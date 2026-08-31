/**
 * Mock WeKnora 上游（烟囱测试用，端口 18080）：
 * - 校验网关注入了 X-API-Key；
 * - 问答返回固定 SSE 流：query 含「伪造」→ 回答 25.3%（引擎外数字，触发 mismatch/reject）；
 *   否则 → 回答与引擎一致的 17.2% → 20.85%；
 * - 知识库列表返回「项目文档库 / 成本利润库」两库（供角色 KB 过滤测试）。
 * 用法：node test/mock-upstream.mjs
 */

import http from 'node:http';

const sse = (obj) => `event: message\ndata: ${JSON.stringify(obj)}\n\n`;

/** 记录最近一次问答请求体（smoke 测试用 GET /__last 读取，验证 KB 过滤/头注入） */
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
      if (/^\/api\/v1\/(knowledge|agent)-chat\//.test(req.url)) {
        const q = (() => {
          try {
            return JSON.parse(body || '{}').query ?? '';
          } catch {
            return '';
          }
        })();
        const bad = q.includes('伪造');
        const noNumbers = q.includes('无数'); // 无数字回答：对账应判 na，不回写横幅
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
        res.write(sse({ response_type: 'thinking', content: '思考中', done: true }));
        res.write(sse({
          response_type: 'answer',
          content: bad ? '利润率将变为 25.3%' : noNumbers ? '利润率受钢筋价格、工期、回款节奏等多重因素影响。' : '利润率将由 17.2% 变为 16.07%（-1.13 pct）',
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
