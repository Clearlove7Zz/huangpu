/**
 * 推演引擎（确定性利润计算）——从 huangpu-react/src/utils/decision-engine.ts 移植的纯逻辑部分。
 * 数值口径铁律：函数体与 TS 版逐行一致（含 toFixed/舍入），保证网关对账"逐位一致"的基准
 * 与前端本地引擎、demo decision-engine.js v2.2 完全相同。DOM/图表渲染部分不移植。
 */

import { CASHFLOW_JUN, CRITICAL_BALANCE, PROFIT_RED_LINE } from './engine-data.mjs';

/** 钢筋成本份额（引擎口径：钢筋目标成本 = 目标成本 × 18%，与 KB 文档、对账白名单同源） */
export const STEEL_SHARE = 0.18;

export const FACTORS = [
  { id: 'steelPrice', label: '钢筋单价', unit: '%', min: -10, max: 15, step: 0.5, default: 0, impactWeight: 1.2 },
  { id: 'progressDelay', label: '关键节点延误', unit: '天', min: 0, max: 90, step: 1, default: 0, impactWeight: 1.5 },
  { id: 'subcontractDelta', label: '分包合同变更', unit: '万', min: -200, max: 500, step: 10, default: 0, impactWeight: 1.8 },
  { id: 'paymentDelay', label: '业主回款延迟', unit: '天', min: 0, max: 60, step: 5, default: 0, impactWeight: 1.4 },
  { id: 'concreteQty', label: '混凝土用量偏差', unit: '%', min: -8, max: 12, step: 0.5, default: 0, impactWeight: 1.0 },
  { id: 'qualityInvest', label: '质量整改投入', unit: '万', min: 0, max: 300, step: 10, default: 0, impactWeight: 0.9 },
];

export function defaultFactors() {
  return {
    steelPrice: FACTORS[0].default,
    progressDelay: FACTORS[1].default,
    subcontractDelta: FACTORS[2].default,
    paymentDelay: FACTORS[3].default,
    concreteQty: FACTORS[4].default,
    qualityInvest: FACTORS[5].default,
  };
}

export function getBaseline(project) {
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
    cashflowJun: CASHFLOW_JUN,
    riskCount: project.risks.total,
    redRisks: project.risks.red,
    paymentRate: project.paymentRate,
    endDateShift: 0,
  };
}

export function simulate(project, factors) {
  const base = getBaseline(project);
  const bidWan = base.bidYi * 10000;
  let costDeltaWan = 0;
  let progressDelta = 0;
  let qualityDelta = 0;
  let safetyDelta = 0;
  let cashflowDelta = 0;
  let riskDelta = 0;
  let endDateShift = 0;
  const breakdown = [];

  const steel = factors.steelPrice || 0;
  if (steel !== 0) {
    const steelCostShare = base.targetYi * STEEL_SHARE * 10000;
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
    belowRedLine: newProfitRate < PROFIT_RED_LINE,
    criticalCashflow: base.cashflowJun + cashflowDelta < CRITICAL_BALANCE,
  };
}

export const SIM_TYPES = [
  { id: 'overall', label: '整体推演', methodDesc: '经典挣值推演图（PV/EV/AC + EAC 预测 + 管理储备），联动动态现金流推演，综合评估项目健康度' },
  { id: 'schedule', label: '进度推演', methodDesc: '项目进度网络图展示活动逻辑关系，关键路径与扰动后工期可视化' },
  { id: 'cost', label: '成本推演', methodDesc: '成本 S 曲线（累计 PV/EV/AC），对比现状与扰动推演轨迹' },
];

export const PRESETS = [
  { id: 'baseline', label: '当前基准', values: {} },
  { id: 'steel_up', label: '钢筋涨价8%', values: { steelPrice: 8 } },
  { id: 'delay_30', label: '主体延误30天', values: { progressDelay: 30 } },
  { id: 'payment_late', label: '回款延迟30天', values: { paymentDelay: 30 } },
  { id: 'combo_risk', label: '复合风险情景', values: { steelPrice: 5, progressDelay: 20, subcontractDelta: 80, paymentDelay: 15 } },
];

function metricItem(label, value, abnormal) {
  return { label, value, status: abnormal ? 'warn' : 'ok', stateLabel: abnormal ? '异常' : '正常' };
}

/** 移植自 TS 版 getCurrentStatusByType（decision-engine.ts:336-398），条件与文案逐行一致 */
export function getCurrentStatusByType(project, simType) {
  const ev = calcEarnedValue(project, {});
  const costSurplus = +(project.cost.targetCost - project.cost.actualCost).toFixed(2);
  let items = [];
  let suggestions = [];

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
    const profitBad = project.profitRate < PROFIT_RED_LINE;
    const overrun = costSurplus <= 0;
    items = [
      metricItem('成本绩效 CPI', String(ev.cpi), cpiBad),
      metricItem('目标成本结余', `${costSurplus > 0 ? '+' : ''}${costSurplus.toFixed(2)} 亿`, overrun),
      metricItem('实际利润率', `${project.profitRate}%`, profitBad),
      metricItem('完工估算 EAC', `${(ev.eac / 10000).toFixed(2)} 亿`, vacBad),
      metricItem('完工偏差 VAC', `${ev.vac >= 0 ? '+' : ''}${ev.vac} 万`, vacBad),
    ];
    if (profitBad) suggestions.push({ type: 'danger', title: '利润率低于红线', text: `当前 ${project.profitRate}% < 红线 ${PROFIT_RED_LINE}%，48 小时内启动三算对比，锁定 ${(project.cost.topOverruns || []).join('、') || '超支分项'}。` });
    if (cpiBad) suggestions.push({ type: 'warn', title: 'CPI 低于 1', text: `CPI=${ev.cpi}，实际成本高于挣值，建议复核分包签证与钢筋/混凝土采购价。` });
    if (vacBad) suggestions.push({ type: 'action', title: '预测完工超支', text: `VAC=${ev.vac} 万，滚动修订目标成本并对外协变更实行限额审批。` });
    if (costSurplus > 0 && !cpiBad) suggestions.push({ type: 'opportunity', title: '成本有结余空间', text: `结余约 ${costSurplus.toFixed(2)} 亿，可设立风险储备，避免无依据扩大分包范围。` });
    if (!suggestions.length) suggestions.push({ type: 'ok', title: '成本指标正常', text: '成本绩效可控，继续按周更新目标成本滚动表。' });
  } else {
    const lag = project.lagNodes > 0 || ev.spi < 0.98;
    const costIssue = ev.cpi < 1 || project.profitRate < PROFIT_RED_LINE;
    const cfIssue = CASHFLOW_JUN < CRITICAL_BALANCE;
    items = [
      metricItem('整体进度', `${project.progress}%`, lag),
      metricItem('实际利润率', `${project.profitRate}%`, project.profitRate < PROFIT_RED_LINE),
      metricItem('SPI / CPI', `${ev.spi} / ${ev.cpi}`, ev.spi < 1 || ev.cpi < 1),
      metricItem('6月现金流结余', `${CASHFLOW_JUN} 万`, cfIssue),
      metricItem('滞后节点', `${project.lagNodes} 个`, project.lagNodes > 0),
    ];
    if (costIssue) suggestions.push({ type: 'warn', title: '成本与利润需关注', text: '利润率或 CPI 偏离目标，建议切换「成本推演」查看 EAC/VAC 并联动商务测算。' });
    if (lag) suggestions.push({ type: 'warn', title: '进度需关注', text: '存在滞后节点或 SPI 偏低，建议切换「进度推演」查看 SV 与关键路径。' });
    if (cfIssue) suggestions.push({ type: 'danger', title: '现金流逼近临界', text: `6 月结余 ${CASHFLOW_JUN} 万，低于临界 ${CRITICAL_BALANCE} 万，财务部协同外协推进回款。` });
    if (!costIssue && !lag && !cfIssue) suggestions.push({ type: 'ok', title: '整体态势平稳', text: '进度、成本、现金流均在可控区间，维持周度例会跟踪。' });
  }
  return { items, suggestions, ev, simType };
}

export function calcEarnedValue(project, factors) {
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
