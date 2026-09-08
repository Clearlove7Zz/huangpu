// 安全员重试：库内问题（目标利润率红线）
const GW = 'http://127.0.0.1:8090';
const ANSWER_RE = new RegExp('"response_type":"answer","content":"((?:[^"\]|\.)*)"', 'g');
const EVENT_RE = new RegExp('"response_type":"([a-z_]+)"', 'g');

const login = await (await fetch(`${GW}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'xiong', password: 'xiong123' }) })).json();
const sidRes = await fetch(`${GW}/api/v1/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': login.token }, body: JSON.stringify({ title: 'safety-retry', description: 'retry' }) });
const sid = (await sidRes.json())?.data?.id;
const res = await fetch(`${GW}/api/v1/agent-chat/${sid}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': login.token }, body: JSON.stringify({ query: '镇龙东F10的目标利润率红线是多少？', channel: 'web' }) });
const text = await res.text();
const answers = [...text.matchAll(ANSWER_RE)].map(m => m[1]).join('');
const events = [...text.matchAll(EVENT_RE)].map(m => m[1]);
console.log('EVENTS:', events.join(' -> '));
console.log('ANSWER_LEN:', answers.length);
console.log('ANSWER:', answers.split('\n').join(' | '));
