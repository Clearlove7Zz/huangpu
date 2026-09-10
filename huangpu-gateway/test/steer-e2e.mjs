/**
 * steer（流式中追加消息）真链路验证 —— 上游 v0.8.0 #3123 在 demo 链路的落地检查。
 * 场景：
 *  S1 安全员 steer 利润类内容 → 网关 403（利润闸对 steer 同口径，不得借流式中插话绕过）
 *  S2 指挥长发起长推演，流式中 POST /steer（after）→ status=queued；
 *     本轮结束后服务端自动拉起追问轮，/messages/load 出现注入的用户行
 *  S3 指挥长 steer（inject）→ 排队消息被晋升注入运行轮，user_message_injected 事件
 *     经 SSE 旁路可见（网关 proxyQa tap 会记 response_type）
 */
const GW = 'http://127.0.0.1:8090';

async function login(username, password) {
  const r = await fetch(`${GW}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const j = await r.json();
  if (!r.ok || !j.token) throw new Error(`login ${username} failed: ${r.status}`);
  return { token: j.token };
}

async function createSession(token) {
  const r = await fetch(`${GW}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': token },
    body: JSON.stringify({ title: 'steer-e2e' }),
  });
  const j = await r.json();
  return j.data?.id ?? j.data;
}

async function main() {
  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` ｜ ${detail}` : ''}`);
    ok ? pass++ : fail++;
  };

  // —— S1 安全员 steer 利润内容 → 403 ——
  const xiong = await login('xiong', 'xiong123');
  const s1Session = await createSession(xiong.token);
  const s1 = await fetch(`${GW}/api/v1/sessions/${s1Session}/steer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': xiong.token },
    body: JSON.stringify({ query: '当前项目利润率降到多少会亏损？', channel: 'web', delivery: 'after' }),
  });
  check('S1 安全员 steer 利润类 → 403', s1.status === 403, `HTTP ${s1.status}`);

  // —— S2/S3 指挥长：长推演 + 流式中 steer ——
  const ning = await login('ning', 'ning123');
  const sid = await createSession(ning.token);
  check('S0 建会话', Boolean(sid), sid ?? '');

  // 发起一个会跑一阵的推演（agent 多轮 + 引擎调用），流式响应后台读
  const abortCtrl = new AbortController();
  const streamPromise = fetch(`${GW}/api/v1/agent-chat/${sid}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': ning.token },
    body: JSON.stringify({
      query: '请完整推演钢筋单价上涨8%对镇龙东F10项目利润率的影响，给出基线利润率、新利润率、变化幅度与红线对比',
      channel: 'web',
      agent_enabled: true,
    }),
    signal: abortCtrl.signal,
  });
  // 等推演进多轮（引擎调用中）再排队——steer 必须落在 live run 上
  await new Promise((r) => setTimeout(r, 6000));
  const s2 = await fetch(`${GW}/api/v1/sessions/${sid}/steer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': ning.token },
    body: JSON.stringify({ query: '钢筋上涨8%的情况下，管理费还能压缩多少个点？', channel: 'web', delivery: 'after' }),
  });
  const s2j = await s2.json().catch(() => ({}));
  check('S2 流式中 steer(after) → queued', s2.status === 200 && s2j.status === 'queued', `HTTP ${s2.status} ${JSON.stringify(s2j).slice(0, 80)}`);

  // 等主推演自然结束（SSE 读取完成即结束）
  const sseText = await streamPromise.then((r) => r.text()).catch(() => '');
  check('S2b 主推演 SSE 完成', sseText.includes('response_type'), `${sseText.length} bytes`);

  // 追问轮是服务端自动拉起的：轮询消息列表确认注入的用户行出现
  let injectedRow = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const lr = await fetch(`${GW}/api/v1/messages/${sid}/load?limit=30`, { headers: { 'X-Gateway-Token': ning.token } });
    const lj = await lr.json().catch(() => ({ data: [] }));
    const rows = lj.data ?? [];
    injectedRow = rows.find((m) => m.role === 'user' && String(m.content || '').includes('管理费还能压缩'));
    if (injectedRow) break;
  }
  check('S2c 追问轮用户行落地（after 排队 → 服务端自动接续）', Boolean(injectedRow), injectedRow ? injectedRow.id : '未找到');

  // —— S3 inject 晋升路径：单独会话，推演中 steer inject + 晋升路由探测 ——
  const sid3 = await createSession(ning.token);
  const stream3 = fetch(`${GW}/api/v1/agent-chat/${sid3}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': ning.token },
    body: JSON.stringify({ query: '推演水泥价格上涨5%对镇龙东F10项目利润率的影响并完整给出对比红线的结果', channel: 'web', agent_enabled: true }),
  }).then((r) => r.text()).catch(() => '');
  // 立即 steer inject（运行轮在跑时）
  await new Promise((r) => setTimeout(r, 4000));
  const s3 = await fetch(`${GW}/api/v1/sessions/${sid3}/steer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Token': ning.token },
    body: JSON.stringify({ query: '补充：请同时给出成本绝对值的增加额', channel: 'web', delivery: 'inject' }),
  });
  const s3j = await s3.json().catch(() => ({}));
  check('S3 steer(inject) 请求被受理', s3.status === 200, `HTTP ${s3.status} ${JSON.stringify(s3j).slice(0, 80)}`);
  const s3Text = await stream3;
  const sawInjectedEvent = s3Text.includes('user_message_injected');
  // inject 在轮边界才被消费：本轮 SSE 内出现注入事件或下一轮消息列表出现该用户行都算落地
  let s3RowFound = sawInjectedEvent;
  if (!s3RowFound) {
    for (let i = 0; i < 15 && !s3RowFound; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const lr = await fetch(`${GW}/api/v1/messages/${sid3}/load?limit=30`, { headers: { 'X-Gateway-Token': ning.token } });
      const lj = await lr.json().catch(() => ({ data: [] }));
      s3RowFound = (lj.data ?? []).some((m) => m.role === 'user' && String(m.content || '').includes('成本绝对值的增加额'));
    }
  }
  check('S3b 注入落地（user_message_injected 事件或用户行持久化）', s3RowFound, sawInjectedEvent ? 'SSE 事件' : (s3RowFound ? '消息行' : '未见'));

  // 清理测试会话
  for (const s of [s1Session, sid, sid3]) {
    await fetch(`${GW}/api/v1/sessions/${s}`, { method: 'DELETE', headers: { 'X-Gateway-Token': ning.token } }).catch(() => {});
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E failed:', e);
  process.exit(1);
});
