import MOCK_DATA from '../data';

/** 一体化决策推演引擎（由 demo decision-engine.js v2.2 移植，纯逻辑无 DOM） */

export interface ProjectLike {
  id: string;
  name: string;
  shortName?: string;
  progress: number;
  lagNodes: number;
  profitRate: number;
  paymentRate: number;
  costCompletion: number;
  cost: {
    bidPrice: number;
    targetCost: number;
    actualCost: number;
    topOverruns?: string[];
  };
  risks: { total: number; red: number };
}

export interface Factors {
  steelPrice: number;
  progressDelay: number;
  subcontractDelta: number;
  paymentDelay: number;
  concreteQty: number;
  qualityInvest: number;
}

export interface SimType {
  id: string;
  label: string;
  icon: string;
  methodDesc: string;
}

export interface Preset {
  id: string;
  label: string;
  icon: string;
  values: Partial<Factors>;
}

export interface FactorMeta {
  id: keyof Factors;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  impactWeight: number;
  hint: string;
  icon: string;
}

export const SIM_TYPES: SimType[] = [
  { id: 'overall', label: '整体推演', icon: '🎯', methodDesc: '经典挣值推演图（PV/EV/AC + EAC 预测 + 管理储备），联动动态现金流推演，综合评估项目健康度' },
  { id: 'schedule', label: '进度推演', icon: '📅', methodDesc: '项目进度网络图展示活动逻辑关系，关键路径与扰动后工期可视化' },
  { id: 'cost', label: '成本推演', icon: '💰', methodDesc: '成本 S 曲线（累计 PV/EV/AC），对比现状与扰动推演轨迹' },
];

export const FACTORS: FactorMeta[] = [
  { id: 'steelPrice', label: '钢筋单价', unit: '%', min: -10, max: 15, step: 0.5, default: 0, impactWeight: 1.2, hint: '相对当前预算价波动', icon: '🔩' },
  { id: 'progressDelay', label: '关键节点延误', unit: '天', min: 0, max: 90, step: 1, default: 0, impactWeight: 1.5, hint: '桩基/主体等里程碑延期', icon: '📅' },
  { id: 'subcontractDelta', label: '分包合同变更', unit: '万', min: -200, max: 500, step: 10, default: 0, impactWeight: 1.8, hint: '签证/变更累计金额', icon: '📋' },
  { id: 'paymentDelay', label: '业主回款延迟', unit: '天', min: 0, max: 60, step: 5, default: 0, impactWeight: 1.4, hint: '较约定账期延长', icon: '💳' },
  { id: 'concreteQty', label: '混凝土用量偏差', unit: '%', min: -8, max: 12, step: 0.5, default: 0, impactWeight: 1.0, hint: '相对施工图预算量', icon: '🏗️' },
  { id: 'qualityInvest', label: '质量整改投入', unit: '万', min: 0, max: 300, step: 10, default: 0, impactWeight: 0.9, hint: '专项整改与复检费用', icon: '✅' },
];

export const PRESETS: Preset[] = [
  { id: 'baseline', label: '当前基准', icon: '📊', values: {} },
  { id: 'steel_up', label: '钢筋涨价8%', icon: '🔩', values: { steelPrice: 8 } },
  { id: 'delay_30', label: '主体延误30天', icon: '⏱️', values: { progressDelay: 30 } },
  { id: 'payment_late', label: '回款延迟30天', icon: '💳', values: { paymentDelay: 30 } },
  { id: 'combo_risk', label: '复合风险情景', icon: '⚠️', values: { steelPrice: 5, progressDelay: 20, subcontractDelta: 80, paymentDelay: 15 } },
];

export function defaultFactors(): Factors {
  return {
    steelPrice: FACTORS[0].default,
    progressDelay: FACTORS[1].default,
    subcontractDelta: FACTORS[2].default,
    paymentDelay: FACTORS[3].default,
    concreteQty: FACTORS[4].default,
    qualityInvest: FACTORS[5].default,
  };
}

function getCashflowJun(): number {
  const m = (MOCK_DATA as { cashflowDetail?: { monthly?: { month: string; forecastBalance: number }[] } })
    .cashflowDetail?.monthly?.find((x) => x.month === '2026-06');
  return m?.forecastBalance ?? 420;
}

function getCriticalBalance(): number {
  return (MOCK_DATA as { cashflowDetail?: { criticalBalance?: number } }).cashflowDetail?.criticalBalance ?? 200;
}

export interface Baseline {
  progress: number;
  profitRate: number;
  profitWan: number;
  bidYi: number;
  targetYi: number;
  actualCostYi: number;
  qualityScore: number;
  safetyScore: number;
  cashflowJun: number;
  riskCount: number;
  redRisks: number;
  paymentRate: number;
  endDateShift: number;
}

export function getBaseline(project: ProjectLike): Baseline {
  const bidYi = project.cost.bidPrice;
  const targetYi = project.cost.targetCost;
  const profitWan = (bidYi - targetYi) * 10000;
  const qualityBase = Math.min(98, 82 + project.progress * 0.04 - project.lagNodes * 3);
  return {
    progress: project.progress,
    profitRate: project.profitRate,
    profitWan: Math.round(profitWan),
    bidYi,
    targetYi,
    actualCostYi: +(targetYi * (project.costCompletion / 100) + targetYi * 0.08).toFixed(2),
    qualityScore: +qualityBase.toFixed(1),
    safetyScore: Math.min(95, 88 - project.lagNodes * 2 + (project.risks.red > 0 ? -4 : 2)),
    cashflowJun: getCashflowJun(),
    riskCount: project.risks.total,
    redRisks: project.risks.red,
    paymentRate: project.paymentRate,
    endDateShift: 0,
  };
}

export interface SimResult {
  baseline: Baseline;
  simulated: {
    progress: number;
    profitRate: number;
    profitWan: number;
    targetYi: number;
    costDeltaWan: number;
    qualityScore: number;
    safetyScore: number;
    cashflowJun: number;
    riskCount: number;
    redRisks: number;
    paymentRate: number;
    endDateShift: number;
  };
  deltas: {
    progress: number;
    profitRate: number;
    profitWan: number;
    quality: number;
    safety: number;
    cashflow: number;
    risk: number;
  };
  breakdown: { factor: string; delta: number; unit: string }[];
  factors: Factors;
  belowRedLine: boolean;
  criticalCashflow: boolean;
}

export function simulate(project: ProjectLike, factors: Partial<Factors>): SimResult {
  const base = getBaseline(project);
  const bidWan = base.bidYi * 10000;
  let costDeltaWan = 0;
  let progressDelta = 0;
  let qualityDelta = 0;
  let safetyDelta = 0;
  let cashflowDelta = 0;
  let riskDelta = 0;
  let endDateShift = 0;
  const breakdown: { factor: string; delta: number; unit: string }[] = [];

  const steel = factors.steelPrice || 0;
  if (steel !== 0) {
    const steelCostShare = base.targetYi * 0.18 * 10000;
    const d = steelCostShare * (steel / 100);
    costDeltaWan += d;
    breakdown.push({ factor: '钢筋单价', delta: d, unit: '万' });
  }

  const concrete = factors.concreteQty || 0;
  if (concrete !== 0) {
    const concShare = base.targetYi * 0.22 * 10000;
    const d = concShare * (concrete / 100);
    costDeltaWan += d;
    breakdown.push({ factor: '混凝土用量', delta: d, unit: '万' });
  }

  const sub = factors.subcontractDelta || 0;
  if (sub !== 0) {
    costDeltaWan += sub;
    breakdown.push({ factor: '分包变更', delta: sub, unit: '万' });
  }

  const quality = factors.qualityInvest || 0;
  if (quality !== 0) {
    costDeltaWan += quality;
    qualityDelta += Math.min(6, quality / 40);
    riskDelta -= Math.min(2, Math.floor(quality / 80));
    breakdown.push({ factor: '质量整改', delta: quality, unit: '万' });
  }

  const delay = factors.progressDelay || 0;
  if (delay > 0) {
    progressDelta = -(delay / 365) * 28;
    const laborOverrun = delay * 1.2;
    costDeltaWan += laborOverrun;
    endDateShift = delay;
    safetyDelta -= Math.min(8, delay / 12);
    riskDelta += Math.min(3, Math.floor(delay / 20));
    breakdown.push({ factor: '工期延误管理费', delta: laborOverrun, unit: '万' });
  }

  const payDelay = factors.paymentDelay || 0;
  if (payDelay > 0) {
    cashflowDelta = -(payDelay / 30) * 180;
    if (payDelay > 20) {
      costDeltaWan += 35;
      breakdown.push({ factor: '垫资财务成本', delta: 35, unit: '万' });
    }
    riskDelta += Math.min(2, Math.floor(payDelay / 25));
  }

  const newTargetYi = base.targetYi + costDeltaWan / 10000;
  const newProfitWan = bidWan - newTargetYi * 10000;
  // 口径修复（M1）：公式只算增量、字段定水平——推演值 = 基线利润率(字段) + 公式推演值 − 公式基线值。
  // 此前直接取公式推演值，与字段基线（17.2% vs 公式 21.98%）矛盾，导致"钢筋涨价利润反升"的方向性错误。
  const formulaBaseRate = +(((bidWan - base.targetYi * 10000) / bidWan) * 100).toFixed(2);
  const newProfitRate = +(base.profitRate + +((newProfitWan / bidWan) * 100).toFixed(2) - formulaBaseRate).toFixed(2);
  const profitDelta = +(newProfitRate - base.profitRate).toFixed(2);

  let newProgress = +(base.progress + progressDelta).toFixed(1);
  newProgress = Math.max(0, Math.min(100, newProgress));

  return {
    baseline: base,
    simulated: {
      progress: newProgress,
      profitRate: newProfitRate,
      profitWan: Math.round(newProfitWan),
      targetYi: +newTargetYi.toFixed(2),
      costDeltaWan: +costDeltaWan.toFixed(1),
      qualityScore: +Math.max(60, Math.min(99, base.qualityScore + qualityDelta)).toFixed(1),
      safetyScore: +Math.max(65, Math.min(98, base.safetyScore + safetyDelta)).toFixed(1),
      cashflowJun: Math.round(base.cashflowJun + cashflowDelta),
      riskCount: Math.max(0, base.riskCount + riskDelta),
      redRisks: Math.max(0, base.redRisks + (profitDelta < -1 ? 1 : 0)),
      paymentRate: +(base.paymentRate - payDelay * 0.15).toFixed(1),
      endDateShift,
    },
    deltas: {
      progress: +(newProgress - base.progress).toFixed(1),
      profitRate: profitDelta,
      profitWan: Math.round(newProfitWan - base.profitWan),
      quality: +qualityDelta.toFixed(1),
      safety: +safetyDelta.toFixed(1),
      cashflow: Math.round(cashflowDelta),
      risk: riskDelta,
    },
    breakdown,
    factors: { ...defaultFactors(), ...factors },
    belowRedLine: newProfitRate < MOCK_DATA.profitRedLine,
    criticalCashflow: base.cashflowJun + cashflowDelta < getCriticalBalance(),
  };
}

export interface EvmResult {
  bac: number;
  pv: number;
  ac: number;
  ev: number;
  spi: number;
  cpi: number;
  sv: number;
  cv: number;
  eac: number;
  etc: number;
  vac: number;
  tcpi: number;
  cpImpact: string;
  delay: number;
}

export function calcEarnedValue(project: ProjectLike, factors: Partial<Factors>): EvmResult {
  const progress = project.progress / 100;
  const bac = +(project.cost.targetCost * 10000).toFixed(0);
  const pv = +(bac * Math.min(1, progress + 0.05)).toFixed(0);
  const delay = factors.progressDelay || 0;
  const evFactor = Math.max(0.7, 1 - delay / 200);
  const ev = +(bac * progress * evFactor).toFixed(0);
  const costFactor = 1 + ((factors.steelPrice || 0) / 100) * 0.18 + ((factors.concreteQty || 0) / 100) * 0.12;
  const ac = +(ev * costFactor + (factors.subcontractDelta || 0)).toFixed(0);
  const spi = pv > 0 ? +(ev / pv).toFixed(3) : 1;
  const cpi = ac > 0 ? +(ev / ac).toFixed(3) : 1;
  const sv = ev - pv;
  const cv = ev - ac;
  const eac = cpi > 0 ? +(bac / cpi).toFixed(0) : bac;
  const etc = eac - ac;
  const vac = bac - eac;
  const tcpi = bac - ac > 0 ? +((bac - ev) / (bac - ac)).toFixed(3) : 1;
  const cpImpact =
    delay > 0
      ? `关键路径活动延误 ${delay} 天，SPI=${spi}，需评估赶工或工序优化`
      : '关键路径未新增延误';
  return { bac, pv, ac, ev, spi, cpi, sv, cv, eac, etc, vac, tcpi, cpImpact, delay };
}

export interface StatusItem {
  label: string;
  value: string;
  status: 'warn' | 'ok';
  stateLabel: string;
}

export interface Suggestion {
  type: 'danger' | 'warn' | 'action' | 'ok' | 'opportunity';
  title: string;
  text: string;
}

function metricItem(label: string, value: string, abnormal: boolean): StatusItem {
  return { label, value, status: abnormal ? 'warn' : 'ok', stateLabel: abnormal ? '异常' : '正常' };
}

export function getCurrentStatusByType(project: ProjectLike, simType: string): {
  items: StatusItem[];
  suggestions: Suggestion[];
  ev: EvmResult;
  simType: string;
} {
  const ev = calcEarnedValue(project, {});
  const costSurplus = project.cost.targetCost - project.cost.actualCost;
  const cashflowJun = getCashflowJun();
  const criticalCf = getCriticalBalance();
  let items: StatusItem[] = [];
  let suggestions: Suggestion[] = [];

  if (simType === 'schedule') {
    const lag = project.lagNodes > 0;
    const spiBad = ev.spi < 0.98;
    const svBad = ev.sv < 0;
    items = [
      metricItem('整体进度完成率', `${project.progress}%`, lag || project.progress < 30),
      metricItem('进度绩效 SPI', String(ev.spi), spiBad),
      metricItem('进度偏差 SV', `${ev.sv >= 0 ? '+' : ''}${ev.sv} 万`, svBad),
      metricItem('滞后里程碑', `${project.lagNodes} 个`, lag),
      metricItem('关键路径状态', lag ? '存在滞后节点' : '暂无新增延误', lag),
    ];
    if (lag) suggestions.push({ type: 'warn', title: '里程碑滞后', text: `当前 ${project.lagNodes} 个节点滞后，建议对照 WBS/甘特图锁定关键路径活动，编制赶工或工序穿插方案。` });
    if (spiBad) suggestions.push({ type: 'warn', title: 'SPI 低于 1', text: `SPI=${ev.spi}，实际完成价值低于计划，建议周报跟踪产值确认与证照节点。` });
    if (svBad) suggestions.push({ type: 'action', title: '进度偏差 SV 为负', text: `SV=${ev.sv} 万，优先协调资源投入关键线路，避免非关键线路占用班组。` });
    if (!lag && !spiBad && !svBad) suggestions.push({ type: 'ok', title: '进度指标正常', text: '进度绩效在计划范围内，维持现有节拍并关注下月里程碑。' });
  } else if (simType === 'cost') {
    const cpiBad = ev.cpi < 1;
    const vacBad = ev.vac < 0;
    const profitBad = project.profitRate < MOCK_DATA.profitRedLine;
    const overrun = costSurplus <= 0;
    items = [
      metricItem('成本绩效 CPI', String(ev.cpi), cpiBad),
      metricItem('目标成本结余', `${costSurplus > 0 ? '+' : ''}${costSurplus.toFixed(2)} 亿`, overrun),
      metricItem('实际利润率', `${project.profitRate}%`, profitBad),
      metricItem('完工估算 EAC', `${(ev.eac / 10000).toFixed(2)} 亿`, vacBad),
      metricItem('完工偏差 VAC', `${ev.vac >= 0 ? '+' : ''}${ev.vac} 万`, vacBad),
    ];
    if (profitBad) suggestions.push({ type: 'danger', title: '利润率低于红线', text: `当前 ${project.profitRate}% < 红线 ${MOCK_DATA.profitRedLine}%，48 小时内启动三算对比，锁定 ${(project.cost.topOverruns || []).join('、') || '超支分项'}。` });
    if (cpiBad) suggestions.push({ type: 'warn', title: 'CPI 低于 1', text: `CPI=${ev.cpi}，实际成本高于挣值，建议复核分包签证与钢筋/混凝土采购价。` });
    if (vacBad) suggestions.push({ type: 'action', title: '预测完工超支', text: `VAC=${ev.vac} 万，滚动修订目标成本并对外协变更实行限额审批。` });
    if (costSurplus > 0 && !cpiBad) suggestions.push({ type: 'opportunity', title: '成本有结余空间', text: `结余约 ${costSurplus.toFixed(2)} 亿，可设立风险储备，避免无依据扩大分包范围。` });
    if (!suggestions.length) suggestions.push({ type: 'ok', title: '成本指标正常', text: '成本绩效可控，继续按周更新目标成本滚动表。' });
  } else {
    const lag = project.lagNodes > 0 || ev.spi < 0.98;
    const costIssue = ev.cpi < 1 || project.profitRate < MOCK_DATA.profitRedLine;
    const cfIssue = cashflowJun < criticalCf;
    items = [
      metricItem('整体进度', `${project.progress}%`, lag),
      metricItem('实际利润率', `${project.profitRate}%`, project.profitRate < MOCK_DATA.profitRedLine),
      metricItem('SPI / CPI', `${ev.spi} / ${ev.cpi}`, ev.spi < 1 || ev.cpi < 1),
      metricItem('6月现金流结余', `${cashflowJun} 万`, cfIssue),
      metricItem('滞后节点', `${project.lagNodes} 个`, project.lagNodes > 0),
    ];
    if (costIssue) suggestions.push({ type: 'warn', title: '成本与利润需关注', text: '利润率或 CPI 偏离目标，建议切换「成本推演」查看 EAC/VAC 并联动商务测算。' });
    if (lag) suggestions.push({ type: 'warn', title: '进度需关注', text: '存在滞后节点或 SPI 偏低，建议切换「进度推演」查看 SV 与关键路径。' });
    if (cfIssue) suggestions.push({ type: 'danger', title: '现金流逼近临界', text: `6 月结余 ${cashflowJun} 万，低于临界 ${criticalCf} 万，财务部协同外协推进回款。` });
    if (!costIssue && !lag && !cfIssue) suggestions.push({ type: 'ok', title: '整体态势平稳', text: '进度、成本、现金流均在可控区间，维持周度例会跟踪。' });
  }
  return { items, suggestions, ev, simType };
}

export interface DimMetric {
  id: string;
  name: string;
  base: number;
  sim: number;
  unit: string;
}

export interface DimensionData {
  metrics: DimMetric[];
  chartLabels: string[];
  chartBase: number[];
  chartSim: number[];
}

export interface DimResult {
  type: string;
  core: SimResult;
  dimension: DimensionData;
  formulas: { name: string; expr: string }[];
  ev: EvmResult;
}

const FORMULAS: Record<string, { name: string; expr: string }[]> = {
  overall: [
    { name: '综合健康指数', expr: 'HI = 0.35×SPI + 0.35×CPI + 0.3×利润率指数' },
    { name: '利润率指数', expr: '利润率指数 = 实际利润率 / 目标红线利润率 × 100' },
  ],
  schedule: [
    { name: '计划价值 PV', expr: 'PV = 计划完成百分比 × BAC（完工预算）' },
    { name: '挣值 EV', expr: 'EV = 实际完成百分比 × BAC' },
    { name: '实际成本 AC', expr: 'AC = 已完成工作的实际花费' },
    { name: '进度偏差 SV', expr: 'SV = EV − PV（SV<0 进度滞后）' },
    { name: '进度绩效指数 SPI', expr: 'SPI = EV / PV（SPI<1 滞后，SPI>1 超前）' },
    { name: '关键路径影响', expr: '关键活动延误天数 → 项目工期与 SPI 联动下调' },
  ],
  cost: [
    { name: '完工预算 BAC', expr: 'BAC = 目标成本（成本基准）' },
    { name: '完工估算 EAC', expr: 'EAC = BAC / CPI（按当前成本效率预测）' },
    { name: '完工偏差 VAC', expr: 'VAC = BAC − EAC（VAC<0 预测超支）' },
    { name: '成本绩效指数 CPI', expr: 'CPI = EV / AC' },
    { name: '目标成本调整', expr: '新目标成本 = 基准目标成本 + Σ材料/分包/工期扰动' },
  ],
};

export function simulateDimension(type: string, project: ProjectLike, factors: Partial<Factors>): DimResult {
  const baseResult = simulate(project, factors);
  const ev = calcEarnedValue(project, factors);
  const simEv = calcEarnedValue(project, factors);

  const dims: Record<string, DimensionData> = {
    overall: {
      metrics: [
        { id: 'hi', name: '综合健康指数', base: 82, sim: +(82 + baseResult.deltas.profitRate * 2 + baseResult.deltas.progress * 0.3).toFixed(1), unit: '' },
        { id: 'profit', name: '实际利润率', base: baseResult.baseline.profitRate, sim: baseResult.simulated.profitRate, unit: '%' },
        { id: 'progress', name: '整体进度', base: baseResult.baseline.progress, sim: baseResult.simulated.progress, unit: '%' },
        { id: 'spi', name: 'SPI', base: ev.spi, sim: simEv.spi, unit: '' },
        { id: 'cpi', name: 'CPI', base: ev.cpi, sim: simEv.cpi, unit: '' },
      ],
      chartLabels: ['进度%', '利润率%', 'SPI×100', 'CPI×100'],
      chartBase: [baseResult.baseline.progress, baseResult.baseline.profitRate, ev.spi * 100, ev.cpi * 100],
      chartSim: [baseResult.simulated.progress, baseResult.simulated.profitRate, simEv.spi * 100, simEv.cpi * 100],
    },
    schedule: {
      metrics: [
        { id: 'pv', name: 'PV 计划价值', base: ev.pv, sim: simEv.pv, unit: '万' },
        { id: 'ev', name: 'EV 挣值', base: ev.ev, sim: simEv.ev, unit: '万' },
        { id: 'ac', name: 'AC 实际成本', base: ev.ac, sim: simEv.ac, unit: '万' },
        { id: 'sv', name: 'SV 进度偏差', base: ev.sv, sim: simEv.sv, unit: '万' },
        { id: 'spi', name: 'SPI', base: ev.spi, sim: simEv.spi, unit: '' },
        { id: 'cpi', name: 'CPI', base: ev.cpi, sim: simEv.cpi, unit: '' },
      ],
      chartLabels: ['PV(百万)', 'EV', 'AC', 'SPI×100', 'SV(百万)'],
      chartBase: [ev.pv / 100, ev.ev / 100, ev.ac / 100, ev.spi * 100, ev.sv / 100],
      chartSim: [simEv.pv / 100, simEv.ev / 100, simEv.ac / 100, simEv.spi * 100, simEv.sv / 100],
    },
    cost: {
      metrics: [
        { id: 'bac', name: 'BAC 完工预算', base: ev.bac, sim: simEv.bac, unit: '万' },
        { id: 'eac', name: 'EAC 完工估算', base: ev.eac, sim: simEv.eac, unit: '万' },
        { id: 'etc', name: 'ETC 尚需估算', base: ev.etc, sim: simEv.etc, unit: '万' },
        { id: 'vac', name: 'VAC 完工偏差', base: ev.vac, sim: simEv.vac, unit: '万' },
        { id: 'cpi', name: 'CPI', base: ev.cpi, sim: simEv.cpi, unit: '' },
        { id: 'tcpi', name: 'TCPI', base: ev.tcpi, sim: simEv.tcpi, unit: '' },
      ],
      chartLabels: ['BAC(百万)', 'EAC', 'CPI×100', 'TCPI×100', 'VAC(百万)'],
      chartBase: [ev.bac / 100, ev.eac / 100, ev.cpi * 100, ev.tcpi * 100, ev.vac / 100],
      chartSim: [simEv.bac / 100, simEv.eac / 100, simEv.cpi * 100, simEv.tcpi * 100, simEv.vac / 100],
    },
  };

  return { type, core: baseResult, dimension: dims[type] || dims.overall, formulas: FORMULAS[type] || [], ev: simEv };
}

/** 生成 AI 研判文本（规则引擎版，RAG 接入前的本地兜底） */
export function buildAiPrompt(dimResult: DimResult, project: ProjectLike, simType = 'overall'): string {
  const status = getCurrentStatusByType(project, simType);
  const typeLabel = SIM_TYPES.find((t) => t.id === simType)?.label || '推演';
  const lines: string[] = [];
  lines.push(`【${typeLabel} · AI 研判】`);
  lines.push(`项目：${project.name}`);
  lines.push('');

  lines.push('【现有情况】');
  status.items.forEach((i) => lines.push(`· ${i.label}：${i.value}（${i.stateLabel}）`));
  lines.push('');
  lines.push('【建议措施】');
  status.suggestions.forEach((s, idx) => lines.push(`${idx + 1}. ${s.title}：${s.text}`));
  lines.push('');

  const d = dimResult.dimension;
  lines.push('【推演定量结果】');
  d.metrics.forEach((m) => lines.push(`· ${m.name}：${m.base}${m.unit} → ${m.sim}${m.unit}`));
  lines.push('');

  const ev = dimResult.ev;
  if (simType === 'schedule') {
    lines.push(`【进度专项】PV=${ev.pv}万 EV=${ev.ev}万 AC=${ev.ac}万 SV=${ev.sv}万 SPI=${ev.spi}`);
    lines.push(ev.cpImpact);
  } else if (simType === 'overall') {
    lines.push(`【综合】SPI=${ev.spi} CPI=${ev.cpi} · ${ev.cpImpact}`);
  }

  const core = dimResult.core;
  lines.push('');
  lines.push(`【扰动推演后】利润率 ${core.simulated.profitRate}%（${core.deltas.profitRate >= 0 ? '+' : ''}${core.deltas.profitRate} pct）· 进度 ${core.simulated.progress}%`);
  if (core.belowRedLine) lines.push('⚠️ 推演后利润率低于红线，请优先落实成本与回款措施。');

  return lines.join('\n');
}
