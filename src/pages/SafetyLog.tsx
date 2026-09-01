import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Image,
  Input,
  List,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
  Upload,
} from 'antd';
import {
  CloudUploadOutlined,
  DeleteOutlined,
  InboxOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { UploadFile } from 'antd';
import MOCK_DATA from '../data';
import {
  checkHealth,
  imageUrl,
  inspectImage,
  levelColor,
  listRecords,
  patchRecord,
  today,
} from '../services/safety-ai-service';
import type { HealthResult, InspectionRecord, InspectionView } from '../services/safety-ai-service';

const { Title, Text } = Typography;

const projects = (MOCK_DATA.projects as { id: string; name: string; shortName: string }[]).map((p) => p.name);

export default function SafetyLog() {
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspectProgress, setInspectProgress] = useState('');
  const [lastResult, setLastResult] = useState<InspectionView | null>(null);
  const [history, setHistory] = useState<InspectionRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [rectifyOpen, setRectifyOpen] = useState(false);
  const [rectifyName, setRectifyName] = useState('');
  const [rectifyTime, setRectifyTime] = useState('');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [form] = Form.useForm();
  const lastResultRef = useRef<InspectionView | null>(null);
  lastResultRef.current = lastResult;

  const refreshHealth = useCallback(async () => {
    setChecking(true);
    const h = await checkHealth();
    setHealth(h);
    setChecking(false);
  }, []);

  const refreshHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await listRecords(50);
      setHistory(data.items || []);
    } catch (e) {
      message.error('无法加载历史：' + (e as Error).message);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
    void refreshHistory();
  }, [refreshHealth, refreshHistory]);

  const runInspect = useCallback(
    async (file: File) => {
      const meta = form.getFieldsValue();
      setInspecting(true);
      setInspectProgress(`正在识别：${file.name} …`);
      try {
        const result = await inspectImage(file, {
          project: meta.project || projects[0],
          area: meta.area || '施工现场',
          inspector: meta.inspector || '安全员',
          checkDate: meta.checkDate ? dayjs(meta.checkDate).format('YYYY-MM-DD') : today(),
        });
        setLastResult(result);
        const n = result.summary?.hazard_count ?? 0;
        message.success(n ? `识别完成：发现 ${n} 项隐患` : '识别完成：未发现 PPE 违规隐患');
        await refreshHistory();
      } catch (e) {
        message.error('识别失败：' + (e as Error).message);
        setInspectProgress('失败：' + (e as Error).message);
      } finally {
        setInspecting(false);
        setInspectProgress('');
      }
    },
    [form, refreshHistory],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith('image/'));
      if (!imgs.length) {
        message.warning('请选择图片文件');
        return;
      }
      const h = health ?? (await checkHealth());
      setHealth(h);
      if (!h.model_loaded) {
        message.warning('请先启动 AI 服务并加载模型');
        return;
      }
      for (const f of imgs) {
        await runInspect(f);
      }
    },
    [health, runInspect],
  );

  const writeToLog = useCallback(async () => {
    const cur = lastResultRef.current;
    if (!cur?.record_id) return;
    try {
      await patchRecord(cur.record_id, {
        written_to_log: true,
        recheck_status: (cur.summary?.hazard_count ?? cur.hazard_count ?? 0) ? '整改中' : '无隐患',
        recheck_plan: cur.check_date || today(),
      });
      message.success('已写入一般隐患排查治理记录');
      setLastResult(null);
      await refreshHistory();
    } catch (e) {
      message.error('写入失败：' + (e as Error).message);
    }
  }, [refreshHistory]);

  const openRectify = useCallback(() => {
    const cur = lastResultRef.current;
    if (!cur?.record_id) {
      message.warning('请先完成一次 AI 识别');
      return;
    }
    setRectifyName(cur.rectify_person || '');
    setRectifyTime(cur.rectify_time || today());
    setRectifyOpen(true);
  }, []);

  const submitRectify = useCallback(async () => {
    const cur = lastResultRef.current;
    if (!cur?.record_id) return;
    try {
      await patchRecord(cur.record_id, {
        rectify_person: rectifyName,
        rectify_time: rectifyTime,
        recheck_status: '已整改',
      });
      message.success('整改信息已登记');
      setRectifyOpen(false);
      await refreshHistory();
    } catch (e) {
      message.error('登记失败：' + (e as Error).message);
    }
  }, [rectifyName, rectifyTime, refreshHistory]);

  const viewRecord = useCallback(
    async (id: string) => {
      try {
        const data = await listRecords(50);
        const r = data.items.find((x) => x.id === id);
        if (!r) {
          message.warning('记录不存在');
          return;
        }
        setLastResult(r);
        message.success('已加载记录 ' + id);
      } catch (e) {
        message.error('加载失败：' + (e as Error).message);
      }
    },
    [],
  );

  const hazardList = lastResult?.hazards ?? [];

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">安全日志 AI 巡检</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            对照《房屋市政工程施工安全日志》岗前巡查 / 一般隐患排查 · 开源 YOLOv8 PPE 实时识别 · 非 Demo 模拟
          </Text>
        </div>
        <Tag color={health?.model_loaded ? 'success' : 'error'} icon={<SafetyCertificateOutlined />} style={{ padding: '4px 12px', borderRadius: 8 }}>
          {health?.model_loaded ? 'AI 服务运行中' : 'AI 服务未就绪'}
        </Tag>
      </div>

      {health?.model_loaded ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16, borderRadius: 12 }}
          message={<span style={{ fontSize: 13 }}>YOLO PPE 模型已加载 · 可识别未戴安全帽 / 未穿反光背心 / 防护缺失 / 疑似坠落等隐患</span>}
        />
      ) : (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16, borderRadius: 12 }}
          action={
            <Space>
              <Button size="small" icon={<ReloadOutlined />} loading={checking} onClick={() => void refreshHealth()}>
                重新检测
              </Button>
            </Space>
          }
          message={
            <span style={{ fontSize: 13 }}>
              <strong>AI 服务未就绪</strong>
              <br />
              请在终端启动：<code>cd huangpu-react/ai-service && python -m uvicorn app:app --host 127.0.0.1 --port 8765</code>
              {health?.error ? <span style={{ display: 'block', color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>错误：{health.error}</span> : null}
            </span>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
            <div className="ds-card-title">安全员上传巡检图片</div>
            <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
              <Row gutter={12}>
                <Col span={24}>
                  <Form.Item name="project" label="项目名称" initialValue={projects[0]}>
                    <Select options={projects.map((p) => ({ value: p, label: p }))} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="area" label="检查区域" initialValue="施工现场">
                    <Input placeholder="如：东门 / 基坑南侧" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="inspector" label="检查人" initialValue="安全员">
                    <Input placeholder="项目专职安全生产管理人员" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="checkDate" label="检查日期" initialValue={dayjs()}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
            <Upload.Dragger
              multiple
              accept="image/*"
              disabled={inspecting}
              fileList={fileList}
              beforeUpload={(file) => {
                void handleFiles([file as unknown as File]);
                return false;
              }}
              onChange={({ fileList: fl }) => setFileList(fl)}
              onRemove={() => setFileList([])}
              showUploadList={{ showRemoveIcon: !inspecting, removeIcon: <DeleteOutlined /> }}
            >
              {inspecting ? (
                <p className="ant-upload-drag-icon">
                  <SyncOutlined spin />
                </p>
              ) : (
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
              )}
              <p className="ant-upload-text">拖拽或点击上传巡检照片</p>
              <p className="ant-upload-hint">支持 JPG / PNG · 可多选依次识别</p>
            </Upload.Dragger>
            {inspectProgress ? (
              <div style={{ marginTop: 12 }}>
                <Progress percent={inspecting ? undefined : 100} status={inspecting ? 'active' : 'success'} />
                <Text style={{ fontSize: 12 }}>{inspectProgress}</Text>
              </div>
            ) : null}
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
            <div className="ds-card-title">AI 识别结果</div>
            {!lastResult ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span style={{ fontSize: 13 }}>上传巡检照片后，AI 将自动标注隐患并生成一般隐患记录。</span>}
                style={{ padding: '48px 0' }}
              />
            ) : (
              <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
                <Col xs={24} md={10}>
                  <Image
                    src={imageUrl(lastResult.annotated_url) + `?t=${Date.now()}`}
                    alt="AI 标注结果"
                    style={{ borderRadius: 8, border: '1px solid #ececf0', width: '100%' }}
                    fallback={imageUrl(lastResult.original_url)}
                  />
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingLeft: 0 }}
                    onClick={() => window.open(imageUrl(lastResult.original_url), '_blank', 'noopener')}
                  >
                    查看原图
                  </Button>
                </Col>
                <Col xs={24} md={14}>
                  <Row gutter={12}>
                    <Col span={8}>
                      <div className="ds-card-title" style={{ fontSize: 13 }}>识别人员</div>
                      <Title level={3} style={{ margin: '4px 0' }}>{lastResult.summary?.person_count ?? lastResult.person_count ?? 0}</Title>
                    </Col>
                    <Col span={8}>
                      <div className="ds-card-title" style={{ fontSize: 13 }}>隐患数</div>
                      <Title level={3} style={{ margin: '4px 0', color: (lastResult.summary?.hazard_count ?? lastResult.hazard_count ?? 0) ? '#e5484d' : undefined }}>
                        {lastResult.summary?.hazard_count ?? lastResult.hazard_count ?? 0}
                      </Title>
                    </Col>
                    <Col span={8}>
                      <div className="ds-card-title" style={{ fontSize: 13 }}>最高级别</div>
                      <Tag color={levelColor(lastResult.summary?.highest_level ?? lastResult.highest_level ?? '合规')} style={{ marginTop: 4 }}>
                        {lastResult.summary?.highest_level ?? lastResult.highest_level ?? '合规'}
                      </Tag>
                    </Col>
                  </Row>
                  <div className="ds-card-title" style={{ fontSize: 13, marginTop: 12 }}>六、一般隐患排查治理（AI 生成）</div>
                  <List
                    size="small"
                    style={{ marginTop: 4 }}
                    dataSource={[
                      { k: '隐患情况', v: lastResult.summary?.hazard_situation ?? lastResult.hazard_situation ?? '无' },
                      { k: '所属部位', v: lastResult.area ?? '—' },
                      { k: '整改措施', v: lastResult.summary?.suggestion ?? lastResult.suggestion ?? '—' },
                      { k: '记录编号', v: lastResult.record_id },
                    ]}
                    renderItem={(item) => (
                      <List.Item style={{ padding: '4px 0', fontSize: 13 }}>
                        <Text style={{ width: 70, display: 'inline-block', color: 'rgba(31,35,40,0.55)' }}>{item.k}</Text>
                        <Text style={{ fontFamily: item.k === '记录编号' ? 'monospace' : undefined }}>{item.v}</Text>
                      </List.Item>
                    )}
                  />
                  {hazardList.length ? (
                    <List
                      size="small"
                      style={{ marginTop: 8, maxHeight: 180, overflow: 'auto' }}
                      dataSource={hazardList}
                      renderItem={(h) => (
                        <List.Item style={{ padding: '4px 0', fontSize: 13 }}>
                          <Space size={8} wrap>
                            <Tag color={levelColor(h.level)}>{h.level}</Tag>
                            <Text strong>{h.label_zh}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>{Math.round(h.confidence * 100)}%</Text>
                            <Text style={{ fontSize: 12, color: 'rgba(31,35,40,0.55)' }}>{h.suggestion}</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>未检出 PPE 违规类隐患。</Text>
                  )}
                  <Space style={{ marginTop: 12 }} wrap>
                    <Button
                      type="primary"
                      icon={<CloudUploadOutlined />}
                      disabled={!hazardList.length}
                      onClick={() => void writeToLog()}
                    >
                      写入一般隐患
                    </Button>
                    <Button icon={<SafetyCertificateOutlined />} onClick={openRectify}>
                      登记整改人
                    </Button>
                  </Space>
                </Col>
              </Row>
            )}
          </Card>
        </Col>
      </Row>

      <Card className="ds-card-line" style={{ marginTop: 16 }} styles={{ body: { padding: '16px 24px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="ds-card-title" style={{ margin: 0 }}>AI 巡检历史（写入安全日志）</div>
          <Button size="small" icon={<ReloadOutlined />} loading={loadingHistory} onClick={() => void refreshHistory()}>
            刷新
          </Button>
        </div>
        <Table
          rowKey="id"
          size="small"
          loading={loadingHistory}
          pagination={false}
          dataSource={history}
          locale={{ emptyText: <Spin size="small" style={{ margin: '24px 0' }} /> }}
          columns={[
            { title: '日期', dataIndex: 'check_date', width: 110 },
            { title: '项目', dataIndex: 'project', ellipsis: true },
            { title: '区域', dataIndex: 'area', width: 120 },
            { title: '检查人', dataIndex: 'inspector', width: 100 },
            { title: '隐患数', dataIndex: 'hazard_count', width: 80, render: (v: number) => <Text style={{ color: v ? '#e5484d' : undefined }}>{v}</Text> },
            { title: '级别', dataIndex: 'highest_level', width: 100, render: (v: string) => <Tag color={levelColor(v)}>{v || '—'}</Tag> },
            {
              title: '日志',
              dataIndex: 'written_to_log',
              width: 90,
              render: (v: boolean) => (v ? <Tag color="success">已写入</Tag> : <Tag>未写入</Tag>),
            },
            {
              title: '操作',
              width: 80,
              render: (_, r: InspectionRecord) => (
                <Button type="link" size="small" onClick={() => void viewRecord(r.id)}>查看</Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="登记整改人"
        open={rectifyOpen}
        onOk={() => void submitRectify()}
        onCancel={() => setRectifyOpen(false)}
        okText="确定登记"
      >
        <Form layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="整改人姓名">
            <Input value={rectifyName} onChange={(e) => setRectifyName(e.target.value)} placeholder="如：熊国建" />
          </Form.Item>
          <Form.Item label="整改时间">
            <Input value={rectifyTime} onChange={(e) => setRectifyTime(e.target.value)} placeholder="YYYY-MM-DD" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
