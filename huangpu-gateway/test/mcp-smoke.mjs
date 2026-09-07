/**
 * MCP 直调冒烟：用镇龙东F10 真实基线调 run_scenario，验证
 * ① 新 schema（actual_cost_yi=0 可过）；② 数值链自洽（基准利润率 14.77%）；
 * ③ 钢筋涨价 8% 情景的引擎逐位输出；④ 红线 10.14%/现金流预警线 0 的判定行为。
 * 用法：node mcp-smoke.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = process.env.MCP_URL || 'http://127.0.0.1:18095/mcp';
const KEY = process.env.MCP_API_KEY || 'hp-engine-mcp-demo-key';

// 镇龙东F10 真实基线（source-kb/docs-real/制度文件 口径表同源）
const baseline = {
  bid_price_yi: 12.7317,
  target_cost_yi: 10.8509,
  actual_cost_yi: 0,          // 标前——本轮 schema 放宽的验证点
  profit_rate: 14.77,
  payment_rate: 0,
  progress: 0,
  cost_completion: 0,
  lag_nodes: 0,
  risk_total: 0,
  risk_red: 0,
  cashflow_jun_wan: 0,        // 现金流缺失，标前按 0
};
const globals = { profit_red_line: 10.14, critical_balance_wan: 0, steel_share_pct: 7.08 };

const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(BASE), {
  requestInit: { headers: { 'X-API-Key': KEY } },
}));

let fails = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' ｜ ' + detail : ''}`);
  if (!cond) fails++;
};

// ① 基准推演（全 0 因子）
const base = await client.callTool({ name: 'run_scenario', arguments: { project: '镇龙东F10', baseline, globals, period: '2026-06-10' } });
const b = JSON.parse(base.content[0].text);
check('schema 放宽：actual_cost_yi=0 通过', b.result?.baseline != null);
check('基准利润率 14.77%', b.result?.baseline?.profitRate === 14.77, `baseline.profitRate=${b.result?.baseline?.profitRate}`);
check('标前实际成本为 0（不再套 8% 启动投入）', b.result?.baseline?.actualCostYi === 0, `actualCostYi=${b.result?.baseline?.actualCostYi}`);
check('基准不破红线', b.result?.belowRedLine === false, `belowRedLine=${b.result?.belowRedLine}`);
check('基准不触发现金流预警', b.result?.criticalCashflow === false, `criticalCashflow=${b.result?.criticalCashflow}`);

// ② 钢筋涨价 8%
const up = await client.callTool({ name: 'run_scenario', arguments: { project: '镇龙东F10', baseline, globals, steel_price: 8, period: '2026-06-10' } });
const u = JSON.parse(up.content[0].text);
const steelCost = 10.8509 * 0.0708 * 10000;   // 7682.44 万
const delta = +(steelCost * 0.08).toFixed(1); // 614.6 万
const newRate = +(((12.7317 - 10.8509) * 10000 - delta) / (12.7317 * 10000) * 100).toFixed(2); // 14.29
check('钢筋+8% 成本扰动 614.6 万', u.result?.simulated?.costDeltaWan === delta, `costDeltaWan=${u.result?.simulated?.costDeltaWan}（期望 ${delta}）`);
check('钢筋+8% 利润率 14.77→14.29', u.result?.simulated?.profitRate === newRate, `profitRate=${u.result?.simulated?.profitRate}（期望 ${newRate}）`);
check('扰动明细含钢筋单价', u.result?.breakdown?.some((x) => x.factor === '钢筋单价'), JSON.stringify(u.result?.breakdown));

// ③ 回款延迟 30 天（现金流：0 + (-180) < 0 → 触发预警，critical_balance_wan=0 口径）
const pd = await client.callTool({ name: 'run_scenario', arguments: { project: '镇龙东F10', baseline, globals, payment_delay_days: 30, period: '2026-06-10' } });
const p = JSON.parse(pd.content[0].text);
check('回款延迟30天现金流 -180 万', p.result?.simulated?.cashflowJun === -180, `cashflowJun=${p.result?.simulated?.cashflowJun}`);
check('负结余触发预警（预警线 0 口径）', p.result?.criticalCashflow === true, `criticalCashflow=${p.result?.criticalCashflow}`);

// ④ 缺字段硬拒（静默编数保险）：去掉 profit_rate——zod 校验失败以 isError 结果返回
try {
  const bad = { ...baseline }; delete bad.profit_rate;
  const res = await client.callTool({ name: 'run_scenario', arguments: { project: '镇龙东F10', baseline: bad, globals } });
  const errText = JSON.stringify(res);
  check('缺字段硬拒（profit_rate 缺失被 zod 拒绝）', res.isError === true && errText.includes('profit_rate'), errText.slice(0, 150));
} catch (e) {
  check('缺字段硬拒（profit_rate 缺失被 zod 拒绝）', String(e.message).includes('profit_rate'), e.message.slice(0, 120));
}

await client.close();
console.log(fails ? `[smoke] ${fails} 项失败` : '[smoke] 全部通过');
process.exit(fails ? 1 : 0);
