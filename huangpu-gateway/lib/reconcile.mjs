/**
 * 输出对账（PRD §7.3 职责③原文形态）：
 * "AI 回答出现数字但过程中没有引擎调用记录，判定为模型编造，拒收并退回本地引擎出数。"
 *
 * 对账只判流程完整性——本次回答的上游流里是否出现过真实的引擎工具调用
 * （AD-09：引擎 MCP 化后，工具由 Agent 模型自主调用，调用记录来自上游 tool_call
 * 事件而非网关注入）；不比对数字内容。内容正确性由 M1 评测脚本（20 题逐位比对）
 * 把关，因此这里没有任何常量白名单、没有逐位比对、没有打回重算。
 *
 * 裁决三值：
 *   pass   回答含数字且上游调用了引擎工具（流程对账通过）
 *   reject 回答含数字但引擎未参与（引擎 MCP 服务故障/模型未调工具）→ 拒收 + 引擎兜底答案
 *   na     非利润问题 / 未识别地块 / 回答无数字，不做对账
 */

import { PROJECTS, PROFIT_RED_LINE, CRITICAL_BALANCE } from './engine-data.mjs';
import { defaultFactors, getBaseline, simulate } from './engine.mjs';

const STEEL_RE = /钢筋[涨跌升降]?\s*(\d+(?:\.\d+)?)\s*%/;
const DELAY_RE = /延误\s*(\d+)\s*天/;
const PAYMENT_RE = /回款延迟\s*(\d+)\s*天/;
const PROFIT_WORDS_RE = /利润|红线|现金流|推演|挣值|回款|成本|CPI|SPI/;

/** 引擎工具名判据：WeKnora 对 MCP 工具加 mcp_<service>_ 前缀，裸名/带前缀均命中 */
export const ENGINE_TOOL_RE = /run_scenario|get_baseline|get_current_status|list_presets/;

export function findProject(q) {
  return PROJECTS.find((p) => q.includes(p.shortName) || q.includes(p.name.replace('地块', ''))) ?? null;
}

/**
 * 解析问题 → 意图 + 因子 + 引擎结果（总是计算，供注入与兜底出数复用）
 * @returns {{isProfit:boolean, scenario:boolean, project:object|null,
 *            factorsUsed:object, hasFactorInput:boolean, sim:object|null}}
 */
export function engineForQuery(query) {
  const q = String(query ?? '');
  const steel = q.match(STEEL_RE);
  const delay = q.match(DELAY_RE);
  const payment = q.match(PAYMENT_RE);
  const scenario = Boolean(steel || delay || payment);
  const isProfit = scenario || PROFIT_WORDS_RE.test(q);
  const project = findProject(q);
  const factorsUsed = defaultFactors();
  if (steel) factorsUsed.steelPrice = parseFloat(steel[1]);
  if (delay) factorsUsed.progressDelay = parseInt(delay[1], 10);
  if (payment) factorsUsed.paymentDelay = parseInt(payment[1], 10);
  const sim = project ? simulate(project, factorsUsed) : null;
  return { isProfit, scenario, project, factorsUsed, hasFactorInput: scenario, sim };
}

/** 回答是否含数值（%/万/pct）——流程对账的"有数字"判据，只判存在性不比对内容 */
export function hasNumbers(text) {
  return /-?\d+(?:\.\d+)?\s*(%|pct|万)/.test(String(text ?? ''));
}

/**
 * 流程对账裁决。
 * @param engine engineForQuery 的返回
 * @param engineToolCalled 上游流中是否出现过引擎工具的真实 tool_call（按工具名判定）
 * @returns {{verdict:'pass'|'reject'|'na', reason:string}}
 */
export function reconcile({ answerText, engine, engineToolCalled }) {
  if (!engine.isProfit) return { verdict: 'na', reason: 'not_profit' };
  if (!engine.project) return { verdict: 'na', reason: 'no_project' };
  if (!hasNumbers(answerText)) return { verdict: 'na', reason: 'no_numbers' };
  if (engineToolCalled) return { verdict: 'pass', reason: 'engine_involved' };
  return { verdict: 'reject', reason: 'numbers_without_engine_call' };
}

/** 拒收后的兜底答案：全部数字由引擎生成（样式对齐前端 answer-engine.ts） */
export function formatEngineAnswer(engine) {
  if (!engine.project) return '未能识别问题中的地块，推演引擎无法出数，请补充地块名称。';
  const p = engine.project;
  if (engine.hasFactorInput) {
    const r = engine.sim;
    const f = engine.factorsUsed;
    const parts = [];
    if (f.steelPrice) parts.push(`钢筋单价 +${f.steelPrice}%`);
    if (f.progressDelay) parts.push(`主体延误 ${f.progressDelay} 天`);
    if (f.paymentDelay) parts.push(`回款延迟 ${f.paymentDelay} 天`);
    const reasons = r.breakdown.map((b) => `${b.factor} ${b.delta >= 0 ? '+' : ''}${+b.delta.toFixed(1)} 万`).join('、');
    const lines = [
      `按「${parts.join('、')}」情景推演，${p.shortName} 利润率将由 ${r.baseline.profitRate}% 变为 **${r.simulated.profitRate}%**（${r.deltas.profitRate >= 0 ? '+' : ''}${r.deltas.profitRate} pct）。`,
      '',
    ];
    if (r.belowRedLine) {
      lines.push(`⚠️ **跌破红线预警**：${r.simulated.profitRate}% < 目标红线 ${PROFIT_RED_LINE}%，需 48 小时内启动三算对比复核。`);
    } else {
      lines.push(`利润率 ${r.simulated.profitRate}% 仍高于红线 ${PROFIT_RED_LINE}%，但需持续跟踪。`);
    }
    lines.push(`成本扰动明细：${reasons || '无'}。`);
    lines.push(`进度：${r.baseline.progress}% → ${r.simulated.progress}%；6 月现金流结余：${r.baseline.cashflowJun} 万 → ${r.simulated.cashflowJun} 万${r.criticalCashflow ? `（**低于 ${CRITICAL_BALANCE} 万临界，触发预警**）` : ''}。`);
    lines.push('');
    lines.push('_（网关对账：以上数字由确定性推演引擎计算，非大模型生成）_');
    return lines.join('\n');
  }
  const b = getBaseline(p);
  return [
    `${p.shortName} 当前实际利润率 **${b.profitRate}%**，目标红线 ${PROFIT_RED_LINE}%（${b.profitRate < PROFIT_RED_LINE ? '⚠️ 已低于红线' : '高于红线'}）。`,
    `中标合同价 ${b.bidYi} 亿，目标成本 ${b.targetYi} 亿，利润 ${b.profitWan} 万；回款率 ${b.paymentRate}%。`,
    '',
    '_（网关对账：以上数字由确定性推演引擎计算，非大模型生成）_',
  ].join('\n');
}
