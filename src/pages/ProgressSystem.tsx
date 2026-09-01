import { useMemo, useState } from 'react';
import { Button, Card, Checkbox, Col, Input, InputNumber, Modal, Progress, Row, Select, Space, Table, Tabs, Tag, Typography, Upload, message } from 'antd';
import { DownloadOutlined, InboxOutlined, RobotOutlined } from '@ant-design/icons';
import Chart from '../components/Chart';
import type { EChartsOption } from 'echarts';
import MOCK_DATA from '../data';
import GanttChart from '../components/GanttChart';

const { Title, Text } = Typography;

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  done: { color: 'success', label: '已完成' },
  doing: { color: 'processing', label: '进行中' },
  pending: { color: 'default', label: '未开始' },
  lag: { color: 'error', label: '滞后' },
};

const MARKER_COLOR: Record<string, string> = { new: '#52c41a', progress: '#1890ff', change: '#faad14' };

type AerialPhotoGroup = {
  month: string;
  label: string;
  desc: string;
  photos: string[];
  aiCompare?: boolean;
  compareWith?: string;
  aiSummary?: string;
  annotations?: Record<string, { x: number; y: number; label: string; type: string }[]>;
};

/** 证照台账行：project 为按地块拼接的展示字段，其余来自 projectDetails.licenses */
type LicenseRow = { project: string; name: string; status: string; date: string; deadline: string; warn: boolean };

export default function ProgressSystem() {
  const data = MOCK_DATA.progressSystem as {
    syncSource: string;
    syncStatus: string;
    fallbackMethod: string;
    lastImport: string;
    defaultProjectId: string;
    milestonesByProject: Record<string, { name: string; plan: string; actual: string; status: string; lagDays: number; weight: number }[]>;
    wbsByProject: Record<string, { id: string; wbs: string; name: string; start: string; end: string; progress: number; isCritical: boolean }[]>;
    constructionNodes: { project: string; node: string; plan: string; actual: string; rate: number; status: string; lagDays: number }[];
    productionUnits: { project: string; unit: string; monthOutput: number; cumOutput: number; reporter: string; date: string; status: string }[];
    drawingPlan: { project: string; major: string; planDate: string; actualDate: string; rate: number; status: string }[];
  };

  const projects = MOCK_DATA.projects as { id: string; name: string; shortName: string; progress: number; lagNodes: number }[];
  const projectDetails = MOCK_DATA.projectDetails as Record<string, { licenses: { name: string; status: string; date: string; deadline: string; warn: boolean }[]; inspections: { date: string; type: string; result: string; status: string; inspector: string }[] }>;
  const [projectId, setProjectId] = useState(data.defaultProjectId);
  const [tab, setTab] = useState('license');
  const [editable, setEditable] = useState(false);

  const project = projects.find((p) => p.id === projectId);
  const milestones = data.milestonesByProject[projectId] ?? [];
  const wbs = data.wbsByProject[projectId] ?? [];

  const allLicenses = useMemo<LicenseRow[]>(() => {
    return projects.flatMap((p) => {
      const detail = projectDetails[p.id];
      if (!detail) return [];
      return detail.licenses.map((l) => ({ project: p.shortName, ...l }));
    });
  }, [projects, projectDetails]);

  const inspections = projectDetails[projectId]?.inspections ?? [];
  const jarvisBim = MOCK_DATA.jarvisBim as { url: string; account: string; password: string; note: string };

  const aerialPhotos = (MOCK_DATA.aerialPhotos as AerialPhotoGroup[]) ?? [];
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);

  // 不加局部窄化标注：mock-data 的 outputValue 字段齐全，窄标注曾导致 totalPlan/timeline 等字段"不存在"
  const ov = MOCK_DATA.outputValue;

  const yearlyOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 } },
      grid: { top: 40, left: 8, right: 16, bottom: 0, containLabel: true },
      xAxis: { type: 'category', data: ov.yearlyChart.map((y) => `${y.year}`), axisLine: { lineStyle: { color: '#e5e7eb' } }, axisTick: { show: false }, axisLabel: { color: 'rgba(31, 35, 40, 0.55)' } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#ececf0' } }, axisLabel: { color: 'rgba(31, 35, 40, 0.55)' } },
      series: [
        { name: '计划产值', type: 'bar', data: ov.yearlyChart.map((y) => y.plan), itemStyle: { color: '#597ef7', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 26 },
        { name: '实物量产值', type: 'bar', data: ov.yearlyChart.map((y) => y.physical), itemStyle: { color: '#36cfc9', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 26 },
        { name: '计量产值', type: 'bar', data: ov.yearlyChart.map((y) => y.measured), itemStyle: { color: '#f4a261', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 26 },
      ],
    }),
    [ov],
  );

  const monthlyOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 } },
      grid: { top: 40, left: 8, right: 16, bottom: 0, containLabel: true },
      xAxis: { type: 'category', data: Array.from({ length: 12 }, (_, i) => `${i + 1}月`), axisLine: { lineStyle: { color: '#e5e7eb' } }, axisTick: { show: false }, axisLabel: { color: 'rgba(31, 35, 40, 0.55)' } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#ececf0' } }, axisLabel: { color: 'rgba(31, 35, 40, 0.55)' } },
      series: [
        { name: '计划产值', type: 'bar', data: ov.monthly.plan, itemStyle: { color: '#597ef7', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 18 },
        { name: '实物量产值', type: 'bar', data: ov.monthly.physical, itemStyle: { color: '#36cfc9', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 18 },
        { name: '计量产值', type: 'bar', data: ov.monthly.measured, itemStyle: { color: '#f4a261', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 18 },
      ],
    }),
    [ov],
  );

  const handleImport = (file: File) => {
    const ok = /\.(xlsx|xls)$/i.test(file.name);
    if (!ok) {
      message.error(`不支持的格式：${file.name}，请上传 .xlsx / .xls`);
      return Upload.LIST_IGNORE;
    }
    message.success(`导入进度Excel：${file.name} · 自动识别里程碑/进度/产值`);
    return false;
  };

  const sectionTitle = (t: string) => (
    <Text strong style={{ fontSize: 13, display: 'block', margin: '16px 0 8px' }}>{t}</Text>
  );

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">施工进度管控</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            证照办理 · 施工计划与进度 · 产值三口径 · 安全巡检与形象进度 · 数据源：{data.syncSource}
          </Text>
        </div>
        <Space>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleImport}>
            <Button size="small" icon={<InboxOutlined />}>导入进度Excel</Button>
          </Upload>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => message.success('正在导出 施工进度报表 (Excel)')}>导出</Button>
          <Checkbox checked={editable} onChange={(e) => setEditable(e.target.checked)}>可编辑</Checkbox>
        </Space>
      </div>

      <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'license',
              label: '证照办理计划与进度',
              children: (
                <Table
                  rowKey={(r) => `${r.project}-${r.name}`}
                  pagination={false}
                  columns={[
                    { title: '项目', dataIndex: 'project', width: 110 },
                    { title: '证照', dataIndex: 'name', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                    { title: '状态', dataIndex: 'status', width: 100, render: (s: string) => editable ? <Input size="small" defaultValue={s} /> : (s === 'done' ? <Tag color="success">已完成</Tag> : <Tag color="processing">办理中</Tag>) },
                    { title: '完成时间', dataIndex: 'date', width: 120, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                    { title: '时限', dataIndex: 'deadline', width: 120, render: (v: string, r: LicenseRow) => (v !== '—' && r.warn ? <Tag color="error">{v}</Tag> : v) },
                  ]}
                  dataSource={allLicenses}
                  scroll={{ x: 700 }}
                />
              ),
            },
            {
              key: 'construction',
              label: '施工计划与进度',
              children: (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Text strong style={{ fontSize: 13 }}>施工项目：</Text>
                    <Select value={projectId} onChange={setProjectId} style={{ width: 220 }} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      整体进度 {project?.progress ?? '—'}% · 滞后节点 {project?.lagNodes ?? 0} 个
                    </Text>
                  </div>

                  {sectionTitle('里程碑计划')}
                  <Table
                    rowKey="name"
                    pagination={false}
                    columns={[
                      { title: '里程碑', dataIndex: 'name', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '计划', dataIndex: 'plan', width: 120, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '实际', dataIndex: 'actual', width: 120, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '完成率', dataIndex: 'weight', width: 160, render: (v: number) => <Progress percent={v} size="small" strokeColor="#2ec4b6" format={(p) => `权重 ${p}%`} /> },
                      { title: '状态', dataIndex: 'status', width: 100, render: (s: string) => <Tag color={STATUS_TAG[s]?.color}>{STATUS_TAG[s]?.label}</Tag> },
                      { title: '滞后(天)', dataIndex: 'lagDays', width: 90, render: (v: number) => (v > 0 ? <Tag color="error">{v} 天</Tag> : '—') },
                    ]}
                    dataSource={milestones}
                  />

                  {sectionTitle('WBS 活动计划 · 自动甘特图')}
                  <div style={{ overflowX: 'auto', border: '1px solid #ececf0', borderRadius: 10, padding: 12, background: '#fcfcfd' }}>
                    <GanttChart activities={wbs} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Table
                      rowKey="id"
                      pagination={false}
                      columns={[
                        { title: 'WBS', dataIndex: 'wbs', width: 80 },
                        { title: '活动名称', dataIndex: 'name', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                        { title: '开始', dataIndex: 'start', width: 120, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                        { title: '结束', dataIndex: 'end', width: 120, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                        { title: '完成%', dataIndex: 'progress', width: 80, align: 'right', render: (v: number) => editable ? <InputNumber size="small" defaultValue={v} style={{ width: 70 }} /> : <span className="ds-num">{v}%</span> },
                        { title: '关键路径', dataIndex: 'isCritical', width: 90, render: (v: boolean) => (v ? <Tag color="warning">关键</Tag> : '—') },
                      ]}
                      dataSource={wbs}
                    />
                  </div>

                  {sectionTitle('全项目施工里程碑汇总')}
                  <Table
                    rowKey={(r) => `${r.project}-${r.node}`}
                    pagination={false}
                    columns={[
                      { title: '项目', dataIndex: 'project' },
                      { title: '节点', dataIndex: 'node', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '计划', dataIndex: 'plan', width: 110, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '实际', dataIndex: 'actual', width: 110, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '完成率', dataIndex: 'rate', width: 160, render: (v: number) => <Progress percent={v} size="small" strokeColor="#f4a261" /> },
                      { title: '状态', dataIndex: 'status', width: 100, render: (s: string) => <Tag color={STATUS_TAG[s]?.color}>{STATUS_TAG[s]?.label}</Tag> },
                      { title: '滞后(天)', dataIndex: 'lagDays', width: 90, render: (v: number) => (v > 0 ? <Tag color="error">{v}</Tag> : '—') },
                    ]}
                    dataSource={data.constructionNodes}
                  />

                  {sectionTitle('设计出图进度（关联）')}
                  <Table
                    rowKey={(r) => `${r.project}-${r.major}`}
                    pagination={false}
                    columns={[
                      { title: '项目', dataIndex: 'project' },
                      { title: '专业', dataIndex: 'major', width: 100 },
                      { title: '计划出图', dataIndex: 'planDate', width: 110 },
                      { title: '实际出图', dataIndex: 'actualDate', width: 110 },
                      { title: '进度', dataIndex: 'rate', width: 160, render: (v: number) => <Progress percent={v} size="small" strokeColor="#f4a261" /> },
                      { title: '状态', dataIndex: 'status', width: 100, render: (s: string) => <Tag color={STATUS_TAG[s]?.color}>{STATUS_TAG[s]?.label}</Tag> },
                    ]}
                    dataSource={data.drawingPlan.filter((d) => d.project === project?.name)}
                  />
                </div>
              ),
            },
            {
              key: 'output',
              label: '产值计划与进度',
              children: (
                <div>
                  {sectionTitle('整体情况')}
                  <Card
                    className="ds-card-line"
                    style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f0f9ff 0%, #faf5ff 100%)', border: '1px solid #e0e7ff' }}
                    styles={{ body: { padding: '20px 24px' } }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
                      <div style={{ minWidth: 180 }}>
                        <Text type="secondary" style={{ fontSize: 12, letterSpacing: 0.5 }}>总计划产值</Text>
                        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2, color: '#1e3a5f' }}>
                          {ov.totalPlan.toLocaleString('zh-CN')}
                          <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 4, color: 'rgba(31,35,40,0.45)' }}>万元</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(31,35,40,0.45)', marginTop: 2 }}>建设期 {ov.buildPeriod}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 320, maxWidth: 560 }}>
                        <div style={{ display: 'flex' }}>
                          {ov.timeline.map((t, i) => {
                            const done = t.done;
                            const nextDone = i < ov.timeline.length - 1 ? ov.timeline[i + 1].done : false;
                            return (
                              <div key={t.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                {i < ov.timeline.length - 1 && (
                                  <div style={{
                                    position: 'absolute', top: 11, left: '50%', width: '100%', height: 3,
                                    background: done && nextDone ? '#52c41a' : done ? '#52c41a' : '#e5e7eb',
                                    borderRadius: 2, zIndex: 0,
                                  }} />
                                )}
                                <div style={{
                                  width: 22, height: 22, borderRadius: '50%',
                                  background: done ? '#52c41a' : '#d9d9d9',
                                  border: done ? '3px solid #b7eb8f' : '2px solid #f0f0f0',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  position: 'relative', zIndex: 1, boxSizing: 'border-box',
                                }}>
                                  {done && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                                </div>
                                <div style={{ marginTop: 6, textAlign: 'center' }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: done ? '#1e3a5f' : 'rgba(31,35,40,0.35)' }}>{t.year}</div>
                                  <div style={{ fontSize: 11, color: 'rgba(31,35,40,0.55)', marginTop: 1 }}>计划 {t.plan.toLocaleString()}</div>
                                  {t.physicalCum != null && (
                                    <div style={{ fontSize: 11, color: '#52c41a', fontWeight: 500, marginTop: 1 }}>实际 {t.physicalCum.toLocaleString()}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        <div style={{ textAlign: 'right' }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>实物量</Text>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#2ec4b6' }}>{ov.physicalRate}%</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>计量</Text>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#f4a261' }}>{ov.measuredRate}%</div>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                    <Card size="small" className="ds-card-line" style={{ flex: 1, minWidth: 180 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>产值计划 · 整体</Text>
                      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{ov.totalPlan.toLocaleString('zh-CN')} <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(31,35,40,0.45)' }}>万元</span></div>
                    </Card>
                    <Card size="small" className="ds-card-line" style={{ flex: 1, minWidth: 180 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>开工累计实物量产值</Text>
                      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{ov.cumPhysical.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(31,35,40,0.45)' }}>万元</span></div>
                      <Text style={{ fontSize: 12, color: '#2ec4b6' }}>{ov.physicalRate}%</Text>
                    </Card>
                    <Card size="small" className="ds-card-line" style={{ flex: 1, minWidth: 180 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>开工累计计量产值</Text>
                      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{ov.cumMeasured.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(31,35,40,0.45)' }}>万元</span></div>
                      <Text style={{ fontSize: 12, color: '#f4a261' }}>{ov.measuredRate}%</Text>
                    </Card>
                  </div>

                  {sectionTitle('进度完成情况')}
                  <Chart option={monthlyOption} height={280} />

                  {sectionTitle('产值明细表')}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #ececf0' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>项目名称</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>合同工作量</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>统计内容</th>
                          {Array.from({ length: 12 }, (_, i) => (
                            <th key={i} style={{ padding: '8px 6px', textAlign: 'right' }}>{i + 1}月</th>
                          ))}
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>截止当月</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>全年计划产值</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>开工累计完成计量产值</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: '计划产值', key: 'plan', cum: ov.monthCumPlan, year: ov.yearPlan },
                          { label: '实物量产值', key: 'physical', cum: ov.monthCumPhysical },
                          { label: '偏差', key: 'variance', cum: ov.monthCumVariance, isVar: true },
                          { label: '完成率', key: 'rate', cum: `${ov.monthCumRate}%`, year: `${ov.yearRate}%`, isPct: true },
                          { label: '计量产值', key: 'measured', cum: ov.monthCumMeasured },
                        ].map((row, ri) => {
                          const vals = row.key === 'variance'
                            ? ov.monthly.plan.map((p, i) => {
                                const ph = ov.monthly.physical[i];
                                return ph != null ? (ph - p).toFixed(2) : null;
                              })
                            : row.key === 'rate'
                              ? ov.monthly.plan.map((p, i) => {
                                  const ph = ov.monthly.physical[i];
                                  return ph != null ? Math.round((ph / p) * 100) + '%' : null;
                                })
                              : (ov.monthly as Record<string, (number | null)[]>)[row.key] ?? [];
                          return (
                            <tr key={ri} style={{ borderBottom: '1px solid #f5f5f7', background: ri === 0 ? '#fafbfc' : undefined }}>
                              {ri === 0 && (
                                <>
                                  <td style={{ padding: '8px 10px', fontWeight: 600 }} rowSpan={5}>{ov.projectName}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right' }} rowSpan={5}>{ov.contractWorkload.toLocaleString('zh-CN')}</td>
                                </>
                              )}
                              <td style={{ padding: '8px 10px' }}>{row.label}</td>
                              {vals.map((v, i) => (
                                <td key={i} style={{ padding: '8px 6px', textAlign: 'right', color: row.isVar && v != null && Number(v) < 0 ? '#e5484d' : undefined }}>
                                  {v == null ? '—' : row.isPct ? v : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                                </td>
                              ))}
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                                {row.cum != null ? (row.isPct ? row.cum : Number(row.cum).toLocaleString('zh-CN', { maximumFractionDigits: 2 })) : '—'}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                {row.year != null ? (row.isPct ? row.year : Number(row.year).toLocaleString('zh-CN', { maximumFractionDigits: 2 })) : '—'}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                {row.key === 'measured' ? ov.cumMeasured.toLocaleString('zh-CN') : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {sectionTitle('年度产值对比（万元 · 计划/实物量/计量）')}
                  <Chart option={yearlyOption} height={280} />

                  {sectionTitle('生产单元产值报审')}
                  <Table
                    rowKey={(r) => `${r.project}-${r.unit}`}
                    pagination={false}
                    columns={[
                      { title: '项目', dataIndex: 'project' },
                      { title: '生产单元', dataIndex: 'unit' },
                      { title: '本月产值(万)', dataIndex: 'monthOutput', align: 'right', className: 'ds-num' },
                      { title: '累计产值(万)', dataIndex: 'cumOutput', align: 'right', className: 'ds-num' },
                      { title: '报审人', dataIndex: 'reporter', width: 90 },
                      { title: '报审日期', dataIndex: 'date', width: 110 },
                      { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={v === '已审核' ? 'success' : 'warning'}>{v}</Tag> },
                    ]}
                    dataSource={data.productionUnits}
                  />
                </div>
              ),
            },
            {
              key: 'image',
              label: '安全巡检与形象进度',
              children: (
                <div>
                  {sectionTitle('安全/质量巡检情况')}
                  <Table
                    rowKey={(r) => `${r.date}-${r.type}`}
                    pagination={false}
                    columns={[
                      { title: '日期', dataIndex: 'date', width: 110, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '类型', dataIndex: 'type', width: 110, render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '结果', dataIndex: 'result', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                      { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={v === '整改中' ? 'warning' : 'success'}>{v}</Tag> },
                      { title: '检查方', dataIndex: 'inspector', render: (v: string) => editable ? <Input size="small" defaultValue={v} /> : v },
                    ]}
                    dataSource={inspections}
                  />

                  {sectionTitle('内部形象进度')}
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

                  {sectionTitle('外部形象进度')}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>航拍 AI 对比 · 标注新增/变化区域 · 每月更新保留历史</Text>
                    <Space style={{ marginLeft: 'auto' }}>
                      <Button size="small" icon={<RobotOutlined />} onClick={() => message.success('AI对比完成 · 已标注最新月相对上月新增进展区域')}>
                        运行AI对比分析
                      </Button>
                      <Button size="small" onClick={() => message.success('Demo：上传本月航拍图（支持历史版本保留）')}>
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
                                onClick={() => setLightbox({ src: `/assets/aerial/${p}`, caption: `${g.label} - ${g.desc}` })}
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
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!lightbox}
        footer={null}
        onCancel={() => setLightbox(null)}
        title={lightbox?.caption}
        width={720}
      >
        {lightbox && (
          <img src={lightbox.src} alt={lightbox.caption} style={{ width: '100%', borderRadius: 8 }} />
        )}
      </Modal>
    </div>
  );
}