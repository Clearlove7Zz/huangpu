import { useMemo, useRef, useState } from 'react';
import { useEffect } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Slider,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  AlertOutlined,
  CheckCircleOutlined,
  CommentOutlined,
  EditOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import Chart from '../components/Chart';
import ThinkingIndicator from '../components/ThinkingIndicator';
import type { EChartsOption } from 'echarts';
import { chatWithRag } from '../services/chat-service';
import { listAgents, listKnowledgeBases } from '../services/kb-service';
import { filterAgentsByRole, filterKbsByRole, getRbac } from '../config/rbac';
import { ragReady } from '../config/rag-config';
import { useAuth } from '../auth';
import MOCK_DATA from '../data';
import {
  FACTORS,
  PRESETS,
  buildAiPrompt,
  defaultFactors,
  getCurrentStatusByType,
  simulate,
  simulateDimension,
} from '../utils/decision-engine';
import type { FactorMeta, Preset, ProjectLike } from '../utils/decision-engine';

const { Title, Text } = Typography;

const RED_LINE = MOCK_DATA.profitRedLine;
const CRITICAL = (MOCK_DATA as { cashflowDetail: { criticalBalance: number } }).cashflowDetail.criticalBalance;

const projects = MOCK_DATA.projects as (ProjectLike & { shortName: string; statusLabel: string })[];

const TYPE_OPTIONS = [
  { value: 'overall', label: '整体推演' },
  { value: 'schedule', label: '进度推演' },
  { value: 'cost', label: '成本推演' },
];

export default function DecisionSystem() {
  const [projectId, setProjectId] = useState(projects[0].id);
  const [factors, setFactors] = useState<Record<string, number>>({ ...defaultFactors() });
  const [simType, setSimType] = useState('overall');
  const [aiText, setAiText] = useState('');
  const [aiDone, setAiDone] = useState(true);
  const timerRef = useRef<number | null>(null);
  const { user } = useAuth();
  const ragScopeRef = useRef<{ kbIds: string[]; agentId: string }>({ kbIds: [], agentId: '' });

  const [factorMeta, setFactorMeta] = useState<FactorMeta[]>(() => FACTORS.map((f) => ({ ...f })));
  const [presets, setPresets] = useState<Preset[]>(() => PRESETS.map((p) => ({ ...p, values: { ...p.values } })));
  const [editPresetId, setEditPresetId] = useState<string | null>(null);
  const [editFactorId, setEditFactorId] = useState<string | null>(null);
  const [presetLabelDraft, setPresetLabelDraft] = useState('');
  const [factorLabelDraft, setFactorLabelDraft] = useState('');
  const [factorWeightDraft, setFactorWeightDraft] = useState(1);

  // 按角色加载默认检索范围（知识库 + 智能体）
  useEffect(() => {
    if (!ragReady()) return;
    const role = user?.role ?? '';
    void Promise.all([listKnowledgeBases(), listAgents()])
      .then(([kbs, agents]) => {
        ragScopeRef.current = {
          kbIds: filterKbsByRole(role, kbs).map((kb) => kb.id),
          agentId: filterAgentsByRole(role, agents).some((a) => a.id === getRbac(role).defaultAgentId)
            ? getRbac(role).defaultAgentId
            : '',
        };
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const project = projects.find((p) => p.id === projectId) ?? projects[0];

  const result = useMemo(() => simulate(project, factors), [project, factors]);
  const dimResult = useMemo(() => simulateDimension(simType, project, factors), [simType, project, factors]);
  const status = useMemo(() => getCurrentStatusByType(project, simType), [project, simType]);

  const radarOption: EChartsOption = useMemo(() => {
    const b = result.baseline;
    const s = result.simulated;
    const norm = (v: number, max: number) => Math.min(100, Math.max(0, (v / max) * 100));
    const indicators = [
      { name: '进度', max: 100 },
      { name: '利润率', max: 100 },
      { name: '质量', max: 100 },
      { name: '安全', max: 100 },
      { name: '现金流', max: 100 },
      { name: '回款率', max: 100 },
    ];
    const base = [b.progress, b.profitRate * 4, b.qualityScore, b.safetyScore, norm(b.cashflowJun, 800), b.paymentRate];
    const sim = [s.progress, s.profitRate * 4, s.qualityScore, s.safetyScore, norm(s.cashflowJun, 800), s.paymentRate];
    return {
      tooltip: {},
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 } },
      radar: {
        indicator: indicators,
         radius: '54%',
         center: ['50%', '60%'],
        axisName: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 },
        splitLine: { lineStyle: { color: '#e5e7eb' } },
        splitArea: { areaStyle: { color: ['rgba(244, 162, 97, 0.02)', 'rgba(244, 162, 97, 0.05)'] } },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              name: '当前基准',
              value: base.map((v) => +v.toFixed(1)),
              itemStyle: { color: '#2ec4b6' },
              areaStyle: { color: 'rgba(19,168,168,0.18)' },
              lineStyle: { width: 2 },
            },
            {
              name: '推演情景',
              value: sim.map((v) => +v.toFixed(1)),
              itemStyle: { color: result.belowRedLine ? '#e5484d' : '#f4a261' },
              areaStyle: { color: result.belowRedLine ? 'rgba(217,83,79,0.15)' : 'rgba(244, 162, 97, 0.15)' },
              lineStyle: { width: 2 },
            },
          ],
        },
      ],
    };
  }, [result]);

  const dimBarOption: EChartsOption = useMemo(() => {
    const labels = dimResult.dimension.chartLabels;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: 'rgba(31, 35, 40, 0.66)', fontSize: 12 } },
      grid: { top: 56, left: 8, right: 16, bottom: 0, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
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
        { name: '现有/基准', type: 'bar', data: dimResult.dimension.chartBase, itemStyle: { color: '#2ec4b6', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 26 },
        { name: '推演', type: 'bar', data: dimResult.dimension.chartSim, itemStyle: { color: result.belowRedLine ? '#e5484d' : '#f4a261', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 26 },
      ],
    };
  }, [dimResult, result.belowRedLine]);

  const factorImpacts = useMemo(
    () => result.breakdown.map((br) => ({ ...br, delta: Math.abs(br.delta) })),
    [result],
  );

  const ragSessionRef = useRef<string | null>(null);

  /** 本地规则研判打字机（远端不可用时的降级） */
  const streamLocalAi = (text: string) => {
    setAiText('');
    setAiDone(false);
    let i = 0;
    timerRef.current = window.setInterval(() => {
      i = Math.min(i + 3, text.length);
      setAiText(text.slice(0, i));
      if (i >= text.length) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        setAiDone(true);
      }
    }, 12);
  };

  const runAi = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setAiText('');
    setAiDone(false);

    // 组装情景 query：本地确定性引擎数值注入（防幻觉），大模型负责组织语言
    const factorLines = FACTORS.filter((f) => factors[f.id] !== f.default)
      .map((f) => `${f.label} ${factors[f.id]}${f.unit}`)
      .join('、');
    const query =
      `【情景推演研判】项目：${project.name}（${project.shortName}）。` +
      (factorLines ? `扰动因子：${factorLines}。` : '当前基准情景。') +
      `本地引擎计算结果（务必直接引用，不要重新计算）：利润率 ${result.baseline.profitRate}% → ${result.simulated.profitRate}%` +
      `（变化 ${result.deltas.profitRate >= 0 ? '+' : ''}${result.deltas.profitRate} pct）` +
      `，跌破红线：${result.belowRedLine ? '是' : '否'}；` +
      `进度 ${result.baseline.progress}% → ${result.simulated.progress}%；` +
      `6月现金流结余 ${result.baseline.cashflowJun} 万 → ${result.simulated.cashflowJun} 万` +
      `（低于临界：${result.criticalCashflow ? '是' : '否'}）。` +
      `请基于知识库中的三算对比/成本/现金流数据，输出研判报告：综合研判、利润率影响、进度影响、质量与安全、现金流影响、成本分解（引用知识库数据）、AI 建议措施、数据引用溯源。`;

    let usedRemote = false;
    void chatWithRag(
      query,
      ragSessionRef.current,
      {
        onDelta: (delta) => {
          usedRemote = true;
          setAiText((prev) => prev + delta);
        },
        onLocalAnswer: () => {
          // 远端失败 → 本地规则引擎降级
          streamLocalAi(buildAiPrompt(dimResult, project, simType));
        },
        onDone: () => {
          if (usedRemote) setAiDone(true);
        },
      },
      {
        maxOutputHint:
          '请按要求的报告结构完整输出全部八个部分（综合研判、利润率影响、进度影响、质量与安全、现金流影响、成本分解、AI 建议措施、数据引用溯源），每部分 2-4 句，不得省略任何部分，总字数控制在 900 字以内。',
        knowledgeBaseIds: ragScopeRef.current.kbIds.length ? ragScopeRef.current.kbIds : undefined,
        agentId: ragScopeRef.current.agentId || undefined,
      },
    ).then((outcome) => {
      ragSessionRef.current = outcome.source === 'rag' ? outcome.sessionId : ragSessionRef.current;
    });
  };

  const applyPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setFactors({ ...defaultFactors(), ...preset.values });
  };

  const openEditPreset = (p: Preset) => {
    setPresetLabelDraft(p.label);
    setEditPresetId(p.id);
  };

  const saveEditPreset = () => {
    if (!editPresetId) return;
    const label = presetLabelDraft.trim();
    if (label) setPresets((ps) => ps.map((p) => (p.id === editPresetId ? { ...p, label } : p)));
    setEditPresetId(null);
  };

  const openEditFactor = (f: FactorMeta) => {
    setFactorLabelDraft(f.label);
    setFactorWeightDraft(f.impactWeight);
    setEditFactorId(f.id);
  };

  const saveEditFactor = () => {
    if (!editFactorId) return;
    const label = factorLabelDraft.trim();
    if (label) setFactorMeta((fs) => fs.map((f) => (f.id === editFactorId ? { ...f, label, impactWeight: factorWeightDraft } : f)));
    setEditFactorId(null);
  };

  const dimMetrics = dimResult.dimension.metrics;

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">
            一体化决策推演
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            6 大扰动因子情景推演 · 利润率红线 {RED_LINE}% · 现金流临界 {CRITICAL} 万
          </Text>
        </div>
        <Space>
          <Select
            value={projectId}
            onChange={setProjectId}
            style={{ width: 220 }}
            options={projects.map((p) => ({ value: p.id, label: `${p.shortName}（${p.name}）` }))}
          />
          <Segmented value={simType} onChange={(v) => setSimType(String(v))} options={TYPE_OPTIONS} />
        </Space>
      </div>

      {/* 红线/临界提示 */}
      {result.belowRedLine || result.criticalCashflow ? (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16, borderRadius: 12 }}
          message={
            <span style={{ fontSize: 13 }}>
              {result.belowRedLine && (
                <Tag color="error">推演后利润率 {result.simulated.profitRate}% 跌破红线 {RED_LINE}%</Tag>
              )}
              {result.criticalCashflow && (
                <Tag color="warning">6 月现金流结余 {result.simulated.cashflowJun} 万 低于临界 {CRITICAL} 万</Tag>
              )}
              {!result.belowRedLine && !result.criticalCashflow && '当前情景下各项指标均在红线内'}
            </span>
          }
        />
      ) : null}

      <Row gutter={[16, 16]}>
        {/* 因子面板 */}
        <Col xs={24} lg={9}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
            <div className="ds-card-title">
              <ExperimentOutlined style={{ color: '#f4a261' }} />
              扰动因子（{project.shortName}）
            </div>
            {factorMeta.map((f: FactorMeta) => {
              const v = factors[f.id];
              return (
                <div key={f.id} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Space size={4}>
                      <Text style={{ fontSize: 13, color: 'rgba(31, 35, 40, 0.72)' }}>{f.label}</Text>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined style={{ fontSize: 11, color: 'rgba(31,35,40,0.35)' }} />}
                        onClick={() => openEditFactor(f)}
                        style={{ padding: 0, height: 16 }}
                        title="编辑名称/影响权重"
                      />
                    </Space>
                    <Text strong style={{ fontSize: 13, color: v !== f.default ? '#f4a261' : undefined }}>
                      {v > 0 && f.unit !== '天' && f.unit !== '万' ? '+' : ''}
                      {v}
                      <Text type="secondary" style={{ fontSize: 12 }}> {f.unit}</Text>
                    </Text>
                  </div>
                  <Slider
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={v}
                    onChange={(val) => setFactors({ ...factors, [f.id]: val })}
                    tooltip={{ formatter: (val) => `${val}${f.unit}` }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {f.hint} · 影响权重 {f.impactWeight}x
                  </Text>
                </div>
              );
            })}
          </Card>
        </Col>

        {/* 指标对比 + 图表 */}
        <Col xs={24} lg={15}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
            <div className="ds-card-title">
              <ThunderboltOutlined style={{ color: '#f4a261' }} />
              推演结果 · 基准 → 情景
            </div>

            <Row gutter={[8, 8]} style={{ marginBottom: 8 }}>
              <Col span={8}>
                <Card size="small" variant="borderless" styles={{ body: { padding: '8px 12px', background: '#fafafa', borderRadius: 8 } }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>实际利润率</Text>
                  <div>
                    <span className="ds-num" style={{ fontSize: 20, fontWeight: 600, color: '#1f2328' }}>{result.baseline.profitRate}%</span>
                    <Text type="secondary" style={{ fontSize: 13 }}> → </Text>
                    <span className="ds-num" style={{ fontSize: 20, fontWeight: 600, color: result.belowRedLine ? '#e5484d' : '#f4a261' }}>
                      {result.simulated.profitRate}%
                    </span>
                  </div>
                  <Text style={{ fontSize: 12, color: result.deltas.profitRate < 0 ? '#e5484d' : '#e8853c' }}>
                    {result.deltas.profitRate >= 0 ? '+' : ''}{result.deltas.profitRate} pct
                  </Text>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" variant="borderless" styles={{ body: { padding: '8px 12px', background: '#fafafa', borderRadius: 8 } }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>整体进度</Text>
                  <div>
                    <span className="ds-num" style={{ fontSize: 20, fontWeight: 600, color: '#1f2328' }}>{result.baseline.progress}%</span>
                    <Text type="secondary" style={{ fontSize: 13 }}> → </Text>
                    <span className="ds-num" style={{ fontSize: 20, fontWeight: 600, color: result.deltas.progress < 0 ? '#e5484d' : '#f4a261' }}>
                      {result.simulated.progress}%
                    </span>
                  </div>
                  <Text style={{ fontSize: 12, color: result.deltas.progress < 0 ? '#e5484d' : '#e8853c' }}>
                    {result.deltas.progress >= 0 ? '+' : ''}{result.deltas.progress} pct
                  </Text>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" variant="borderless" styles={{ body: { padding: '8px 12px', background: '#fafafa', borderRadius: 8 } }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>6月现金流结余</Text>
                  <div>
                    <span className="ds-num" style={{ fontSize: 20, fontWeight: 600, color: '#1f2328' }}>{result.baseline.cashflowJun} 万</span>
                    <Text type="secondary" style={{ fontSize: 13 }}> → </Text>
                    <span className="ds-num" style={{ fontSize: 20, fontWeight: 600, color: result.criticalCashflow ? '#e5484d' : '#f4a261' }}>
                      {result.simulated.cashflowJun} 万
                    </span>
                  </div>
                  <Text style={{ fontSize: 12, color: result.deltas.cashflow < 0 ? '#e5484d' : '#e8853c' }}>
                    {result.deltas.cashflow >= 0 ? '+' : ''}{result.deltas.cashflow} 万
                  </Text>
                </Card>
              </Col>
            </Row>

            <Row gutter={[8, 8]}>
              {dimMetrics.map((m) => {
                const delta = +(m.sim - m.base).toFixed(2);
                return (
                  <Col xs={12} md={8} key={m.id}>
                    <Card size="small" className="ds-card-line" styles={{ body: { padding: '8px 12px' } }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{m.name}</Text>
                      <div style={{ whiteSpace: 'nowrap' }}>
                        <span className="ds-num" style={{ fontSize: 14, color: 'rgba(31, 35, 40, 0.66)' }}>{m.base}{m.unit}</span>
                        <Text type="secondary" style={{ fontSize: 12, margin: '0 4px' }}>→</Text>
                        <span className="ds-num" style={{ fontSize: 14, fontWeight: 600, color: delta < 0 ? '#e5484d' : delta > 0 ? '#f4a261' : '#1f2328' }}>
                          {m.sim}{m.unit}
                        </span>
                      </div>
                      <Text style={{ fontSize: 12, color: delta === 0 ? 'rgba(31, 35, 40, 0.42)' : delta < 0 ? '#e5484d' : '#e8853c' }}>
                        {delta > 0 ? '+' : ''}{delta}{m.unit}
                      </Text>
                    </Card>
                  </Col>
                );
              })}
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} md={12}>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>六维健康雷达</Text>
                <Chart option={radarOption} height={270} />
              </Col>
              <Col xs={24} md={12}>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>维度对比（{TYPE_OPTIONS.find((t) => t.value === simType)?.label}）</Text>
                <Chart option={dimBarOption} height={270} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* 快捷情景 */}
      <Card className="ds-card-line" style={{ marginTop: 16 }} styles={{ body: { padding: '16px 24px' } }}>
        <div className="ds-card-title" style={{ marginBottom: 12 }}>快捷情景</div>
        <Space wrap size={[8, 8]}>
          {presets.map((p) => (
            <Space key={p.id} size={0}>
              <Button
                size="small"
                shape="round"
                type={JSON.stringify(factors) === JSON.stringify({ ...defaultFactors(), ...p.values }) ? 'primary' : 'default'}
                onClick={() => applyPreset(p.id)}
              >
                {p.icon} {p.label}
              </Button>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined style={{ fontSize: 11, color: 'rgba(31,35,40,0.35)' }} />}
                onClick={() => openEditPreset(p)}
                style={{ padding: 0, height: 22, marginLeft: -2 }}
                title="重命名快捷情景"
              />
            </Space>
          ))}
        </Space>
        {factorImpacts.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Text strong style={{ fontSize: 13 }}>成本扰动明细：</Text>
            <Space wrap size={[8, 8]} style={{ marginTop: 4 }}>
              {factorImpacts.map((b) => (
                <Tag key={b.factor} color={b.delta > 0 ? 'warning' : 'success'}>
                  {b.factor} {b.delta >= 0 ? '+' : ''}{b.delta} {b.unit}
                </Tag>
              ))}
            </Space>
          </div>
        )}
      </Card>

      {/* 当前状态 + AI 研判 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={9}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
            <div className="ds-card-title">
              <CheckCircleOutlined style={{ color: '#f4a261' }} />
              当前状态诊断
            </div>
            {status.items.map((it) => (
              <div
                key={it.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid #ececf0',
                }}
              >
                <Text style={{ fontSize: 13, color: 'rgba(31, 35, 40, 0.72)' }}>{it.label}</Text>
                <Space size={8}>
                  <Text strong className="ds-num" style={{ fontSize: 13 }}>{it.value}</Text>
                  <Tag color={it.status === 'ok' ? 'success' : 'warning'} style={{ marginRight: 0 }}>
                    {it.stateLabel}
                  </Tag>
                </Space>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <Text strong style={{ fontSize: 13 }}>建议措施：</Text>
              {status.suggestions.map((s, idx) => (
                <div key={s.title} style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 13 }}>
                  <Tag color={s.type === 'danger' ? 'error' : s.type === 'warn' ? 'warning' : s.type === 'ok' ? 'success' : 'cyan'}>
                    {s.type === 'danger' ? '预警' : s.type === 'warn' ? '关注' : s.type === 'ok' ? '正常' : s.type === 'opportunity' ? '机会' : '行动'}
                  </Tag>
                  <Text style={{ fontSize: 13, color: 'rgba(31, 35, 40, 0.72)', flex: 1 }}>
                    <Text strong>{idx + 1}. {s.title}：</Text>
                    {s.text}
                  </Text>
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
              <div className="ds-card-title" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <span>
                  <AlertOutlined style={{ color: '#f4a261', marginRight: 8 }} />
                  AI 研判报告
                </span>
                <Space>
                  <Button
                    size="small"
                    icon={<CommentOutlined />}
                    onClick={() => (window.location.hash = '#/ai')}
                  >
                    在 AI 智能问答中深入提问
                  </Button>
                  <Button type="primary" size="small" icon={<ThunderboltOutlined />} disabled={!aiDone} onClick={runAi}>
                    ✨ 解析情景并生成研判
                  </Button>
                </Space>
              </div>
            {!aiDone && !aiText ? (
              <div className="ds-ai-box">
                <ThinkingIndicator />
              </div>
            ) : aiText ? (
              <div className="ds-ai-box" style={{ maxHeight: 420, overflowY: 'auto' }}>
                {aiText}
              </div>
            ) : (
              <div className="ds-ai-box" style={{ color: 'rgba(31, 35, 40, 0.45)' }}>
                点击「解析情景并生成研判」，基于当前 6 因子情景输出含数值依据的研判报告（流式）。
                <br />
                <Text style={{ fontSize: 12, color: 'rgba(31, 35, 40, 0.35)' }}>
                  数值由本地确定性引擎计算，研判基于业务台账（三算对比 / 现金流）检索生成，引用可溯源。
                </Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="重命名快捷情景"
        open={editPresetId !== null}
        onOk={saveEditPreset}
        onCancel={() => setEditPresetId(null)}
        okText="保存"
        cancelText="取消"
        width={360}
      >
        <Input
          value={presetLabelDraft}
          onChange={(e) => setPresetLabelDraft(e.target.value)}
          placeholder="输入情景名称"
          onPressEnter={saveEditPreset}
        />
      </Modal>

      <Modal
        title="编辑扰动因子"
        open={editFactorId !== null}
        onOk={saveEditFactor}
        onCancel={() => setEditFactorId(null)}
        okText="保存"
        cancelText="取消"
        width={360}
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>因子名称</Text>
          <Input
            value={factorLabelDraft}
            onChange={(e) => setFactorLabelDraft(e.target.value)}
            placeholder="输入因子名称"
            onPressEnter={saveEditFactor}
            style={{ marginTop: 4 }}
          />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>影响权重（数字越大气泡越大）</Text>
          <InputNumber
            value={factorWeightDraft}
            min={0}
            max={10}
            step={0.1}
            onChange={(val) => setFactorWeightDraft(val ?? 1)}
            style={{ width: '100%', marginTop: 4 }}
          />
        </div>
      </Modal>
    </div>
  );
}
