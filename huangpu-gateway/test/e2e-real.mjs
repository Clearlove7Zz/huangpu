/**
 * 真链路 E2E（依赖真实 WeKnora + engine-mcp + 网关在线）：
 * 商务部登录 → agent-chat（默认解析到利润推演智能体）→ 期望上游真实
 * run_scenario tool_call + 引擎数值 + 网关 pass 横幅。任一服务不在线则跳过（exit 2）。
 * 用法：node test/e2e-real.mjs
 */
const GW = process.env.GW || 'http://127.0.0.1:8090';
const query = process.argv[2] || '镇龙东F10钢筋涨价8%后利润率变成多少？';

const ok = await fetch(`${GW}/health`).then((r) => r.ok).catch(() => false);
if (!ok) {
  console.log(`[e2e] 网关 ${GW} 不在线，跳过真链路 E2E`);
  process.exit(2);
}

const login = await fetch(`${GW}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'ai', password: 'ai123' }),
});
const tok = (await login.json()).token;

const sid = (await (await fetch(`${GW}/api/v1/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': tok },
  body: JSON.stringify({ title: 'e2e-real', description: '网关真链路验证' }),
})).json())?.data?.id;
console.log('[e2e] session:', sid);

const t0 = Date.now();
const res = await fetch(`${GW}/api/v1/agent-chat/${sid}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': tok },
  body: JSON.stringify({ query, knowledge_base_ids: [
    '173b5610-d346-40d3-aee0-b0ff229a673a', // test（叙事口径）
    '14bcd117-9352-42f8-a824-b47dabbb2add', // 合同资料
    'c3ee40ea-0815-43d8-b52f-783dc9c1f5d2', // 成本月报
    'e3ddfa30-84d6-446e-a27e-d2fdf71df7e1', // 综合月报
    'da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed', // 制度文件
    'a00aaf1f-bf35-4802-9548-508263452f55', // 现金流库
  ], channel: 'web' }),
});
if (!res.ok || !res.body) {
  console.error('[e2e] agent-chat failed:', res.status, await res.text().catch(() => ''));
  process.exit(1);
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = '';
let answerText = '';
const tools = [];
let verdict = '';
let firstToolMs = 0;
let firstAnswerMs = 0;
let totalMs = 0;
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
      if (ev.response_type === 'tool_call') {
        if (!firstToolMs) firstToolMs = Date.now() - t0;
        tools.push(ev.data?.tool_name);
        console.log(`[e2e +${(firstToolMs / 1000).toFixed(1)}s] TOOL_CALL ${ev.data?.tool_name}`);
      } else if (ev.response_type === 'answer') {
        if (!firstAnswerMs) firstAnswerMs = Date.now() - t0;
        answerText += ev.content ?? '';
      } else if (ev.response_type === 'gateway_audit') {
        verdict = ev.data?.verdict ?? '';
        console.log(`[e2e +${((Date.now() - t0) / 1000).toFixed(1)}s] GATEWAY_AUDIT ${verdict}: ${ev.data?.message}`);
      } else if (ev.response_type === 'error') {
        console.log(`[e2e] ERROR: ${String(ev.content).slice(0, 200)}`);
      }
    }
  }
}
totalMs = Date.now() - t0;
const engineTools = tools.filter((n) => /run_scenario|get_baseline|get_current_status|list_presets/.test(n));
const hasEngineNum = /14\.29/.test(answerText) && /14\.77/.test(answerText);
console.log('---');
console.log(`tools: ${tools.join(',') || '(none)'}`);
console.log(`verdict: ${verdict || '(none)'}`);
console.log(`firstToolMs: ${firstToolMs}  firstAnswerMs: ${firstAnswerMs}  totalMs: ${totalMs}`);
console.log(`answer tail: ${answerText.slice(-260).replace(/\n+/g, ' ')}`);
const passOk = verdict === 'pass' && engineTools.length > 0 && hasEngineNum;
console.log(passOk ? '[e2e] PASS：引擎参与 + 数值一致 + 绿横幅' : '[e2e] FAIL');
process.exit(passOk ? 0 : 1);
