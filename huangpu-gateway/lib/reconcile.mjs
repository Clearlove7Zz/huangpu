/**
 * 输出对账（数值铁律的机器化，PRD §7.3 网关职责③）：
 * 1. 意图识别：从问题中提取地块与情景因子（钢筋涨幅/延误天数/回款延迟）；
 * 2. 引擎出数：调内置确定性推演引擎（engine.mjs）得到基准数字；
 * 3. 数字比对：回答中的百分数必须逐位出自引擎结果或常量白名单，否则判"编造"；
 * 4. 兜底出数：判编造时由引擎生成替代答案（大模型禁止自算）。
 *
 * 对账范围（demo 口径）：只强制"百分数"；"万"类数字记录进审计但不拦截，
 * 避免知识库引用（三算对比明细等）造成误伤。地块未识别的问题不做对账。
 */

import { PROJECTS, PROFIT_RED_LINE, CRITICAL_BALANCE } from './engine-data.mjs';
import { defaultFactors, getBaseline, simulate } from './engine.mjs';

const STEEL_RE = /钢筋[涨跌升降]?\s*(\d+(?:\.\d+)?)\s*%/;
const DELAY_RE = /延误\s*(\d+)\s*天/;
const PAYMENT_RE = /回款延迟\s*(\d+)\s*天/;
const PROFIT_WORDS_RE = /利润|红线|现金流|推演|挣值|回款|成本|CPI|SPI/;

/** 常量白名单（PRD §7.3）：红线 16.66 / EPC 费率下浮 5 */
const CONSTANTS = [PROFIT_RED_LINE, 5];

export function findProject(q) {
  return PROJECTS.find((p) => q.includes(p.shortName) || q.includes(p.name.replace('地块', ''))) ?? null;
}

/**
 * 解析问题 → 意图 + 因子 + 引擎结果（总是计算，供对账与兜底出数复用）
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

/** 从文本提取带单位数字：百分数（强制对账）与万元数（仅审计） */
export function extractNumbers(text) {
  const out = [];
  const re = /(-?\d+(?:\.\d+)?)\s*(%|pct|万)/g;
  let m;
  while ((m = re.exec(String(text ?? ''))) !== null) {
    out.push({ value: parseFloat(m[1]), unit: m[2], raw: m[0] });
  }
  return out;
}

function collectEngineNumbers(sim) {
  const nums = [];
  const walk = (obj) => {
    for (const v of Object.values(obj ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v)) nums.push(v);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(sim);
  return nums;
}

function sameNum(a, b) {
  return Math.abs(a - b) < 0.005; // 逐位一致：允许 toFixed(2) 舍入误差
}

/**
 * 对账裁决。
 * @param engine engineForQuery 的返回
 * @param engineCalled 网关本次是否实际把引擎结果注入了对话（GATEWAY_ENGINE_DISABLED=1 时为 false）
 * @returns {{verdict:'pass'|'mismatch'|'reject'|'na', reason:string, mismatched?:string[]}}
 *   pass     数字全部出自引擎/白名单
 *   mismatch 引擎已调用，但回答出现引擎没有的百分数（模型改数/幻觉）
 *   reject   有百分数但引擎未参与（含引擎被禁用时模型自算），按数值铁律拒收
 *   na       非利润问题 / 未识别地块 / 回答不含百分数，不做对账
 */
export function reconcile({ answerText, engine, engineCalled }) {
  if (!engine.isProfit) return { verdict: 'na', reason: 'not_profit' };
  if (!engine.project) return { verdict: 'na', reason: 'no_project' };
  const pctNums = extractNumbers(answerText).filter((n) => n.unit === '%');
  if (!engineCalled) {
    if (pctNums.length === 0) return { verdict: 'na', reason: 'no_numbers' };
    return { verdict: 'reject', reason: 'numbers_without_engine_call', mismatched: pctNums.map((n) => n.raw) };
  }
  const allowed = [...collectEngineNumbers(engine.sim), ...CONSTANTS];
  const bad = pctNums.filter((n) => !allowed.some((a) => sameNum(a, n.value)));
  if (bad.length) {
    if (engine.hasFactorInput) {
      // 情景推演问题（识别到钢筋/延误/回款因子）：回答数字必须出自引擎，
      // 不一致即拒收交由引擎答案替换（数值铁律）——用户不应看到未背书的推演数字
      return { verdict: 'reject', reason: 'scenario_numbers_not_from_engine', mismatched: bad.map((n) => n.raw) };
    }
    // 非情景利润问题：回答可能引用 KB 百分数（三算对比 23.17% 等），只标注不拒收，避免误伤
    return { verdict: 'mismatch', reason: 'number_not_from_engine', mismatched: bad.map((n) => n.raw) };
  }
  if (pctNums.length === 0) return { verdict: 'na', reason: 'no_numbers' }; // 回答无数值，无从对账，不发"通过"横幅
  return { verdict: 'pass', reason: 'match' };
}

/**
 * 打回重算的返工指令（附引擎标准数）——"拒收打回给 agent"模式：
 * 第一轮回答对账未过后，网关向同一会话以本文本为 query 追加重答请求。
 */
export function formatEngineFeedback(engine, mismatched = []) {
  const r = engine.sim;
  const p = engine.project;
  return [
    `【网关返工通知】你上一条回答中的数字 ${mismatched.join('、') || ''} 未通过与推演引擎的逐位对账，已被拒绝。`,
    '请重新回答用户原来的问题：所有利润/推演数值必须逐位采用以下引擎结果，禁止自行计算或从文档推算；文档依据与定性分析正常保留。',
    `引擎结果——项目 ${p.shortName}：基线利润率 ${r.baseline.profitRate}%；本情景推演后利润率 ${r.simulated.profitRate}%（${r.deltas.profitRate >= 0 ? '+' : ''}${r.deltas.profitRate} pct）；红线 ${PROFIT_RED_LINE}%，判定：${r.belowRedLine ? '已跌破，需启动预警' : '未跌破'}；成本冲击 ${r.simulated.costDeltaWan >= 0 ? '+' : ''}${r.simulated.costDeltaWan} 万；6 月现金流结余 ${r.simulated.cashflowJun} 万（临界 ${CRITICAL_BALANCE} 万${r.criticalCashflow ? '，已触发预警' : ''}）。`,
  ].join('\n');
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
