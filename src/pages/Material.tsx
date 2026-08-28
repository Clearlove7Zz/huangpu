import { useMemo, useState } from 'react';
import { Button, Card, Col, Input, Row, Space, Table, Tag, Typography, message } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import Chart from '../components/Chart';
import type { EChartsOption } from 'echarts';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;

interface MaterialRow {
  name: string;
  budget: number;
  purchased: number;
  consumed: number;
  unit: string;
  warn: boolean;
  source: string;
}

export default function Material() {
  const data = MOCK_DATA.projectDetails as Record<string, { materials: MaterialRow[] }>;
  const projects = MOCK_DATA.projects as { id: string; shortName: string }[];
  const [projectId, setProjectId] = useState(projects[0].id);
  const [keyword, setKeyword] = useState('');

  const materials = data[projectId]?.materials ?? [];
  const filtered = materials.filter((m) => !keyword || m.name.includes(keyword));
  const warnCount = materials.filter((m) => m.warn).length;

  const fmt = (v: number) => v.toLocaleString('zh-CN');
  const overPct = (m: MaterialRow) => ((m.consumed - m.budget) / m.budget * 100).toFixed(1);
  const purchasePct = (m: MaterialRow) => ((m.purchased - m.budget) / m.budget * 100).toFixed(1);

  const chartOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 } },
      grid: { top: 40, left: 8, right: 16, bottom: 30, containLabel: true },
      xAxis: {
        type: 'category',
        data: filtered.map((m) => m.name.replace(/C30|HRB400|蒸压/, '')),
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: { color: 'rgba(31, 35, 40, 0.55)', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#ececf0' } },
        axisLabel: { color: 'rgba(31, 35, 40, 0.55)' },
      },
      series: [
        { name: '预算', type: 'bar', data: filtered.map((m) => m.budget), itemStyle: { color: '#597ef7', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 },
        { name: '采购', type: 'bar', data: filtered.map((m) => m.purchased), itemStyle: { color: '#36cfc9', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 },
        {
          name: '消耗',
          type: 'bar',
          data: filtered.map((m) => m.consumed),
          itemStyle: { color: '#f4a261', borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 28,
        },
      ],
    }),
    [filtered],
  );

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">物资消耗管控</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            预算用量 vs 供应链实际采购/消耗量 · 超 {MOCK_DATA.materialWarnThreshold}% 预警 · 数据来源：供应链平台自动同步
          </Text>
        </div>
        <Space>
          <Input
            allowClear
            variant="filled"
            prefix={<SearchOutlined />}
            placeholder="搜索材料"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 200 }}
          />
          <Tag color={warnCount > 0 ? 'error' : 'success'} style={{ padding: '4px 12px', borderRadius: 8 }}>
            {warnCount > 0 ? `${warnCount} 项超量预警` : '物资管控正常'}
          </Tag>
        </Space>
      </div>

      <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {projects.map((p) => (
            <Tag
              key={p.id}
              color={projectId === p.id ? 'processing' : 'default'}
              style={{ cursor: 'pointer', padding: '2px 12px', borderRadius: 8 }}
              onClick={() => setProjectId(p.id)}
            >
              {p.shortName}
            </Tag>
          ))}
        </div>

        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} lg={6}>
            <Card size="small" className="ds-card-line">
              <Text type="secondary" style={{ fontSize: 12 }}>管控材料种类</Text>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{materials.length}</div>
            </Card>
          </Col>
          <Col xs={12} lg={6}>
            <Card size="small" className="ds-card-line">
              <Text type="secondary" style={{ fontSize: 12 }}>超量预警</Text>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: warnCount > 0 ? '#e5484d' : '#2ec4b6' }}>{warnCount}</div>
            </Card>
          </Col>
          <Col xs={12} lg={6}>
            <Card size="small" className="ds-card-line">
              <Text type="secondary" style={{ fontSize: 12 }}>预警阈值</Text>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{MOCK_DATA.materialWarnThreshold}%</div>
            </Card>
          </Col>
          <Col xs={12} lg={6}>
            <Card size="small" className="ds-card-line">
              <Text type="secondary" style={{ fontSize: 12 }}>数据同步</Text>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>供应链平台</div>
            </Card>
          </Col>
        </Row>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong style={{ fontSize: 13 }}>预算 vs 采购 vs 消耗 对比表</Text>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => message.success('正在导出 物资消耗预算对比预警表 (Excel)')}>
            导出预警报告
          </Button>
        </div>
        <Table
          rowKey="name"
          pagination={false}
          columns={[
            { title: '材料名称', dataIndex: 'name', width: 180 },
            { title: '单位', dataIndex: 'unit', width: 70 },
            { title: '预算用量', dataIndex: 'budget', align: 'right', render: (v: number) => <span className="ds-num">{fmt(v)}</span> },
            { title: '实际采购', dataIndex: 'purchased', align: 'right', render: (v: number) => <span className="ds-num">{fmt(v)}</span> },
            { title: '实际消耗', dataIndex: 'consumed', align: 'right', render: (v: number, r: MaterialRow) => (
                <span className="ds-num" style={{ color: r.warn ? '#e5484d' : undefined }}>{fmt(v)}</span>
              ) },
            { title: '采购偏差', dataIndex: '', align: 'right', width: 100, render: (_: unknown, r: MaterialRow) => {
                const p = Number(purchasePct(r));
                return <span className="ds-num" style={{ color: p > 0 ? '#e8853c' : p < 0 ? '#2ec4b6' : undefined }}>{p > 0 ? '+' : ''}{p.toFixed(1)}%</span>;
              } },
            { title: '消耗偏差', dataIndex: '', align: 'right', width: 100, render: (_: unknown, r: MaterialRow) => {
                const p = Number(overPct(r));
                return <span className="ds-num" style={{ color: r.warn ? '#e5484d' : p < 0 ? '#2ec4b6' : undefined }}>{p > 0 ? '+' : ''}{p.toFixed(1)}%</span>;
              } },
            { title: '数据来源', dataIndex: 'source', width: 130, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
            { title: '状态', dataIndex: 'warn', width: 100, render: (w: boolean) => (w ? <Tag color="error">超量预警</Tag> : <Tag color="success">正常</Tag>) },
            { title: '影响', dataIndex: '', width: 140, render: (_: unknown, r: MaterialRow) => (r.warn ? <Text style={{ fontSize: 12, color: '#e5484d' }}>成本上升·利润下降</Text> : '—') },
          ]}
          dataSource={filtered}
          scroll={{ x: 1100 }}
        />

        <Text strong style={{ fontSize: 13, display: 'block', margin: '20px 0 8px' }}>消耗趋势对比</Text>
        <Chart option={chartOption} height={320} />
      </Card>
    </div>
  );
}