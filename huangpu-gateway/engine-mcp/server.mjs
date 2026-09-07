/**
 * 利润推演引擎 MCP 服务 v2（RAG 供数 · C 路线"问时现抽"，负责人决策 2026-09-02）。
 *
 * 数据流：agent 从「项目原始资料」等多源文档（合同摘要/成本月报/综合月报/制度/资金计划）
 *        现场检索基线与全局常量 → 调 run_scenario(baseline, globals, project, factors)
 *        → 引擎确定性计算 → 结果回灌 agent 总结。
 *
 * - AD-09：引擎走 MCP 工具，不内嵌网关；算法 import ../lib/engine.mjs（单源零漂移）。
 * - v2 签名（与 PRD 附录 D 的偏离系负责人架构决策）：baseline/globals 全必填——缺字段由
 *   zod schema 硬拒绝，模型必须回文档补检索；这是"问时现抽"架构下防"静默编数"的主保险。
 *   内置常量（engine-data）不再作为计算输入，仅存于网关兜底路径。
 * - transport：streamable HTTP（WeKnora MCP client 禁用 stdio）；自鉴权 X-API-Key（AD-08）。
 */

import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { PROJECTS } from '../lib/engine-data.mjs';
import { simulate, PRESETS, SIM_TYPES } from '../lib/engine.mjs';

const PORT = Number(process.env.MCP_PORT || 18095);
const MCP_API_KEY = process.env.MCP_API_KEY || 'hp-engine-mcp-demo-key';

/** 宽松解析地块元信息（仅用于结果标注 id/shortName，计算输入全部来自调用方 baseline） */
function resolveProjectMeta(q) {
  const s = String(q ?? '').trim();
  if (!s) return null;
  const p =
    PROJECTS.find((p) => p.id === s) ??
    PROJECTS.find((p) => p.shortName === s) ??
    PROJECTS.find((p) => p.name === s || p.name.includes(s) || s.includes(p.shortName));
  return p ? { id: p.id, name: p.name, shortName: p.shortName } : { id: s, name: s, shortName: s };
}

function projectHint() {
  return PROJECTS.map((p) => `${p.id}(${p.shortName})`).join('、');
}

const baselineShape = {
  bid_price_yi: z.number().positive().describe('中标合同价（亿）——出自合同/中标材料；标前项目为预估合同价（控制价下浮测算值）'),
  target_cost_yi: z.number().positive().describe('目标成本（亿）——出自成本测算/月报；标前项目为内部测算成本'),
  actual_cost_yi: z.number().min(0).describe('累计实际成本（亿）——出自成本月报；标前未开工为 0'),
  profit_rate: z.number().min(0).max(100).describe('当前实际利润率（%）——出自成本月报；标前为测算利润率（相对合同价口径）'),
  payment_rate: z.number().min(0).max(100).describe('回款率（%）——出自商务/综合月报；标前为 0'),
  progress: z.number().min(0).max(100).describe('形象进度（%）——出自监理/综合月报；标前为 0'),
  cost_completion: z.number().min(0).max(100).describe('成本完成度（%）——出自成本月报；标前为 0'),
  lag_nodes: z.number().int().min(0).describe('滞后节点数（个）——出自监理/综合月报；标前为 0'),
  risk_total: z.number().int().min(0).describe('风险总数（个）——出自风险台账/综合月报；标前为 0'),
  risk_red: z.number().int().min(0).describe('红色风险数（个）——出自风险台账/综合月报；标前为 0'),
  cashflow_jun_wan: z.number().describe('本期现金流结余（万）——出自资金计划；现金流测算缺失时按 0'),
};

const globalsShape = {
  profit_red_line: z.number().min(0).max(100).describe('目标利润率红线（%）——出自管理办法'),
  critical_balance_wan: z.number().min(0).describe('现金流临界预警线（万）——出自资金管理办法'),
  steel_share_pct: z.number().min(0).max(100).describe('钢筋成本份额（%）——出自成本管理制度'),
};

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

const runScenarioCfg = {
    title: '利润情景推演',
    description:
      '对指定地块执行确定性利润推演（数值铁律：利润数字必须由本引擎计算，模型不得自行推算）。' +
      'baseline 与 globals 的每一个字段都必须从知识库原始材料（合同摘要/成本月报/综合月报/资金计划/管理制度）' +
      '检索取得，不得凭记忆或估算填写；任一字段缺失本工具会直接拒绝并列出缺失清单，届时请回知识库补检索。' +
      `project 可填：${projectHint()}。返回基线与推演后的利润率、现金流、进度及扰动明细。`,
    inputSchema: {
      project: z.string().describe(`地块 ID 或名称，如：${projectHint()}`),
      baseline: z.object(baselineShape).describe('基线 11 项——从原始材料逐项检索取得'),
      globals: z.object(globalsShape).describe('全局常量 3 项——从管理制度/资金办法检索取得'),
      period: z.string().optional().describe('数据所属期次（如 2026-06），取自材料时填写，用于结果标注'),
      top_overruns: z.array(z.string()).optional().describe('超支分项列表（可选，出自成本月报）'),
      ...factorShape,
    },
};
const runScenarioHandler = async (a) => {
    const meta = resolveProjectMeta(a.project);
    const project = {
      id: meta.id,
      name: meta.name,
      shortName: meta.shortName,
      progress: a.baseline.progress,
      lagNodes: a.baseline.lag_nodes,
      profitRate: a.baseline.profit_rate,
      paymentRate: a.baseline.payment_rate,
      costCompletion: a.baseline.cost_completion,
      risks: { total: a.baseline.risk_total, red: a.baseline.risk_red },
      cost: {
        bidPrice: a.baseline.bid_price_yi,
        targetCost: a.baseline.target_cost_yi,
        actualCost: a.baseline.actual_cost_yi,
        topOverruns: a.top_overruns ?? [],
      },
    };
    const globals = {
      profitRedLine: a.globals.profit_red_line,
      criticalBalanceWan: a.globals.critical_balance_wan,
      steelShare: a.globals.steel_share_pct / 100,
      cashflowJunWan: a.baseline.cashflow_jun_wan,
    };
    const sim = simulate(project, toFactors(a), globals);
    return json({
      project: meta,
      ...(a.period ? { period: a.period } : {}),
      result: sim,
    });
};

/** 每请求新建 McpServer+transport（McpServer 单实例同一时刻只挂一个 transport，
 *  共享实例在并发/快速连发时 "Already connected" 500；无状态模式下按请求装配是官方形态） */
function buildServer() {
  const s = new McpServer({ name: 'profit-engine', version: '2.0.0' });
  s.registerTool('run_scenario', { ...runScenarioCfg }, runScenarioHandler);
  s.registerTool('list_presets', {
    title: '预设情景清单',
    description: '列出可用的推演预设情景与推演维度说明（供选择情景用，不返回具体数值）。',
    inputSchema: {},
  }, async () => json({ presets: PRESETS, simTypes: SIM_TYPES }));
  return s;
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'profit-engine-mcp', version: '2.0.0-rag-supplied', tools: ['run_scenario', 'list_presets'] }));
    return;
  }

  if (url.pathname !== '/mcp') {
    res.writeHead(404).end();
    return;
  }

  // MCP 自鉴权（AD-08）：WeKnora 注册时配置同一 api_key
  if ((req.headers['x-api-key'] ?? '') !== MCP_API_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized: invalid X-API-Key' }, id: null }));
    return;
  }

  // 无状态模式：每个请求独立 server+transport，不维护会话
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => transport.close());
    await buildServer().connect(transport);

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
  console.log(`[engine-mcp] profit-engine MCP server v2 on http://0.0.0.0:${PORT}/mcp (streamable HTTP, X-API-Key auth)`);
  console.log('[engine-mcp] v2 (C 路线): baseline/globals supplied by agent from source documents; builtin constants no longer used as inputs');
});
