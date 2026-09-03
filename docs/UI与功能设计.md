# 黄埔城更数字沙盘 · UI 与功能设计

| 版本 | v1 ｜ 日期 | 2026-09-01 ｜ 前端基线 | huangpu-react（React 19 + antd 6.6.0，橙色主题）｜ 配套 | 《系统架构-后端》|
|---|---|---|---|---|---|

**口径说明**：页面结构、模块内容、交互均按 huangpu-react 现状源码整理（附文件路径），区分【现状】与【目标】——"目标数据源"列标注 mock → 真实接口的升级路径。整体换肤已被两次否决，本文不涉及视觉重构。

## 1. 页面信息架构

【现状】单页应用，路由唯一来源 `src/App.tsx`（L35-71），登录后落地 `/dashboard`。侧边栏一级菜单、无二级，按四个分组组织（`src/layouts/AppLayout.tsx` L40-83）；菜单按角色 `user.nav` 过滤，AI 问答所有角色可见（`src/auth.tsx` L32-34）。

```mermaid
flowchart LR
    Login["登录页 /login"] --> Main["主框架<br/>侧边栏四分组 + 顶栏"]

    Main --> A1["AI 智能问答 /ai"]

    Main --> S1["多项目总览 /dashboard<br/>（首页）"]
    Main --> S2["单项目详情 /project"]
    Main --> S3["一体化决策推演 /decision-system"]

    Main --> B["业务系统（12 页）<br/>施工进度管控 · 设计管控 · 文档管理<br/>工作管理 · 成本测算子系统 · 物资消耗管控<br/>供应商库 · 外协协调 · 动态现金流<br/>风险管理系统 · 安全日志AI巡检 · 报表中心"]

    Main --> Y1["数据同步日志 /sync"]

    classDef plain fill:#ffffff,stroke:#8a8a8a,color:#000000
    class Login,Main,A1,S1,S2,S3,B,Y1 plain
```

页面访问控制三层：未登录跳 `/login`（`RequireAuth`）；页面 key 不在角色 `user.nav` 内跳回 `/dashboard`（前端拦截）；真实的知识库/智能体/利润权限拦截在后端网关（见《系统架构-后端》§4.3）。

## 2. 首页（多项目总览 /dashboard）模块设计

【现状】首页 = 工作台，`src/pages/Dashboard.tsx`，数据全部来自写死 mock（`src/data/mock-data.ts`），无接口调用。模块自上而下按渲染顺序排列（L219-456），支持"看板自定义"隐藏模块（配置存 localStorage）。

页面模块结构图（左右树：连线表示"页面—模块"的包含关系，非流程；各模块完整内容见下方逐模块定义表）：

```mermaid
flowchart LR
    HOME["首页 · 多项目总览"]
    HOME --- HDR["页头工具<br/>导出报表 ｜ 看板自定义"]
    HOME --- M1["① 核心指标 4 卡<br/>在管地块 · 累计产值<br/>风险总数 · 实际利润率均值"]
    HOME --- M2["② 近期重点关注<br/>红线 / 滞后 / 风险 / 回款"]
    HOME --- M3["③ 周期数据变化<br/>日周月季年 · 按部门导出"]
    HOME --- M4["④ 四地块每周排名<br/>Table · 维度切换"]
    HOME --- M5["⑤ 进度产值图<br/>计划/实物量/计量"]
    HOME --- M6["⑥ 项目列表卡片<br/>点击下钻单项目详情"]
    HOME --- M7["⑦ 部门动态<br/>动态列表 + 关注事项"]

    classDef plain fill:#ffffff,stroke:#8a8a8a,color:#000000
    class HOME,HDR,M1,M2,M3,M4,M5,M6,M7 plain
```

逐模块定义——每个模块里面放什么：

| # | 模块 | 里面放什么 | 交互 | 数据现状 → 目标 |
|---|---|---|---|---|
| ① | 核心指标卡 ×4 | 在管地块数、累计产值、风险总数、实际利润率均值 | 无 | mock `projects` → 地块台账接口 |
| ② | 近期重点关注 | 四类异常标签列表：跌破红线、进度滞后、红色风险、回款率异常，标注所属地块 | 无（由指标派生） | mock 派生 → 引擎挣值预警（SPI/CPI/VAC 超阈值） |
| ③ | 周期数据变化 | 日/周/月/季/年粒度切换 + 该粒度下的指标小卡 | 粒度切换；按部门导出 CSV（真实可用） | mock `periodReports` → 台账快照接口 |
| ④ | 四地块每周排名 | 排名 Table，维度 Segmented 切换 | 切换对比维度 | mock `weeklyRanking` → 台账 |
| ⑤ | 进度产值图 | 计划产值/实物量/计量三系列柱状图 | 无 | mock `outputValue` → 产值台账 |
| ⑥ | 项目列表卡片 | 四地块卡片（新联01 等），点击下钻 | 点击进单项目详情 | mock → 台账；下钻跳转待修（见 §5） |
| ⑦ | 部门动态 | 各部门动态列表 + 关注事项 | 无 | mock `periodReports.byDept` → 工作管理 |
| 页头 | 工具按钮 | 导出报表（前端生成 CSV，真实）、看板自定义（模块显隐开关，localStorage 持久化） | — | — |

首页**不设**全局 AI 浮窗：AI 入口收敛为侧边栏"/ai + 推演页内嵌面板"两处。理由：前端无全局项目/地块状态（见 §4），浮窗自动携带上下文需天级改造且收益仅省几个字，与用户直接进 /ai 提问无差别——该功能已决策砍掉。

## 3. 业务页面功能设计

### 3.1 AI 智能问答 /ai（系统核心页）

`src/pages/AiAssistant.tsx`。三栏结构：左侧会话栏、中部消息区、底部输入区。

**左侧会话栏**：新建/删除/切换会话；按用户名 localStorage 持久化（`hp-ai-sessions-<用户名>`）；切换会话时从服务端回放历史消息，未完成的消息自动续流。

**消息区**——每条 AI 回答的组成元素：

| 元素 | 内容 | 实现位置 |
|---|---|---|
| Markdown 渲染 | GFM / KaTeX 公式 / highlight.js 代码高亮 / Mermaid 图（与 WeKnora 渲染对齐） | `components/MarkdownView.tsx` |
| 思考过程时间轴 | thinking 多轮 + tool_call/tool_result 配对展示 | `components/ThinkingPanel.tsx` |
| 引用溯源 chips | 点击开 Drawer 查看来源文档与片段 | AiAssistant L680、L709-711 |
| 来源徽章 | "RAG 在线回答 / 本地演示引擎" | L661 |
| 对账裁决横幅 | 网关 gateway_audit=reject 时显示，并自动追加引擎兜底答案 | L409-415、L662 |
| 断线续流 | 流中断后"继续生成"（continue-stream 接口） | L539-567 |
| 重新生成 | 空回答时可用 | L488-536 |
| Artifact 产物 | 产物列表与下载 | `services/artifact-service.ts` |

**输入区**：智能体选择（AgentPicker，按角色过滤）、附件上传（≤5 个、单个 20MB，上传后轮询解析状态）、知识库文件夹勾选（KnowledgeFolderPicker）、发送/停止生成（abort SSE + 通知后端 stop）。欢迎页提供 6 个快捷问题按钮。

**网络行为**【现状】：SSE 手工解析 8 类事件（answer/references/thinking/tool_call/tool_result/gateway_audit/complete/stop，`src/services/rag.ts` L306-412）；90 秒空闲看门狗（非总时长）；统一入口 `chatWithRag` 远端优先，RAG 未就绪或流失败时降级本地引擎（`chat-service.ts` L71-141）。

### 3.2 单项目详情 /project

`src/pages/ProjectDetail.tsx`。顶部项目 Select + "可编辑"开关；KPI 4 卡；以下 8 个 Tab（数据全 mock）：

| Tab | 内容 |
|---|---|
| 证照办理表 | 证照清单 |
| 施工计划与进度 | 设计进度表 + 里程碑 Timeline |
| 安全巡检与形象进度 | 巡检表 + Jarvis BIM iframe（外链）+ 航拍图分组（AI 标注、对比/上传按钮为演示假提示） |
| 风险管控 | 工程/经济/设计三列卡片 |
| 动态现金流 | 只读嵌入摘要 |
| 成本管控 | 三值对比表、成本构成条、超支 Top、结余项、物资预警表、分包付款台账 |
| 项目大事记 | 大事记列表（导出为假提示） |
| 产值与荣誉 | ECharts 饼图 + 创奖表 |

### 3.3 一体化决策推演 /decision-system

`src/pages/DecisionSystem.tsx`。推演类型 Segmented（整体/进度/成本）；红线/临界 Alert；**6 个扰动因子 Slider**（可重命名、改权重）；推演结果卡（利润率/进度/现金流 baseline→simulated）；六维雷达 + 维度柱图；快捷情景按钮（可重命名）；当前状态诊断；**AI 研判报告面板**——点击"解析情景并生成研判"调 `chatWithRag`，把本地引擎算出的数值注入 prompt、流式输出研判；失败时降级本地打字机输出。

引擎现状：前端独立实现 `decision-engine.ts`（演示脚手架）；目标：改调后端引擎 MCP `run_scenario`（见《系统架构-后端》§4.1、§4.4），保证与对话取数同一份算法。

### 3.4 其余业务页（12 页）

| 页面 | 核心模块 | 数据现状 |
|---|---|---|
| 施工进度管控 | 证照办理 / 计划与进度（里程碑 + **甘特图** + WBS + 设计出图进度）/ 产值计划与进度（三口径卡 + 月度图 + 产值明细表）/ 安全巡检与形象进度 | mock；Excel 导入导出为假按钮 |
| 设计管控 | 地块+项目双选择、4 统计卡、五阶段卡片、设计变更台账、各项目偏差率对比图 | mock |
| 文档管理 | **真实接口页**：左侧知识库树（增删改）+ 右侧文件表（解析状态/预览/移动/删除）+ 上传 + "管理知识库"外链 WeKnora 后台 | RAG 未连接时降级为演示表 |
| 工作管理 | 日/周/月/季汇报 4 表 + 通知单 + 规章制度 | mock；按钮多为演示 |
| 成本测算子系统 | 5 Tab：工程审核对比（**分部分项清单可编辑审核量价并自动重算**——真实计算）、三算对比（目标 vs 实际利润率图）、实际成本清单（分包/材料/中标三选一）、成本测算汇总、价格指标库 | mock 底表 + 前端真重算 |
| 物资消耗管控 | 4 指标卡 + 预算/采购/消耗对比（偏差列计算）+ 消耗趋势图 | mock；导出预警报告为假 |
| 供应商库 | 专业劳务 + 材料设备两张大表、搜索过滤、可编辑开关（默认开） | mock |
| 外协协调 | @提醒输入区 + 协调事项 Table | mock；@不落库 |
| 动态现金流 | 月度明细（可编辑开关）+ 6 月临界预警 Alert + 实际 vs 预测折线（临界 markLine）+ 敏感性分析 + 支出结构堆叠柱 + 分项目表 | mock |
| 风险管理系统 | 4 统计卡 + 红黄蓝过滤 + 项目风险分布条形 | mock |
| 安全日志 AI巡检 | **真实 AI 页**：直连本地 FastAPI + YOLOv8 PPE（:8765）——健康检测提示、拖拽传图、识别结果（标注图/人数/隐患数/隐患记录）、写入隐患 + 整改登记、巡检历史 | 真服务 |
| 报表中心 | 分类切换 + 报表 Table | mock；导出/解读为假 |

### 3.5 登录 /login

账号密码 + 短信验证码（演示写死 888888）+ 演示身份下拉（7 组网关账号）；提交走网关 `POST /api/auth/login`，网关不可用回退前端 mock 登录（演示容错）。

### 3.6 数据现状总原则

除 AI 问答、文档管理、安全巡检、登录外，页面数据全部来自 `src/data/` 写死 mock（`mock-data.ts` 1067 行、`cost-data.ts`、`suppliers-data.ts`）。**demo 数据不是业务事实**：字段、表名、数值口径不得当作系统 schema 依据，目标数据源按各页"数据现状 → 目标"列升级为台账接口 + 引擎 + 知识库。

## 4. AI 能力的页面呈现

**入口两处**：侧边栏"AI 智能问答"（所有角色可见）；决策推演页内嵌"AI 研判报告"面板（含"在 AI 智能问答中深入提问"跳转）。

**地块上下文策略**：不做前端自动注入。源码事实：react 无全局项目状态（仅 `AuthContext`，每页各自 `useState(projectId)` 默认取第一个地块）。用户在问题里自然语言携带地块名（"新联01利润率多少"），检索过滤由智能体解析 + 元数据管道实现。

**可信呈现四件套**（AI 回答的每个数字都可核对出处）：引用溯源 chips + Drawer、来源徽章、网关对账裁决横幅、思考过程时间轴。

利润问答前端链路：

```mermaid
%%{init: {"theme":"neutral","themeVariables":{"actorBkg":"#ffffff","actorTextColor":"#000000","actorBorder":"#8a8a8a","actorLineColor":"#595959","noteBkgColor":"#ffffff","noteTextColor":"#000000","noteBorderColor":"#8a8a8a","signalColor":"#333333","signalTextColor":"#000000","activationBkgColor":"#ffffff","activationBorderColor":"#8a8a8a","labelBoxBkgColor":"#ffffff","labelBoxBorderColor":"#8a8a8a","labelTextColor":"#000000","loopTextColor":"#000000"}}}%%
sequenceDiagram
    participant U as 用户
    participant P as AI 问答页
    participant G as 网关 8090
    participant W as WeKnora

    U->>P: 输入"新联01 利润率多少"
    P->>G: SSE /api/v1/agent-chat（HMAC 令牌 + 智能体/知识库选择）
    G->>W: RBAC 校验通过后代理（注入 X-API-Key）
    W-->>P: 流式事件 answer/thinking/tool_call/references
    P->>P: 流式渲染 Markdown + 引用 chips + 思考时间轴
    G->>G: 流结束后对账：利润问题+含数字+无引擎 tool_call = reject
    alt 裁决 reject
        G-->>P: gateway_audit 事件 + 网关用引擎重算的答案
        P->>P: 显示对账横幅 · 分隔线追加引擎答案（原回答保留）
    else pass / na
        G-->>P: gateway_audit 事件（仅横幅状态提示）
    end
    P-->>U: 流式输出完成
```

## 5. 全局状态与异常流

**全局状态**【现状】：仅 `AuthContext`（用户/登录态，`src/auth.tsx` L27）；项目选择为页面级状态，无全局地块上下文。localStorage 清单：

| key | 内容 |
|---|---|
| `hp-role` | 当前演示角色 |
| `hp-gateway-token` | 网关 HMAC 令牌（浏览器不持 WeKnora key） |
| `hp-ai-sessions-<用户名>` | AI 会话列表 |
| `huangpu-dashboard-modules` | 首页看板自定义配置 |

**异常态**：

| 场景 | 页面呈现 | 位置 |
|---|---|---|
| RAG 未连接 | 文档页降级为演示表；AI 页降级本地引擎，来源徽章变"本地演示引擎" | Documents L246-289、chat-service L71-141 |
| 流中断/超时 | 90 秒空闲看门狗触发 → "继续生成"断线续流 | rag.ts L52-71、L456-502 |
| 对账 reject | 横幅提示 + 自动追加引擎兜底答案 | AiAssistant L409-415 |
| 安全 AI 未就绪 | 健康检测 Alert + 启动命令提示 | SafetyLog L225-245 |
| 未登录 / 越权访问 | 跳 /login；越权页面跳 /dashboard；服务端 403 | App.tsx L23-33 + 网关 |

**现状待修清单**（演示不阻塞，列入迭代）：

1. 首页项目卡片下钻用 `window.location.hash='#/project'`——与 BrowserRouter 路由不匹配且不带项目 ID，下钻实为失效跳转（Dashboard.tsx L407）。
2. 各页"可编辑"开关只切换输入框展示态，不持久化（ProjectDetail L148-150 等）。
3. 一批演示假按钮：Excel 导入/导出、通知单操作、报表解读、航拍 AI 对比/上传等（各页 message 假提示）。
4. 顶栏搜索框、通知/帮助按钮为装饰无操作（AppLayout L286-326）。

## 6. 范围外

- 整体换肤 / 设计系统重构：不做（历史两次回滚），保留 antd 6.6.0 + 橙色主题。
- BIM 视图：外链 iframe 展示，非本系统功能范围。
- 浮窗自动携带地块上下文：不做（已决策，理由见 §2）。
- 安全巡检改造：不做（现状已是真 AI）。
