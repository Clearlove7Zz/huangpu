import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Col, Empty, Image, Input, InputNumber, Modal, Progress, Row, Select, Space, Table, Tabs, Tag, Timeline, Typography, message } from 'antd';
import { CloudUploadOutlined, ExportOutlined, RobotOutlined } from '@ant-design/icons';
import Chart from '../components/Chart';
import type { EChartsOption } from 'echarts';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;

interface ProjDetail {
  licenses: { name: string; status: string; date: string; deadline: string; warn: boolean }[];
  designProgress: { major: string; plan: string; actual: string; rate: number; lag: boolean }[];
  milestones: { name: string; plan: string; actual: string; status: string; reason: string }[];
  risks: { engineering: { level: string; desc: string; owner: string; status: string; deadline: string }[]; economic: { level: string; desc: string; owner: string; status: string; deadline: string }[]; design: { level: string; desc: string; owner: string; status: string; deadline: string }[] };
  costSections: { name: string; value: number; pct: number }[];
  threeValueCompare: { major: string; tender: number; bid: number; target: number; actual: number }[];
  benchmarkTop: { item: string; diff: number; amount: number; reason: string }[];
  benchmarkSave: { item: string; diff: number; amount: number; reason: string }[];
  otherDirectCosts: { versions: string[]; items: { name: string; v1: number; v2: number; v3: number }[] };
  subcontracts: { company: string; contract: number; paid: number; remain: number; overpay: boolean }[];
  materials: { name: string; budget: number; purchased: number; consumed: number; unit: string; warn: boolean; source: string }[];
  outputByMajor: { major: string; value: number }[];
  honors: { name: string; date: string; status: string; cert: boolean }[];
  inspections: { date: string; type: string; result: string; status: string; inspector: string }[];
  majorEvents: { date: string; title: string; type: string; desc: string; image: string }[];
}

interface AerialPhotoGroup {
  month: string;
  label: string;
  desc: string;
  photos: string[];
  aiCompare?: boolean;
  compareWith?: string;
  aiSummary?: string;
  annotations?: Record<string, { x: number; y: number; label: string; type: string }[]>;
}

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  done: { color: 'success', label: '已完成' },
  doing: { color: 'processing', label: '进行中' },
  pending: { color: 'default', label: '未开始' },
  lag: { color: 'error', label: '滞后' },
};

const RISK_TAG: Record<string, string> = { red: 'error', yellow: 'warning', blue: 'processing' };

const MARKER_COLOR: Record<string, string> = { new: '#52c41a', progress: '#1890ff', change: '#faad14' };

export default function ProjectDetail() {
  const projects = MOCK_DATA.projects as {
    id: string; shortName: string; name: string; builder: string; contractMode: string; area: number; totalCost: number;
    progress: number; lagNodes: number; outputTotal: number; outputMonth: number; profitRate: number; paymentRate: number; costCompletion: number;
  }[];
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  // URL 参数为唯一真相源：点卡片/切下拉框都走导航，同路由仅变参数不重挂载的坑由此规避
  const projectId = routeId && projects.some((p) => p.id === routeId) ? routeId : projects[0].id;
  const [lightbox, setLightbox] = useState<{ src: string; caption: string; group: AerialPhotoGroup; photo: string } | null>(null);
  // 数据对象与 ProjDetail 为手工对齐的形状（运行时字段齐全），TS 无法证明重叠，按其建议走 unknown 中转
  const details = MOCK_DATA.projectDetails as unknown as Record<string, ProjDetail>;
  const detail = details[projectId];
  const aerialPhotos = (MOCK_DATA.aerialPhotos as AerialPhotoGroup[]) ?? [];
  const jarvisBim = MOCK_DATA.jarvisBim as { url: string; account: string; password: string; note: string };
  // 可编辑开关已随勾选框移除：demo 的内联编辑无持久化，属脚手架，页面固定只读展示
  const editable = false;

  const pieData = useMemo(
    () => (detail ? detail.outputByMajor.map((o) => ({ name: o.major, value: o.value })) : []),
    [detail],
  );

  const pieOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'item', formatter: '{b}：{c} 亿元（{d}%）' },
      legend: { bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 } },
      series: [
        {
          name: '专业产值',
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, formatter: '{b}\n{c} 亿', fontSize: 12, color: 'rgba(31, 35, 40, 0.72)' },
          labelLine: { length: 12, length2: 8 },
          emphasis: { label: { fontWeight: 600 } },
          color: ['#f4a261', '#2ec4b6', '#d4a300', '#6b7280'],
          data: pieData,
        },
      ],
    }),
    [pieData],
  );

  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const events = detail?.majorEvents ?? [];
  const profitRedLine = MOCK_DATA.profitRedLine as number;

  const kpiCards = [
    {
      label: '整体进度',
      value: `${project.progress}%`,
      unit: '',
      trend: project.lagNodes > 0 ? `滞后节点 ${project.lagNodes}个` : '无滞后节点',
      warn: project.lagNodes > 0,
      border: project.lagNodes > 0 ? '#e5484d' : '#2ec4b6',
    },
    {
      label: '累计产值',
      value: `${project.outputTotal}`,
      unit: '亿',
      trend: `本月 ${project.outputMonth} 亿`,
      warn: false,
      border: '#f4a261',
    },
    {
      label: '实际利润率',
      value: `${project.profitRate}%`,
      unit: '',
      trend: `目标利润率 ${profitRedLine}%（固定）· 业主利润 ${MOCK_DATA.ownerProfitRate}%`,
      warn: project.profitRate < profitRedLine,
      border: project.profitRate < profitRedLine ? '#e5484d' : '#2ec4b6',
    },
    {
      label: '回款率',
      value: `${project.paymentRate}%`,
      unit: '',
      trend: `成本完成 ${project.costCompletion}%`,
      warn: false,
      border: '#d4a300',
    },
  ];

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">
            单项目详情
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {project.builder} · {project.contractMode} · 建面{(project.area / 10000).toFixed(1)}万㎡ · EPC标的{project.totalCost}亿元
          </Text>
        </div>
        <Select
          value={projectId}
          onChange={(newId) => navigate(`/project/${newId}`)}
          style={{ width: 240 }}
          options={projects.map((p) => ({ value: p.id, label: `${p.shortName}（${p.name}）` }))}
        />
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {kpiCards.map((k) => (
          <Col xs={12} lg={6} key={k.label}>
            <Card className="ds-card-line" styles={{ body: { padding: '14px 20px', borderTop: `3px solid ${k.border}` } }}>
              <Text style={{ fontSize: 13, color: 'rgba(31, 35, 40, 0.45)' }}>{k.label}</Text>
              <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.3, color: k.warn ? '#e5484d' : 'rgba(31, 35, 40, 0.88)' }}>
                {k.value}
                {k.unit && <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 4 }}>{k.unit}</span>}
              </div>
              <Text style={{ fontSize: 12, color: k.warn ? '#e5484d' : 'rgba(31, 35, 40, 0.45)' }}>{k.trend}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
        <Tabs
          items={[
            {
              key: 'licenses',
              label: '证照办理',
              children: (
                <Table
                  rowKey="name"
                  pagination={false}
                  columns={[
                    { title: '证照事项', dataIndex: 'name', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                    { title: '状态', dataIndex: 'status', width: 100, render: (s: string) => editable ? <Input size="small" defaultValue={s} /> : <Tag color={STATUS_TAG[s]?.color}>{STATUS_TAG[s]?.label}</Tag> },
                    { title: '完成日期', dataIndex: 'date', width: 120, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                    { title: '时限', dataIndex: 'deadline', width: 120, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                    { title: '提示', dataIndex: 'warn', width: 100, render: (w: boolean) => (w ? <Tag color="error">临近时限</Tag> : '—') },
                  ]}
                  dataSource={detail.licenses}
                />
              ),
            },
            {
              key: 'schedule',
              label: '施工计划与进度',
              children: (
                <>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>设计进度表</Text>
                  <Table
                    size="small"
                    rowKey="major"
                    pagination={false}
                    columns={[
                      { title: '专业', dataIndex: 'major', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '计划', dataIndex: 'plan', width: 110, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '实际', dataIndex: 'actual', width: 110, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '完成度', dataIndex: 'rate', width: 180, render: (v: number) => <Progress percent={v} size="small" strokeColor="#f4a261" /> },
                      { title: '状态', dataIndex: 'lag', width: 90, render: (lag: boolean) => (lag ? <Tag color="error">滞后</Tag> : <Tag color="success">正常</Tag>) },
                    ]}
                    dataSource={detail.designProgress}
                  />
                  <Text strong style={{ fontSize: 13, display: 'block', margin: '16px 0 8px' }}>里程碑时间轴</Text>
                  <Timeline
                    items={detail.milestones.map((m) => ({
                      color: m.status === 'lag' ? 'red' : m.status === 'doing' ? 'blue' : 'gray',
                      children: (
                        <div>
                          <Space>
                            <Text strong style={{ fontSize: 13 }}>{m.name}</Text>
                            <Tag color={STATUS_TAG[m.status]?.color}>{STATUS_TAG[m.status]?.label}</Tag>
                          </Space>
                          <div style={{ fontSize: 12, color: 'rgba(31, 35, 40, 0.45)' }}>
                            计划 {m.plan} · 实际 {m.actual || '—'}
                            {m.reason && ` · ${m.reason}`}
                          </div>
                        </div>
                      ),
                    }))}
                  />
                </>
              ),
            },
            {
              key: 'safety',
              label: '安全巡检与形象进度',
              children: (
                <>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>巡检记录</Text>
                  <Table
                    size="small"
                    rowKey="date"
                    pagination={false}
                    columns={[
                      { title: '日期', dataIndex: 'date', width: 110, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '类型', dataIndex: 'type', width: 110, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '结果', dataIndex: 'result', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={v === '整改中' ? 'warning' : 'success'}>{v}</Tag> },
                      { title: '检查方', dataIndex: 'inspector', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                    ]}
                    dataSource={detail.inspections}
                  />

                  <Text strong style={{ fontSize: 13, display: 'block', margin: '20px 0 8px' }}>内部形象进度</Text>
                  <div style={{ border: '1px solid #ececf0', borderRadius: 10, overflow: 'hidden', background: '#f7f8fa' }}>
                    <iframe
                      src={jarvisBim.url}
                      title="内部形象进度 Jarvis BIM"
                      style={{ width: '100%', height: 420, border: 'none' }}
                      allow="fullscreen"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                    Jarvis BIM · 账号 {jarvisBim.account} · {jarvisBim.note}
                  </Text>

                  <Text strong style={{ fontSize: 13, display: 'block', margin: '20px 0 8px' }}>外部形象进度</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>航拍 AI 对比 · 标注新增/变化区域 · 每月更新保留历史</Text>
                    <Space style={{ marginLeft: 'auto' }}>
                      <Button
                        size="small"
                        icon={<RobotOutlined />}
                        onClick={() => message.success('AI对比完成 · 已标注最新月相对上月新增进展区域')}
                      >
                        运行AI对比分析
                      </Button>
                      <Button
                        size="small"
                        icon={<CloudUploadOutlined />}
                        onClick={() => message.success('Demo：上传本月航拍图（支持历史版本保留）')}
                      >
                        上传本月航拍
                      </Button>
                    </Space>
                  </div>

                  {aerialPhotos.map((g) => (
                    <div key={g.month} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                        <Text strong style={{ fontSize: 16 }}>{g.label} · {g.month}</Text>
                        <Text type="secondary" style={{ fontSize: 13 }}>{g.desc}</Text>
                      </div>
                      {g.aiCompare && (
                        <div style={{ marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: 'rgba(46, 196, 182, 0.10)', color: '#0f766e', fontSize: 12 }}>
                          <RobotOutlined /> AI对比 {g.compareWith} → {g.label}：{g.aiSummary}
                        </div>
                      )}
                      <Row gutter={[12, 12]}>
                        {g.photos.map((p) => {
                          const markers = g.annotations?.[p] ?? [];
                          return (
                            <Col xs={12} md={8} key={p}>
                              <div
                                style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'zoom-in', border: '1px solid #ececf0', aspectRatio: '4 / 3', background: '#f0f0f0' }}
                                onClick={() => setLightbox({ src: `/assets/aerial/${p}`, caption: `${g.label} - ${g.desc}`, group: g, photo: p })}
                              >
                                <img src={`/assets/aerial/${p}`} alt={g.label} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                {markers.map((m, i) => (
                                  <span
                                    key={i}
                                    title={m.label}
                                    style={{
                                      position: 'absolute', left: `${m.x}%`, top: `${m.y}%`, transform: 'translate(-50%, -50%)',
                                      background: MARKER_COLOR[m.type] ?? '#1890ff', color: '#fff', fontSize: 10, lineHeight: '16px',
                                      padding: '0 6px', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.35)', whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {m.label}
                                  </span>
                                ))}
                                <div style={{ position: 'absolute', left: 8, bottom: 8, background: 'rgba(15, 23, 42, 0.66)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
                                  {g.label}{g.aiCompare ? ' · AI已标注' : ''}
                                </div>
                              </div>
                            </Col>
                          );
                        })}
                      </Row>
                    </div>
                  ))}
                </>
              ),
            },
            {
              key: 'risks',
              label: '风险管控',
              children: (
                <Row gutter={[16, 16]}>
                  {(['engineering', 'economic', 'design'] as const).map((dim) => (
                    <Col xs={24} md={8} key={dim}>
                      <Card size="small" className="ds-card-line" styles={{ body: { padding: 12 } }}>
                        <Text strong style={{ fontSize: 13 }}>
                          {dim === 'engineering' ? '工程风险' : dim === 'economic' ? '经济风险' : '设计风险'}
                        </Text>
                        {detail.risks[dim].length === 0 && <Empty description="暂无风险" imageStyle={{ height: 40 }} />}
                        {detail.risks[dim].map((r) => (
                          <div key={r.desc} style={{ padding: '8px 0', borderBottom: '1px solid #ececf0' }}>
                            <Space size={6}>
                              <Tag color={RISK_TAG[r.level]}>{r.level === 'red' ? '红' : r.level === 'yellow' ? '黄' : '蓝'}</Tag>
                              <Text style={{ fontSize: 13 }}>{r.desc}</Text>
                            </Space>
                            <div style={{ fontSize: 12, color: 'rgba(31, 35, 40, 0.45)', marginTop: 4 }}>
                              责任人 {r.owner} · {r.status} · 期限 {r.deadline}
                            </div>
                          </div>
                        ))}
                      </Card>
                    </Col>
                  ))}
                </Row>
              ),
            },
            {
              key: 'cashflow',
              label: '动态现金流',
              children: (
                <div style={{ padding: '12px 16px', background: '#f5f5f5', borderRadius: 8, fontSize: 13 }}>
                  <Text strong>2026-05 结余 220 万</Text>
                  <Text style={{ color: 'rgba(31, 35, 40, 0.72)' }}> · 预测 6 月 260 万 · 回款率 {project.paymentRate}%</Text>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      完整月度明细/敏感性分析见「动态现金流」模块；本页为只读嵌入视图。
                    </Text>
                  </div>
                </div>
              ),
            },
            {
              key: 'cost',
              label: '成本管控',
              children: (
                <>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>三值对比（亿元）</Text>
                      <Table
                        size="small"
                        rowKey="major"
                        pagination={false}
                        columns={[
                           { title: '分项', dataIndex: 'major', width: 180 },
                           { title: '招标价', dataIndex: 'tender', width: 110, align: 'right' },
                           { title: '合同价', dataIndex: 'bid', width: 110, align: 'right' },
                           { title: '目标成本', dataIndex: 'target', width: 110, align: 'right' },
                           { title: '实际成本', dataIndex: 'actual', width: 110, align: 'right', render: (v: number, r: { actual: number; target: number }) => (
                              <span style={{ color: v != null && v > r.target ? '#e5484d' : '#e8853c', fontWeight: 600 }}>{v ?? '—'}</span>
                            ) },
                        ]}
                         dataSource={detail.threeValueCompare}
                         scroll={{ x: 650 }}
                      />
                    </Col>
                    <Col xs={24} lg={12}>
                      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>成本构成（亿元）</Text>
                      {detail.costSections.map((c) => (
                        <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <Text style={{ fontSize: 13, width: 90, color: 'rgba(31, 35, 40, 0.72)' }}>{c.name}</Text>
                          <Progress percent={c.pct} size="small" style={{ flex: 1 }} strokeColor="#f4a261" />
                          <Text className="ds-num" style={{ fontSize: 13, width: 70, textAlign: 'right' }}>{c.value} 亿</Text>
                        </div>
                      ))}
                    </Col>
                  </Row>
                  <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col xs={24} md={12}>
                      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>超支 Top（三算对比基准）</Text>
                      <Table
                        size="small"
                        rowKey="item"
                        pagination={false}
                        columns={[
                           { title: '项', dataIndex: 'item', width: 160, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                          { title: '偏差', dataIndex: 'diff', width: 80, align: 'right', render: (v: number) => <span style={{ color: '#e5484d' }}>+{v}%</span> },
                          { title: '金额(万)', dataIndex: 'amount', width: 90, align: 'right', className: 'ds-num' },
                           { title: '原因', dataIndex: 'reason', width: 180, ellipsis: true },
                        ]}
                         dataSource={detail.benchmarkTop}
                         scroll={{ x: 520 }}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>结余项（三算对比基准）</Text>
                      <Table
                        size="small"
                        rowKey="item"
                        pagination={false}
                        columns={[
                           { title: '项', dataIndex: 'item', width: 160 },
                          { title: '偏差', dataIndex: 'diff', width: 80, align: 'right', render: (v: number) => <span style={{ color: '#e8853c' }}>{v}%</span> },
                          { title: '金额(万)', dataIndex: 'amount', width: 90, align: 'right' },
                           { title: '原因', dataIndex: 'reason', width: 180, ellipsis: true },
                        ]}
                         dataSource={detail.benchmarkSave}
                         scroll={{ x: 520 }}
                      />
                    </Col>
                  </Row>
                  <Text strong style={{ fontSize: 13, display: 'block', margin: '16px 0 8px' }}>物资消耗预警</Text>
                  <Table
                    size="small"
                    rowKey="name"
                    pagination={false}
                    columns={[
                      { title: '材料', dataIndex: 'name', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '预算', dataIndex: 'budget', align: 'right', render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 100 }} /> : v },
                      { title: '采购', dataIndex: 'purchased', align: 'right', render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 100 }} /> : v },
                      { title: '消耗', dataIndex: 'consumed', align: 'right', render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 100 }} /> : v },
                      { title: '单位', dataIndex: 'unit', width: 70 },
                      { title: '偏差', dataIndex: 'warn', width: 100, render: (w: boolean) => (w ? <Tag color="error">超量预警</Tag> : <Tag color="success">正常</Tag>) },
                    ]}
                    dataSource={detail.materials}
                    scroll={{ x: 600 }}
                  />
                  <Text strong style={{ fontSize: 13, display: 'block', margin: '16px 0 8px' }}>分包付款台账</Text>
                  <Table
                    size="small"
                    rowKey="company"
                    pagination={false}
                    columns={[
                      { title: '分包单位', dataIndex: 'company', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '合同额(万)', dataIndex: 'contract', align: 'right', render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 110 }} /> : v },
                      { title: '已付(万)', dataIndex: 'paid', align: 'right', render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 110 }} /> : v },
                      { title: '剩余(万)', dataIndex: 'remain', align: 'right' },
                      { title: '超付', dataIndex: 'overpay', width: 80, render: (v: boolean) => (v ? <Tag color="error">超付</Tag> : <Tag color="success">正常</Tag>) },
                    ]}
                    dataSource={detail.subcontracts}
                  />
                </>
              ),
            },
            {
              key: 'events',
              label: '项目大事记',
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <Button size="small" icon={<ExportOutlined />} onClick={() => message.success('正在导出：项目大事记汇总 (Excel)')}>
                      导出
                    </Button>
                  </div>
                  {events.length === 0 && <Empty description="暂无大事记" />}
                  {events.map((e) => (
                    <div key={e.date + e.title} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid #ececf0' }}>
                      <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', width: 120, height: 80, background: '#f0f2f5', border: '1px solid #ececf0' }}>
                        {e.image ? (
                          <Image src={e.image} alt={e.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 12 }}>无图</div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'rgba(31, 35, 40, 0.45)' }}>{e.date}</div>
                        <Space size={8} style={{ marginTop: 2 }}>
                          <Text strong style={{ fontSize: 13 }}>{e.title}</Text>
                          <Tag color="orange">{e.type}</Tag>
                        </Space>
                        <div style={{ fontSize: 12, color: 'rgba(31, 35, 40, 0.66)', marginTop: 2 }}>{e.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: 'honors',
              label: '产值与荣誉',
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>专业产值（亿元）</Text>
                    <Chart option={pieOption} height={280} />
                  </Col>
                  <Col xs={24} md={12}>
                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>创奖申报</Text>
                    <Table
                      size="small"
                      rowKey="name"
                      pagination={false}
                      columns={[
                         { title: '奖项', dataIndex: 'name', width: 180 },
                        { title: '节点', dataIndex: 'date', width: 110 },
                        { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={v === '申报中' ? 'processing' : 'default'}>{v}</Tag> },
                      ]}
                      dataSource={detail.honors}
                    />
                  </Col>
                </Row>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={lightbox != null}
        footer={null}
        onCancel={() => setLightbox(null)}
        width={900}
        title={lightbox?.caption}
      >
        {lightbox && (
          <div>
            <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden' }}>
              <img src={lightbox.src} alt={lightbox.caption} style={{ width: '100%', display: 'block' }} />
              {(lightbox.group.annotations?.[lightbox.photo] ?? []).map((m, i) => (
                <span
                  key={i}
                  style={{
                    position: 'absolute', left: `${m.x}%`, top: `${m.y}%`, transform: 'translate(-50%, -50%)',
                    background: MARKER_COLOR[m.type] ?? '#1890ff', color: '#fff', fontSize: 12, lineHeight: '20px',
                    padding: '0 8px', borderRadius: 4, boxShadow: '0 1px 6px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
                  }}
                >
                  {m.label}
                </span>
              ))}
            </div>
            {lightbox.group.aiCompare && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(46, 196, 182, 0.10)', color: '#0f766e', fontSize: 13 }}>
                <RobotOutlined /> AI对比分析（{lightbox.group.compareWith} → {lightbox.group.label}）：{lightbox.group.aiSummary}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
