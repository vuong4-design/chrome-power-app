import {db} from '.';
import type {DB} from '../../../shared/types/db';

const allScripts = async () => {
  return await db('automation_scripts').select('*').orderBy('created_at', 'desc');
};

const getScriptById = async (id: number) => {
  return await db('automation_scripts').where({id}).first();
};

const createScript = async (script: DB.AutomationScript) => {
  const [id] = await db('automation_scripts').insert({
    name: script.name,
    type: script.type,
    content: script.content ?? null,
    path: script.path ?? null,
    created_at: db.fn.now(),
    updated_at: db.fn.now(),
  });
  return {id};
};

const updateScript = async (id: number, script: Partial<DB.AutomationScript>) => {
  const updateData = {
    ...script,
    updated_at: db.fn.now(),
  };
  return await db('automation_scripts').where({id}).update(updateData);
};

const deleteScript = async (id: number) => {
  return await db('automation_scripts').where({id}).delete();
};

const createRuns = async (runs: DB.AutomationRunCreateInput[]) => {
  if (runs.length === 0) {
    return [];
  }
  return await db('automation_runs').insert(
    runs.map(run => ({
      script_id: run.script_id,
      window_id: run.window_id,
      status: run.status,
      logs: run.logs ?? null,
      started_at: run.started_at ?? null,
      finished_at: run.finished_at ?? null,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    })),
  );
};

const getRunById = async (id: number) => {
  return await db('automation_runs').where({id}).first();
};

const updateRun = async (id: number, updates: Partial<DB.AutomationRun>) => {
  return await db('automation_runs').where({id}).update({
    ...updates,
    updated_at: db.fn.now(),
  });
};

const appendRunLog = async (id: number, message: string) => {
  const existing = await db('automation_runs').where({id}).first('logs');
  const nextLog = `${existing?.logs ?? ''}${message}\n`;
  return await db('automation_runs').where({id}).update({
    logs: nextLog,
    updated_at: db.fn.now(),
  });
};

const getRunsByScriptId = async (scriptId: number) => {
  return await db('automation_runs')
    .where({script_id: scriptId})
    .orderBy('created_at', 'desc');
};

export const AutomationDB = {
  allScripts,
  getScriptById,
  createScript,
  updateScript,
  deleteScript,
  createRuns,
  getRunById,
  updateRun,
  appendRunLog,
  getRunsByScriptId,
};
