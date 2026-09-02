import MOCK_DATA from '../data';
import { defaultFactors, simulate } from './decision-engine';
import type { ProjectLike } from './decision-engine';
import type { RagReference } from '../services/rag';

/** 本地规则回答引擎：模拟 RAG 问答（WeKnora 接入前） */

export interface AiAnswer {
  text: string;
  references: RagReference[];
}

const projects = MOCK_DATA.projects as (ProjectLike & { shortName: string; name: string })[];

function findProject(q: string): (typeof projects)[number] {
  const hit = projects.find((p) => q.includes(p.shortName) || q.includes(p.name.replace('地块', '')));
  return hit ?? projects[0];
}

function fmtWan(v: number): string {
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

interface SimParams {
  steel?: number;
  delay?: number;
  payment?: number;
  sub?: number;
}

function simulateText(project: (typeof projects)[number], params: SimParams) {
  const f = defaultFactors();
  if (params.steel) f.steelPrice = params.steel;
  if (params.delay) f.progressDelay = params.delay;
  if (params.payment) f.paymentDelay = params.payment;
  if (params.sub) f.subcontractDelta = params.sub;
  return simulate(project, f);
}

interface ThreeRow {
  name: string;
  profitRate: number;
  actualRate: number;
  warn: boolean;
  analysis: string;
}

interface ThreeDetailRow {
  name: string;
  actualCost: number;
  internalCost: number;
  variance: number;
  analysis: string;
}

interface CashDetail {
  monthly: { month: string; forecastBalance: number; actualBalance: number | null }[];
  sensitivity: { scenario: string; junForecast: number; desc: string }[];
  criticalBalance: number;
}

interface Ranking {
  week: string;
  rankings: { rank: number; name: string; scores: { overall: number; cost: number } }[];
}

function getThreeData(): { summary: ThreeRow[]; details: Record<string, ThreeDetailRow[]> } {
  const d = MOCK_DATA as { threeValueCompare: { summary: ThreeRow[]; details: Record<string, ThreeDetailRow[]> } };
  return d.threeValueCompare;
}

function getCash(): CashDetail {
  return (MOCK_DATA as { cashflowDetail: CashDetail }).cashflowDetail;
}

function getRanking(): Ranking {
  return (MOCK_DATA as { weeklyRanking: Ranking }).weeklyRanking;
}

export function generateAnswer(question: string): AiAnswer {
  const q = question.trim();
  const project = findProject(q);
  const projectName = project.shortName;
  const three = getThreeData();
  const cash = getCash();

  // —— 情景推演类：钢筋/延误/回款/复合 ——
  const steelMatch = q.match(/钢筋[涨跌升降]?\s*(\d+(?:\.\d+)?)\s*%/);
  const delayMatch = q.match(/延误\s*(\d+)\s*天/);
  const paymentMatch = q.match(/回款延迟\s*(\d+)\s*天/);
  if (steelMatch || delayMatch || paymentMatch) {
    const r = simulateText(project, {
      steel: steelMatch ? parseFloat(steelMatch[1]) : undefined,
      delay: delayMatch ? parseInt(delayMatch[1], 10) : undefined,
      payment: paymentMatch ? parseInt(paymentMatch[1], 10) : undefined,
    });
    const parts: string[] = [];
    if (steelMatch) parts.push('钢筋单价 +' + steelMatch[1] + '%');
    if (delayMatch) parts.push('主体延误 ' + delayMatch[1] + ' 天');
    if (paymentMatch) parts.push('回款延迟 ' + paymentMatch[1] + ' 天');
    const head = parts.length ? '按「' + parts.join('、') + '」情景推演' : '按当前扰动因子推演';
    const reasons = r.breakdown.map((b) => b.factor + ' ' + (b.delta >= 0 ? '+' : '') + fmtWan(b.delta) + ' 万').join('、');

    const lines: string[] = [];
    lines.push(head + '，' + projectName + ' 利润率将由 ' + r.baseline.profitRate + '% 变为 **' + r.simulated.profitRate + '%**（' + (r.deltas.profitRate >= 0 ? '+' : '') + r.deltas.profitRate + ' pct）。');
    lines.push('');
    if (r.belowRedLine) {
      lines.push('⚠️ **跌破红线预警**：' + r.simulated.profitRate + '% < 目标红线 16.66%，需 48 小时内启动三算对比复核。');
    } else {
      lines.push('利润率 ' + r.simulated.profitRate + '% 仍高于红线 16.66%，但需持续跟踪。');
    }
    lines.push('成本扰动明细：' + (reasons || '无') + '。');
    lines.push('进度：' + r.baseline.progress + '% → ' + r.simulated.progress + '%；6 月现金流结余：' + r.baseline.cashflowJun + ' 万 → ' + r.simulated.cashflowJun + ' 万' + (r.criticalCashflow ? '（**低于 200 万临界，触发预警**）' : '') + '。');
    lines.push('');
    lines.push('建议：商务部对照三算对比表锁定超支分项，钢筋类优先集采议价；财务部协同外协推进业主回款。');

    const total = three.summary.find((s) => s.name.includes('合计'));
    return {
      text: lines.join('\n'),
      references: [
        { title: '三算对比表（合计）', content: '目标利润率 ' + total?.profitRate + '%，实际 ' + total?.actualRate + '%' },
        { title: '现金流敏感性分析', content: cash.sensitivity.map((s) => s.scenario + '：' + s.junForecast + ' 万').join('；') },
      ],
    };
  }

  // —— 现金流 / 回款 ——
  if (q.includes('现金流') || q.includes('回款') || q.includes('结余') || q.includes('临界')) {
    const jun = cash.monthly.find((m) => m.month === '2026-06');
    const may = cash.monthly.find((m) => m.month === '2026-05');
    const junBalance = jun ? jun.forecastBalance : 0;
    const warnText = junBalance < cash.criticalBalance ? '，**低于临界值 ' + cash.criticalBalance + ' 万，触发垫资预警**' : '';
    const lines: string[] = [];
    lines.push('6 月现金流预测结余 **' + junBalance + ' 万**' + warnText + '；5 月实际结余 ' + (may ? may.actualBalance : '—') + ' 万。');
    lines.push('');
    lines.push('敏感性分析：');
    cash.sensitivity.forEach((s) => lines.push('· ' + s.scenario + '：6 月结余 ' + s.junForecast + ' 万（' + s.desc + '）'));
    lines.push('');
    lines.push('结论：业主回款延迟 15 天即跌破临界值，建议财务部协同外协部按合同节点推进回款，并预留 ' + cash.criticalBalance + ' 万以上安全垫。');
    return {
      text: lines.join('\n'),
      references: [
        { title: '动态现金流 · 月度明细', content: '6 月预测结余 ' + junBalance + ' 万，临界 ' + cash.criticalBalance + ' 万' },
        { title: '敏感性分析', content: cash.sensitivity.map((s) => s.scenario + '：' + s.junForecast + ' 万').join('；') },
      ],
    };
  }

  // —— 排名 / 管控 ——
  if (q.includes('排名') || q.includes('管控') || q.includes('最差')) {
    const ranking = getRanking();
    const worst = [...ranking.rankings].sort((a, b) => a.scores.cost - b.scores.cost)[0];
    const lines: string[] = [];
    lines.push(ranking.week + ' 四地块成本管控排名（成本维度）：');
    ranking.rankings.forEach((r) => lines.push('· 第 ' + r.rank + ' 名 ' + r.name + '：成本 ' + r.scores.cost + ' 分'));
    lines.push('');
    lines.push('管控最差：**' + worst.name + '**（成本 ' + worst.scores.cost + ' 分）。');
    if (worst.name.includes('AZ-01')) {
      lines.push('其中 AZ-01 实际利润率 18.59%，距红线 16.66% 仅 1.93 pct，主因地下室分项超支与钢筋超预算 7.8%，建议重点纠偏。');
    }
    lines.push('');
    lines.push('建议：对低分项目启动分包限额审批与三算对比复盘。');
    return {
      text: lines.join('\n'),
      references: [{ title: '四地块每周排名', content: ranking.week + ' · 成本维度得分' }],
    };
  }

  // —— 三算对比 / 地下室 ——
  if (q.includes('地下室') || q.includes('三算') || q.includes('23.17') || q.includes('19.24')) {
    const row = three.summary.find((s) => s.name.includes('地下室'));
    const details = three.details.basement ?? [];
    const lines: string[] = [];
    const drop = row ? (row.profitRate - row.actualRate).toFixed(2) : '';
    lines.push('三算对比中地下室分项目标利润率 ' + row?.profitRate + '% → 实际 ' + row?.actualRate + '%（下降 ' + drop + ' pct）。');
    lines.push('');
    lines.push('主因（分项明细）：');
    details.forEach((d) =>
      lines.push('· ' + d.name + '：实际 ' + fmtWan(d.actualCost) + ' 万 vs 目标 ' + fmtWan(d.internalCost) + ' 万（偏差 ' + (d.variance >= 0 ? '+' : '') + fmtWan(d.variance) + ' 万）——' + d.analysis),
    );
    lines.push('');
    lines.push('结论：筏板/侧墙工程量增加与 HRB400 钢筋超预算 7.8% 是主因，已触发红线预警（16.66%），需商务 48h 内完成复核并锁定集采价。');
    return {
      text: lines.join('\n'),
      references: [{ title: '三算对比表 · 地下室', content: '目标利润率 23.17% → 实际 19.24%（-3.93 pct）' }],
    };
  }

  // —— 红线 / 利润 ——
  if (q.includes('红线') || q.includes('利润率') || q.includes('利润')) {
    const below = projects.filter((p) => p.profitRate < 16.66);
    const total = three.summary.find((s) => s.name.includes('合计'));
    const lines: string[] = [];
    lines.push('四地块实际利润率：');
    projects.forEach((p) => lines.push('· ' + p.shortName + '：' + p.profitRate + '%' + (p.profitRate < 16.66 ? ' ⚠️ 低于红线' : '')));
    lines.push('');
    lines.push('红线标准：目标利润率 **16.66%**（分包成本控制口径），业主固定给予 5%（EPC 费率下浮）。');
    if (below.length > 0) {
      lines.push('当前 ' + below.map((p) => p.shortName).join('、') + ' 跌破红线，合计口径实际利润率 ' + total?.actualRate + '%，主因地下室/高层住宅分项超支，建议优先启动三算对比纠偏。');
    } else {
      lines.push('当前全部项目高于红线，整体可控。');
    }
    lines.push('');
    lines.push('相关：利润率 =（中标合同价 − 目标成本）/ 中标合同价。');
    return {
      text: lines.join('\n'),
      references: [{ title: '三算对比表（合计）', content: '目标 ' + total?.profitRate + '% / 实际 ' + total?.actualRate + '%' }],
    };
  }

  // —— 兜底 ——
  return {
    text:
      '抱歉，当前为本地规则引擎演示模式，暂不能回答该问题。\n\n可以试试：\n· 「AZ-01 为什么低于红线？」\n· 「钢筋涨 8% 且延误 30 天，新联01 利润会怎样？」\n· 「6 月现金流会跌破 200 万临界吗？」\n· 「地下室分项为什么从 23.17% 掉到 19.24%？」\n\n二期接入 WeKnora RAG 后，将支持任意自然语言利润问答与文档检索。',
    references: [],
  };
}
