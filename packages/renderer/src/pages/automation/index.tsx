import {useEffect, useMemo, useState} from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
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
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from 'reactflow';
import type {Connection, Edge, Node, NodeChange} from 'reactflow';

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
  const [builderExportOpen, setBuilderExportOpen] = useState(false);
  const [builderCreateOpen, setBuilderCreateOpen] = useState(false);
  const [selectedScript, setSelectedScript] = useState<DB.AutomationScript | null>(null);
  const [selectedRun, setSelectedRun] = useState<DB.AutomationRun | null>(null);
  const [builderEngine, setBuilderEngine] = useState<BuilderEngine>('puppeteer');
  const [messageApi, contextHolder] = message.useMessage({
    duration: 2,
    top: 120,
    getContainer: () => document.body,
  });
  const [form] = Form.useForm();
  const [runForm] = Form.useForm();
  const [builderForm] = Form.useForm();
  const [builderNodes, setBuilderNodes] = useState<Array<Node<BuilderNodeData>>>([]);
  const [builderEdges, setBuilderEdges] = useState<Edge[]>([]);
  const [selectedBuilderNodeId, setSelectedBuilderNodeId] = useState<string | null>(null);

  const builderPalette: BuilderNodeDefinition[] = [
    {type: 'navigate', label: t('automation_builder_node_navigate')},
    {type: 'click', label: t('automation_builder_node_click')},
    {type: 'input', label: t('automation_builder_node_input')},
    {type: 'wait', label: t('automation_builder_node_wait')},
    {type: 'condition', label: t('automation_builder_node_condition')},
    {type: 'loop', label: t('automation_builder_node_loop')},
    {type: 'screenshot', label: t('automation_builder_node_screenshot')},
    {type: 'error', label: t('automation_builder_node_error')},
  ];

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

  const handleAddBuilderNode = (definition: BuilderNodeDefinition, position?: BuilderPosition) => {
    setBuilderNodes(prev => [
      ...prev,
      {
        id: `${definition.type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: 'automation',
        position: position ?? {x: 80, y: prev.length * 120},
        data: {
          label: definition.label,
          type: definition.type,
          params: getDefaultParams(definition.type),
        },
      },
    ]);
  };

  const handleRemoveBuilderNode = (id: string) => {
    setBuilderNodes(prev => prev.filter(node => node.id !== id));
    setBuilderEdges(prev => prev.filter(edge => edge.source !== id && edge.target !== id));
    setSelectedBuilderNodeId(prev => (prev === id ? null : prev));
  };

  const handleBuilderParamChange = (id: string, key: string, value: string | number) => {
    setBuilderNodes(prev =>
      prev.map(node =>
        node.id === id
          ? {...node, data: {...node.data, params: {...node.data.params, [key]: value}}}
          : node,
      ),
    );
  };

  const handleBuilderDrop: React.DragEventHandler<HTMLDivElement> = event => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/automation-node');
    const definition = builderPalette.find(node => node.type === type);
    if (definition) {
      const bounds = event.currentTarget.getBoundingClientRect();
      handleAddBuilderNode(definition, {
        x: event.clientX - bounds.left - 90,
        y: event.clientY - bounds.top - 30,
      });
    }
  };

  const handleBuilderDragStart = (type: string) => (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('application/automation-node', type);
  };

  const builderWorkflow = useMemo(() => {
    return serializeBuilderWorkflow(builderNodes, builderEdges);
  }, [builderNodes, builderEdges]);

  const builderJson = useMemo(() => {
    return JSON.stringify(builderWorkflow, null, 2);
  }, [builderWorkflow]);

  const builderScript = useMemo(() => {
    return generateBuilderScript(builderNodes, builderEngine);
  }, [builderNodes, builderEngine]);

  const exportBuilderJson = () => {
    setBuilderExportOpen(true);
  };

  const handleBuilderCreate = () => {
    builderForm.resetFields();
    builderForm.setFieldsValue({
      type: builderEngine,
    });
    setBuilderCreateOpen(true);
  };

  const handleSaveBuilderScript = async () => {
    const values = await builderForm.validateFields();
    await AutomationBridge.createScript({
      name: values.name,
      type: values.type,
      content: builderScript,
      path: null,
      workflow: builderJson,
    });
    messageApi.success(t('automation_script_created'));
    setBuilderCreateOpen(false);
    await refreshScripts();
  };

  const handleBuilderNodesChange = (changes: NodeChange[]) => {
    setBuilderNodes(prev => applyNodeChanges(changes, prev));
  };

  const handleBuilderEdgesChange = (changes: any) => {
    setBuilderEdges(prev => applyEdgeChanges(changes, prev));
  };

  const handleBuilderConnect = (connection: Connection) => {
    setBuilderEdges(prev => addEdge(connection, prev));
  };

  const selectedBuilderNode = useMemo(() => {
    return builderNodes.find(node => node.id === selectedBuilderNodeId) ?? null;
  }, [builderNodes, selectedBuilderNodeId]);

  const builderNodeTypes = useMemo(() => {
    return {
      automation: ({data, selected}: BuilderNodeRenderProps) => (
        <div
          style={{
            width: 180,
            padding: '10px 12px',
            borderRadius: 10,
            border: `2px solid ${selected ? '#2563eb' : '#cbd5f5'}`,
            background: '#fff',
            boxShadow: '0 10px 20px rgba(15, 23, 42, 0.15)',
          }}
        >
          <Text strong>{data.label}</Text>
          <div style={{marginTop: 6}}>
            <Text type="secondary" style={{fontSize: 12}}>
              {data.type}
            </Text>
          </div>
        </div>
      ),
    };
  }, []);

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
          workflow: script.workflow ?? null,
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
            {
              key: 'builder',
              label: t('automation_builder_tab'),
              children: (
                <Space
                  direction="vertical"
                  size="middle"
                  style={{width: '100%'}}
                >
                  <Paragraph type="secondary">{t('automation_builder_description')}</Paragraph>
                  <Form
                    layout="inline"
                    style={{rowGap: 8}}
                  >
                    <Form.Item label={t('automation_builder_engine')}>
                      <Select
                        value={builderEngine}
                        onChange={value => setBuilderEngine(value)}
                        options={[
                          {label: 'Puppeteer', value: 'puppeteer'},
                          {label: 'Playwright', value: 'playwright'},
                          {label: 'Selenium', value: 'selenium'},
                        ]}
                        style={{minWidth: 160}}
                      />
                    </Form.Item>
                  </Form>
                  <Space align="start" style={{width: '100%'}}>
                    <Card title={t('automation_builder_palette')} style={{width: 240}}>
                      <Space
                        direction="vertical"
                        style={{width: '100%'}}
                      >
                        {builderPalette.map(node => (
                          <Card
                            key={node.type}
                            size="small"
                            draggable
                            onDragStart={handleBuilderDragStart(node.type)}
                            onClick={() => handleAddBuilderNode(node)}
                            style={{cursor: 'grab'}}
                          >
                            {node.label}
                          </Card>
                        ))}
                      </Space>
                    </Card>
                    <Card title={t('automation_builder_canvas')} style={{flex: 1}}>
                      <ReactFlowProvider>
                        <ReactFlow
                          nodes={builderNodes}
                          edges={builderEdges}
                          onNodesChange={handleBuilderNodesChange}
                          onEdgesChange={handleBuilderEdgesChange}
                          onConnect={handleBuilderConnect}
                          onNodeClick={node => setSelectedBuilderNodeId(node.id)}
                          onDrop={handleBuilderDrop}
                          onDragOver={event => event.preventDefault()}
                          nodeTypes={builderNodeTypes as Record<string, (props: any) => JSX.Element>}
                        >
                          <Background />
                          <Controls />
                        </ReactFlow>
                        {builderNodes.length === 0 && (
                          <Text type="secondary">{t('automation_builder_empty')}</Text>
                        )}
                      </ReactFlowProvider>
                    </Card>
                    <Card title={t('automation_builder_properties')} style={{width: 300}}>
                      {selectedBuilderNode ? (
                        <Space direction="vertical" style={{width: '100%'}}>
                          {renderBuilderNodeForm(
                            selectedBuilderNode,
                            handleBuilderParamChange,
                            t,
                          )}
                          <Button danger onClick={() => handleRemoveBuilderNode(selectedBuilderNode.id)}>
                            {t('automation_builder_remove')}
                          </Button>
                        </Space>
                      ) : (
                        <Text type="secondary">{t('automation_builder_select_node')}</Text>
                      )}
                    </Card>
                  </Space>
                  <Space>
                    <Button
                      type="primary"
                      onClick={handleBuilderCreate}
                      disabled={builderNodes.length === 0}
                    >
                      {t('automation_builder_create_script')}
                    </Button>
                    <Button
                      icon={<DownloadOutlined />}
                      onClick={exportBuilderJson}
                      disabled={builderNodes.length === 0}
                    >
                      {t('automation_builder_export')}
                    </Button>
                  </Space>
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

      <Modal
        open={builderExportOpen}
        title={t('automation_builder_export_title')}
        footer={null}
        onCancel={() => setBuilderExportOpen(false)}
      >
        <Paragraph type="secondary">{t('automation_builder_export_hint')}</Paragraph>
        <Tabs
          items={[
            {
              key: 'json',
              label: t('automation_builder_export_json_tab'),
              children: <TextArea rows={12} value={builderJson} readOnly />,
            },
            {
              key: 'script',
              label: t('automation_builder_export_script_tab'),
              children: <TextArea rows={12} value={builderScript} readOnly />,
            },
          ]}
        />
      </Modal>

      <Modal
        open={builderCreateOpen}
        title={t('automation_builder_create_title')}
        okText={t('automation_builder_create_confirm')}
        cancelText={t('automation_script_cancel')}
        onCancel={() => setBuilderCreateOpen(false)}
        onOk={handleSaveBuilderScript}
      >
        <Form layout="vertical" form={builderForm}>
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
          <Paragraph type="secondary">{t('automation_builder_create_hint')}</Paragraph>
        </Form>
      </Modal>
    </div>
  );
};

export default Automation;

type BuilderNodeType =
  | 'navigate'
  | 'click'
  | 'input'
  | 'wait'
  | 'condition'
  | 'loop'
  | 'screenshot'
  | 'error';

type BuilderNodeDefinition = {
  type: BuilderNodeType;
  label: string;
};

type BuilderPosition = {
  x: number;
  y: number;
};

type BuilderNodeParams = Record<string, string | number>;

type BuilderNodeData = {
  label: string;
  type: BuilderNodeType;
  params: BuilderNodeParams;
};

type BuilderNodeRenderProps = {
  data: BuilderNodeData;
  selected: boolean;
};

type BuilderEngine = 'puppeteer' | 'playwright' | 'selenium';

const serializeBuilderWorkflow = (nodes: Array<Node<BuilderNodeData>>, edges: Edge[]) => ({
  nodes: nodes.map(node => ({
    id: node.id,
    type: node.data.type,
    position: node.position,
    params: node.data.params,
  })),
  edges: edges.map(edge => ({id: edge.id, source: edge.source, target: edge.target})),
});

const getDefaultParams = (type: BuilderNodeType): BuilderNodeParams => {
  switch (type) {
    case 'navigate':
      return {url: ''};
    case 'click':
      return {selector: ''};
    case 'input':
      return {selector: '', value: ''};
    case 'wait':
      return {durationMs: 1000};
    case 'condition':
      return {selector: '', operator: 'exists'};
    case 'loop':
      return {times: 1};
    case 'screenshot':
      return {path: 'screenshot.png'};
    case 'error':
      return {message: ''};
    default:
      return {};
  }
};

const generateBuilderScript = (nodes: Array<Node<BuilderNodeData>>, engine: BuilderEngine) => {
  const orderedNodes = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const steps = orderedNodes.flatMap(node => getScriptStepsForNode(node, engine));
  const header = getScriptHeader(engine);
  const footer = getScriptFooter(engine);
  if (steps.length === 0) {
    return [header, footer].join('\n');
  }
  return [header, ...steps, footer].join('\n');
};

const getScriptHeader = (engine: BuilderEngine) => {
  switch (engine) {
    case 'playwright':
      return [
        "const { chromium } = require('playwright');",
        '',
        'async function run() {',
        '  const browser = await chromium.launch();',
        '  const page = await browser.newPage();',
      ].join('\n');
    case 'selenium':
      return [
        "const { Builder, By } = require('selenium-webdriver');",
        '',
        'async function run() {',
        "  const driver = await new Builder().forBrowser('chrome').build();",
      ].join('\n');
    default:
      return [
        "const puppeteer = require('puppeteer');",
        '',
        'async function run() {',
        '  const browser = await puppeteer.launch();',
        '  const page = await browser.newPage();',
      ].join('\n');
  }
};

const getScriptStepsForNode = (node: Node<BuilderNodeData>, engine: BuilderEngine) => {
  const getSelector = (value: BuilderNodeParams[keyof BuilderNodeParams]) =>
    typeof value === 'string' ? value : '';
  const getNumber = (value: BuilderNodeParams[keyof BuilderNodeParams]) =>
    typeof value === 'number' ? value : 0;
  const getString = (value: BuilderNodeParams[keyof BuilderNodeParams]) =>
    typeof value === 'string' ? value : '';

  switch (node.data.type) {
    case 'navigate': {
      const url = getString(node.data.params.url);
      if (engine === 'selenium') {
        return [`  await driver.get('${url || 'https://example.com'}');`];
      }
      return [`  await page.goto('${url || 'https://example.com'}');`];
    }
    case 'click': {
      const selector = getSelector(node.data.params.selector);
      if (engine === 'selenium') {
        return [`  await driver.findElement(By.css('${selector}')).click();`];
      }
      return [`  await page.click('${selector}');`];
    }
    case 'input': {
      const selector = getSelector(node.data.params.selector);
      const value = getString(node.data.params.value);
      if (engine === 'selenium') {
        return [
          `  const input = await driver.findElement(By.css('${selector}'));`,
          '  await input.clear();',
          `  await input.sendKeys('${value}');`,
        ];
      }
      if (engine === 'playwright') {
        return [`  await page.fill('${selector}', '${value}');`];
      }
      return [`  await page.type('${selector}', '${value}');`];
    }
    case 'wait': {
      const duration = getNumber(node.data.params.durationMs) || 1000;
      if (engine === 'selenium') {
        return [`  await driver.sleep(${duration});`];
      }
      return [`  await page.waitForTimeout(${duration});`];
    }
    case 'condition': {
      const selector = getSelector(node.data.params.selector);
      const operator = getString(node.data.params.operator) || 'exists';
      if (engine === 'selenium') {
        return [
          `  const conditionMet = await driver.findElements(By.css('${selector}'));`,
          `  if (${operator === 'exists' ? '' : '!'}conditionMet.length) {`,
          "    throw new Error('Condition not met');",
          '  }',
        ];
      }
      return [
        `  const conditionMet = await page.$('${selector}');`,
        `  if (${operator === 'exists' ? '!' : ''}conditionMet) {`,
        "    throw new Error('Condition not met');",
        '  }',
      ];
    }
    case 'loop': {
      const times = getNumber(node.data.params.times) || 1;
      return [
        `  for (let i = 0; i < ${times}; i++) {`,
        '    // TODO: move steps into loop once nested nodes are supported.',
        '  }',
      ];
    }
    case 'screenshot': {
      const pathValue = getString(node.data.params.path) || 'screenshot.png';
      if (engine === 'selenium') {
        return [
          "  const image = await driver.takeScreenshot();",
          "  require('fs').writeFileSync(",
          `    '${pathValue}',`,
          "    image,",
          "    'base64',",
          '  );',
        ];
      }
      return [`  await page.screenshot({ path: '${pathValue}' });`];
    }
    case 'error': {
      const message = getString(node.data.params.message) || 'Automation error';
      return [`  throw new Error('${message}');`];
    }
    default:
      return [];
  }
};

const getScriptFooter = (engine: BuilderEngine) => {
  switch (engine) {
    case 'selenium':
      return [
        '  await driver.quit();',
        '}',
        '',
        'run().catch(error => {',
        '  console.error(error);',
        '  process.exit(1);',
        '});',
      ].join('\n');
    default:
      return [
        '  await browser.close();',
        '}',
        '',
        'run().catch(error => {',
        '  console.error(error);',
        '  process.exit(1);',
        '});',
      ].join('\n');
  }
};

const renderBuilderNodeForm = (
  node: Node<BuilderNodeData>,
  onChange: (id: string, key: string, value: string | number) => void,
  t: (key: string) => string,
) => {
  switch (node.data.type) {
    case 'navigate':
      return (
        <Form layout="vertical">
          <Form.Item label={t('automation_builder_field_url')}>
            <Input
              value={node.data.params.url as string}
              onChange={event => onChange(node.id, 'url', event.target.value)}
            />
          </Form.Item>
        </Form>
      );
    case 'click':
      return (
        <Form layout="vertical">
          <Form.Item label={t('automation_builder_field_selector')}>
            <Input
              value={node.data.params.selector as string}
              onChange={event => onChange(node.id, 'selector', event.target.value)}
            />
          </Form.Item>
        </Form>
      );
    case 'input':
      return (
        <Form layout="vertical">
          <Form.Item label={t('automation_builder_field_selector')}>
            <Input
              value={node.data.params.selector as string}
              onChange={event => onChange(node.id, 'selector', event.target.value)}
            />
          </Form.Item>
          <Form.Item label={t('automation_builder_field_value')}>
            <Input
              value={node.data.params.value as string}
              onChange={event => onChange(node.id, 'value', event.target.value)}
            />
          </Form.Item>
        </Form>
      );
    case 'wait':
      return (
        <Form layout="vertical">
          <Form.Item label={t('automation_builder_field_duration')}>
            <InputNumber
              min={0}
              value={node.data.params.durationMs as number}
              onChange={value => onChange(node.id, 'durationMs', value ?? 0)}
              style={{width: '100%'}}
            />
          </Form.Item>
        </Form>
      );
    case 'condition':
      return (
        <Form layout="vertical">
          <Form.Item label={t('automation_builder_field_selector')}>
            <Input
              value={node.data.params.selector as string}
              onChange={event => onChange(node.id, 'selector', event.target.value)}
            />
          </Form.Item>
          <Form.Item label={t('automation_builder_field_operator')}>
            <Select
              value={node.data.params.operator as string}
              onChange={value => onChange(node.id, 'operator', value)}
              options={[
                {label: t('automation_builder_operator_exists'), value: 'exists'},
                {label: t('automation_builder_operator_not_exists'), value: 'not_exists'},
              ]}
            />
          </Form.Item>
        </Form>
      );
    case 'loop':
      return (
        <Form layout="vertical">
          <Form.Item label={t('automation_builder_field_times')}>
            <InputNumber
              min={1}
              value={node.data.params.times as number}
              onChange={value => onChange(node.id, 'times', value ?? 1)}
              style={{width: '100%'}}
            />
          </Form.Item>
        </Form>
      );
    case 'screenshot':
      return (
        <Form layout="vertical">
          <Form.Item label={t('automation_builder_field_path')}>
            <Input
              value={node.data.params.path as string}
              onChange={event => onChange(node.id, 'path', event.target.value)}
            />
          </Form.Item>
        </Form>
      );
    case 'error':
      return (
        <Form layout="vertical">
          <Form.Item label={t('automation_builder_field_message')}>
            <Input
              value={node.data.params.message as string}
              onChange={event => onChange(node.id, 'message', event.target.value)}
            />
          </Form.Item>
        </Form>
      );
    default:
      return null;
  }
};
