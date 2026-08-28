import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Modal,
  Progress,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import Chart from '../components/Chart';
import type { EChartsOption } from 'echarts';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;

interface Project {
  id: string;
  name: string;
  shortName: string;
  statusLabel: string;
  progress: number;
  lagNodes: number;
  outputTotal: number;
  profitRate: number;
  paymentRate: number;
  risks: { total: number; red: number; yellow: number; blue: number };
  cost: { tenderPrice: number; bidPrice: number; targetCost: number; actualCost: number };
}

const projects = MOCK_DATA.projects as Project[];

const RED_LINE = MOCK_DATA.profitRedLine;
const avgProfit = (projects.reduce((s, p) => s + p.profitRate, 0) / projects.length).toFixed(2);
const belowRed = projects.filter((p) => p.profitRate < RED_LINE);

const PERIODS: Record<string, { label: string; period: string; summary: string; metrics: { name: string; value: string; delta: string; note: string }[] }> =
  (MOCK_DATA as { periodReports: Record<string, unknown> }).periodReports as never;

const DASH_MODULES = [
  { id: 'kpi', label: '核心指标卡片' },
  { id: 'focus', label: '近期重点关注' },
  { id: 'period', label: '周期数据变化' },
  { id: 'rank', label: '四地块每周排名' },
  { id: 'output', label: '进度产值图' },
  { id: 'projects', label: '项目列表' },
  { id: 'dept', label: '部门动态' },
] as const;

type DashModuleId = (typeof DASH_MODULES)[number]['id'];

const MODULES_KEY = 'huangpu-dashboard-modules';

function loadHiddenModules(): DashModuleId[] {
  try {
    const raw = localStorage.getItem(MODULES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    return arr.filter((x): x is DashModuleId => DASH_MODULES.some((m) => m.id === x));
  } catch {
    return [];
  }
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [period, setPeriod] = useState('daily');
  const [rankDim, setRankDim] = useState('综合得分');
  const [hiddenModules, setHiddenModules] = useState<DashModuleId[]>(loadHiddenModules);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftHidden, setDraftHidden] = useState<DashModuleId[]>([]);

  const report = PERIODS[period];
  const ranking = MOCK_DATA.weeklyRanking;

  const rankData = useMemo(
    () =>
      (ranking.rankings as { rank: number; name: string; scores: Record<string, number>; trend: string }[]).map((r) => ({
        rank: r.rank,
        name: r.name,
        score: r.scores[rankDim] ?? 0,
        trend: r.trend,
      })),
    [ranking, rankDim],
  );

  const outputTimeline = (MOCK_DATA as { outputValue: { yearlyChart: { year: number; plan: number; physical: number; measured: number }[] } })
    .outputValue.yearlyChart;

  const outputChartOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 } },
      grid: { top: 56, left: 8, right: 16, bottom: 0, containLabel: true },
      xAxis: {
        type: 'category',
        data: outputTimeline.map((d) => `${d.year}年`),
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: { color: 'rgba(31, 35, 40, 0.55)' },
      },
      yAxis: {
        type: 'value',
        name: '万元',
        nameTextStyle: { color: 'rgba(31, 35, 40, 0.45)', fontSize: 11 },
        splitLine: { lineStyle: { color: '#ececf0' } },
        axisLabel: { color: 'rgba(31, 35, 40, 0.55)' },
      },
      series: [
        { name: '计划', type: 'bar', data: outputTimeline.map((d) => d.plan), itemStyle: { color: '#f4a261', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 },
        { name: '实物量', type: 'bar', data: outputTimeline.map((d) => d.physical), itemStyle: { color: '#2ec4b6', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 },
        { name: '计量', type: 'bar', data: outputTimeline.map((d) => d.measured), itemStyle: { color: '#d4a300', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 },
      ],
    }),
    [outputTimeline],
  );

  const statusColor = (status: string) => (status === 'red' ? 'error' : status === 'yellow' ? 'warning' : 'processing');

  return (
    <div>
      {/* 页面标题 */}
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">
            多项目总览
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            四地块核心指标一屏总览 · 数据 T+1 更新
          </Text>
        </div>
<Space>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => {
              const rows: string[][] = [
                ['项目', '进度%', '累计产值(亿)', '利润率%', '回款率%', '红色风险', '黄色风险'],
                ...projects.map((p) => [p.shortName, String(p.progress), String(p.outputTotal), String(p.profitRate), String(p.paymentRate), String(p.risks.red), String(p.risks.yellow)]),
              ];
              downloadCsv(`四地块总览_${new Date().toISOString().slice(0, 10)}.csv`, rows);
              message.success(`已导出 四地块总览 CSV`);
            }}
          >
            导出报表
          </Button>
          <Button type="primary" icon={<SettingOutlined />} onClick={() => { setDraftHidden(hiddenModules); setCustomizeOpen(true); }}>
            看板自定义
          </Button>
        </Space>
      </div>

      <Modal
        title="看板自定义"
        open={customizeOpen}
        onOk={() => {
          setHiddenModules(draftHidden);
          localStorage.setItem(MODULES_KEY, JSON.stringify(draftHidden));
          message.success('看板配置已保存');
          setCustomizeOpen(false);
        }}
        onCancel={() => setCustomizeOpen(false)}
        okText="应用"
      >
        <div style={{ marginTop: 12 }}>
          <Checkbox.Group
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            value={DASH_MODULES.filter((m) => !draftHidden.includes(m.id)).map((m) => m.id)}
            onChange={(vals) => setDraftHidden(DASH_MODULES.filter((m) => !(vals as string[]).includes(m.id)).map((m) => m.id))}
            options={DASH_MODULES.map((m) => ({ value: m.id, label: m.label }))}
          />
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>勾选的模块将显示在看板中，配置保存在本机</Text>
            <Button
              size="small"
              onClick={() => {
                setDraftHidden([]);
                setHiddenModules([]);
                localStorage.removeItem(MODULES_KEY);
                message.success('已恢复默认布局');
                setCustomizeOpen(false);
              }}
            >
              恢复默认
            </Button>
          </div>
        </div>
      </Modal>

{/* 核心指标 */}
      {!hiddenModules.includes('kpi') && (
        <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #f4a261' } }}>
            <Statistic title="在管地块" value={projects.length} suffix="个" />
            <Text type="secondary" style={{ fontSize: 12 }}>覆盖黄埔区 3 街道</Text>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #2ec4b6' } }}>
            <Statistic title="累计产值" value={projects.reduce((s, p) => s + p.outputTotal, 0).toFixed(2)} suffix="亿元" precision={2} />
            <Text type="secondary" style={{ fontSize: 12 }}><ArrowUpOutlined style={{ color: '#e8853c' }} /> 较上月 +12.4%</Text>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #d4a300' } }}>
            <Statistic title="风险总数" value={projects.reduce((s, p) => s + p.risks.total, 0)} suffix="项" />
            <Text type="secondary" style={{ fontSize: 12 }}>
              <Text type="warning" style={{ fontSize: 12 }}>{projects.reduce((s, p) => s + p.risks.red, 0)} 项红色</Text>
              {' · '}
              {projects.reduce((s, p) => s + p.risks.yellow, 0)} 项黄色
            </Text>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #e5484d' } }}>
            <Statistic title="实际利润率均值" value={avgProfit} suffix="%" precision={2} valueStyle={{ color: +avgProfit < RED_LINE ? '#e5484d' : undefined }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              <Text style={{ fontSize: 12, color: '#e5484d' }}><ArrowDownOutlined /> {+avgProfit < RED_LINE ? '低于' : '高于'}红线 {RED_LINE}%</Text>
            </Text>
          </Card>
</Col>
      </Row>
      )}

      {/* 近期重点关注 */}
      {!hiddenModules.includes('focus') && (
        <Card
        className="ds-card-line"
        style={{ marginTop: 16 }}
        styles={{ body: { padding: '16px 24px' } }}
        title={<div className="ds-card-title" style={{ marginBottom: 0 }}>近期重点关注</div>}
      >
        <Space wrap size={[8, 8]}>
          {belowRed.map((p) => (
            <Tag color="error" icon={<ExclamationCircleOutlined />} key={`${p.id}-red`}>
              {p.shortName} 利润率 {p.profitRate}% 跌破红线 {RED_LINE}%
            </Tag>
          ))}
          {projects.filter((p) => p.lagNodes > 0).map((p) => (
            <Tag color="warning" key={`${p.id}-lag`}> {p.shortName} 进度滞后 {p.lagNodes} 节点</Tag>
          ))}
          {projects.filter((p) => p.risks.red > 0).map((p) => (
            <Tag color="error" key={`${p.id}-risk`}> {p.shortName} 红色风险 {p.risks.red} 项</Tag>
          ))}
          {projects.filter((p) => p.paymentRate < 90).map((p) => (
            <Tag color="warning" key={`${p.id}-pay`}> {p.shortName} 回款率 {p.paymentRate}%</Tag>
          ))}
        </Space>
      </Card>
      )}

      {/* 周期数据 + 每周排名 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {!hiddenModules.includes('period') && (
        <Col xs={24} lg={14}>
          <Card
            className="ds-card-line"
            styles={{ body: { padding: '16px 24px' } }}
            title={
              <div className="ds-card-title" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
                <span>周期数据变化</span>
                <Segmented
                  value={period}
                  onChange={(v) => setPeriod(String(v))}
                  options={['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map((k) => ({ value: k, label: PERIODS[k].label }))}
                  size="small"
                />
              </div>
            }
          >
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
              {report.period} · {report.summary}
            </Text>
            <Row gutter={[8, 8]}>
              {report.metrics.map((m) => (
                <Col span={8} key={m.name}>
                  <Card size="small" variant="borderless" styles={{ body: { padding: 8 } }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{m.name}</Text>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#1f2328' }} className="ds-num">{m.value}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{m.note}</Text>
                  </Card>
                </Col>
              ))}
            </Row>
            <Space style={{ marginTop: 12 }}>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => {
                  const rows: string[][] = [
                    ['指标', '数值', '环比', '说明'],
                    ...report.metrics.map((m) => [m.name, m.value, m.delta, m.note]),
                  ];
                  downloadCsv(`周期报表_${report.label}.csv`, rows);
                  message.success(`已导出 ${report.label} 报表 CSV`);
                }}
              >
                按部门导出 CSV
              </Button>
            </Space>
          </Card>
        </Col>
        )}
        {!hiddenModules.includes('rank') && (
        <Col xs={24} lg={10}>
          <Card
            className="ds-card-line"
            styles={{ body: { padding: '16px 24px' } }}
            title={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start', padding: '20px 0 12px 0' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2328' }}>
                  四地块每周排名 · {ranking.week}
                </span>
                <Segmented size="small" value={rankDim} onChange={(v) => setRankDim(String(v))} options={ranking.dimensions.map((d) => ({ value: d, label: d.replace('得分', '') }))} />
              </div>
            }
          >
            <Table
              size="small"
              rowKey="rank"
              pagination={false}
              columns={[
                { title: '排名', dataIndex: 'rank', width: 56, render: (v: number) => (v <= 3 ? <Text strong style={{ color: '#f4a261' }}>{v}</Text> : v) },
                { title: '项目', dataIndex: 'name' },
                {
                  title: rankDim,
                  dataIndex: 'score',
                  render: (v: number) => (
                    <Space size={8}>
                      <span className="ds-num">{v}</span>
                      <Progress percent={v} showInfo={false} size="small" style={{ width: 72 }} strokeColor={v < 70 ? '#d4a300' : '#f4a261'} />
                    </Space>
                  ),
                },
                {
                  title: '趋势',
                  dataIndex: 'trend',
                  width: 64,
                  render: (t: string) =>
                    t === 'up' ? <Tag color="success"><ArrowUpOutlined /></Tag> : t === 'down' ? <Tag color="error"><ArrowDownOutlined /></Tag> : <Tag>平</Tag>,
                },
              ]}
              dataSource={rankData}
            />
          </Card>
        </Col>
        )}
      </Row>

      {/* 进度产值 + 项目卡片 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {!hiddenModules.includes('output') && (
        <Col xs={24} lg={12}>
          <Card
            className="ds-card-line"
            styles={{ body: { padding: '16px 24px' } }}
            title={<div className="ds-card-title" style={{ marginBottom: 0 }}>进度产值（四项目汇总）</div>}
          >
            <Chart option={outputChartOption} height={240} />
          </Card>
        </Col>
        )}
        {!hiddenModules.includes('projects') && (
        <Col xs={24} lg={12}>
          <Card
            className="ds-card-line"
            styles={{ body: { padding: '16px 24px' } }}
            title={<div className="ds-card-title" style={{ marginBottom: 0 }}>项目列表（点击下钻）</div>}
          >
            <Row gutter={[12, 12]}>
              {projects.map((p) => (
                <Col xs={12} key={p.id}>
                  <Card
                    hoverable
                    size="small"
                    className="ds-card-line"
                    styles={{ body: { padding: 12 } }}
                    onClick={() => (window.location.hash = '#/project')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ color: '#1f2328' }}>{p.shortName}</Text>
                      <Tag color={p.statusLabel === '首期试点' ? 'processing' : p.statusLabel === '在建' ? 'success' : 'default'}>
                        {p.statusLabel}
                      </Tag>
                    </div>
                    <Progress percent={p.progress} size="small" strokeColor="#f4a261" style={{ margin: '8px 0 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>利润率 <Text strong style={{ color: p.profitRate < RED_LINE ? '#e5484d' : '#f4a261' }}>{p.profitRate}%</Text></Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>产值 {p.outputTotal} 亿</Text>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
        )}
      </Row>

      {/* 周期部门明细 */}
      {!hiddenModules.includes('dept') && (
      <Card
        className="ds-card-line"
        style={{ marginTop: 16 }}
        styles={{ body: { padding: '16px 24px' } }}
        title={<div className="ds-card-title" style={{ marginBottom: 0 }}>{report.label} · 部门动态</div>}
      >
        {(report as unknown as { byDept: { dept: string; detail: string }[] }).byDept.map((d) => (
          <div key={d.dept} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #ececf0' }}>
            <Tag color="cyan" style={{ flexShrink: 0 }}>{d.dept}</Tag>
            <Text style={{ fontSize: 13, color: 'rgba(31, 35, 40, 0.72)' }}>{d.detail}</Text>
          </div>
        ))}
        {(report as unknown as { focus: { level: string; title: string; desc: string }[] }).focus.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <Text strong style={{ fontSize: 13 }}>关注事项：</Text>
            <Space wrap size={[8, 8]} style={{ marginTop: 8 }}>
              {(report as unknown as { focus: { level: string; title: string; desc: string }[] }).focus.map((f) => (
                <Tag key={f.title} color={statusColor(f.level === '高' ? 'red' : f.level === '中' ? 'yellow' : 'blue')}>
                  {f.title}：{f.desc}
                </Tag>
              ))}
            </Space>
          </div>
        ) : null}
      </Card>
      )}

      <div style={{ height: 16 }} />
      {rankData.length === 0 && <Empty />}
    </div>
  );
}

