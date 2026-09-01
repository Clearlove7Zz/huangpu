/**
 * 利润推演引擎 MCP 服务（PRD 附录 D：decision-engine 4 函数注册为 WeKnora MCP 工具）。
 *
 * - 架构约束 AD-09：引擎走 MCP 工具，Agent 按需调用，不内嵌网关。
 *   本进程独立于网关；算法直接 import ../lib/engine.mjs（与网关兜底/前端本地引擎同源，零漂移）。
 * - transport：streamable HTTP（WeKnora MCP client 禁用 stdio，internal/mcp/client.go）。
 * - 自鉴权（AD-08 "MCP 自鉴权"）：所有 /mcp 请求校验 X-API-Key。
 * - 部署：bind 0.0.0.0，WeKnora 容器经 host.docker.internal 访问。
 */

import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { PROJECTS, PROFIT_RED_LINE } from '../lib/engine-data.mjs';
import { simulate, getBaseline, getCurrentStatusByType, PRESETS, SIM_TYPES } from '../lib/engine.mjs';

const PORT = Number(process.env.MCP_PORT || 18095);
const MCP_API_KEY = process.env.MCP_API_KEY || 'hp-engine-mcp-demo-key';

/** 宽松解析地块：接受 id / 短名 / 全名子串（模型侧给 id 或中文名都行） */
function resolveProject(q) {
  const s = String(q ?? '').trim();
  if (!s) return null;
  return (
    PROJECTS.find((p) => p.id === s) ??
    PROJECTS.find((p) => p.shortName === s) ??
    PROJECTS.find((p) => p.name === s || p.name.includes(s) || s.includes(p.shortName)) ??
    null
  );
}

function projectHint() {
  return PROJECTS.map((p) => `${p.id}(${p.shortName})`).join('、');
}

const factorShape = {
  steel_price: z.number().min(-10).max(15).optional().describe('钢筋单价波动 %（-10~15，正=涨价），默认 0'),
  progress_delay_days: z.number().int().min(0).max(90).optional().describe('关键节点延误天数（0~90），默认 0'),
  subcontract_delta_wan: z.number().min(-200).max(500).optional().describe('分包合同变更金额（万，-200~500），默认 0'),
  payment_delay_days: z.number().int().min(0).max(60).optional().describe('业主回款延迟天数（0~60），默认 0'),
  concrete_qty_pct: z.number().min(-8).max(12).optional().describe('混凝土用量偏差 %（-8~12），默认 0'),
  quality_invest_wan: z.number().min(0).max(300).optional().describe('质量整改投入（万，0~300），默认 0'),
};

function toFactors(a) {
  return {
    steelPrice: a.steel_price ?? 0,
    progressDelay: a.progress_delay_days ?? 0,
    subcontractDelta: a.subcontract_delta_wan ?? 0,
    paymentDelay: a.payment_delay_days ?? 0,
    concreteQty: a.concrete_qty_pct ?? 0,
    qualityInvest: a.quality_invest_wan ?? 0,
  };
}

function json(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

const server = new McpServer({ name: 'profit-engine', version: '1.0.0' });

server.registerTool(
  'run_scenario',
  {
    title: '利润情景推演',
    description:
      '对指定地块执行确定性利润推演（数值铁律：利润数字必须由本引擎计算，模型不得自行推算）。' +
      `可选地块：${projectHint()}。返回基线与推演后的利润率、现金流、进度及扰动明细。` +
      '基线数据（利润率/成本/合同价/份额）由引擎内置维护并随台账期次更新，调用前无需检索知识库获取基线数值；' +
      '本工具只接收问题中的情景扰动因子（如钢筋涨价 X%、延误 X 天），未提到的因子保持 0。',
    inputSchema: {
      project: z.string().describe(`地块 ID 或名称，如：${projectHint()}`),
      ...factorShape,
    },
  },
  async (args) => {
    const p = resolveProject(args.project);
    if (!p) return { content: [{ type: 'text', text: `未识别地块「${args.project}」，可用：${projectHint()}` }], isError: true };
    return json({ project: { id: p.id, name: p.name, shortName: p.shortName }, result: simulate(p, toFactors(args)) });
  }
);

server.registerTool(
  'get_baseline',
  {
    title: '地块基线指标',
    description:
      `获取指定地块当前基线（实际利润率、中标合同价、目标成本、回款率等）。可选地块：${projectHint()}。` +
      `目标利润率红线 ${PROFIT_RED_LINE}%。需要基线数值时优先调用本工具，而非检索知识库（引擎数值随台账期次更新，最权威）。`,
    inputSchema: { project: z.string().describe(`地块 ID 或名称，如：${projectHint()}`) },
  },
  async (args) => {
    const p = resolveProject(args.project);
    if (!p) return { content: [{ type: 'text', text: `未识别地块「${args.project}」，可用：${projectHint()}` }], isError: true };
    return json({ project: { id: p.id, name: p.name, shortName: p.shortName }, baseline: getBaseline(p), profitRedLine: PROFIT_RED_LINE });
  }
);

server.registerTool(
  'get_current_status',
  {
    title: '地块现状诊断',
    description:
      '按推演维度给出地块现状指标与建议（overall=整体 / schedule=进度 / cost=成本，含红线预警与挣值指标）。',
    inputSchema: {
      project: z.string().describe(`地块 ID 或名称，如：${projectHint()}`),
      sim_type: z.enum(['overall', 'schedule', 'cost']).optional().describe('推演维度，默认 overall'),
    },
  },
  async (args) => {
    const p = resolveProject(args.project);
    if (!p) return { content: [{ type: 'text', text: `未识别地块「${args.project}」，可用：${projectHint()}` }], isError: true };
    return json(getCurrentStatusByType(p, args.sim_type ?? 'overall'));
  }
);

server.registerTool(
  'list_presets',
  {
    title: '预设情景清单',
    description: '列出可用的推演预设情景与推演维度说明（供选择情景用，不返回具体数值）。',
    inputSchema: {},
  },
  async () => json({ presets: PRESETS, simTypes: SIM_TYPES })
);

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'profit-engine-mcp', tools: ['run_scenario', 'get_baseline', 'get_current_status', 'list_presets'] }));
    return;
  }

  if (url.pathname !== '/mcp') {
    res.writeHead(404).end();
    return;
  }

  // MCP 自鉴权（AD-08）：网关/WeKnora 注册时配置同一 api_key
  if ((req.headers['x-api-key'] ?? '') !== MCP_API_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized: invalid X-API-Key' }, id: null }));
    return;
  }

  // 无状态模式：每个请求独立 transport，不维护会话
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => transport.close());
    await server.connect(transport);

    let body = '';
    for await (const chunk of req) body += chunk;
    await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
  } catch (err) {
    console.error('[engine-mcp] request error:', err?.message || err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
    }
  }
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[engine-mcp] profit-engine MCP server on http://0.0.0.0:${PORT}/mcp (streamable HTTP, X-API-Key auth)`);
});
