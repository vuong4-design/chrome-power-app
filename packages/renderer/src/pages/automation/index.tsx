import {useEffect, useMemo, useState} from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  UploadOutlined,
  DownloadOutlined,
  EyeOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type {ColumnsType} from 'antd/es/table';
import type {UploadProps} from 'antd/es/upload';
import {useTranslation} from 'react-i18next';
import type {DB} from '../../../../shared/types/db';
import {AutomationBridge, WindowBridge} from '#preload';
import dayjs from 'dayjs';

const {Text, Paragraph} = Typography;
const {TextArea} = Input;

const Automation = () => {
  const {t} = useTranslation();
  const [scripts, setScripts] = useState<DB.AutomationScript[]>([]);
  const [runs, setRuns] = useState<DB.AutomationRun[]>([]);
  const [windows, setWindows] = useState<DB.Window[]>([]);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [selectedScript, setSelectedScript] = useState<DB.AutomationScript | null>(null);
  const [selectedRun, setSelectedRun] = useState<DB.AutomationRun | null>(null);
  const [messageApi, contextHolder] = message.useMessage({
    duration: 2,
    top: 120,
    getContainer: () => document.body,
  });
  const [form] = Form.useForm();
  const [runForm] = Form.useForm();

  const refreshScripts = async () => {
    const data = await AutomationBridge.getScripts();
    setScripts(data as DB.AutomationScript[]);
  };

  const refreshRuns = async () => {
    const data = await AutomationBridge.getRuns();
    setRuns(data as DB.AutomationRun[]);
  };

  const refreshWindows = async () => {
    const data = await WindowBridge.getAll();
    setWindows(data as DB.Window[]);
  };

  useEffect(() => {
    void refreshScripts();
    void refreshRuns();
    void refreshWindows();
  }, []);

  const scriptOptions = useMemo(() => {
    return scripts.map(script => ({value: script.id!, label: script.name}));
  }, [scripts]);

  const windowOptions = useMemo(() => {
    return windows.map(window => ({
      value: window.id!,
      label: `${window.name ?? window.profile_id ?? window.id}`,
    }));
  }, [windows]);

  const handleOpenCreate = () => {
    setSelectedScript(null);
    form.resetFields();
    setScriptModalOpen(true);
  };

  const handleEditScript = (script: DB.AutomationScript) => {
    setSelectedScript(script);
    form.setFieldsValue({
      name: script.name,
      type: script.type,
      content: script.content,
      path: script.path,
    });
    setScriptModalOpen(true);
  };

  const handleDeleteScript = async (script: DB.AutomationScript) => {
    Modal.confirm({
      title: t('automation_delete_confirm_title'),
      content: t('automation_delete_confirm_content'),
      okText: t('automation_delete_confirm_ok'),
      cancelText: t('automation_delete_confirm_cancel'),
      onOk: async () => {
        await AutomationBridge.deleteScript(script.id!);
        messageApi.success(t('automation_script_deleted'));
        await refreshScripts();
        await refreshRuns();
      },
    });
  };

  const handleSaveScript = async () => {
    const values = await form.validateFields();
    const payload: DB.AutomationScript = {
      name: values.name,
      type: values.type,
      content: values.content || null,
      path: values.path || null,
    };

    if (selectedScript?.id) {
      await AutomationBridge.updateScript(selectedScript.id, payload);
      messageApi.success(t('automation_script_updated'));
    } else {
      await AutomationBridge.createScript(payload);
      messageApi.success(t('automation_script_created'));
    }
    setScriptModalOpen(false);
    await refreshScripts();
  };

  const handleOpenRun = (script: DB.AutomationScript) => {
    setSelectedScript(script);
    runForm.resetFields();
    runForm.setFieldsValue({
      batchSize: 3,
      timeoutMs: 300000,
    });
    setRunModalOpen(true);
  };

  const handleStartRun = async () => {
    const values = await runForm.validateFields();
    const scriptId = selectedScript?.id;
    if (!scriptId) {
      return;
    }
    await AutomationBridge.startRuns(scriptId, values.windowIds, {
      batchSize: values.batchSize,
      timeoutMs: values.timeoutMs,
    });
    messageApi.success(t('automation_run_started_notice'));
    setRunModalOpen(false);
    await refreshRuns();
  };

  const handleCancelRun = async (runId: number) => {
    await AutomationBridge.cancelRuns([runId]);
    messageApi.info(t('automation_run_cancelled'));
    await refreshRuns();
  };

  const handleOpenLogs = (run: DB.AutomationRun) => {
    setSelectedRun(run);
    setLogModalOpen(true);
  };

  const exportScripts = () => {
    const payload = JSON.stringify(scripts, null, 2);
    const blob = new Blob([payload], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'automation-scripts.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportScripts = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as DB.AutomationScript[];
    for (const script of parsed) {
      if (script.name && script.type) {
        await AutomationBridge.createScript({
          name: script.name,
          type: script.type,
          content: script.content ?? null,
          path: script.path ?? null,
        });
      }
    }
    messageApi.success(t('automation_script_imported'));
    await refreshScripts();
    return false;
  };

  const uploadProps: UploadProps = {
    accept: '.json',
    showUploadList: false,
    beforeUpload: handleImportScripts,
  };

  const scriptColumns: ColumnsType<DB.AutomationScript> = [
    {
      title: t('automation_script_name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('automation_script_type'),
      dataIndex: 'type',
      key: 'type',
      render: value => <Tag color="blue">{value}</Tag>,
    },
    {
      title: t('automation_script_updated_at'),
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: value => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: t('automation_script_action'),
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleOpenRun(record)}
          >
            {t('automation_script_run')}
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditScript(record)}
          >
            {t('automation_script_edit')}
          </Button>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteScript(record)}
          >
            {t('automation_script_delete')}
          </Button>
        </Space>
      ),
    },
  ];

  const runColumns: ColumnsType<DB.AutomationRun> = [
    {
      title: t('automation_run_id'),
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: t('automation_run_script'),
      dataIndex: 'script_id',
      key: 'script_id',
      render: value => scriptOptions.find(option => option.value === value)?.label ?? value,
    },
    {
      title: t('automation_run_window'),
      dataIndex: 'window_id',
      key: 'window_id',
    },
    {
      title: t('automation_run_status'),
      dataIndex: 'status',
      key: 'status',
      render: value => {
        const colorMap: Record<string, string> = {
          completed: 'green',
          running: 'blue',
          queued: 'gold',
          pending: 'default',
          failed: 'red',
          timeout: 'volcano',
          cancelled: 'orange',
        };
        return <Tag color={colorMap[value] ?? 'default'}>{value}</Tag>;
      },
    },
    {
      title: t('automation_run_started'),
      dataIndex: 'started_at',
      key: 'started_at',
      render: value => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: t('automation_run_finished'),
      dataIndex: 'finished_at',
      key: 'finished_at',
      render: value => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: t('automation_run_action'),
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleOpenLogs(record)}
          >
            {t('automation_run_view_log')}
          </Button>
          <Button
            size="small"
            icon={<StopOutlined />}
            onClick={() => handleCancelRun(record.id!)}
            disabled={record.status === 'completed' || record.status === 'failed'}
          >
            {t('automation_run_cancel')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}
      <Card>
        <Tabs
          defaultActiveKey="scripts"
          items={[
            {
              key: 'scripts',
              label: t('automation_scripts_tab'),
              children: (
                <Space
                  direction="vertical"
                  size="middle"
                  style={{width: '100%'}}
                >
                  <Space>
                    <Button
                      type="primary"
                      icon={<FileAddOutlined />}
                      onClick={handleOpenCreate}
                    >
                      {t('automation_script_new')}
                    </Button>
                    <Upload {...uploadProps}>
                      <Button icon={<UploadOutlined />}>{t('automation_script_import')}</Button>
                    </Upload>
                    <Button
                      icon={<DownloadOutlined />}
                      onClick={exportScripts}
                    >
                      {t('automation_script_export')}
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={refreshScripts}
                    >
                      {t('refresh')}
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    columns={scriptColumns}
                    dataSource={scripts}
                    pagination={{pageSize: 8}}
                  />
                </Space>
              ),
            },
            {
              key: 'runs',
              label: t('automation_runs_tab'),
              children: (
                <Space
                  direction="vertical"
                  size="middle"
                  style={{width: '100%'}}
                >
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={refreshRuns}
                  >
                    {t('refresh')}
                  </Button>
                  <Table
                    rowKey="id"
                    columns={runColumns}
                    dataSource={runs}
                    pagination={{pageSize: 8}}
                  />
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={scriptModalOpen}
        title={selectedScript ? t('automation_script_edit_title') : t('automation_script_new_title')}
        okText={t('automation_script_save')}
        cancelText={t('automation_script_cancel')}
        onCancel={() => setScriptModalOpen(false)}
        onOk={handleSaveScript}
      >
        <Form
          layout="vertical"
          form={form}
        >
          <Form.Item
            label={t('automation_script_name')}
            name="name"
            rules={[{required: true, message: t('automation_script_name_required')}]}
          >
            <Input placeholder={t('automation_script_name_placeholder')} />
          </Form.Item>
          <Form.Item
            label={t('automation_script_type')}
            name="type"
            rules={[{required: true, message: t('automation_script_type_required')}]}
          >
            <Select
              options={[
                {label: 'Puppeteer', value: 'puppeteer'},
                {label: 'Playwright', value: 'playwright'},
                {label: 'Selenium', value: 'selenium'},
              ]}
              placeholder={t('automation_script_type_placeholder')}
            />
          </Form.Item>
          <Form.Item
            label={t('automation_script_content')}
            name="content"
          >
            <TextArea rows={6} placeholder={t('automation_script_content_placeholder')} />
          </Form.Item>
          <Form.Item
            label={t('automation_script_path')}
            name="path"
          >
            <Input placeholder={t('automation_script_path_placeholder')} />
          </Form.Item>
          <Paragraph type="secondary">{t('automation_script_content_hint')}</Paragraph>
        </Form>
      </Modal>

      <Modal
        open={runModalOpen}
        title={t('automation_run_modal_title')}
        okText={t('automation_run_start')}
        cancelText={t('automation_run_cancel')}
        onCancel={() => setRunModalOpen(false)}
        onOk={handleStartRun}
      >
        <Form
          layout="vertical"
          form={runForm}
        >
          <Form.Item label={t('automation_run_script')}>
            <Text strong>{selectedScript?.name}</Text>
          </Form.Item>
          <Form.Item
            label={t('automation_run_window')}
            name="windowIds"
            rules={[{required: true, message: t('automation_run_window_required')}]}
          >
            <Select
              mode="multiple"
              options={windowOptions}
              placeholder={t('automation_run_window_placeholder')}
            />
          </Form.Item>
          <Form.Item
            label={t('automation_run_batch')}
            name="batchSize"
            rules={[{required: true, message: t('automation_run_batch_required')}]}
          >
            <Input type="number" min={1} />
          </Form.Item>
          <Form.Item
            label={t('automation_run_timeout')}
            name="timeoutMs"
            rules={[{required: true, message: t('automation_run_timeout_required')}]}
          >
            <Input type="number" min={1000} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={logModalOpen}
        title={t('automation_run_log_title')}
        footer={null}
        onCancel={() => setLogModalOpen(false)}
      >
        <Text type="secondary">{t('automation_run_log_hint')}</Text>
        <TextArea
          rows={10}
          value={selectedRun?.logs ?? ''}
          readOnly
          style={{marginTop: 12}}
        />
      </Modal>
    </div>
  );
};

export default Automation;
