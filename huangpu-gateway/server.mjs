/**
 * 黄埔城更数字沙盘 · demo 后端网关
 *
 * 职责（PRD §7.3，demo 最小闭环）：
 *   ① 认证 + 角色调度：demo 登录签发 HMAC 令牌；按角色强制智能体白名单与知识库范围；
 *      无利润权限的角色问利润直接 403。
 *   ② 凭据持有：WeKnora scoped API key 只存在本服务 .env，浏览器仅持网关令牌。
 *   ③ 输出对账：旁路监听回答流，数字必须出自推演引擎（engine.mjs）或常量白名单，
 *      否则判编造拒收并回写引擎兜底答案。
 *   ④ 审计：全部拦截/裁决落 logs/gateway-audit.jsonl。
 *
 * 零 npm 依赖，Node ≥18，启动：node server.mjs
 * demo 简化：引擎为网关内置模块（非独立 MCP 服务，M3 拆分）；无 HTTPS/数据库/限流。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, verifyToken, tokenFromRequest } from './lib/auth.mjs';
import { getRbac } from './lib/rbac.mjs';
import { engineForQuery, reconcile, formatEngineAnswer, formatEngineFeedback } from './lib/reconcile.mjs';
import { applyCors, sendJson, readBody, proxyPassthrough, proxyQa, sseEvent, upstreamJson } from './lib/proxy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// —— .env 加载（零依赖解析；不覆盖已有环境变量） ——
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] in process.env === false) process.env[m[1]] = m[2];
  }
}

const PORT = Number(process.env.PORT || 8090);
const WEKNORA_URL = process.env.WEKNORA_URL || 'http://127.0.0.1:8080';
const WEKNORA_API_KEY = process.env.WEKNORA_API_KEY || '';
const ENGINE_DISABLED = process.env.GATEWAY_ENGINE_DISABLED === '1';
const wUrl = new URL(WEKNORA_URL);
const TARGET = {
  host: wUrl.hostname,
  port: Number(wUrl.port) || (wUrl.protocol === 'https:' ? 443 : 80),
  apiKey: WEKNORA_API_KEY,
};

if (!WEKNORA_API_KEY) {
  console.warn('[gateway] 警告：未配置 WEKNORA_API_KEY，上游将 401（前端降级链路会接管）');
}

// —— 审计日志（JSONL，一条一行） ——
const LOG_DIR = path.join(__dirname, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const AUDIT_FILE = path.join(LOG_DIR, 'gateway-audit.jsonl');
function audit(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  fs.appendFile(AUDIT_FILE, line + '\n', () => {});
  console.log('[audit]', line);
}

// —— 知识库 ID→名称 映射缓存（角色关键词过滤用，5 分钟刷新） ——
let kbCache = { at: 0, map: null };
async function getKbNameMap() {
  if (kbCache.map && Date.now() - kbCache.at < 5 * 60 * 1000) return kbCache.map;
  const j = await upstreamJson(TARGET, 'GET', '/api/v1/knowledge-bases');
  if (j && Array.isArray(j.data)) {
    const map = {};
    for (const kb of j.data) map[String(kb.id)] = String(kb.name ?? '');
    kbCache = { at: Date.now(), map };
  }
  return kbCache.map; // 上游失败沿用旧缓存
}

// —— 问答管线 ——
async function handleQa(clientReq, clientRes, { payload, scope, path: qaPath }) {
  let body = {};
  try {
    body = JSON.parse((await readBody(clientReq)).toString('utf8') || '{}');
  } catch {
    // 保持空对象，让上游返回明确错误
  }
  const query = String(body.query ?? '');
  const t0 = Date.now();

  // ① 越权拦截：无利润权限的角色问利润/推演类问题（PRD：安全员不可问利润）
  const engine = engineForQuery(query);
  if (engine.isProfit && !scope.canAskProfit) {
    audit({ action: 'deny_profit', user: payload.name, role: payload.role, query });
    sendJson(clientRes, 403, { error: `网关拦截：角色「${payload.role}」无利润数据权限，利润类问题请联系商务部/财务部` });
    return;
  }

  // ② 角色调度：智能体白名单（WeKnora API key 只能限知识库、限不了智能体，源码
  //    tenant_api_key.go 核实，故须网关强制；白名单外 403，未指定则注入角色默认）
  if (qaPath.startsWith('/api/v1/agent-chat/')) {
    if (body.agent_id && !scope.agentIds.includes(String(body.agent_id))) {
      audit({ action: 'deny_agent', user: payload.name, role: payload.role, agent_id: body.agent_id, query });
      sendJson(clientRes, 403, { error: `网关拦截：角色「${payload.role}」不可使用智能体 ${body.agent_id}` });
      return;
    }
    if (!body.agent_id) body.agent_id = scope.defaultAgentId;
  }

  // ③ 知识库白名单：按角色关键词过滤请求体中的 knowledge_base_ids
  if (!scope.kbKeywords.includes('*') && Array.isArray(body.knowledge_base_ids) && body.knowledge_base_ids.length) {
    const map = await getKbNameMap();
    if (map) {
      body.knowledge_base_ids = body.knowledge_base_ids.filter((id) => {
        const name = map[String(id)] ?? '';
        return scope.kbKeywords.some((kw) => name.includes(kw));
      });
    }
  }

  // ④ 引擎代调：利润/推演类问题先把引擎结果作为 tool_call/tool_result 注入流
  //    （GATEWAY_ENGINE_DISABLED=1 时跳过，用于演示"AI 自算 → 网关拒收"路径）
  const engineCalled = !ENGINE_DISABLED && engine.isProfit && Boolean(engine.project);
  const injected = [];
  if (engineCalled) injected.push(buildToolEvents(engine));

  // ⑤ 转发 + SSE 旁路监听 + 流结束后对账（情景推演数字不一致可打回 agent 重算一次）
  proxyQa({
    clientRes,
    target: TARGET,
    path: qaPath,
    bodyStr: JSON.stringify(body),
    injectedEvents: injected,
    onComplete: async ({ tap, attempt }) => {
      const verdict = reconcile({ answerText: tap.answerText, engine, engineCalled });
      audit({
        action: 'chat',
        attempt,
        user: payload.name,
        role: payload.role,
        query,
        endpoint: qaPath.replace('/api/v1/', ''),
        engine_called: engineCalled,
        upstream_tool_call: tap.sawToolCall,
        verdict: verdict.verdict,
        reason: verdict.reason,
        mismatched: verdict.mismatched ?? [],
        answer_chars: tap.answerText.length,
        elapsed_ms: Date.now() - t0,
      });
      const appendEvents = [];
      if (verdict.verdict === 'pass') {
        appendEvents.push(sseEvent({
          response_type: 'gateway_audit',
          data: { verdict: 'pass', attempt, message: `网关对账通过（第 ${attempt} 轮）：回答数字与推演引擎逐位一致` },
        }));
      } else if (verdict.verdict === 'mismatch') {
        appendEvents.push(sseEvent({
          response_type: 'gateway_audit',
          data: {
            verdict: 'mismatch',
            attempt,
            mismatched: verdict.mismatched,
            message: `网关对账不一致：回答中的 ${verdict.mismatched.join('、')} 不是引擎计算结果，已标记待人工复核`,
          },
        }));
      } else if (verdict.verdict === 'reject') {
        // 打回重算：情景推演问题数字与引擎不一致时，向同一会话追加重答请求（最多一次）；
        // 引擎被禁用（ENGINE_DISABLED）或已是第二轮则不再打回，直接引擎兜底
        const retryable = verdict.reason === 'scenario_numbers_not_from_engine' && !ENGINE_DISABLED && attempt < 2;
        if (retryable) {
          audit({
            action: 'chat_sendback',
            attempt,
            user: payload.name,
            role: payload.role,
            query,
            mismatched: verdict.mismatched,
          });
          return {
            appendEvents: [sseEvent({
              response_type: 'gateway_retry',
              data: { attempt: attempt + 1, mismatched: verdict.mismatched, message: `首次回答未通过对账（${verdict.mismatched.join('、')} 与引擎不一致），已打回重新生成` },
            })],
            followUp: { path: qaPath, bodyStr: JSON.stringify({ ...body, query: formatEngineFeedback(engine, verdict.mismatched) }) },
          };
        }
        const message = verdict.reason === 'scenario_numbers_not_from_engine'
          ? `网关对账拒收：情景推演回答中的 ${verdict.mismatched.join('、')} 与推演引擎结果不一致，以下方引擎结果为准`
          : '网关对账拒收：回答含数字但推演引擎未参与计算（数值铁律），以下为本地引擎结果';
        appendEvents.push(sseEvent({
          response_type: 'gateway_audit',
          data: {
            verdict: 'reject',
            attempt,
            engine_answer: formatEngineAnswer(engine),
            message,
          },
        }));
      }
      return { appendEvents };
    },
  });
}

/** 引擎代调事件：前端 rag.ts 已支持 tool_call/tool_result 渲染 */
function buildToolEvents(engine) {
  const id = `gw-engine-${Date.now()}`;
  const factors = Object.fromEntries(Object.entries(engine.factorsUsed).filter(([, v]) => v !== 0));
  return (
    sseEvent({
      id,
      response_type: 'tool_call',
      data: { tool_call_id: id, tool_name: 'run_scenario', arguments: { project: engine.project.shortName, factors } },
    }) +
    sseEvent({
      id,
      response_type: 'tool_result',
      data: {
        tool_call_id: id,
        tool_name: 'run_scenario',
        success: true,
        duration_ms: 1,
        output: `利润率 ${engine.sim.simulated.profitRate}%（基线 ${engine.sim.baseline.profitRate}%，红线 16.66%）`,
        engine: {
          baseline: engine.sim.baseline.profitRate,
          profitRate: engine.sim.simulated.profitRate,
          delta: engine.sim.deltas.profitRate,
          belowRedLine: engine.sim.belowRedLine,
          criticalCashflow: engine.sim.criticalCashflow,
          breakdown: engine.sim.breakdown,
        },
      },
    })
  );
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  let u;
  try {
    u = new URL(req.url, 'http://localhost');
  } catch {
    sendJson(res, 400, { error: 'bad request url' });
    return;
  }
  const p = u.pathname;

  if (p === '/health') {
    sendJson(res, 200, { ok: true, service: 'huangpu-gateway', upstream: WEKNORA_URL, engineDisabled: ENGINE_DISABLED });
    return;
  }

  // 演示登录（无网关令牌的仅有的两个入口）
  if (p === '/api/auth/login' && req.method === 'POST') {
    let body = {};
    try {
      body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    } catch {
      // 保持空对象 → 登录失败
    }
    const r = login(String(body.username ?? ''), String(body.password ?? ''));
    if (!r) {
      audit({ action: 'login_fail', username: body.username ?? '' });
      sendJson(res, 401, { error: '用户名或密码错误' });
      return;
    }
    r.scope = getRbac(r.role);
    audit({ action: 'login', user: r.name, role: r.role });
    sendJson(res, 200, r);
    return;
  }
  if (p === '/api/auth/me') {
    const payload = verifyToken(tokenFromRequest(req));
    if (!payload) {
      sendJson(res, 401, { error: '未登录或令牌已过期' });
      return;
    }
    sendJson(res, 200, { role: payload.role, name: payload.name, scope: getRbac(payload.role) });
    return;
  }

  // /api/v1/*：一律要求网关令牌（WeKnora API key 由网关持有，浏览器不再携带）
  if (p.startsWith('/api/v1/')) {
    const payload = verifyToken(tokenFromRequest(req));
    if (!payload) {
      sendJson(res, 401, { error: '网关：未登录或令牌已过期' });
      return;
    }
    const scope = getRbac(payload.role);
    const isQa = req.method === 'POST' && /^\/api\/v1\/(knowledge|agent)-chat\/.+$/.test(p);
    if (isQa) {
      await handleQa(req, res, { payload, scope, path: p });
      return;
    }
    proxyPassthrough({ clientReq: req, clientRes: res, target: TARGET, path: p + u.search });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`[gateway] 黄埔城更 demo 网关已启动 http://127.0.0.1:${PORT}`);
  console.log(`[gateway] 上游 WeKnora: ${WEKNORA_URL} ｜ 引擎代调: ${ENGINE_DISABLED ? '已禁用（演示拒收路径）' : '启用'}`);
  console.log('[gateway] 审计日志: logs/gateway-audit.jsonl');
});
