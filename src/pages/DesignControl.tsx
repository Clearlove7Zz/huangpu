import { useMemo, useState } from 'react';
import { Card, Col, Progress, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import Chart from '../components/Chart';
import type { EChartsOption } from 'echarts';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;

const PHASE_STATUS: Record<string, { color: string; label: string }> = {
  done: { color: 'success', label: '已完成' },
  doing: { color: 'processing', label: '进行中' },
  pending: { color: 'default', label: '未开始' },
  lag: { color: 'error', label: '滞后' },
};

type Plot = {
  id: string;
  name: string;
  projects: {
    id: string;
    name: string;
    overallProgress: number;
    deviationRate: number;
    changeImpact: { count: number; scheduleDays: number; costWan: number };
    phases: Record<string, { plan: string; actual: string; progress: number; status: string; disciplines: { name: string; rate: number; status: string }[] }>;
    drawingChanges: { no: string; phase: string; reason: string; scheduleDays: number; costWan: number; date: string }[];
  }[];
};

export default function DesignControl() {
  const data = MOCK_DATA.designControl as {
    phaseKeys: { key: string; name: string }[];
    plots: Plot[];
    overallSummary: { totalProjects: number; avgDeviationRate: number; totalChanges: number; totalScheduleDays: number; totalCostWan: number; onTrack: number; lagging: number };
  };

  const summary = data.overallSummary;
  const allProjects = data.plots.flatMap((p) => p.projects);

  const [plotId, setPlotId] = useState(data.plots[0].id);
  const [projectId, setProjectId] = useState(data.plots[0].projects[0].id);
  const [activePhase, setActivePhase] = useState<string>(data.phaseKeys[3]?.key ?? data.phaseKeys[0]?.key ?? '');

  const plot = data.plots.find((p) => p.id === plotId) ?? data.plots[0];
  const proj = plot.projects.find((p) => p.id === projectId) ?? plot.projects[0];

  const onPlotChange = (id: string) => {
    const p = data.plots.find((x) => x.id === id);
    setPlotId(id);
    if (p) setProjectId(p.projects[0].id);
  };

  const devChartOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 } },
      grid: { top: 40, left: 8, right: 16, bottom: 0, containLabel: true },
      xAxis: {
        type: 'category',
        data: allProjects.map((p) => p.name.replace('地块', '')),
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: { color: 'rgba(31, 35, 40, 0.55)' },
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#ececf0' } }, axisLabel: { color: 'rgba(31, 35, 40, 0.55)' } },
      series: [
        { name: '设计完成度%', type: 'bar', data: allProjects.map((p) => p.overallProgress), itemStyle: { color: '#597ef7', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 24 },
        { name: '进度偏差率%', type: 'bar', data: allProjects.map((p) => p.deviationRate), itemStyle: { color: '#faad14', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 24 },
      ],
    }),
    [allProjects],
  );

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">设计管控</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            五阶段设计进度 · 六维看板 · 设计变更跟踪
          </Text>
        </div>
        <Space>
          <Select
            size="middle"
            style={{ width: 180 }}
            value={plotId}
            onChange={onPlotChange}
            options={data.plots.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Select
            size="middle"
            style={{ width: 200 }}
            value={proj.id}
            onChange={setProjectId}
            options={plot.projects.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #f4a261', height: 110 } }}>
            <Statistic title="设计项目" value={summary.totalProjects} suffix="个" />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #2ec4b6', height: 110 } }}>
            <Statistic title="平均偏差率" value={summary.avgDeviationRate} suffix="%" precision={1} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #d4a300', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' } }}>
            <Statistic title="设计变更" value={summary.totalChanges} suffix="项" />
            <Text type="secondary" style={{ fontSize: 12 }}>影响工期 {summary.totalScheduleDays} 天 / 成本 {summary.totalCostWan} 万</Text>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #e5484d', height: 110 } }}>
            <Statistic title="受控状态" value={`${summary.onTrack} 正常`} suffix={`/ ${summary.lagging} 滞后`} />
          </Card>
        </Col>
      </Row>

      <Card className="ds-card-line" style={{ marginTop: 16 }} styles={{ body: { padding: '16px 24px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text strong style={{ fontSize: 14, color: '#1f2328' }}>{proj.name} · 设计整体完成度</Text>
          <Space size={12}>
            <Tag color={proj.deviationRate > 10 ? 'error' : 'success'}>偏差率 {proj.deviationRate}%</Tag>
            <Tag color="processing">变更 {proj.changeImpact.count} 项 · {proj.changeImpact.scheduleDays} 天 · {proj.changeImpact.costWan} 万</Tag>
          </Space>
        </div>
        <Row gutter={[12, 12]}>
          {data.phaseKeys.map((pk) => {
            const ph = proj.phases[pk.key];
            if (!ph) return null;
            const active = activePhase === pk.key;
            return (
              <Col xs={24} md={12} key={pk.key} style={{ flex: 1, minWidth: 200 }}>
                <Card
                  size="small"
                  className="ds-card-line"
                  onClick={() => setActivePhase(pk.key)}
                  style={{ borderColor: active ? '#f4a261' : undefined, borderWidth: active ? 2 : 1, cursor: 'pointer', height: '100%' }}
                  styles={{ body: { padding: 12, height: 158, display: 'flex', flexDirection: 'column' } }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: 500 }}>{pk.name}</Text>
                    <Tag color={PHASE_STATUS[ph.status]?.color}>{PHASE_STATUS[ph.status]?.label}</Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>计划 {ph.plan} · 实际 {ph.actual || '—'}</Text>
                  <Progress percent={ph.progress} size="small" strokeColor="#f4a261" style={{ margin: '8px 0' }} />
                  <Space wrap size={[4, 4]} style={{ marginTop: 'auto' }}>
                    {ph.disciplines.map((d) => (
                      <Tag key={d.name} color={d.status === 'lag' ? 'error' : d.status === 'done' ? 'success' : d.status === 'doing' ? 'processing' : 'default'}>
                        {d.name} {d.rate}%
                      </Tag>
                    ))}
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Card>

      <Card className="ds-card-line" style={{ marginTop: 16 }} styles={{ body: { padding: '16px 24px' } }}>
        <div className="ds-card-title" style={{ marginBottom: 0 }}>{proj.name} · 设计变更台账</div>
        <Table
          rowKey="no"
          pagination={false}
          columns={[
            { title: '编号', dataIndex: 'no', width: 120 },
            { title: '阶段', dataIndex: 'phase', width: 90, render: (v: string) => <Tag color="cyan">{v}</Tag> },
            { title: '变更原因', dataIndex: 'reason', width: 260, ellipsis: true },
            { title: '影响工期(天)', dataIndex: 'scheduleDays', width: 110, align: 'right', render: (v: number) => <span style={{ color: '#d4a300' }}>+{v}</span> },
            { title: '影响成本(万)', dataIndex: 'costWan', width: 110, align: 'right', render: (v: number) => <span style={{ color: '#e5484d' }}>+{v}</span> },
            { title: '日期', dataIndex: 'date', width: 110 },
          ]}
          dataSource={proj.drawingChanges}
          locale={{ emptyText: '暂无图纸变更记录' }}
        />
      </Card>

      <Card className="ds-card-line" style={{ marginTop: 16 }} styles={{ body: { padding: '16px 24px' } }}>
        <div className="ds-card-title" style={{ marginBottom: 0 }}>各项目设计进度偏差率对比</div>
        <Chart option={devChartOption} height={260} />
      </Card>
    </div>
  );
}