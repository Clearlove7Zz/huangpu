/**
 * function calling 真验证：对指定 Agent 发起 agent-chat SSE，观察是否产生真实 tool_call，
 * 以及模型最终回答是否采纳引擎数值。用法：node agent-probe.mjs [agentId] [query]
 */
const API_KEY = process.env.WEKNORA_API_KEY || 'sk-sRLJhYCDXJp502v6CXAv_3ORqEsdbvW7Qnno0jeakbs';
const BASE = 'http://127.0.0.1:8080/api/v1';
const agentId = process.argv[2] || 'c241e02f-1856-41ba-acff-3422abde3cbb';
const query = process.argv[3] || '新联01钢筋涨价8%后利润率变成多少？';

const headers = { 'Content-Type': 'application/json', 'X-API-Key': API_KEY };

const created = await fetch(`${BASE}/sessions`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ title: 'probe-agent-chat', description: 'function calling 验证' }),
});
const sid = (await created.json())?.data?.id;
if (!sid) {
  console.error('create session failed:', created.status, await created.text());
  process.exit(1);
}
console.log('[probe] session:', sid);

const t0 = Date.now();
const res = await fetch(`${BASE}/agent-chat/${sid}`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ query, agent_enabled: true, agent_id: agentId, channel: 'web' }),
});
if (!res.ok || !res.body) {
  console.error('agent-chat failed:', res.status, await res.text().catch(() => ''));
  process.exit(1);
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = '';
let answerText = '';
const toolCalls = [];
let firstAnswerMs = 0;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  let idx;
  while ((idx = buf.indexOf('\n\n')) >= 0) {
    const block = buf.slice(0, idx);
    buf = buf.slice(idx + 2);
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      let ev;
      try {
        ev = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      const t = ev.response_type;
      if (t === 'tool_call') {
        const args = ev.data?.arguments ?? ev.data?.arguments_json ?? '';
        console.log(`[probe +${((Date.now() - t0) / 1000).toFixed(1)}s] TOOL_CALL: ${ev.data?.tool_name} args=${String(args).slice(0, 160)}`);
        toolCalls.push(ev.data?.tool_name);
      } else if (t === 'tool_result') {
        console.log(`[probe +${((Date.now() - t0) / 1000).toFixed(1)}s] TOOL_RESULT: ${ev.data?.tool_name} success=${ev.data?.success} out=${String(ev.data?.output ?? '').slice(0, 200).replace(/\s+/g, ' ')}`);
      } else if (t === 'answer') {
        if (!firstAnswerMs) firstAnswerMs = Date.now() - t0;
        answerText += ev.content ?? '';
      } else if (t === 'error') {
        console.log(`[probe] ERROR: ${JSON.stringify(ev).slice(0, 300)}`);
      } else if (t === 'complete') {
        console.log('[probe] complete');
      }
    }
  }
}
console.log('---');
console.log('toolCalls:', toolCalls.length ? toolCalls.join(',') : '(none)');
console.log('firstAnswerMs:', firstAnswerMs);
console.log('answer tail:', answerText.slice(-500).replace(/\n+/g, ' '));
