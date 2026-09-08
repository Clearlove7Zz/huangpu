/**
 * Mock WeKnora 上游（烟囱测试用，端口 18080）——模拟 MCP 化后的真实 Agent 行为：
 * - 校验网关注入了 X-API-Key；提供 /api/v1/agents 列表（含利润推演智能体，供网关
 *   名称解析/越权判定）与 /api/v1/knowledge-bases（供角色 KB 过滤测试）；
 * - 问答 SSE 流（模拟 Agent 模型自主工具调用）：
 *     默认          → tool_call(mcp_profit_engine_run_scenario) + tool_result + 回答 18.46% → 对账 pass
 *     含「伪造」    → 无任何工具调用，回答 25.3%（引擎外数字）           → 对账 reject
 *     含「仅KB工具」→ tool_call(knowledge_search) + 回答 18.46%（非引擎工具）→ 对账 reject（按名匹配回归）
 *     含「无数」    → 纯文字回答                                          → 对账 na
 * 用法：node test/mock-upstream.mjs
 */

import http from 'node:http';

const sse = (obj) => `event: message\ndata: ${JSON.stringify(obj)}\n\n`;

/** 记录最近一次问答请求体（smoke 测试用 GET /__last 读取，验证 KB 过滤/头注入/默认智能体） */
const last = { url: '', body: '' };

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      console.log(`[mock-upstream] ${req.method} ${req.url} x-api-key=${req.headers['x-api-key'] ? 'present' : 'MISSING'}`);

      if (req.url === '/__last') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ url: last.url, body: last.body }));
        return;
      }
      if (/^\/api\/v1\/(knowledge|agent)-chat\//.test(req.url)) {
        last.url = req.url;
        last.body = body;
      }
      if (!req.headers['x-api-key']) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'mock: missing X-API-Key' }));
        return;
      }
      if (req.url === '/api/v1/knowledge-bases') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'kb-1', name: '项目文档库' }, { id: 'kb-2', name: '成本利润库' }] }));
        return;
      }
      if (req.url === '/api/v1/agents') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: 'builtin-quick-answer', name: '快速问答', is_builtin: true, config: { agent_mode: 'quick-answer' } },
            { id: 'builtin-smart-reasoning', name: '智能推理', is_builtin: true, config: { agent_mode: 'smart-reasoning' } },
            { id: 'builtin-data-analyst', name: '数据分析师', is_builtin: true, config: { agent_mode: 'smart-reasoning' } },
            { id: 'ag-profit', name: '利润研判', is_builtin: false, config: { agent_mode: 'smart-reasoning' } },
            { id: 'ag-decision', name: '决策研判', is_builtin: false, config: { agent_mode: 'smart-reasoning' } },
          ],
        }));
        return;
      }
      if (/^\/api\/v1\/(knowledge|agent)-chat\//.test(req.url)) {
        const q = (() => {
          try {
            return JSON.parse(body || '{}').query ?? '';
          } catch {
            return '';
          }
        })();
        const fabricated = q.includes('伪造');
        const kbToolOnly = q.includes('仅KB工具');
        const noNumbers = q.includes('无数');
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
        res.write(sse({ response_type: 'thinking', content: '思考中', done: true }));
        if (!fabricated && !noNumbers) {
          // 引擎工具（MCP 前缀名）或 KB 工具（按名匹配回归用）
          const toolName = kbToolOnly ? 'knowledge_search' : 'mcp_profit_engine_run_scenario';
          res.write(sse({ response_type: 'tool_call', data: { tool_call_id: 'tc-1', tool_name: toolName, arguments: { project: '新联01' } } }));
          res.write(sse({ response_type: 'tool_result', data: { tool_call_id: 'tc-1', tool_name: toolName, success: true, duration_ms: 5, output: '{"profitRate":18.46}' } }));
        }
        res.write(sse({
          response_type: 'answer',
          content: fabricated ? '利润率将变为 25.3%' : noNumbers ? '利润率受钢筋价格、工期、回款节奏等多重因素影响。' : '利润率将由 19.59% 变为 18.46%（-1.13 pct）',
        }));
        res.write(sse({ response_type: 'complete', data: { total_duration_ms: 12, total_steps: 1 } }));
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, echo: req.url }));
    });
  })
  .listen(18080, () => console.log('[mock-upstream] listening 18080'));
