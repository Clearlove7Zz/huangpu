import { useMemo, useState } from 'react';
import { Card, Col, Progress, Row, Segmented, Space, Statistic, Table, Tag, Typography } from 'antd';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;

interface RiskGroup {
  projectId: string;
  projectName: string;
  total: number;
  red: number;
  yellow: number;
  blue: number;
  pending: number;
  overThreshold: number;
}

export default function RiskSystem() {
  const projects = MOCK_DATA.projects as {
    id: string;
    shortName: string;
    risks: { total: number; red: number; yellow: number; blue: number; pending: number; overThreshold: number };
  }[];

  const [dim, setDim] = useState<'all' | 'red' | 'yellow' | 'blue'>('all');

  const groups: RiskGroup[] = useMemo(
    () =>
      projects.map((p) => ({
        projectId: p.id,
        projectName: p.shortName,
        total: p.risks.total,
        red: p.risks.red,
        yellow: p.risks.yellow,
        blue: p.risks.blue,
        pending: p.risks.pending,
        overThreshold: p.risks.overThreshold,
      })),
    [projects],
  );

  const filtered = groups.filter((g) =>
    dim === 'all' ? true : g[dim] > 0,
  );

  const totals = useMemo(
    () => ({
      total: groups.reduce((s, g) => s + g.total, 0),
      red: groups.reduce((s, g) => s + g.red, 0),
      yellow: groups.reduce((s, g) => s + g.yellow, 0),
      blue: groups.reduce((s, g) => s + g.blue, 0),
      pending: groups.reduce((s, g) => s + g.pending, 0),
    }),
    [groups],
  );

  const max = Math.max(...groups.map((g) => g.total), 1);

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">风险管理系统</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            四地块风险概览 · 工程 / 经济 / 设计三维度 · 红黄蓝分级 · 超阈值预警
          </Text>
        </div>
        <Segmented
          value={dim}
          onChange={(v) => setDim(v as typeof dim)}
          options={[
            { value: 'all', label: '全部' },
            { value: 'red', label: `红色 ${totals.red}` },
            { value: 'yellow', label: `黄色 ${totals.yellow}` },
            { value: 'blue', label: `蓝色 ${totals.blue}` },
          ]}
        />
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #f4a261' } }}>
            <Statistic title="风险总数" value={totals.total} suffix="项" />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #e5484d' } }}>
            <Statistic title="红色风险" value={totals.red} suffix="项" valueStyle={{ color: '#e5484d' }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #d4a300' } }}>
            <Statistic title="黄色风险" value={totals.yellow} suffix="项" valueStyle={{ color: '#d4a300' }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px', borderTop: '3px solid #2ec4b6' } }}>
            <Statistic title="待处理" value={totals.pending} suffix="项" />
            <Text type="secondary" style={{ fontSize: 12 }}>{totals.red > 0 ? `其中红色 ${totals.red} 项需 48h 内响应` : '红色风险已清零'}</Text>
          </Card>
        </Col>
      </Row>

      <Card className="ds-card-line" style={{ marginTop: 16 }} styles={{ body: { padding: '16px 24px' } }}>
        <Table
          rowKey="projectId"
          pagination={false}
          columns={[
            { title: '项目', dataIndex: 'projectName', width: 140 },
            {
              title: '风险分布',
              key: 'bars',
              render: (_: unknown, g: RiskGroup) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Space size={8}>
                    <Text style={{ fontSize: 12, width: 40, color: 'rgba(31, 35, 40, 0.45)' }}>红</Text>
                    <Progress percent={(g.red / max) * 100} showInfo={false} strokeColor="#e5484d" size="small" style={{ width: 160 }} />
                    <Text className="ds-num" style={{ fontSize: 12 }}>{g.red}</Text>
                  </Space>
                  <Space size={8}>
                    <Text style={{ fontSize: 12, width: 40, color: 'rgba(31, 35, 40, 0.45)' }}>黄</Text>
                    <Progress percent={(g.yellow / max) * 100} showInfo={false} strokeColor="#d4a300" size="small" style={{ width: 160 }} />
                    <Text className="ds-num" style={{ fontSize: 12 }}>{g.yellow}</Text>
                  </Space>
                  <Space size={8}>
                    <Text style={{ fontSize: 12, width: 40, color: 'rgba(31, 35, 40, 0.45)' }}>蓝</Text>
                    <Progress percent={(g.blue / max) * 100} showInfo={false} strokeColor="#2ec4b6" size="small" style={{ width: 160 }} />
                    <Text className="ds-num" style={{ fontSize: 12 }}>{g.blue}</Text>
                  </Space>
                </div>
              ),
            },
            { title: '总数', dataIndex: 'total', width: 80, align: 'right', className: 'ds-num' },
            {
              title: '超阈值预警',
              dataIndex: 'overThreshold',
              width: 110,
              render: (v: number) => (v > 0 ? <Tag color="error">超阈值 {v}</Tag> : <Tag color="success">正常</Tag>),
            },
            {
              title: '处置状态',
              dataIndex: 'pending',
              width: 110,
              render: (v: number, g: RiskGroup) =>
                g.red > 0 ? <Tag color="error">红色待处置 {g.red}</Tag> : v > 0 ? <Tag color="warning">待处理 {v}</Tag> : <Tag color="success">已闭环</Tag>,
            },
          ]}
          dataSource={filtered}
        />
      </Card>
    </div>
  );
}
