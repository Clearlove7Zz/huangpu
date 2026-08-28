import { useMemo, useState } from 'react';
import { Alert, Card, Checkbox, Col, InputNumber, Progress, Row, Space, Table, Tag, Typography } from 'antd';
import Chart from '../components/Chart';
import type { EChartsOption } from 'echarts';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;

interface CashRow {
  month: string;
  income: number;
  expense: number;
  balance: number;
  forecast: number;
  forecastIncome: number;
  outputValue: number;
  warn?: boolean;
}

export default function Cashflow() {
  const data = MOCK_DATA as {
    cashflowDetail: {
      assumptions: string[];
      monthly: {
        month: string;
        ownerPayment: number;
        otherIncome: number;
        forecastIncome: number;
        outputValue: number;
        subcontract: number;
        material: number;
        labor: number;
        manage: number;
        tax: number;
        actualBalance: number | null;
        forecastBalance: number;
        actualExpense: number | null;
        forecastExpense: number;
        warn?: boolean;
      }[];
      byProject: { project: string; month: string; ownerPayment: number; subcontract: number; material: number; labor: number; manage: number; tax: number; balance: number; forecast: number; collectionRate: number; warn: boolean }[];
      sensitivity: { scenario: string; junForecast: number; desc: string }[];
      criticalBalance: number;
    };
    cashflow: { items: CashRow[]; byProject: { project: string; income: number; expense: number; balance: number; forecast: number; warn: boolean }[]; criticalBalance: number; warnMonth: string };
  };

  const detail = data.cashflowDetail;
  const critical = detail.criticalBalance;
  const [editable, setEditable] = useState(false);

  const monthlyData = useMemo(
    () =>
      detail.monthly.map((m) => ({
        month: m.month.slice(5),
        actual: m.actualBalance,
        forecast: m.forecastBalance,
        income: m.forecastIncome,
        expense: m.forecastExpense,
        sub: m.subcontract,
        material: m.material,
        labor: m.labor,
        manage: m.manage,
        tax: m.tax,
      })),
    [detail.monthly],
  );

  const balanceOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 } },
      grid: { top: 56, left: 8, right: 16, bottom: 0, containLabel: true },
      xAxis: {
        type: 'category',
        data: monthlyData.map((d) => d.month),
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: { color: 'rgba(31, 35, 40, 0.55)' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#ececf0' } },
        axisLabel: { color: 'rgba(31, 35, 40, 0.55)' },
      },
      series: [
        {
          name: '实际结余',
          type: 'line',
          data: monthlyData.map((d) => d.actual),
          connectNulls: true,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2, color: '#f4a261' },
          itemStyle: { color: '#f4a261' },
          markLine: {
            symbol: 'none',
            silent: true,
            label: { formatter: `临界 ${critical} 万`, color: '#e5484d', fontSize: 11, position: 'insideEndTop' },
            lineStyle: { color: '#e5484d', type: 'dashed', width: 1 },
            data: [{ yAxis: critical }],
          },
        },
        {
          name: '预测结余',
          type: 'line',
          data: monthlyData.map((d) => d.forecast),
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2, color: '#d4a300', type: 'dashed' },
          itemStyle: { color: '#d4a300' },
        },
      ],
    }),
    [monthlyData, critical],
  );

  const expenseOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 } },
      grid: { top: 56, left: 8, right: 16, bottom: 0, containLabel: true },
      xAxis: {
        type: 'category',
        data: monthlyData.map((d) => d.month),
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: { color: 'rgba(31, 35, 40, 0.55)' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#ececf0' } },
        axisLabel: { color: 'rgba(31, 35, 40, 0.55)' },
      },
      series: [
        { name: '分包付款', type: 'bar', stack: '支出', data: monthlyData.map((d) => d.sub), itemStyle: { color: '#f4a261' }, barMaxWidth: 26 },
        { name: '材料采购', type: 'bar', stack: '支出', data: monthlyData.map((d) => d.material), itemStyle: { color: '#2ec4b6' } },
        { name: '劳务工资', type: 'bar', stack: '支出', data: monthlyData.map((d) => d.labor), itemStyle: { color: '#d4a300' } },
        { name: '管理费', type: 'bar', stack: '支出', data: monthlyData.map((d) => d.manage), itemStyle: { color: '#1890ff' } },
        { name: '税金', type: 'bar', stack: '支出', data: monthlyData.map((d) => d.tax), itemStyle: { color: '#eb2f96' } },
      ],
    }),
    [monthlyData],
  );

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">
            动态现金流
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            月度明细 · 预测曲线 · 敏感性分析 · 临界结余预警线 {critical} 万
          </Text>
        </div>
        <Checkbox checked={editable} onChange={(e) => setEditable(e.target.checked)} style={{ marginTop: 12 }}>
          可编辑
        </Checkbox>
      </div>

      <Card className="ds-card-line" style={{ marginBottom: 16 }} styles={{ body: { padding: '16px 24px' } }}>
        <div className="ds-card-title" style={{ marginBottom: 12 }}>现金流明细（万元 · 可编辑测算）</div>
        <Table
          size="small"
          rowKey="month"
          pagination={false}
          scroll={{ x: 1100 }}
          columns={[
            { title: '月份', dataIndex: 'month', width: 90, fixed: 'left' as const },
            { title: '业主回款', dataIndex: 'ownerPayment', align: 'right', width: 100, render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 90 }} /> : v },
            { title: '其他收入', dataIndex: 'otherIncome', align: 'right', width: 90, render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 90 }} /> : v },
            { title: '分包支出', dataIndex: 'subcontract', align: 'right', width: 90, render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 90 }} /> : v },
            { title: '材料支出', dataIndex: 'material', align: 'right', width: 90, render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 90 }} /> : v },
            { title: '人工支出', dataIndex: 'labor', align: 'right', width: 90, render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 90 }} /> : v },
            { title: '管理费', dataIndex: 'manage', align: 'right', width: 90, render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 90 }} /> : v },
            { title: '税金', dataIndex: 'tax', align: 'right', width: 90, render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 90 }} /> : v },
            { title: '实际结余', dataIndex: 'actualBalance', align: 'right', width: 100, render: (v: number | null) => <span className="ds-num">{v ?? '—'}</span> },
            { title: '预测结余', dataIndex: 'forecastBalance', align: 'right', width: 100, render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 90 }} /> : <span className="ds-num">{v}</span> },
            { title: '状态', dataIndex: 'warn', width: 70, render: (w?: boolean) => (w ? <Tag color="error">预警</Tag> : <Tag color="success">正常</Tag>) },
          ]}
          dataSource={detail.monthly}
        />
      </Card>

      {detail.monthly.find((m) => m.month === '2026-06')?.forecastBalance !== undefined &&
        (detail.monthly.find((m) => m.month === '2026-06')?.forecastBalance ?? 0) < critical && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16, borderRadius: 12 }}
            message={
              <span style={{ fontSize: 13 }}>
                <Tag color="error">6 月预测结余 {detail.monthly.find((m) => m.month === '2026-06')?.forecastBalance} 万 低于临界 {critical} 万</Tag>
                敏感性分析显示业主回款延迟 15 天即触发预警，建议财务部协同外协推进回款。
              </span>
            }
          />
        )}

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
            <div className="ds-card-title">月度收支与结余（万元）</div>
            <Chart option={balanceOption} height={260} />
          </Card>
        </Col>
        <Col xs={24}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
            <div className="ds-card-title">敏感性分析 · 6 月预测结余</div>
            {detail.sensitivity.map((s) => (
              <div key={s.scenario} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, color: 'rgba(31, 35, 40, 0.72)' }}>{s.scenario}</Text>
                  <Text strong className="ds-num" style={{ fontSize: 13, color: s.junForecast < critical ? '#e5484d' : '#f4a261' }}>
                    {s.junForecast} 万
                  </Text>
                </div>
                <Progress
                  percent={Math.min(100, (s.junForecast / 800) * 100)}
                  showInfo={false}
                  strokeColor={s.junForecast < critical ? '#e5484d' : '#f4a261'}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>{s.desc}</Text>
              </div>
            ))}
            <div style={{ marginTop: 8, padding: '12px 16px', background: '#f5f5f5', borderRadius: 8, fontSize: 13, lineHeight: '22px', color: 'rgba(31, 35, 40, 0.72)' }}>
              <Text strong>假设条件：</Text>
              {detail.assumptions.map((a) => (
                <div key={a} style={{ fontSize: 12 }}>· {a}</div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
            <div className="ds-card-title" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
              <span>支出结构（月度明细 · 万元）</span>
              <Space>
                <Text style={{ fontSize: 12, color: 'rgba(31, 35, 40, 0.42)' }}>悬停查看各项支出金额</Text>
              </Space>
            </div>
            <Chart option={expenseOption} height={280} />
          </Card>
        </Col>
        <Col xs={24}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
            <div className="ds-card-title">2026-05 分项目现金流（万元）</div>
            <Table
              size="small"
              rowKey="project"
              pagination={false}
              columns={[
                { title: '项目', dataIndex: 'project', width: 260 },
                { title: '结余', dataIndex: 'balance', align: 'right', render: (v: number) => <span className="ds-num" style={{ fontWeight: 600 }}>{v}</span> },
                { title: '预测', dataIndex: 'forecast', align: 'right', render: (v: number) => <span className="ds-num">{v}</span> },
                { title: '回款率', dataIndex: 'collectionRate', align: 'right', render: (v: number) => <span className="ds-num">{v}%</span> },
                { title: '状态', dataIndex: 'warn', width: 70, render: (w: boolean) => (w ? <Tag color="error">预警</Tag> : <Tag color="success">正常</Tag>) },
              ]}
              dataSource={detail.byProject}
            />
            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                汇总结余：<Text strong className="ds-num">{detail.byProject.reduce((s, p) => s + p.balance, 0)} 万</Text> · 回款率均值{' '}
                <Text strong className="ds-num">
                  {(detail.byProject.reduce((s, p) => s + p.collectionRate, 0) / detail.byProject.length).toFixed(1)}%
                </Text>
              </Text>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
