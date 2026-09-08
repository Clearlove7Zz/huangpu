# 黄埔城更数字沙盘 · demo 后端网关 + 引擎 MCP 服务

浏览器与 WeKnora 之间的收权层（PRD §7.3「后端网关」四职责）+ 独立利润推演引擎 MCP 服务（PRD 附录 D，AD-09）。
网关零 npm 依赖（Node ≥18 内置模块）；引擎 MCP 服务用官方 SDK（`engine-mcp/` 内独立 package.json，网关本体不受影响）。

## 架构

```
浏览器(huangpu-react) ──vite proxy──▶ 本网关 :8090 ──注入 X-API-Key──▶ WeKnora :8080
                                       ├─ /api/auth/login     demo 登录 → HMAC 令牌
                                       ├─ /api/v1/*           透明代理（要求网关令牌）
                                       │    └─ 问答请求：角色调度 → KB 白名单过滤
                                       │        → SSE 旁路对账（按上游引擎工具调用记录裁决）
                                       ├─ 引擎兜底出数        lib/engine.mjs（仅拒收时使用，不代调）
                                       └─ 审计                logs/gateway-audit.jsonl

Agent 模型 ──原生 tool calling──▶ WeKnora MCP client ──streamable HTTP──▶ engine-mcp :18095
                                                                     （run_scenario / get_baseline /
                                                                       get_current_status / list_presets）
```

## 启动

```bash
# 1. WeKnora（docker compose，weknora-local/）——.env 已配 NO_PROXY/SSRF_WHITELIST_EXTRA 放行 host.docker.internal
# 2. 引擎 MCP 服务（宿主机，18095）
cd engine-mcp && npm install && node server.mjs
# 3. 网关（8090）
node server.mjs            # 或 start-gateway.bat
# 4. 前端
cd ../huangpu-react && npm run dev   # vite 已把 /api/v1 与 /api/auth 代理到 :8090
```

## 四职责对照（PRD §7.3 + AD-09）

| 职责 | 实现位置 | 说明 |
|------|----------|------|
| ① 认证 + 角色调度 | `lib/auth.mjs` + `lib/rbac.mjs` + `server.mjs` handleQa | demo 登录签发 HMAC 令牌；智能体白名单（内置已全部退场不分配，自定义按名称关键词匹配，白名单外 403）；未指定则按角色默认专属智能体（商务/财务→利润研判、指挥长→决策研判、工程→工程问答、外协→外协问答、安全→安全问答）；知识库按角色显式 kbIds 矩阵过滤（chat 请求体 + 管理接口读列表 + 单库读门禁）；管理写操作仅 kbWrite 角色（商务/财务/全权限）；无利润权限的角色问利润直接 403 |
| ② 凭据持有 | `.env` + `lib/proxy.mjs` | WeKnora scoped key 只在网关 `.env`（已 gitignore），浏览器仅持网关令牌；引擎 MCP 有独立 X-API-Key 自鉴权（AD-08「MCP 自鉴权」） |
| ③ 输出对账 | `lib/reconcile.mjs` + `lib/proxy.mjs` proxyQa | **PRD §7.3 原文形态 + AD-09 已生效**："AI 回答出现数字但过程中没有引擎调用记录，判定为模型编造，拒收并退回本地引擎出数"。引擎调用记录 = 上游真实 `tool_call` 事件且工具名命中引擎工具（`run_scenario/get_baseline/get_current_status/list_presets`，含 `mcp_<service>_` 前缀）——KB 工具（如 knowledge_search）不算引擎参与。只判流程完整性，不比对数字内容；回答实时透传，网关不代调不注入 |
| ④ 审计 | `server.mjs` audit() | 登录/问答/两类拦截全部落 `logs/gateway-audit.jsonl`（一行一 JSON，含命中的引擎工具名列表） |

对账裁决（`response_type: gateway_audit` 事件回写前端）：

| verdict | 触发条件 | 前端表现 |
|---------|----------|----------|
| `pass` | 回答含数字 ∧ 上游调用了引擎工具 | 绿色"推演引擎已参与本次回答（流程对账通过）" |
| `reject` | 回答含数字 ∧ 引擎未参与（引擎 MCP 停机/模型未调工具） | 拒收提示 + 回写引擎兜底答案 |
| `na` | 非利润问题 / 未识别地块 / 回答无数字 | 无事件（仅审计） |

明确取舍：引擎参与后模型若改数，运行时不拦——内容正确性由 M1 评测脚本（20 题逐位比对）把关（引擎 MCP 绑定已生效，本项防线前置到位）；利润意图识别仍靠关键词正则（决定 403/兜底触发），误判后果仅为横幅噪音，不影响回答透传（demo 题面可控）。

## 演示脚本（验收五条）

1. **闭环（真实工具调用）**：`ai` 登录（默认已选中「利润推演智能体」）问"新联01钢筋涨8%利润率多少" → 界面出现真实的 `mcp_profit-engine_run_scenario` 工具调用卡片 → 回答 19.59% → 18.46%（引擎逐位数值）→ 绿色对账通过。
2. **越权**：`xiong` 登录问同一句 → 403"角色「安全员」无利润数据权限"；其智能体列表中也看不到「利润推演智能体」。
3. **数值铁律（真实故障演练）**：停掉 engine-mcp 进程（`Ctrl+C`）→ 同一问题模型无引擎工具可用、仅翻知识库自算 → 网关判"无引擎调用记录"拒收 → 界面红横幅 + 引擎兜底答案。（替代已删除的 `GATEWAY_ENGINE_DISABLED` 假开关，更真实。）
4. **降级**：关掉网关 → 前端自动回落本地规则引擎（既有链路，无新增代码）。
5. **留痕**：`logs/gateway-audit.jsonl` 有全部 login/deny/chat 裁决记录（chat 含 `engine_tool_called` 工具名列表）。

## 测试

```bash
node test/smoke.mjs      # mock 上游 + 网关，19 项断言（含 knowledge_search 不算引擎参与的回归锁）
node test/agent-probe.mjs [agentId] [query]   # 直连 WeKnora 观察 Agent 真实工具调用
node test/e2e-real.mjs   # 真链路（需 WeKnora + engine-mcp + 网关在线）：pass 链验证 + 首字延迟实测
```

## WeKnora 侧配置（API 完成，零代码改动）

- MCP 服务：`POST /api/v1/mcp-services` 注册 `profit-engine`（http-streamable，`http://host.docker.internal:18095/mcp`，auth api_key）；需 `SSRF_WHITELIST_EXTRA` 放行 host.docker.internal、容器 `NO_PROXY` 放行（均已在 weknora-local/.env 配置）。
- 智能体：「利润推演智能体」（`agent_mode: smart-reasoning`，绑定成本利润/项目文档 KB，`mcp_selection_mode: selected`，max_iterations 10）。
- ⚠️ demo 依赖 MCP 服务与网关两侧进程在线；WeKnora 重建库后 MCP 服务/智能体需重新注册（网关按名称关键词匹配，ID 漂移无影响）。

## demo 简化声明与生产化遗留

- 引擎算法单源：`lib/engine.mjs` 同时供网关兜底与 engine-mcp 使用；前端本地引擎 `decision-engine.ts`、沙盘 `decision-engine.js` 为同步拷贝（头注有同步声明）。
- `GATEWAY_ENGINE_DISABLED` 假开关已删除——拒收路径由真实引擎停机触发。
- 无 HTTPS / 数据库 / 限流；令牌为 HMAC 签名（无刷新机制，12h 过期）。
- 引擎数据 `lib/engine-data.mjs` 与 `huangpu-react/src/data` 同源复制（头注有同步声明），接真实台账时整体替换。
- 审计为本地 JSONL，生产需入库（PRD §7.3 审计设计）。
- 权限单一事实源在网关 `lib/rbac.mjs`（登录/取 me 整包 scope 下发）；前端 `src/config/rbac.ts` 仅保留类型与离线兜底，过滤函数已 scope 优先。2026-09-08 起知识库授权为显式 kbIds 矩阵（非库名关键词）、页面可见性为 scope.pages、库管理权为 kbWrite、内置智能体（快速问答为 kb all 全库检索）不分配给任何角色。
- 阶段 B 待办：引擎 Python FastMCP 移植（PRD M1.1 正式交付）+ 五情景逐位校验脚本，完成后 WeKnora 里换 MCP 注册 URL 即切换。
