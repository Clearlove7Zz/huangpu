/**
 * 代理转发层：浏览器 ⇄ WeKnora。
 * - proxyPassthrough：透明双向管道（会话/知识库/附件等非问答请求，SSE 自然流式）；
 * - proxyQa：问答专用——注入网关引擎事件、旁路监听 SSE 累积回答文本供对账、
 *   流结束后回写网关裁决事件；
 * - 每次上游调用注入 X-API-Key（key 只存在于网关 .env，浏览器接触不到）。
 */

import http from 'node:http';

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept, Authorization, X-Gateway-Token, X-API-Key, X-Request-ID');
}

export function sendJson(res, status, obj) {
  if (res.headersSent) {
    res.end(JSON.stringify(obj));
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** SSE 事件序列化（与 WeKnora 同格式：event: message + data: JSON） */
export function sseEvent(obj) {
  return `event: message\ndata: ${JSON.stringify(obj)}\n\n`;
}

function upstreamOptions(target, method, path, headers) {
  return {
    host: target.host,
    port: target.port,
    method,
    path,
    headers: {
      ...headers,
      'X-API-Key': target.apiKey,
    },
  };
}

/** 简单 JSON 上游调用（网关内部取知识库列表等），失败返回 null */
export function upstreamJson(target, method, path) {
  return new Promise((resolve) => {
    const req = http.request(upstreamOptions(target, method, path, { Accept: 'application/json' }), (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/** 透明转发：请求体直接管道，响应直接管道（GET/POST/DELETE/multipart 通用） */
export function proxyPassthrough({ clientReq, clientRes, target, path }) {
  const headers = { ...clientReq.headers };
  delete headers.host;
  const up = http.request(upstreamOptions(target, clientReq.method, path, headers), (upRes) => {
    clientRes.writeHead(upRes.statusCode, upRes.headers);
    upRes.pipe(clientRes);
  });
  up.on('error', () => sendJson(clientRes, 502, { error: '网关：WeKnora 上游不可达（前端将自动降级本地引擎）' }));
  clientReq.on('error', () => up.destroy());
  clientRes.on('close', () => up.destroy());
  clientReq.pipe(up);
}

/** 解析一个 SSE 事件块，更新旁路累积器 */
function feedBlock(block, tap) {
  const dataLines = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return;
  let payload;
  try {
    payload = JSON.parse(dataLines.join('\n'));
  } catch {
    return; // 非 JSON 事件忽略
  }
  if (payload.response_type === 'answer' && typeof payload.content === 'string') {
    tap.answerText += payload.content;
  } else if (payload.response_type === 'tool_call') {
    tap.sawToolCall = true;
  }
}

/**
 * 问答代理（POST /api/v1/knowledge-chat|agent-chat/:sid），支持打回重算。
 * @param injectedEvents 首轮预注入事件（网关引擎 tool_call/tool_result）
 * @param onComplete 流结束回调：入参 {tap, attempt}，可返回
 *   { appendEvents, followUp?: {path, bodyStr} }——followUp 存在且未超次数时，
 *   以新请求体向同一会话重发（打回给 agent 重答），事件继续写入同一客户端流。
 */
export function proxyQa({ clientRes, target, path, bodyStr, injectedEvents, onComplete }) {
  const MAX_ATTEMPTS = 2; // 最多打回重算 1 次
  let attempts = 0;
  const run = (currentPath, currentBody, currentInjected) => {
    attempts += 1;
    const up = http.request(upstreamOptions(target, 'POST', currentPath, { 'Content-Type': 'application/json', Accept: 'text/event-stream' }), (upRes) => {
      const ct = String(upRes.headers['content-type'] ?? '');
      if (!ct.includes('text/event-stream')) {
        // 上游异常（401/500 JSON 等）：原样转发，交给前端既有降级链路
        const chunks = [];
        upRes.on('data', (c) => chunks.push(c));
        upRes.on('end', () => {
          if (!clientRes.headersSent) clientRes.writeHead(upRes.statusCode, upRes.headers);
          clientRes.end(Buffer.concat(chunks));
        });
        return;
      }
      if (!clientRes.headersSent) {
        clientRes.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
      }
      for (const ev of currentInjected) clientRes.write(ev);

      const tap = { answerText: '', sawToolCall: false, leftover: '' };
      const dec = new TextDecoder('utf-8');
      const feed = (raw) => {
        tap.leftover += raw;
        let idx;
        while ((idx = tap.leftover.indexOf('\n\n')) !== -1) {
          const block = tap.leftover.slice(0, idx);
          tap.leftover = tap.leftover.slice(idx + 2);
          feedBlock(block, tap);
        }
      };
      upRes.on('data', (c) => {
        const s = dec.decode(c, { stream: true });
        feed(s);
        clientRes.write(s);
      });
      upRes.on('end', async () => {
        feed(dec.decode());
        if (tap.leftover.trim()) feedBlock(tap.leftover, tap);
        let result = { appendEvents: [] };
        try {
          result = (await onComplete({ tap, attempt: attempts })) ?? result;
        } catch (err) {
          console.error('[gateway] 对账失败（不影响已转发内容）', err);
        }
        for (const ev of result.appendEvents ?? []) clientRes.write(ev);
        if (result.followUp && attempts < MAX_ATTEMPTS) {
          run(result.followUp.path, result.followUp.bodyStr, []);
          return; // 客户端流由下一次尝试收尾
        }
        clientRes.end();
      });
    });
    up.on('error', (err) => {
      console.error(`[gateway] 上游错误（第 ${attempts} 次）`, err.message);
      if (!clientRes.headersSent) sendJson(clientRes, 502, { error: '网关：WeKnora 上游不可达（前端将自动降级本地引擎）' });
      else clientRes.end();
    });
    up.setTimeout(120000, () => up.destroy(new Error('upstream timeout')));
    clientRes.on('close', () => up.destroy());
    up.end(currentBody);
  };
  run(path, bodyStr, injectedEvents);
}
