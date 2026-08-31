# 黄埔城更数字沙盘 · demo 后端网关

浏览器与 WeKnora 之间的收权层，PRD §7.3「后端网关」四职责的 demo 最小闭环。
零 npm 依赖（Node ≥18 内置模块），`node server.mjs` 直接运行。

## 架构

```
浏览器(huangpu-react) ──vite proxy──▶ 本网关 :8090 ──注入 X-API-Key──▶ WeKnora :8080
                                       ├─ /api/auth/login     demo 登录 → HMAC 令牌
                                       ├─ /api/v1/*           透明代理（要求网关令牌）
                                       │    └─ 问答请求：角色调度 → KB 白名单过滤
                                       │        → 引擎代调注入 → SSE 旁路对账 → 裁决事件
                                       ├─ 内置推演引擎        decision-engine.ts 移植（lib/engine.mjs）
                                       └─ 审计                logs/gateway-audit.jsonl
```

## 四职责对照（PRD §7.3）

| 职责 | 实现位置 | 说明 |
|------|----------|------|
| ① 认证 + 角色调度 | `lib/auth.mjs` + `lib/rbac.mjs` + `server.mjs` handleQa | demo 登录签发 HMAC 令牌；智能体白名单（白名单外 403，未指定注入角色默认）；知识库按角色关键词过滤；无利润权限的角色问利润直接 403 |
| ② 凭据持有 | `.env` + `lib/proxy.mjs` | WeKnora scoped key 只在网关 `.env`（已 gitignore），浏览器仅持网关令牌，接触不到上游 key |
| ③ 输出对账 | `lib/reconcile.mjs` + `lib/proxy.mjs` proxyQa | 旁路监听回答流：利润/推演类问题先由网关代调引擎（`run_scenario` 工具事件注入流内）；流结束后，回答中的**百分数**必须逐位出自引擎结果或常量白名单（16.66/5），否则裁决见下。回答正文缓冲至对账通过才下发（打回则整段丢弃重答）——未背书数字不出现在用户界面 |
| ④ 审计 | `server.mjs` audit() | 登录/问答/两类拦截全部落 `logs/gateway-audit.jsonl`（一行一 JSON） |

对账裁决（`response_type: gateway_audit` 事件回写前端）：

| verdict | 触发条件 | 前端表现 |
|---------|----------|----------|
| `pass` | 回答百分数与引擎结果逐位一致 | 绿色"对账通过"提示 |
| `mismatch` | 引擎已参与，但出现引擎没有的百分数 | 红色"对账不一致"警示 |
| `reject` | 有百分数但引擎未参与（含 `GATEWAY_ENGINE_DISABLED=1` 时模型自算） | 拒收提示 + 回写引擎兜底答案 |
| `na` | 非利润问题 / 未识别地块 / 回答无百分数 | 无事件（仅审计） |

对账范围（demo 口径）：只强制**百分数**；"万"类数字记审计不拦截，避免知识库引用（三算对比明细等）误伤。

## 快速开始

```bash
# 1. 配置：复制 .env.example 为 .env，填入 WEKNORA_API_KEY（WeKnora WebUI → 密钥管理）
# 2. 启动 WeKnora（docker-compose）→ 启动本网关 → 启动前端
node server.mjs          # 或 start-gateway.bat
cd ../huangpu-react && npm run dev   # vite 已把 /api/v1 与 /api/auth 代理到 :8090
```

演示账号（demo 值，`lib/auth.mjs`）：

| 账号 | 密码 | 角色 | 利润权限 |
|------|------|------|----------|
| ai | ai123 | 指挥部-商务部 | 有 |
| wang | wang123 | 指挥部-财务部 | 有 |
| ning | ning123 | 股份领导/指挥长 | 有（低权限智能体） |
| cao | cao123 | 指挥部-工程技术部 | 有（低权限智能体） |
| wu | wu123 | 指挥部-外协部 | 有（低权限智能体） |
| xiong | xiong123 | 安全员 | **无（问利润 403）** |
| admin | admin123 | 全权限测试账号 | 有 |

## 演示脚本（验收五条）

1. **闭环**：`ai` 登录问"新联01钢筋涨8%利润率多少" → 界面出现"调用推演引擎 run_scenario"工具事件 → 回答数字与引擎逐位一致 → 绿色对账通过。
2. **越权**：`xiong` 登录问同一句 → 403"角色「安全员」无利润数据权限"。
3. **数值铁律**：`.env` 设 `GATEWAY_ENGINE_DISABLED=1` 重启网关 → 同一问题模型自算数字 → 网关判"编造"拒收 → 界面展示引擎兜底答案。
4. **降级**：关掉网关 → 前端自动回落本地规则引擎（既有链路，无新增代码）。
5. **留痕**：`logs/gateway-audit.jsonl` 有全部 login/deny/chat 裁决记录。

## 测试

```bash
node test/smoke.mjs   # 自起 mock 上游 + 网关，14 项断言（登录/401/403/注入/pass/mismatch/reject/KB过滤/审计）
```

## demo 简化声明与生产化遗留

- 引擎为网关**内置模块**，非独立 MCP 服务（M3 拆分：MCP 化 + WeKnora agent 挂接，届时对账工具调用来自上游 tool_call 而非网关注入）。
- 无 HTTPS / 数据库 / 限流；令牌为 HMAC 签名（无刷新机制，12h 过期）。
- 引擎数据 `lib/engine-data.mjs` 与 `huangpu-react/src/data` 同源复制（头注有同步声明），M3 接真实台账时整体替换。
- 审计为本地 JSONL，生产需入库（PRD §7.3 审计设计）。
- 角色→权限白名单在网关 `lib/rbac.mjs` 与前端 `src/config/rbac.ts` 各有一份（前者是强制源，后者仅界面过滤），两处需同步维护。
