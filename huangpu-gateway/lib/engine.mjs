/**
 * 推演引擎（确定性利润计算）——从 huangpu-react/src/utils/decision-engine.ts 移植的纯逻辑部分。
 * 数值口径铁律：函数体与 TS 版逐行一致（含 toFixed/舍入），保证网关对账"逐位一致"的基准
 * 与前端本地引擎、demo decision-engine.js v2.2 完全相同。DOM/图表渲染部分不移植。
 */

import { CASHFLOW_JUN, CRITICAL_BALANCE, PROFIT_RED_LINE } from './engine-data.mjs';

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
  const newProfitRate = +((newProfitWan / bidWan) * 100).toFixed(2);
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
