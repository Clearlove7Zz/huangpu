# 黄埔区城建数字沙盘 · RAG 利润智能系统

面向城建项目的知识库问答与利润推演示系统：多源文档（合同/月报/制度/现金流）入库 → RAG 检索 →
利润推演引擎计算 → **网关对账**（AI 答案里的每个数字必须与引擎输出逐位一致，不符即拒收并返工）。

## 系统组成

| 组件 | 技术 | 端口 | 本仓库位置 |
|---|---|---|---|
| WeKnora（RAG 后端） | Go + gin + PostgreSQL17/pgvector + Redis + Neo4j | 80 / 8080 | 独立仓库，见下文「WeKnora 后端」 |
| 后端网关 + 利润引擎 MCP | Node ≥18，网关零依赖 | 8090 / 18095 | `huangpu-gateway/` |
| 前端（数字沙盘） | React 19 + antd 6 + Vite 8 | 5173 | `huangpu-react` 分支 |
| 静态沙盘 demo | 纯前端 | — | `huangpu-sandbox/` |

调用链：`浏览器 → 网关:8090（登录/RBAC/注入 API Key/SSE 对账）→ WeKnora:8080（RAG/Agent）→ 引擎 MCP:18095（确定性计算）`

## 仓库结构（分支布局）

- **`master`**（本分支）：文档 + 网关 + 静态沙盘 + 知识库导入脚本
  - `docs/` — 系统架构（后端）、UI 与功能设计、成本估算，及更早的 PRD 体系
  - `huangpu-gateway/` — 网关与引擎 MCP（见其目录内 README，含对账语义与测试）
  - `huangpu-sandbox/` — 手绘静态 demo
  - `kb-import/` — 知识库批量导入脚本
- **`huangpu-react`** 分支：React 前端完整源码（独立提交历史）

## WeKnora 后端

WeKnora 基于腾讯开源 [Tencent/WeKnora](https://github.com/Tencent/WeKnora)，不在本仓库内重复托管。
本地部署方式：

```bash
git clone https://github.com/Tencent/WeKnora.git weknora-local
cd weknora-local
docker compose up -d          # 前端 80 / app 8080 / docreader / postgres / redis / neo4j
```

黄埔本地适配（沙箱开关、compose 挂载、NO_PROXY、知识库编辑弹窗等）见该仓库 `HANDOVER.md` 所述条目，
涉及文件：`docker-compose.yml`、`config/`、`frontend/src/views/knowledge/KnowledgeBaseEditorModal.vue`。
当前基线：本地 main = 官方 v0.8.0（fbaff900，2026-09-09 同步，迁移 90→92）+ 2 个本地适配提交；
代码回退 tag `pre-upgrade-20260909`。
知识库语料导入用 `kb-import/` 脚本；技能（Skills）经 WeKnora「设置 → 技能目录」注册安装
（v0.8.0 起为租户技能目录，宿主 preloaded 目录挂载机制已随上游删除）。

## 快速启动（本机开发）

```bash
# 1. WeKnora（需 Docker Desktop）
cd weknora-local && docker compose up -d

# 2. 引擎 MCP + 网关
cd huangpu-gateway/engine-mcp && node server.mjs     # :18095
cd huangpu-gateway && node server.mjs                # :8090

# 3. 前端
cd huangpu-react && npm install --legacy-peer-deps && npm run dev   # :5173
```

网关或 WeKnora 未启动时，前端自动降级本地演示引擎（页面浏览/推演图表全功能可用，
AI 问答出"本地演示引擎"横幅而非 RAG 回答）。

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/系统架构-后端.md](docs/系统架构-后端.md) | 技术栈、服务拓扑、手绘 SVG 架构图、M0 实测清单 |
| [docs/UI与功能设计.md](docs/UI与功能设计.md) | 首页 8 模块、各页功能、AI 呈现与对账时序 |
| [docs/成本估算.md](docs/成本估算.md) | 生产实现 356 人天明细（v4.5）、硬件与首年运行、里程碑分期 |
| [部署文档](docs/部署.md) | 本机开发 / 目标机部署 / 局域网共享 / 常见坑 |
| [huangpu-gateway/README.md](huangpu-gateway/README.md) | 网关对账语义、接口清单、E2E 测试 |

## 数据与演示口径

仓库内所有项目、台账、金额均为**演示数据**，非业务事实；推演数值以引擎实时输出为准。
