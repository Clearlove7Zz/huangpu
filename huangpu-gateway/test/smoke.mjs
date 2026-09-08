/**
 * 网关端到端 smoke 测试：自起 mock 上游(18080) + 网关(18090)，UTF-8 全链路断言。
 * 用法：node test/smoke.mjs
 * 覆盖（引擎 MCP 化 + AD-09 对账语义）：
 *   健康检查 / 登录 / 无令牌 401 / 安全员问利润 403 / 安全员用利润智能体 403 /
 *   上游真实 tool_call 透传 + 对账 pass / 伪造数字（无工具调用）reject + 引擎兜底 /
 *   仅 KB 工具（knowledge_search）不算引擎参与 → reject（按名匹配回归）/
 *   无数字 na / 默认智能体按名称解析（利润推演智能体）/ 智能体越权 403 /
 *   KB 白名单过滤 / 审计落盘。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve(import.meta.dirname, '..');
const GW = 'http://127.0.0.1:18090';
const MOCK = 'http://127.0.0.1:18080';
const ENGINE_TOOL = 'mcp_profit_engine_run_scenario';

let passCount = 0;
let failCount = 0;
function check(name, cond, extra = '') {
  if (cond) passCount++;
  else failCount++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` ｜ ${extra}` : ''}`);
}

function startGateway() {
  return spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      WEKNORA_URL: 'http://127.0.0.1:18080',
      WEKNORA_API_KEY: 'sk-test-key',
      PORT: '18090',
      GATEWAY_TOKEN_SECRET: 'hp-gateway-demo-secret',
    },
    stdio: 'ignore',
  });
}

async function startMock() {
  const child = spawn(process.execPath, ['test/mock-upstream.mjs'], { cwd: ROOT, stdio: 'ignore' });
  await waitReady(`${MOCK}/__last`); // 根路径要求 X-API-Key（会 401），轮询免鉴权的 /__last
  return child;
}

/** 轮询直到服务就绪（最多 5s），避免端口占用/启动慢导致的假失败 */
async function waitReady(url) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // 未就绪，继续等
    }
    await sleep(100);
  }
  throw new Error(`服务未就绪: ${url}`);
}

async function login(username, password) {
  const res = await fetch(`${GW}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function qa(token, path, body) {
  const res = await fetch(`${GW}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': token },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function lastBody() {
  const j = await (await fetch(`${MOCK}/__last`)).json();
  return { url: String(j.url ?? ''), body: JSON.parse(j.body || '{}') };
}

const AUDIT = path.join(ROOT, 'logs', 'gateway-audit.jsonl');
const auditLinesBefore = fs.existsSync(AUDIT) ? fs.readFileSync(AUDIT, 'utf8').trim().split('\n').length : 0;

const mock = await startMock();
const gw = startGateway();
await waitReady(`${GW}/health`);

try {
  // T0 健康检查（含引擎 MCP 地址）
  const health = await (await fetch(`${GW}/health`)).json();
  check('T0 健康检查', health.ok === true && health.upstream.includes('18080') && String(health.engineMcp).includes('18095'));

  // T1 登录 + 错误凭据
  const ai = await login('ai', 'ai123');
  const bad = await login('ai', 'wrong');
  check('T1a 登录签发令牌', ai.status === 200 && ai.json.token?.length > 20 && ai.json.role === '指挥部-商务部');
  check('T1b 错误凭据 401', bad.status === 401);
  const tokAI = ai.json.token;
  const tokXiong = (await login('xiong', 'xiong123')).json.token;
  const tokNing = (await login('ning', 'ning123')).json.token;

  // T2 无令牌 401
  const noTok = await qa('', '/api/v1/knowledge-chat/s1', { query: 'hi' });
  check('T2 无令牌访问 401', noTok.status === 401, noTok.text.slice(0, 60));

  // T3a 安全员问利润 403（上游不被触碰）
  const deny = await qa(tokXiong, '/api/v1/knowledge-chat/s1', { query: '镇龙东F10钢筋涨8%利润率多少', knowledge_base_ids: ['kb-1'] });
  check('T3a 安全员问利润被 403 拦截', deny.status === 403 && deny.text.includes('网关拦截'), deny.text.slice(0, 80));

  // T3b 安全员指定利润推演智能体（名称不对其可见）→ 403 deny_agent
  const denyProfitAgent = await qa(tokXiong, '/api/v1/agent-chat/s1b', { query: '项目进度如何', agent_id: 'ag-profit' });
  check('T3b 安全员用利润推演智能体 403', denyProfitAgent.status === 403 && denyProfitAgent.text.includes('网关拦截'));

  // T4 商务部问利润（agent-chat，默认智能体按名称解析为利润推演智能体）：
  // 上游真实 tool_call 透传 + 对账 pass
  const ok = await qa(tokAI, '/api/v1/agent-chat/s2', { query: '镇龙东F10钢筋涨8%利润率多少', knowledge_base_ids: ['kb-1'], channel: 'web' });
  check('T4a 上游真实引擎 tool_call 透传', ok.text.includes(`"tool_name":"${ENGINE_TOOL}"`), `HTTP ${ok.status}`);
  check('T4b 对账 pass（引擎已参与）', ok.text.includes('18.46%') && ok.text.includes('"verdict":"pass"') && ok.text.includes('流程对账通过'));
  const lastDefault = await lastBody();
  check('T4c 默认智能体按名称解析', lastDefault.body.agent_id === 'ag-profit', `agent_id=${lastDefault.body.agent_id}`);

  // T5 伪造数字：无任何工具调用 → reject + 引擎兜底答案（PRD §7.3 原文）
  const fab = await qa(tokAI, '/api/v1/agent-chat/s3', { query: '伪造测试：镇龙东F10钢筋涨8%利润率多少', agent_id: 'ag-profit', knowledge_base_ids: ['kb-1'] });
  check(
    'T5 无引擎调用即拒收 + 引擎兜底',
    fab.text.includes('25.3%') && fab.text.includes('"verdict":"reject"') && fab.text.includes('engine_answer') && fab.text.includes('14.29%'),
  );

  // T5b 仅 KB 工具（knowledge_search）不算引擎参与 → reject（按名匹配回归锁）
  const kbOnly = await qa(tokAI, '/api/v1/agent-chat/s4', { query: '仅KB工具：镇龙东F10钢筋涨8%利润率多少', agent_id: 'ag-profit', knowledge_base_ids: ['kb-1'] });
  check(
    'T5b knowledge_search 不算引擎参与 → reject',
    kbOnly.text.includes('"tool_name":"knowledge_search"') && kbOnly.text.includes('"verdict":"reject"'),
  );

  // T5c 利润问题但回答无任何数字 → na（不回写对账横幅）
  const noNum = await qa(tokAI, '/api/v1/agent-chat/s5', { query: '镇龙东F10利润率受什么因素影响（无数）', agent_id: 'ag-profit', knowledge_base_ids: ['kb-1'] });
  check('T5c 无数字回答不发出对账横幅', !noNum.text.includes('gateway_audit'), noNum.text.slice(-120).replace(/\n/g, ' '));

  // T6a 指挥长用白名单外内置智能体 → 403
  const denyAgent = await qa(tokNing, '/api/v1/agent-chat/s6', { query: '项目进度如何', agent_id: 'builtin-smart-reasoning' });
  check('T6a 智能体越权 403', denyAgent.status === 403 && denyAgent.text.includes('网关拦截'));

  // T6b 指挥长用利润推演智能体（名称匹配放行）
  const lowPrivProfit = await qa(tokNing, '/api/v1/agent-chat/s7', { query: '项目进度如何', agent_id: 'ag-profit' });
  check('T6b 低权限角色可用利润推演智能体', lowPrivProfit.status === 200, lowPrivProfit.text.slice(0, 80));

  // T6c 指挥长 agent-chat 未指定智能体 → 默认 builtin-quick-answer
  await qa(tokNing, '/api/v1/agent-chat/s8', { query: '项目进度如何' });
  const lastLow = await lastBody();
  check('T6c 低权限默认智能体不变', lastLow.body.agent_id === 'builtin-quick-answer', `agent_id=${lastLow.body.agent_id}`);

  // T7a 全量角色（指挥长 kbAll）不过滤，kb-1/kb-2 原样透传
  await qa(tokNing, '/api/v1/knowledge-chat/s9', { query: '项目进度如何', knowledge_base_ids: ['kb-1', 'kb-2'], channel: 'web' });
  const lastFiltered = await lastBody();
  check(
    'T7a 全量角色 KB 不过滤',
    lastFiltered.url.includes('/s9') && JSON.stringify(lastFiltered.body.knowledge_base_ids) === JSON.stringify(['kb-1', 'kb-2']),
    `上游收到: ${JSON.stringify(lastFiltered.body.knowledge_base_ids)}`,
  );

  // T7b 部分角色（安全员：仅口径制度一个 ID）——kb-1/kb-2 均不在矩阵内，应全滤掉
  await qa(tokXiong, '/api/v1/knowledge-chat/s10', { query: '项目进度如何', knowledge_base_ids: ['kb-1', 'kb-2'], channel: 'web' });
  const lastXiong = await lastBody();
  check(
    'T7b 部分角色 KB 白名单过滤',
    lastXiong.url.includes('/s10') && JSON.stringify(lastXiong.body.knowledge_base_ids) === JSON.stringify([]),
    `上游收到: ${JSON.stringify(lastXiong.body.knowledge_base_ids)}`,
  );

  // T8 上游收到了网关注入的 X-API-Key（mock 缺 key 会 401，s9 拿到回答即证明）
  check('T8 上游侧 X-API-Key 注入', lastFiltered.url.includes('/s9'));

  // T9/T10 审计落盘
  const lines = fs.readFileSync(AUDIT, 'utf8').trim().split('\n').slice(auditLinesBefore);
  const actions = new Set(lines.map((l) => JSON.parse(l).action));
  check(
    'T9 审计日志覆盖 login/chat/deny',
    actions.has('login') && actions.has('chat') && actions.has('deny_profit') && actions.has('deny_agent'),
    `新增 ${lines.length} 条，动作: ${[...actions].join('/')}`,
  );
  const chatLine = lines.map((l) => JSON.parse(l)).find((l) => l.action === 'chat' && l.verdict === 'pass');
  check(
    'T10 审计 chat 记录含引擎工具名与角色',
    Boolean(chatLine) && chatLine.role === '指挥部-商务部' && Array.isArray(chatLine.engine_tool_called) && chatLine.engine_tool_called.includes(ENGINE_TOOL),
  );
} finally {
  gw.kill();
  mock.kill();
}

console.log(`\n结果：${passCount} 通过 / ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
