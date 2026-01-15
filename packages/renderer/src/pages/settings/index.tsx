import {Button, Card, Form, Input, Progress, Radio, Select, Space, message} from 'antd';
import {CommonBridge, ProxyBridge, TagBridge, WindowBridge} from '#preload';
import {useEffect, useState} from 'react';
import type {SettingOptions} from '../../../../shared/types/common';
import {useTranslation} from 'react-i18next';
import type {DB} from '../../../../shared/types/db';
import {buildExportZip} from '/@/utils/export';

type FieldType = {
  profileCachePath: string;
  useLocalChrome: boolean;
  localChromePath: string;
  chromiumBinPath: string;
  automationConnect: boolean;
};

const Settings = () => {
  const [formValue, setFormValue] = useState<SettingOptions>({
    profileCachePath: '',
    useLocalChrome: true,
    localChromePath: '',
    chromiumBinPath: '',
    automationConnect: false,
  });
  const [form] = Form.useForm();
  const {t} = useTranslation();
  const [messageApi, contextHolder] = message.useMessage();
  const [backupEntity, setBackupEntity] = useState<'windows' | 'proxies' | 'profiles'>('windows');
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreFilePath, setRestoreFilePath] = useState('');
  const [restoreStrategy, setRestoreStrategy] = useState<'merge' | 'replace' | 'skip'>('merge');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const settings = await CommonBridge.getSettings();
    setFormValue(settings);
    form.setFieldsValue(settings);
  };

  const handleSave = async (values: SettingOptions) => {
    await CommonBridge.saveSettings(values);
  };

  const handleChoosePath = async (
    field: 'profileCachePath' | 'localChromePath' | 'chromiumBinPath',
    type: 'openFile' | 'openDirectory',
  ) => {
    const path = await CommonBridge.choosePath(type);
    if (!formValue[field] || (path && formValue[field] !== path)) {
      handleFormValueChange({
        ...formValue,
        [field]: path,
      });
    }
  };

  const handleFormValueChange = (changed: SettingOptions) => {
    const newFormValue = {
      ...formValue,
      ...changed,
    };
    setFormValue(newFormValue);
    handleSave(newFormValue);
  };

  const buildWindowExportPayload = async (windows: DB.Window[]) => {
    const [tags, proxies] = await Promise.all([TagBridge?.getAll(), ProxyBridge?.getAll()]);
    const tagMap = new Map<number, DB.Tag>();
    tags?.forEach((tag: DB.Tag) => {
      if (tag.id) {
        tagMap.set(tag.id, tag);
      }
    });
    return windows.map(window => {
      const tagNames = window.tags
        ? window.tags
            .toString()
            .split(',')
            .map(tag => tagMap.get(Number(tag))?.name)
            .filter(Boolean)
        : [];
      return {
        ...window,
        tags: tagNames,
        proxy: proxies?.find((proxy: DB.Proxy) => proxy.id === window.proxy_id)?.proxy ?? null,
      };
    });
  };

  const buildProfileExportPayload = (windows: DB.Window[]) => {
    return windows.map(window => ({
      id: window.id,
      profile_id: window.profile_id,
      name: window.name,
      group_id: window.group_id,
      group_name: window.group_name,
      remark: window.remark,
      created_at: window.created_at,
      updated_at: window.updated_at,
    }));
  };

  const handleBackupExport = async () => {
    setBackupInProgress(true);
    try {
      const windows = await WindowBridge?.getAll();
      const proxies = await ProxyBridge?.getAll();
      const windowRows = (windows ?? []) as DB.Window[];
      const proxyRows = (proxies ?? []) as DB.Proxy[];
      const data =
        backupEntity === 'proxies'
          ? proxyRows
          : backupEntity === 'profiles'
            ? buildProfileExportPayload(windowRows)
            : await buildWindowExportPayload(windowRows);
      const buffer = await buildExportZip({
        entity: backupEntity,
        data,
        scope: 'all',
      });
      const result = await CommonBridge?.saveDialog({
        title: t('backup_export_title'),
        defaultPath: `${backupEntity}-backup.zip`,
        filters: [{name: 'Zip Files', extensions: ['zip']}],
      });
      if (result.filePath) {
        await CommonBridge?.saveFile(result.filePath, buffer);
        messageApi.success(t('backup_export_success'));
      }
    } catch (error) {
      messageApi.error(`${t('backup_export_failed')}: ${(error as Error).message}`);
    } finally {
      setBackupInProgress(false);
    }
  };

  const handleChooseBackupFile = async () => {
    const filePath = await CommonBridge.choosePath('openFile');
    if (!filePath) {
      return;
    }
    setRestoreFilePath(filePath);
  };

  const handleRestore = async () => {
    if (!restoreFilePath) {
      messageApi.warning(t('backup_restore_missing_file'));
      return;
    }
    setRestoreInProgress(true);
    setRestoreProgress(20);
    try {
      const result = await CommonBridge.restoreBackup(restoreFilePath, restoreStrategy);
      setRestoreProgress(100);
      if (result?.success) {
        messageApi.success(t('backup_restore_success'));
        setRestoreFilePath('');
      } else {
        messageApi.error(result?.message || t('backup_restore_failed'));
      }
    } catch (error) {
      messageApi.error(`${t('backup_restore_failed')}: ${(error as Error).message}`);
    } finally {
      setTimeout(() => {
        setRestoreProgress(0);
        setRestoreInProgress(false);
      }, 300);
    }
  };

  // type FieldType = SettingOptions;

  return (
    <>
      {contextHolder}
      <Card
        className="content-card p-6"
        bordered={false}
      >
        <Form
          name="settingsForm"
          className="w-2/3"
          labelCol={{span: 5}}
          size="large"
          form={form}
          initialValues={formValue}
          onValuesChange={handleFormValueChange}
        >
          <Form.Item<FieldType>
            label={t('settings_cache_path')}
            name="profileCachePath"
          >
            <Space.Compact style={{width: '100%'}}>
              <Input
                readOnly
                disabled
                value={formValue.profileCachePath}
              />
              <Button
                type="default"
                onClick={() => handleChoosePath('profileCachePath', 'openDirectory')}
              >
                {t('settings_choose_cache_path')}
              </Button>
            </Space.Compact>
          </Form.Item>
          {/* <Form.Item<FieldType>
            label={t('settings_use_local_chrome')}
            name="useLocalChrome"
          >
            <Switch value={formValue.useLocalChrome} />
          </Form.Item> */}
          {formValue.useLocalChrome ? (
            <Form.Item<FieldType>
              label={t('settings_chrome_path')}
              name="localChromePath"
            >
              <Space.Compact style={{width: '100%'}}>
                <Input
                  readOnly
                  disabled
                  value={formValue.localChromePath}
                />
                <Button
                  type="default"
                  onClick={() => handleChoosePath('localChromePath', 'openFile')}
                >
                  {t('settings_choose_cache_path')}
                </Button>
              </Space.Compact>
            </Form.Item>
          ) : (
            <Form.Item<FieldType>
              label={t('setting_chromium_path')}
              name="chromiumBinPath"
            >
              <Space.Compact style={{width: '100%'}}>
                <Input
                  readOnly
                  disabled
                  value={formValue.chromiumBinPath}
                />
                <Button
                  type="default"
                  onClick={() => handleChoosePath('chromiumBinPath', 'openFile')}
                >
                  {t('settings_choose_cache_path')}
                </Button>
              </Space.Compact>
            </Form.Item>
          )}
          {/* <Form.Item<FieldType>
            label={t('settings_automation_connect')}
            name="automationConnect"
            >
              <Switch value={formValue.automationConnect} />
          </Form.Item> */}
        </Form>
      </Card>
      <Card
        className="content-card p-6 mt-6"
        bordered={false}
        title={t('backup_title')}
      >
        <Space
          direction="vertical"
          size={16}
          className="w-full"
        >
          <Space
            direction="vertical"
            className="w-full"
          >
            <div className="text-sm text-gray-500">{t('backup_description')}</div>
            <Space>
              <Select
                value={backupEntity}
                onChange={value => setBackupEntity(value)}
                options={[
                  {label: t('backup_entity_windows'), value: 'windows'},
                  {label: t('backup_entity_profiles'), value: 'profiles'},
                  {label: t('backup_entity_proxies'), value: 'proxies'},
                ]}
                style={{width: 200}}
              />
              <Button
                type="primary"
                loading={backupInProgress}
                onClick={handleBackupExport}
              >
                {t('backup_export_action')}
              </Button>
            </Space>
          </Space>
          <Space
            direction="vertical"
            className="w-full"
          >
            <div className="text-sm text-gray-500">{t('backup_restore_description')}</div>
            <Space>
              <Input
                readOnly
                value={restoreFilePath}
                placeholder={t('backup_restore_placeholder')}
                style={{width: 320}}
              />
              <Button onClick={handleChooseBackupFile}>{t('backup_restore_choose')}</Button>
            </Space>
            <Radio.Group
              value={restoreStrategy}
              onChange={event => setRestoreStrategy(event.target.value)}
            >
              <Space>
                <Radio value="merge">{t('backup_conflict_merge')}</Radio>
                <Radio value="replace">{t('backup_conflict_replace')}</Radio>
                <Radio value="skip">{t('backup_conflict_skip')}</Radio>
              </Space>
            </Radio.Group>
            <Space>
              <Button
                type="primary"
                loading={restoreInProgress}
                onClick={handleRestore}
              >
                {t('backup_restore_action')}
              </Button>
              <Progress
                percent={restoreProgress}
                status={restoreInProgress ? 'active' : 'normal'}
                size="small"
                style={{width: 200}}
              />
            </Space>
          </Space>
        </Space>
      </Card>
    </>
  );
};
export default Settings;
