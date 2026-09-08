// 真链路角色实测：安全员（安全问答）与指挥长（决策研判）
const GW = 'http://127.0.0.1:8090';

async function login(username, password) {
  const r = await fetch(`${GW}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.json();
}

async function ask(token, query) {
  const sidRes = await fetch(`${GW}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': token },
    body: JSON.stringify({ title: 'role-test', description: '角色实测' }),
  });
  const sid = (await sidRes.json())?.data?.id;
  const res = await fetch(`${GW}/api/v1/agent-chat/${sid}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': token },
    body: JSON.stringify({ query, channel: 'web' }),
  });
  const text = await res.text();
  const answers = [...text.matchAll(/"response_type":"answer","content":"((?:[^"\\]|\\.)*)"/g)]
    .map((m) => m[1]).join('');
  const tools = [...new Set([...text.matchAll(/"tool_name":"([^"]+)"/g)].map((m) => m[1]))];
  return { answer: answers.replace(/\\n/g, ' ').slice(0, 300), tools };
}

const xiong = await login('xiong', 'xiong123');
console.log('【安全员】', xiong.name, '/', xiong.role, '| 默认智能体:', xiong.scope.defaultAgentName);
console.log('scope.pages:', JSON.stringify(xiong.scope.pages));

console.log('\n① 安全员问库内（口径制度：红线）:');
const r1 = await ask(xiong.token, '镇龙东F10的目标利润率红线是多少？');
console.log('  工具:', r1.tools.join(',') || '(无)');
console.log('  答:', r1.answer);

console.log('\n② 安全员问库外（钢筋目标单价——在成本测算库，安全员无权限）:');
const r2 = await ask(xiong.token, '镇龙东F10的钢筋目标单价是多少？');
console.log('  工具:', r2.tools.join(',') || '(无)');
console.log('  答:', r2.answer);

const ning = await login('ning', 'ning123');
console.log('\n【指挥长】', ning.name, '/', ning.role, '| 默认智能体:', ning.scope.defaultAgentName);

console.log('\n③ 指挥长问推演（钢筋涨8%）:');
const r3 = await ask(ning.token, '镇龙东F10钢筋涨8%后利润率变成多少？');
console.log('  工具:', r3.tools.join(',') || '(无)');
console.log('  答:', r3.answer);
