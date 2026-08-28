import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Input, InputNumber, Select, Space, Table, Tabs, Tag, Typography, Upload, message } from 'antd';
import { DollarOutlined, DownloadOutlined, InboxOutlined, ReloadOutlined } from '@ant-design/icons';
import Chart from '../components/Chart';
import type { EChartsOption } from 'echarts';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;

interface ThreeValueRow {
  id?: string;
  name: string;
  tender: number;
  contract: number;
  internalCost: number;
  profit: number;
  profitRate: number;
  actualCost: number;
  actualProfit: number;
  actualRate: number;
  variance: number;
  warn: boolean;
  analysis: string;
}

interface OwnerVsAuditRow {
  item: string;
  unit?: string;
  ownerQty?: number;
  ownerAmt?: number;
  auditQty?: number;
  auditAmt?: number;
  qtyDiff?: number;
  diff?: number;
  note?: string;
}

interface AuditSummaryRow {
  seq: number | string;
  name: string;
  submit: number;
  audit: number;
  increase: number;
  decrease: number;
  diff: number;
}

export default function CostSystem() {
  const [tab, setTab] = useState('audit');
  const [auditUnitId, setAuditUnitId] = useState('basement');
  const [actualSub, setActualSub] = useState('sub');

  const costData = MOCK_DATA as unknown as {
    auditCompare: {
      projectList: { id: string; name: string; submit: number; audit: number; diff: number }[];
      masterSummary: AuditSummaryRow[];
      units: Record<string, { name: string; summary: AuditSummaryRow[]; boq: { code: string; name: string; unit: string; submitQty: number; submitPrice: number; submitAmt: number; auditQty: number; auditPrice: number; auditAmt: number; increase: number; decrease: number; diff: number; note: string }[]; ownerVsAudit: OwnerVsAuditRow[] }>;
    };
    threeValueCompare: { summary: ThreeValueRow[]; details: Record<string, { name: string; tender: number; contract: number; internalCost: number; actualCost: number; variance: number; analysis: string }[]> };
    actualCostList: { subcontracts: { id: string; name: string; supplier: string; scope: string; budgetPrice: number; actualBidPrice: number; content: string; status: string; paid: number }[]; materials: { id: string; name: string; supplier: string; unit: string; budgetQty: number; budgetPrice: number; actualQty: number; actualPrice: number; purchased: number; content: string; warn: boolean }[] };
    costSummary: { name: string; tender: number; contract: number; internalCost: number; internalProfit: number; internalRate: number; integrationCost: number; integrationProfit: number; integrationRate: number }[];
    costIndex: { category: string; item: string; unit: string; price: number; region: string; valid: string }[];
  };

  const threeSummary = costData.threeValueCompare.summary;

  const money = (v: number) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

  type BoqRow = (typeof costData.auditCompare.units.basement.boq)[number];
  const [boqRows, setBoqRows] = useState<BoqRow[]>(() =>
    costData.auditCompare.units.basement.boq.map((r) => ({ ...r })),
  );

  const [masterRows, setMasterRows] = useState<AuditSummaryRow[]>(() =>
    costData.auditCompare.masterSummary.map((r) => ({ ...r })),
  );
  const [unitRows, setUnitRows] = useState<AuditSummaryRow[]>(() =>
    (costData.auditCompare.units.basement.summary ?? []).map((r) => ({ ...r })),
  );
  const [ownerRows, setOwnerRows] = useState<OwnerVsAuditRow[]>(() =>
    (costData.auditCompare.units.basement.ownerVsAudit ?? []).map((r) => ({ ...r })),
  );

  useEffect(() => {
    const rows = costData.auditCompare.units[auditUnitId]?.boq;
    setBoqRows(rows ? rows.map((r) => ({ ...r })) : []);
    const unit = costData.auditCompare.units[auditUnitId];
    setUnitRows(unit?.summary ? unit.summary.map((r) => ({ ...r })) : []);
    setOwnerRows(unit?.ownerVsAudit ? unit.ownerVsAudit.map((r) => ({ ...r })) : []);
  }, [auditUnitId, costData]);

  const recalcRow = (r: BoqRow): BoqRow => {
    const auditAmt = r.auditQty * r.auditPrice;
    const diff = auditAmt - r.submitAmt;
    return { ...r, auditAmt, diff, increase: diff > 0 ? diff : 0, decrease: diff < 0 ? Math.abs(diff) : 0 };
  };

  const recalcAll = () => {
    setBoqRows((rows) => rows.map(recalcRow));
    message.success('核增核减已重新计算');
  };

  const setBoqField = (code: string, field: 'auditQty' | 'auditPrice', value: number | null) => {
    setBoqRows((rows) => rows.map((r) => (r.code === code ? recalcRow({ ...r, [field]: value ?? 0 }) : r)));
  };

  const recalcSummary = (r: AuditSummaryRow): AuditSummaryRow => {
    const diff = r.audit - r.submit;
    return { ...r, diff, increase: diff > 0 ? diff : 0, decrease: diff < 0 ? Math.abs(diff) : 0 };
  };

  const setSummaryField = (
    setter: React.Dispatch<React.SetStateAction<AuditSummaryRow[]>>,
    seq: number | string,
    field: 'name' | 'submit' | 'audit',
    value: number | string | null,
  ) => {
    setter((rows) => rows.map((r) => (r.seq === seq ? recalcSummary({ ...r, [field]: value ?? (field === 'name' ? '' : 0) }) : r)));
  };

  const recalcOwner = (r: OwnerVsAuditRow): OwnerVsAuditRow => {
    const qtyDiff = (r.auditQty ?? 0) - (r.ownerQty ?? 0);
    const diff = (r.auditAmt ?? 0) - (r.ownerAmt ?? 0);
    return { ...r, qtyDiff, diff };
  };

  const setOwnerField = (item: string, field: 'ownerQty' | 'ownerAmt' | 'auditQty' | 'auditAmt', value: number | null) => {
    setOwnerRows((rows) => rows.map((r) => (r.item === item ? recalcOwner({ ...r, [field]: value ?? 0 }) : r)));
  };

  const boqTotal = useMemo(() => {
    const t = boqRows.reduce(
      (acc, r) => ({
        auditAmt: acc.auditAmt + r.auditAmt,
        increase: acc.increase + r.increase,
        decrease: acc.decrease + r.decrease,
      }),
      { auditAmt: 0, increase: 0, decrease: 0 },
    );
    return { ...t, diff: t.auditAmt - boqRows.reduce((a, r) => a + r.submitAmt, 0) };
  }, [boqRows]);

  const auditUnit = costData.auditCompare.units[auditUnitId] ?? costData.auditCompare.units.basement;
  const auditUnitName = auditUnit?.name ?? '—';

  const handleImport = (file: File) => {
    const ok = /\.(xlsx|xls)$/i.test(file.name);
    if (!ok) {
      message.error(`不支持的格式：${file.name}，请上传 .xlsx / .xls`);
      return Upload.LIST_IGNORE;
    }
    message.success(`Excel导入：${file.name} · 自动校验清单/税率/格式，跳过异常行`);
    return false;
  };

  const chartData = useMemo(() => {
    const SHORT: Record<string, string> = {
      division: '分部分项+措施', early: '前期', earth: '土方基坑', basement: '地下室',
      residential: '高层住宅', facade: '外墙', decoration: '精装修', measure: '总价措施',
      other: '其他项目', otherDirect: '其他直接', indirect: '间接费', tax: '税金', total: '合计',
    };
    return threeSummary.filter((r) => r.profitRate > 0).map((r) => ({
      id: r.id,
      name: SHORT[r.id ?? ''] ?? r.name.replace(/[一二三四五六]、/, '').replace(/\s/g, ''),
      fullName: r.name.replace(/[一二三四五六]、/, '').replace(/\s/g, ''),
      target: r.profitRate,
      actual: r.actualRate,
    }));
  }, [threeSummary]);

  const profitChartOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: unknown) => {
          const list = params as { axisValue: string; seriesName: string; value: number; data: { fullName?: string } }[];
          const full = (list[0]?.data as { fullName?: string } | undefined)?.fullName ?? list[0]?.axisValue ?? '';
          const rows = list.map((p) => `${p.seriesName}：${p.value}%`).join('<br/>');
          return `${full}<br/>${rows}`;
        } },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 } },
      grid: { top: 56, left: 16, right: 16, bottom: 60, containLabel: true },
      xAxis: {
        type: 'category',
        data: chartData.map((d) => d.name),
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: { color: 'rgba(31, 35, 40, 0.55)', fontSize: 11, interval: 0, rotate: 30 },
      },
      yAxis: {
        type: 'value',
        name: '%',
        nameTextStyle: { color: 'rgba(31, 35, 40, 0.45)', fontSize: 11 },
        splitLine: { lineStyle: { color: '#ececf0' } },
        axisLabel: { color: 'rgba(31, 35, 40, 0.55)' },
      },
      series: [
        { name: '目标利润率', type: 'bar', data: chartData.map((d) => ({ value: d.target, fullName: d.fullName })), itemStyle: { color: '#2ec4b6', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 24 },
        { name: '实际利润率', type: 'bar', data: chartData.map((d) => ({ value: d.actual, fullName: d.fullName })), itemStyle: { color: '#d4a300', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 24 },
      ],
      markLine: undefined,
    }),
    [chartData],
  );

  const threeColumns = [
    { title: '分项', dataIndex: 'name', width: 160, fixed: 'left' as const, ellipsis: true },
    { title: '招标控制价(万)', dataIndex: 'tender', width: 110, align: 'right' as const, render: (v: number) => <span className="ds-num">{money(v)}</span> },
    { title: '中标合同价(万)', dataIndex: 'contract', width: 110, align: 'right' as const, render: (v: number) => <span className="ds-num">{money(v)}</span> },
    { title: '内部成本(万)', dataIndex: 'internalCost', width: 110, align: 'right' as const, render: (v: number) => <span className="ds-num">{money(v)}</span> },
    { title: '测算利润(万)', dataIndex: 'profit', width: 100, align: 'right' as const, render: (v: number) => (v > 0 ? <span className="ds-num">{money(v)}</span> : '—') },
    { title: '测算利润率', dataIndex: 'profitRate', width: 90, align: 'right' as const, render: (v: number) => (v > 0 ? <span className="ds-num">{v}%</span> : '—') },
    { title: '实际成本(万)', dataIndex: 'actualCost', width: 110, align: 'right' as const, render: (v: number) => <span className="ds-num">{money(v)}</span> },
    { title: '实际利润(万)', dataIndex: 'actualProfit', width: 100, align: 'right' as const, render: (v: number) => <span className="ds-num" style={{ color: v < 0 ? '#e5484d' : undefined }}>{money(v)}</span> },
    { title: '实际利润率', dataIndex: 'actualRate', width: 90, align: 'right' as const, render: (v: number, r: ThreeValueRow) => (
        <span className="ds-num" style={{ color: r.warn ? '#e5484d' : '#f4a261', fontWeight: 600 }}>{v}%</span>
      ) },
    { title: '偏差', dataIndex: 'variance', width: 70, align: 'right' as const, render: (v: number) => (
        <span className="ds-num" style={{ color: v < 0 ? '#e5484d' : '#e8853c' }}>{v >= 0 ? '+' : ''}{v}</span>
      ) },
    { title: '状态', dataIndex: 'warn', width: 80, render: (w: boolean) => (w ? <Tag color="error">预警</Tag> : <Tag color="success">正常</Tag>) },
    { title: '分析', dataIndex: 'analysis', width: 160, fixed: 'right' as const, ellipsis: true, render: (v: string) => (v ? <Text style={{ fontSize: 12, color: 'rgba(31, 35, 40, 0.55)' }}>{v}</Text> : '—') },
  ];

  const buildAuditSummaryColumns = (isMaster: boolean) => [
    { title: '序号', dataIndex: 'seq', width: 56, fixed: 'left' as const },
    {
      title: '项目名称', dataIndex: 'name', width: 200, ellipsis: true,
      render: (v: string, r: AuditSummaryRow) => (isMaster && r.seq === 1
        ? <span className="ds-num">{v}</span>
        : <Input size="small" value={v} onChange={(e) => setSummaryField(isMaster ? setMasterRows : setUnitRows, r.seq, 'name', e.target.value)} />),
    },
    {
      title: '送审金额(元)', dataIndex: 'submit', align: 'right' as const,
      render: (v: number, r: AuditSummaryRow) => (isMaster && r.seq === 1
        ? <span className="ds-num">{money(v)}</span>
        : <InputNumber size="small" value={v} min={0} style={{ width: 120 }} onChange={(val) => setSummaryField(isMaster ? setMasterRows : setUnitRows, r.seq, 'submit', val)} />),
    },
    {
      title: '审定金额(元)', dataIndex: 'audit', align: 'right' as const,
      render: (v: number, r: AuditSummaryRow) => (isMaster && r.seq === 1
        ? <span className="ds-num">{money(v)}</span>
        : <InputNumber size="small" value={v} min={0} style={{ width: 120 }} onChange={(val) => setSummaryField(isMaster ? setMasterRows : setUnitRows, r.seq, 'audit', val)} />),
    },
    { title: '核增(元)', dataIndex: 'increase', align: 'right' as const, render: (v: number) => <span style={{ color: '#e5484d' }}>{money(v)}</span> },
    { title: '核减(元)', dataIndex: 'decrease', align: 'right' as const, render: (v: number) => <span style={{ color: '#e8853c' }}>{money(v)}</span> },
    { title: '增减金额(元)', dataIndex: 'diff', width: 130, fixed: 'right' as const, align: 'right' as const, render: (v: number) => <span className="ds-num" style={{ fontWeight: 600, color: v < 0 ? '#e5484d' : '#e8853c' }}>{money(v)}</span> },
  ];

  const auditBoqColumns = [
    { title: '清单项', dataIndex: 'name', width: 190, fixed: 'left' as const, ellipsis: true },
    { title: '单位', dataIndex: 'unit', width: 56 },
    { title: '送审量', dataIndex: 'submitQty', align: 'right' as const, width: 76 },
    { title: '送审价', dataIndex: 'submitPrice', align: 'right' as const, width: 76 },
    { title: '送审合价', dataIndex: 'submitAmt', align: 'right' as const, width: 100, render: (v: number) => <span className="ds-num">{money(v)}</span> },
    { title: '审核量', dataIndex: 'auditQty', align: 'right' as const, width: 96, render: (v: number, r: BoqRow) => (
        <InputNumber size="small" value={v} min={0} onChange={(val) => setBoqField(r.code, 'auditQty', val)} style={{ width: 84 }} />
      ) },
    { title: '审核价', dataIndex: 'auditPrice', align: 'right' as const, width: 96, render: (v: number, r: BoqRow) => (
        <InputNumber size="small" value={v} min={0} onChange={(val) => setBoqField(r.code, 'auditPrice', val)} style={{ width: 84 }} />
      ) },
    { title: '审定合价(元)', dataIndex: 'auditAmt', align: 'right' as const, width: 110, render: (v: number) => <span className="ds-num">{money(v)}</span> },
    { title: '核增', dataIndex: 'increase', align: 'right' as const, width: 90, render: (v: number) => <span style={{ color: '#e5484d' }}>{money(v)}</span> },
    { title: '核减', dataIndex: 'decrease', align: 'right' as const, width: 90, render: (v: number) => <span style={{ color: '#e8853c' }}>{money(v)}</span> },
    { title: '增减', dataIndex: 'diff', align: 'right' as const, width: 110, render: (v: number) => <span style={{ color: v < 0 ? '#e5484d' : '#e8853c' }}>{money(v)}</span> },
    { title: '说明', dataIndex: 'note', width: 100, fixed: 'right' as const },
  ];

  const ownerVsAuditColumns = [
    { title: '清单项', dataIndex: 'item', width: 200, fixed: 'left' as const, ellipsis: true },
    { title: '单位', dataIndex: 'unit', width: 60 },
    {
      title: '业主工程量', dataIndex: 'ownerQty', align: 'right' as const,
      render: (v: number | undefined, r: OwnerVsAuditRow) => (v != null
        ? <InputNumber size="small" value={v} style={{ width: 100 }} onChange={(val) => setOwnerField(r.item, 'ownerQty', val)} />
        : '—'),
    },
    {
      title: '业主合价', dataIndex: 'ownerAmt', align: 'right' as const,
      render: (v: number | undefined, r: OwnerVsAuditRow) => (v != null
        ? <InputNumber size="small" value={v} min={0} style={{ width: 110 }} onChange={(val) => setOwnerField(r.item, 'ownerAmt', val)} />
        : '—'),
    },
    {
      title: '审核工程量', dataIndex: 'auditQty', align: 'right' as const,
      render: (v: number | undefined, r: OwnerVsAuditRow) => (v != null
        ? <InputNumber size="small" value={v} style={{ width: 100 }} onChange={(val) => setOwnerField(r.item, 'auditQty', val)} />
        : '—'),
    },
    {
      title: '审核合价', dataIndex: 'auditAmt', align: 'right' as const,
      render: (v: number | undefined, r: OwnerVsAuditRow) => (v != null
        ? <InputNumber size="small" value={v} min={0} style={{ width: 110 }} onChange={(val) => setOwnerField(r.item, 'auditAmt', val)} />
        : '—'),
    },
    { title: '量差', dataIndex: 'qtyDiff', align: 'right' as const, render: (v?: number) => (v != null ? <span style={{ color: v !== 0 ? '#e8853c' : undefined }}>{v > 0 ? '+' : ''}{money(v)}</span> : '—') },
    { title: '增减(元)', dataIndex: 'diff', align: 'right' as const, render: (v?: number) => (v != null ? <span style={{ color: v < 0 ? '#e5484d' : '#e8853c' }}>{money(v)}</span> : '—') },
    { title: '说明', dataIndex: 'note', width: 200, fixed: 'right' as const, ellipsis: true, render: (v?: string) => (v ? <Text style={{ fontSize: 12 }}>{v}</Text> : '—') },
  ];

  const sectionTitle = (t: string) => (
    <Text strong style={{ fontSize: 13, display: 'block', margin: '16px 0 8px' }}>{t}</Text>
  );

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">
            成本测算子系统
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            工程审核对比表 · 三算对比表 · 实际成本清单 · 支持Excel导入与在线编辑核增核减
          </Text>
        </div>
        <Tag color="processing" icon={<DollarOutlined />} style={{ padding: '4px 12px', borderRadius: 8 }}>
          商务部数据 · 2026-05 期
        </Tag>
      </div>

      <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'audit',
              label: '工程审核对比表',
              children: (
                <div>
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleImport}>
                      <Button type="primary" size="small" icon={<InboxOutlined />}>导入Excel（地下室工程模板）</Button>
                    </Upload>
                    <Button size="small" icon={<ReloadOutlined />} onClick={recalcAll}>重新计算核增核减</Button>
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => message.success(`正在导出 工程审核对比表 (Excel)`)}>导出</Button>
                    <Select
                      size="small"
                      style={{ minWidth: 220 }}
                      value={auditUnitId}
                      onChange={setAuditUnitId}
                      options={costData.auditCompare.projectList.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </Space>

                  {sectionTitle('总表 · 各单项工程审核汇总（可编辑送审/审定金额）')}
                  <Table
                    size="small"
                    rowKey="seq"
                    pagination={false}
                    columns={buildAuditSummaryColumns(true)}
                    dataSource={masterRows.map((m) =>
                      m.seq === 1
                        ? { ...m, audit: boqTotal.auditAmt, increase: boqTotal.increase, decrease: boqTotal.decrease, diff: boqTotal.diff }
                        : m,
                    )}
                    scroll={{ x: 1000 }}
                  />

                  {sectionTitle(`单位工程审核对比表 · ${auditUnitName}（可编辑送审/审定金额）`)}
                  <Table
                    size="small"
                    rowKey={(r: AuditSummaryRow) => String(r.seq)}
                    pagination={false}
                    columns={buildAuditSummaryColumns(false)}
                    dataSource={unitRows}
                    scroll={{ x: 1000 }}
                  />

                  {sectionTitle('分部分项清单对比明细（可编辑审核量/审核价）')}
                  <Table
                    size="small"
                    rowKey="code"
                    pagination={false}
                    columns={auditBoqColumns}
                    dataSource={boqRows}
                    scroll={{ x: 1300 }}
                    footer={() => (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span>修改审核量/审核价后点击「重新计算核增核减」自动更新合价</span>
                        <span>
                          合计：审核 {money(boqTotal.auditAmt)} 元 · 核增 {money(boqTotal.increase)} / 核减 {money(boqTotal.decrease)} / 净核减{' '}
                          <span style={{ color: boqTotal.diff < 0 ? '#e5484d' : '#e8853c', fontWeight: 600 }}>{money(boqTotal.diff)}</span> 元
                        </span>
                      </div>
                    )}
                  />

                  {sectionTitle('业主广联达算量 vs 我方审核量对比（可编辑量/合价，自动重算量差与增减）')}
                  {ownerRows.length ? (
                    <Table
                      size="small"
                      rowKey="item"
                      pagination={false}
                      columns={ownerVsAuditColumns}
                      dataSource={ownerRows}
                      scroll={{ x: 1200 }}
                    />
                  ) : (
                    <Empty description={`暂无「${auditUnitName}」业主算量对比数据`} style={{ padding: '24px 0' }} />
                  )}
                </div>
              ),
            },
            {
              key: 'three',
              label: '三算对比表',
              children: (
                <>
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleImport}>
                      <Button type="primary" size="small" icon={<InboxOutlined />}>导入三算对比Excel</Button>
                    </Upload>
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => message.success(`正在导出 三算对比表 (Excel)`)}>导出</Button>
                  </Space>
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    columns={threeColumns}
                    dataSource={threeSummary}
                    expandable={{
                      expandedRowRender: (r: ThreeValueRow) => {
                        const details = costData.threeValueCompare.details[r.id ?? ''];
                        if (!details) return <Empty description="无明细" style={{ padding: 16 }} />;
                        return (
                          <Table
                            size="small"
                            rowKey="name"
                            pagination={false}
                            columns={[
                              { title: '分部/分项', dataIndex: 'name' },
                              { title: '招标控制价(万)', dataIndex: 'tender', align: 'right', render: (v: number) => money(v) },
                              { title: '中标合同价(万)', dataIndex: 'contract', align: 'right', render: (v: number) => money(v) },
                              { title: '内部成本(万)', dataIndex: 'internalCost', align: 'right', render: (v: number) => money(v) },
                              { title: '实际成本(万)', dataIndex: 'actualCost', align: 'right', render: (v: number) => money(v) },
                              { title: '差异(万)', dataIndex: 'variance', align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#e5484d' : '#e8853c' }}>{money(v)}</span> },
                              { title: '分析', dataIndex: 'analysis', width: 200, fixed: 'right' as const, ellipsis: true, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
                            ]}
                            dataSource={details}
                          />
                        );
                      },
                      rowExpandable: (r: ThreeValueRow) => Boolean(costData.threeValueCompare.details[r.id ?? '']),
                    }}
                    scroll={{ x: 1350 }}
                  />
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                    目标利润率红线 {MOCK_DATA.profitRedLine}% · 业主给予总包利润 {MOCK_DATA.ownerProfitRate}%
                  </Text>
                  <div style={{ marginTop: 16 }}>
                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                      目标利润率 vs 实际利润率（分项 · %）
                    </Text>
                    <Chart option={profitChartOption} height={350} />
                  </div>
                </>
              ),
            },
            {
              key: 'actual',
              label: '实际成本清单',
              children: (
                <div>
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleImport}>
                      <Button type="primary" size="small" icon={<InboxOutlined />}>Excel导入</Button>
                    </Upload>
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => message.success(`正在导出 实际成本清单 (Excel)`)}>导出</Button>
                    <Select
                      size="small"
                      style={{ width: 150 }}
                      value={actualSub}
                      onChange={(v) => setActualSub(v)}
                      options={[
                        { value: 'sub', label: '专业分包' },
                        { value: 'mat', label: '材料采购' },
                        { value: 'bid', label: '中标工程量清单' },
                      ]}
                    />
                  </Space>
                  {actualSub === 'sub' && (
                    <>
                      {sectionTitle('专业分包实际成本')}
                      <Table
                        size="small"
                        rowKey="id"
                        pagination={false}
                        columns={[
                          { title: '编号', dataIndex: 'id', width: 80, fixed: 'left' as const },
                          { title: '分包项', dataIndex: 'name', width: 130 },
                          { title: '供应商', dataIndex: 'supplier', width: 200, ellipsis: true },
                          { title: '分包范围', dataIndex: 'scope', width: 200, ellipsis: true, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
                          { title: '分包内容', dataIndex: 'content', width: 200, ellipsis: true, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
                          { title: '预算价(万)', dataIndex: 'budgetPrice', align: 'right' as const },
                          { title: '实际中标价(万)', dataIndex: 'actualBidPrice', align: 'right' as const, render: (v: number) => <span className="ds-num">{money(v)}</span> },
                          { title: '价差(万)', dataIndex: '', width: 90, align: 'right' as const, render: (_: unknown, r: { budgetPrice: number; actualBidPrice: number }) => {
                              const d = r.actualBidPrice - r.budgetPrice;
                              return <span className="ds-num" style={{ color: d > 0 ? '#e5484d' : d < 0 ? '#e8853c' : undefined }}>{(d > 0 ? '+' : '') + money(d)}</span>;
                            } },
                          { title: '已付(万)', dataIndex: 'paid', align: 'right' as const },
                          { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === '已完成' ? 'success' : v === '筹备' ? 'default' : 'processing'}>{v}</Tag> },
                        ]}
                        dataSource={costData.actualCostList.subcontracts}
                        scroll={{ x: 1450 }}
                      />
                    </>
                  )}
                  {actualSub === 'mat' && (
                    <>
                      {sectionTitle('材料采购实际成本')}
                      <Table
                        size="small"
                        rowKey="id"
                        pagination={false}
                        columns={[
                          { title: '编号', dataIndex: 'id', width: 80, fixed: 'left' as const },
                          { title: '材料', dataIndex: 'name', width: 150 },
                          { title: '供应商', dataIndex: 'supplier', width: 200, ellipsis: true },
                          { title: '采购内容', dataIndex: 'content', width: 200, ellipsis: true, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
                          { title: '单位', dataIndex: 'unit', width: 56 },
                          { title: '预算量', dataIndex: 'budgetQty', align: 'right' as const },
                          { title: '预算价(元)', dataIndex: 'budgetPrice', align: 'right' as const },
                          { title: '实际量', dataIndex: 'actualQty', align: 'right' as const },
                          { title: '实际价(元)', dataIndex: 'actualPrice', align: 'right' as const },
                          { title: '已采购', dataIndex: 'purchased', align: 'right' as const },
                          { title: '状态', dataIndex: 'warn', width: 80, render: (w: boolean) => (w ? <Tag color="error">超量</Tag> : <Tag color="success">正常</Tag>) },
                        ]}
                        dataSource={costData.actualCostList.materials}
                        scroll={{ x: 1400 }}
                      />
                    </>
                  )}
                  {actualSub === 'bid' && (
                    <>
                      {sectionTitle('中标工程量清单 · 新联01地块（土石方工程 · 依据勘测院土石方计算书）')}
                      <Table
                        size="small"
                        rowKey="seq"
                        pagination={false}
                        columns={[
                          { title: '序号', dataIndex: 'seq', width: 56 },
                          { title: '项目名称', dataIndex: 'name', ellipsis: true },
                          { title: '单位', dataIndex: 'unit', width: 80 },
                          { title: '数量', dataIndex: 'qty', align: 'right' as const },
                          { title: '不含税单价', dataIndex: 'priceNoTax', align: 'right' as const },
                          { title: '不含税合价', dataIndex: 'totalNoTax', align: 'right' as const, render: (v: number) => money(v) },
                          { title: '税率', dataIndex: 'tax', width: 70 },
                          { title: '类型', dataIndex: 'type', width: 80, render: (v: string) => <Tag color="cyan">{v}</Tag> },
                          { title: '供应商', dataIndex: 'supplier', ellipsis: true },
                        ]}
                        dataSource={(costData as unknown as { bidBoq: { seq: number; name: string; unit: string; qty: number; priceNoTax: number; totalNoTax: number; tax: string; type: string; supplier: string }[] }).bidBoq}
                        footer={() => (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span>不含税小计</span>
                            <span style={{ fontWeight: 600 }}>
                              {(costData as unknown as { bidBoq: { totalNoTax: number }[] }).bidBoq.reduce((a, b) => a + b.totalNoTax, 0).toLocaleString('zh-CN')} 元
                            </span>
                          </div>
                        )}
                      />
                    </>
                  )}
                </div>
              ),
            },
            {
              key: 'summary',
              label: '成本测算汇总',
              children: (
                <>
                  <Table
                    size="small"
                    rowKey="name"
                    pagination={false}
                    columns={[
                                   { title: '分项', dataIndex: 'name', width: 180, fixed: 'left' as const },
                      { title: '招标价(万)', dataIndex: 'tender', align: 'right', render: (v: number) => money(v) },
                      { title: '合同价(万)', dataIndex: 'contract', align: 'right', render: (v: number) => money(v) },
                      { title: '内部成本(万)', dataIndex: 'internalCost', align: 'right', render: (v: number) => money(v) },
                      { title: '内部利润(万)', dataIndex: 'internalProfit', align: 'right', render: (v: number) => money(v) },
                      { title: '内部利润率', dataIndex: 'internalRate', align: 'right', render: (v: number) => <span className="ds-num">{v}%</span> },
                      { title: '一体化成本(万)', dataIndex: 'integrationCost', align: 'right', render: (v: number) => money(v) },
                       { title: '一体化利润率', dataIndex: 'integrationRate', width: 120, fixed: 'right' as const, align: 'right', render: (v: number) => <span className="ds-num" style={{ color: v < MOCK_DATA.profitRedLine ? '#e5484d' : undefined }}>{v}%</span> },
                    ]}
                    dataSource={costData.costSummary}
                    scroll={{ x: 1100 }}
                  />
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
                    内部利润率口径 = 分包成本控制后；一体化利润率 = 按一体化单位口径测算。地下室一体化利润率 8.2% 显著低于红线，需重点纠偏。
                  </Text>
                </>
              ),
            },
            {
              key: 'index',
              label: '价格指标库',
              children: (
                <Table
                  size="small"
                  rowKey="item"
                  pagination={false}
                  columns={[
                    { title: '类别', dataIndex: 'category', width: 80, render: (v: string) => <Tag color="cyan">{v}</Tag> },
                    { title: '项目', dataIndex: 'item' },
                    { title: '单位', dataIndex: 'unit', width: 80 },
                    { title: '价格(元)', dataIndex: 'price', align: 'right', render: (v: number) => <span className="ds-num">{money(v)}</span> },
                    { title: '地区', dataIndex: 'region', width: 80 },
                    { title: '有效期至', dataIndex: 'valid', width: 110 },
                  ]}
                  dataSource={costData.costIndex}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
