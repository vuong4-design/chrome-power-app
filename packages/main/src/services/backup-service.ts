import {ipcMain} from 'electron';
import {readFile} from 'fs/promises';
import JSZip from 'jszip';
import type {Knex} from 'knex';
import {db} from '../db';
import {createLogger} from '../../../shared/utils/logger';
import {SERVICE_LOGGER_LABEL} from '../constants';
import {EXPORT_SCHEMA_VERSION} from '../../../shared/constants';

type ConflictStrategy = 'merge' | 'replace' | 'skip';

type BackupMetadata = {
  schema_version: number;
  entity: 'windows' | 'proxies' | 'profiles';
  scope: 'all' | 'selected';
  exported_at: string;
  count: number;
};

type RestorePayload = {
  filePath: string;
  strategy: ConflictStrategy;
};

const logger = createLogger(SERVICE_LOGGER_LABEL);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const mergeWithExisting = (existing: Record<string, unknown>, incoming: Record<string, unknown>) => {
  const merged = {...existing};
  Object.entries(incoming).forEach(([key, value]) => {
    const current = merged[key];
    if (
      current === undefined ||
      current === null ||
      current === '' ||
      (Array.isArray(current) && current.length === 0)
    ) {
      merged[key] = value;
    }
  });
  return merged;
};

const resolveTagIds = async (trx: Knex.Transaction, tags: unknown) => {
  if (!tags) {
    return null;
  }
  const names = Array.isArray(tags) ? tags : tags.toString().split(',');
  const cleaned = names.map(tag => tag.toString().trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return null;
  }
  const tagIds: number[] = [];
  for (const name of cleaned) {
    const existing = await trx('tag').where({name}).first();
    if (existing?.id) {
      tagIds.push(existing.id);
      continue;
    }
    const [id] = await trx('tag').insert({name});
    if (id) {
      tagIds.push(id);
    }
  }
  return tagIds.join(',');
};

const resolveGroupId = async (trx: Knex.Transaction, groupName: unknown, groupId: unknown) => {
  if (typeof groupId === 'number') {
    return groupId;
  }
  if (!isNonEmptyString(groupName)) {
    return null;
  }
  const existing = await trx('group').where({name: groupName}).first();
  if (existing?.id) {
    return existing.id;
  }
  const [id] = await trx('group').insert({name: groupName});
  return id ?? null;
};

const restoreWindows = async (
  trx: Knex.Transaction,
  items: Array<Record<string, unknown>>,
  strategy: ConflictStrategy,
  isProfileOnly: boolean,
) => {
  for (const item of items) {
    const profileId = item.profile_id ?? item.profileId ?? item.profileID;
    if (!isNonEmptyString(profileId)) {
      throw new Error('Invalid window profile_id in backup data.');
    }
    const existing = await trx('window').where({profile_id: profileId}).first();
    const groupId = await resolveGroupId(trx, item.group_name, item.group_id);
    const tags = await resolveTagIds(trx, item.tags);
    const payload = {
      profile_id: profileId,
      name: item.name ?? null,
      group_id: groupId,
      remark: item.remark ?? null,
      tags,
      proxy_id: item.proxy_id ?? null,
      ua: isProfileOnly ? null : (item.ua ?? null),
      fingerprint: isProfileOnly ? null : (item.fingerprint ?? null),
      cookie: isProfileOnly ? null : (item.cookie ?? null),
      updated_at: trx.fn.now(),
    };

    if (!existing) {
      await trx('window').insert({
        ...payload,
        created_at: trx.fn.now(),
      });
      continue;
    }

    if (strategy === 'skip') {
      continue;
    }

    if (strategy === 'merge') {
      const merged = mergeWithExisting(existing, payload);
      await trx('window').where({id: existing.id}).update({
        ...merged,
        updated_at: trx.fn.now(),
      });
      continue;
    }

    await trx('window').where({id: existing.id}).update({
      ...payload,
      updated_at: trx.fn.now(),
    });
  }
};

const restoreProxies = async (
  trx: Knex.Transaction,
  items: Array<Record<string, unknown>>,
  strategy: ConflictStrategy,
) => {
  for (const item of items) {
    const proxyValue = item.proxy ?? item.host ?? '';
    if (!isNonEmptyString(proxyValue)) {
      throw new Error('Invalid proxy in backup data.');
    }
    const existing = await trx('proxy').where({proxy: proxyValue}).first();
    const payload = {
      proxy: proxyValue,
      ip: item.ip ?? null,
      host: item.host ?? null,
      proxy_type: item.proxy_type ?? null,
      ip_checker: item.ip_checker ?? null,
      ip_country: item.ip_country ?? null,
      remark: item.remark ?? null,
      updated_at: trx.fn.now(),
    };

    if (!existing) {
      await trx('proxy').insert({
        ...payload,
        created_at: trx.fn.now(),
      });
      continue;
    }

    if (strategy === 'skip') {
      continue;
    }

    if (strategy === 'merge') {
      const merged = mergeWithExisting(existing, payload);
      await trx('proxy').where({id: existing.id}).update({
        ...merged,
        updated_at: trx.fn.now(),
      });
      continue;
    }

    await trx('proxy').where({id: existing.id}).update({
      ...payload,
      updated_at: trx.fn.now(),
    });
  }
};

const validateBackup = async (filePath: string) => {
  if (!filePath.toLowerCase().endsWith('.zip')) {
    throw new Error('Backup file must be a .zip archive.');
  }
  const buffer = await readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const metadataFile = zip.file('metadata.json');
  if (!metadataFile) {
    throw new Error('Backup zip missing metadata.json.');
  }
  const metadataJson = await metadataFile.async('string');
  const metadata = JSON.parse(metadataJson) as BackupMetadata;
  if (metadata.schema_version !== EXPORT_SCHEMA_VERSION) {
    throw new Error('Unsupported backup schema version.');
  }
  if (!['windows', 'proxies', 'profiles'].includes(metadata.entity)) {
    throw new Error('Unsupported backup entity.');
  }
  const dataFile = zip.file(`${metadata.entity}.json`);
  if (!dataFile) {
    throw new Error(`Backup zip missing ${metadata.entity}.json.`);
  }
  const dataJson = await dataFile.async('string');
  const data = JSON.parse(dataJson) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Backup payload must be an array.');
  }
  return {
    metadata,
    data: data as Array<Record<string, unknown>>,
  };
};

export const initBackupService = () => {
  ipcMain.handle('backup-restore', async (_, payload: RestorePayload) => {
    try {
      const {metadata, data} = await validateBackup(payload.filePath);
      await db.transaction(async trx => {
        if (metadata.entity === 'proxies') {
          await restoreProxies(trx, data, payload.strategy);
          return;
        }
        if (metadata.entity === 'profiles') {
          await restoreWindows(trx, data, payload.strategy, true);
          return;
        }
        await restoreWindows(trx, data, payload.strategy, false);
      });
      return {success: true, message: 'Restore completed.'};
    } catch (error) {
      logger.error('restore backup failed', error);
      return {success: false, message: (error as Error).message || 'Restore failed.'};
    }
  });
};
