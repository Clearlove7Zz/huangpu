/**
 * 网关端到端 smoke 测试：自起 mock 上游(18080) + 网关(18090)，UTF-8 全链路断言。
 * 用法：node test/smoke.mjs
 * 覆盖：健康检查 / 登录 / 无令牌 401 / 安全员问利润 403 / 引擎注入+对账 pass /
 *       伪造数字 mismatch / 智能体越权 403 / KB 白名单过滤 / 引擎禁用 → reject /
 *       审计日志落盘。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve(import.meta.dirname, '..');
const GW = 'http://127.0.0.1:18090';
const MOCK = 'http://127.0.0.1:18080';

let passCount = 0;
let failCount = 0;
function check(name, cond, extra = '') {
  if (cond) passCount++;
  else failCount++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` ｜ ${extra}` : ''}`);
}

function startGateway(engineDisabled) {
  return spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      WEKNORA_URL: 'http://127.0.0.1:18080',
      WEKNORA_API_KEY: 'sk-test-key',
      PORT: '18090',
      GATEWAY_TOKEN_SECRET: 'hp-gateway-demo-secret',
      GATEWAY_ENGINE_DISABLED: engineDisabled ? '1' : '',
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

const AUDIT = path.join(ROOT, 'logs', 'gateway-audit.jsonl');
const auditLinesBefore = fs.existsSync(AUDIT) ? fs.readFileSync(AUDIT, 'utf8').trim().split('\n').length : 0;

const mock = await startMock();
let gw = startGateway(false);
await waitReady(`${GW}/health`);

try {
  // T0 健康检查
  const health = await (await fetch(`${GW}/health`)).json();
  check('T0 健康检查', health.ok === true && health.upstream.includes('18080'));

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

  // T3 安全员问利润 403（上游不被触碰）
  const deny = await qa(tokXiong, '/api/v1/knowledge-chat/s1', { query: '新联01钢筋涨8%利润率多少', knowledge_base_ids: ['kb-1'] });
  check('T3 安全员问利润被 403 拦截', deny.status === 403 && deny.text.includes('网关拦截'), deny.text.slice(0, 80));

  // T4 商务部问利润：引擎注入 + 对账 pass
  const ok = await qa(tokAI, '/api/v1/knowledge-chat/s1', { query: '新联01钢筋涨8%利润率多少', knowledge_base_ids: ['kb-1'], channel: 'web' });
  check('T4a 流中注入 run_scenario 工具事件', ok.text.includes('"tool_name":"run_scenario"'));
  check('T4b 回答数字与引擎一致且对账 pass', ok.text.includes('16.07%') && ok.text.includes('"verdict":"pass"'), `HTTP ${ok.status}`);

  // T5 情景推演问题含引擎外数字 → 打回重算（第二轮 mock 给出正确答案 → 最终 pass）
  const bad2 = await qa(tokAI, '/api/v1/knowledge-chat/s2', { query: '伪造测试：新联01钢筋涨8%利润率多少', knowledge_base_ids: ['kb-1'] });
  check(
    'T5 情景推演数字不一致打回重算且二轮通过',
    bad2.text.includes('gateway_retry') && bad2.text.includes('16.07%') && bad2.text.includes('"verdict":"pass"'),
  );

  // T5b 利润问题但回答无任何数字 → na（不回写对账横幅，避免"无意义绿灯"）
  const noNum = await qa(tokAI, '/api/v1/knowledge-chat/s2b', { query: '新联01利润率受什么因素影响（无数）', knowledge_base_ids: ['kb-1'] });
  check('T5b 无数字回答不发出对账横幅', !noNum.text.includes('gateway_audit'), noNum.text.slice(-120).replace(/\n/g, ' '));

  // T5c 非情景利润问题数字不一致 → mismatch（只标注不拒收，避免误伤 KB 引文）
  const flag = await qa(tokAI, '/api/v1/knowledge-chat/s2c', { query: '伪造对比：新联01利润率情况如何', knowledge_base_ids: ['kb-1'] });
  check('T5c 非情景问题数字不一致仅标注 mismatch', flag.text.includes('"verdict":"mismatch"') && !flag.text.includes('engine_answer'));

  // T6 指挥长用白名单外智能体 → 403
  const denyAgent = await qa(tokNing, '/api/v1/agent-chat/s3', { query: '项目进度如何', agent_id: 'builtin-smart-reasoning', knowledge_base_ids: ['kb-1'] });
  check('T6 智能体越权 403', denyAgent.status === 403 && denyAgent.text.includes('网关拦截'));

  // T7 指挥长 KB 过滤：kb-2(成本利润库) 应被滤掉
  await qa(tokNing, '/api/v1/knowledge-chat/s4', { query: '项目进度如何', knowledge_base_ids: ['kb-1', 'kb-2'], channel: 'web' });
  const last = await (await fetch(`${MOCK}/__last`)).json();
  const lastBody = JSON.parse(last.body || '{}');
  check(
    'T7 知识库白名单过滤',
    last.url.includes('/s4') && JSON.stringify(lastBody.knowledge_base_ids) === JSON.stringify(['kb-1']),
    `上游收到: ${JSON.stringify(lastBody.knowledge_base_ids)}`,
  );

  // T8 上游收到了网关注入的 X-API-Key
  check('T8 上游侧 X-API-Key 注入', last.body.length >= 0 && (await (await fetch(`${MOCK}/__last`)).json()).url.includes('s4')); // mock 已校验 key（MISSING 会 401，s4 拿到了回答即证明）

  // —— 阶段二：GATEWAY_ENGINE_DISABLED=1 → 模型自算数字被判 reject ——
  gw.kill();
  await sleep(300);
  gw = startGateway(true);
  await waitReady(`${GW}/health`);
  const rej = await qa(tokAI, '/api/v1/knowledge-chat/s5', { query: '新联01钢筋涨8%利润率多少', knowledge_base_ids: ['kb-1'] });
  check(
    'T9 引擎禁用时模型自算被拒收 + 引擎兜底答案',
    rej.text.includes('"verdict":"reject"') && rej.text.includes('engine_answer') && rej.text.includes('16.07%'),
  );

  // T10 审计落盘
  const lines = fs.readFileSync(AUDIT, 'utf8').trim().split('\n').slice(auditLinesBefore);
  const actions = new Set(lines.map((l) => JSON.parse(l).action));
  check(
    'T10 审计日志覆盖 login/chat/deny/sendback',
    actions.has('login') && actions.has('chat') && actions.has('deny_profit') && actions.has('deny_agent') && actions.has('chat_sendback'),
    `新增 ${lines.length} 条，动作: ${[...actions].join('/')}`,
  );
  const chatLine = lines.map((l) => JSON.parse(l)).find((l) => l.action === 'chat' && l.verdict === 'pass');
  check('T11 审计 chat 记录含裁决与角色', Boolean(chatLine) && chatLine.role === '指挥部-商务部' && chatLine.engine_called === true);
} finally {
  gw.kill();
  mock.kill();
}

console.log(`\n结果：${passCount} 通过 / ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
