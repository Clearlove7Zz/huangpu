/**
 * 黄埔城更数字沙盘 · demo 后端网关
 *
 * 职责（PRD §7.3）：
 *   ① 认证 + 角色调度：demo 登录签发 HMAC 令牌；按角色强制智能体白名单（含按名称
 *      匹配的自定义智能体）与知识库范围；无利润权限的角色问利润直接 403。
 *   ② 凭据持有：WeKnora scoped API key 只存在本服务 .env，浏览器仅持网关令牌。
 *   ③ 输出对账（PRD 原文形态 + AD-09）：旁路监听回答流，"有数字但过程中没有引擎
 *      调用记录 = 编造，拒收并退回本地引擎出数"。引擎调用记录 = 上游真实 tool_call
 *      事件且工具名命中引擎工具（引擎已 MCP 化，由 Agent 模型自主调用，见 engine-mcp/）。
 *      网关保留 engine.mjs 仅作拒收兜底出数，不再代调注入。
 *   ④ 审计：全部拦截/裁决落 logs/gateway-audit.jsonl。
 *
 * 零 npm 依赖，Node ≥18，启动：node server.mjs（引擎 MCP 服务另启：node engine-mcp/server.mjs）
 * demo 简化：无 HTTPS/数据库/限流。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, verifyToken, tokenFromRequest } from './lib/auth.mjs';
import { getRbac, agentAllowed, PROFIT_AGENT_NAME } from './lib/rbac.mjs';
import { engineForQuery, reconcile, formatEngineAnswer, ENGINE_TOOL_RE } from './lib/reconcile.mjs';
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
const ENGINE_MCP_URL = process.env.ENGINE_MCP_URL || 'http://127.0.0.1:18095/mcp';
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

// —— 智能体 ID→{name} 映射缓存（名称匹配越权判定与默认智能体解析用，5 分钟刷新） ——
let agentCache = { at: 0, map: null };
async function getAgentsMap() {
  if (agentCache.map && Date.now() - agentCache.at < 5 * 60 * 1000) return agentCache.map;
  const j = await upstreamJson(TARGET, 'GET', '/api/v1/agents');
  if (j && Array.isArray(j.data)) {
    const map = {};
    for (const a of j.data) map[String(a.id)] = { name: String(a.name ?? '') };
    agentCache = { at: Date.now(), map };
  }
  return agentCache.map; // 上游失败沿用旧缓存
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
  //    tenant_api_key.go 核实，故须网关强制）。自定义智能体按名称关键词匹配（ID 随
  //    库重建漂移）；白名单外 403，未指定则按角色默认（优先名称解析，回退内置默认）。
  if (qaPath.startsWith('/api/v1/agent-chat/')) {
    const agents = await getAgentsMap();
    if (body.agent_id) {
      const agentName = agents?.[String(body.agent_id)]?.name ?? '';
      if (!agentAllowed(scope, String(body.agent_id), agentName)) {
        audit({ action: 'deny_agent', user: payload.name, role: payload.role, agent_id: body.agent_id, query });
        sendJson(clientRes, 403, { error: `网关拦截：角色「${payload.role}」不可使用智能体 ${agentName || body.agent_id}` });
        return;
      }
    } else {
      const resolved = scope.defaultAgentName && agents
        ? Object.entries(agents).find(([, v]) => v.name === scope.defaultAgentName)?.[0]
        : null;
      body.agent_id = resolved ?? scope.defaultAgentId;
    }
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

  // ④ 转发 + SSE 旁路监听 + 流结束后流程对账（PRD §7.3 原文形态 + AD-09：
  //    引擎调用记录 = 上游真实 tool_call 且工具名命中引擎工具；网关不代调不注入。
  //    "有数字但无引擎调用记录 = 编造，拒收并退回引擎出数"；不比对数字内容）
  proxyQa({
    clientRes,
    target: TARGET,
    path: qaPath,
    bodyStr: JSON.stringify(body),
    onComplete: async ({ tap }) => {
      const engineTools = (tap.toolNames ?? []).filter((n) => ENGINE_TOOL_RE.test(n));
      const verdict = reconcile({ answerText: tap.answerText, engine, engineToolCalled: engineTools.length > 0 });
      audit({
        action: 'chat',
        user: payload.name,
        role: payload.role,
        query,
        endpoint: qaPath.replace('/api/v1/', ''),
        engine_tool_called: engineTools,
        upstream_tool_call: tap.sawToolCall,
        has_numbers: verdict.verdict !== 'na',
        verdict: verdict.verdict,
        reason: verdict.reason,
        answer_chars: tap.answerText.length,
        elapsed_ms: Date.now() - t0,
      });
      const appendEvents = [];
      if (verdict.verdict === 'pass') {
        appendEvents.push(sseEvent({
          response_type: 'gateway_audit',
          data: { verdict: 'pass', message: '推演引擎已参与本次回答（流程对账通过）' },
        }));
      } else if (verdict.verdict === 'reject') {
        appendEvents.push(sseEvent({
          response_type: 'gateway_audit',
          data: {
            verdict: 'reject',
            engine_answer: formatEngineAnswer(engine),
            message: '网关对账拒收：回答含数字但推演引擎未参与计算（数值铁律），以下为引擎结果',
          },
        }));
      }
      return { appendEvents };
    },
  });
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
    sendJson(res, 200, { ok: true, service: 'huangpu-gateway', upstream: WEKNORA_URL, engineMcp: ENGINE_MCP_URL });
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
  console.log(`[gateway] 上游 WeKnora: ${WEKNORA_URL} ｜ 引擎 MCP: ${ENGINE_MCP_URL}（对账依据上游引擎工具 tool_call）`);
  console.log(`[gateway] 默认利润智能体: ${PROFIT_AGENT_NAME}`);
  console.log('[gateway] 审计日志: logs/gateway-audit.jsonl');
});
