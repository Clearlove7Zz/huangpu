# AI 问答页 Orbs 风格重设计实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有权限、RAG、会话和引用能力的前提下，将 AI 问答页重做为浅色 Orbs 风格的极简沉浸式工作台，并接入 WeKnora 临时附件。

**Architecture:** 将 WeKnora 临时附件能力封装在 `rag.ts`，由 `chat-service.ts` 负责把智能体、文件夹和附件选项组合到一次问答请求。`AiAssistant.tsx` 负责页面状态和交互，展示层拆出状态核心、选择器、附件预览和输入工作台，避免继续扩大单一页面中的视觉逻辑。RAG SSE 协议保持不变，只替换进度展示。

**Tech Stack:** React 19、TypeScript 6、Ant Design 6、Vite 8、现有 WeKnora REST/SSE API、CSS 动效。

## Global Constraints

- 页面继续使用 Codex 浅色主题，不引入 AI 页独立深色主题。
- 前端将 WeKnora knowledge base 统一称为“文件夹”。
- 只展示当前角色允许的智能体和知识库，默认选择权限内全部知识库。
- 附件只作为当前会话上下文，不自动写入永久知识库。
- 不把 `File` 对象写入 localStorage，只保存附件摘要。
- 所有动效支持 `prefers-reduced-motion: reduce`。
- 必须通过 `npx tsc --noEmit` 和 `npm run build`。
- 当前目录不是 Git 仓库，不执行 commit；每个任务用编译或运行验证作为检查点。

---

### Task 1: 封装 WeKnora 临时附件服务

**Files:**
- Modify: `src/services/rag.ts`
- Modify: `src/services/chat-service.ts`
- Create: `src/services/attachment-service.ts`

**Interfaces:**
- `TemporaryAttachment`: `{ id: string; fileName: string; fileSize: number; status: 'uploaded' | 'processing' | 'ready' | 'failed'; progress?: number; error?: string }`
- `uploadTemporaryAttachment(sessionId: string, file: File, agentId?: string, onProgress?: (percent: number) => void): Promise<TemporaryAttachment>`
- `getTemporaryAttachment(sessionId: string, attachmentId: string): Promise<TemporaryAttachment>`
- `deleteTemporaryAttachment(sessionId: string, attachmentId: string): Promise<void>`
- `createRemoteSession(): Promise<string>`
- `ChatOptions`: 增加 `knowledgeBaseIds?: string[]`、`agentId?: string`、`attachmentIds?: string[]`

- [ ] **Step 1: 记录现有服务契约并确认请求地址**

确认服务层仍使用 `RAG_CONFIG.baseUrl` 和 `X-API-Key`，并将以下路径统一拼接到 `baseUrl`：

```ts
POST /sessions
POST /sessions/{sessionId}/attachments
GET /sessions/{sessionId}/attachments/{attachmentId}
DELETE /sessions/{sessionId}/attachments/{attachmentId}
```

- [ ] **Step 2: 实现附件服务**

上传使用 `FormData`，只追加 `file`、可选 `agent_id` 和 `parser_engine=auto`；不要手动设置 `multipart/form-data` 的 `Content-Type`。响应统一转换为 `TemporaryAttachment`，隐藏 WeKnora 的 `data` 包装结构。

- [ ] **Step 3: 增加远端会话创建函数**

当发送问题前需要上传附件时，先调用 `POST /sessions` 创建会话；无附件时保留 `streamKnowledgeChat` 的懒创建行为。

- [ ] **Step 4: 让流式请求携带附件 ID**

将 `attachmentIds` 写入 `knowledge-chat/{sessionId}` 请求体：

```ts
{
  query,
  knowledge_base_ids: knowledgeBaseIds,
  agent_id: agentId,
  attachment_ids: attachmentIds
}
```

只在数组非空时发送 `attachment_ids`，但知识库选择为空时必须发送空数组或显式禁用检索，不能回退到全局配置。

- [ ] **Step 5: 运行类型检查**

运行：`npx tsc --noEmit`

预期：通过；如果已有错误，记录错误文件和本任务新增错误的区别。

---

### Task 2: 建立 Orbs 风格状态核心和轻量 RAG 状态

**Files:**
- Create: `src/components/ThinkingOrb.tsx`
- Create: `src/components/AssistantStatus.tsx`
- Modify: `src/index.css`
- Remove usage: `src/components/RagPipeline.tsx` from `AiAssistant.tsx`（组件文件可暂时保留，不再使用）

**Interfaces:**
- `ThinkingOrb({ state, size, reducedMotion? })`
- `AssistantStatus({ state, label, detail?, compact? })`
- 状态集合：`idle | understanding | searching | reading | organizing | generating | done`

- [ ] **Step 1: 写状态映射表**

在 `AssistantStatus.tsx` 中固定以下中文文案：

```ts
idle: '准备回答'
understanding: '理解问题'
searching: '检索文件夹'
reading: '读取附件'
organizing: '整理证据'
generating: '生成回答'
done: '已完成'
```

- [ ] **Step 2: 实现点阵核心**

使用 CSS radial-gradient 或多个 span 点阵实现呼吸、聚拢、扩散三类状态；不引入新的 npm 依赖。`size` 支持欢迎区的大核心和输入区的小核心两种尺寸。

- [ ] **Step 3: 实现状态胶囊**

状态胶囊包含点阵核心、状态文字和可选详情，例如“检索文件夹 · 已选 3 个”。生成中使用 shimmer 或低频呼吸效果，完成后停止动画。

- [ ] **Step 4: 加入动效降级规则**

在 `@media (prefers-reduced-motion: reduce)` 下取消 transform、opacity、shimmer 动画，只保留静态点阵和文字。

- [ ] **Step 5: 运行构建检查**

运行：`npm run build`

预期：新组件可独立编译，尚未接入页面也不能引入 TypeScript 或 CSS 错误。

---

### Task 3: 拆出权限选择器和附件预览组件

**Files:**
- Create: `src/components/AgentPicker.tsx`
- Create: `src/components/KnowledgeFolderPicker.tsx`
- Create: `src/components/AttachmentPreview.tsx`
- Modify: `src/index.css`

**Interfaces:**
- `AgentPicker({ agents, value, onChange, disabled })`
- `KnowledgeFolderPicker({ folders, selectedIds, onChange, disabled })`
- `AttachmentPreview({ files, onRemove, disabled })`
- `PickerAgent`: `{ id: string; name: string; mode: string; builtin: boolean }`
- `PickerFolder`: `{ id: string; name: string }`
- `AttachmentView`: `{ localId: string; remoteId?: string; name: string; size: number; status: string; progress?: number; error?: string }`

- [ ] **Step 1: 实现智能体选择器**

使用当前 `availableAgents`，弹出层只渲染已过滤列表；显示名称、模式和当前选中状态。无可用智能体时显示禁用态，不制造默认 ID。

- [ ] **Step 2: 实现文件夹多选器**

使用 `availableKbs`，支持全选、清空和逐项勾选。按钮文案按数量变化：`全部文件夹`、`已选 2 个文件夹`、`未选择文件夹`。清空后回调 `[]`。

- [ ] **Step 3: 实现附件预览条**

每个附件显示文件类型图标、名称、大小、上传/解析状态、进度和删除按钮。失败状态显示错误，不允许伪装成可发送状态。

- [ ] **Step 4: 运行类型检查**

运行：`npx tsc --noEmit`

预期：三个组件可被页面导入，props 类型不使用 `any`。

---

### Task 4: 重做 AiAssistant 页面布局和发送状态

**Files:**
- Modify: `src/pages/AiAssistant.tsx`
- Modify: `src/services/chat-service.ts`
- Modify: `src/services/rag.ts`

**Interfaces:**
- 页面状态：`selectedAgentId`、`selectedKbIds`、`attachments`、`assistantState`
- `ChatMsg.attachments?: { id: string; name: string; size: number; status: string }[]`
- `chatWithRag(query, sessionId, callbacks, { knowledgeBaseIds, agentId, attachmentIds })`

- [ ] **Step 1: 保留现有会话和权限加载逻辑**

保留 `loadSessions`、localStorage 隔离、`listAgents`、`listKnowledgeBases`、`filterAgentsByRole`、`filterKbsByRole`；将默认知识库设置固定为当前权限内所有 ID，不再因为空数组误判而恢复旧选择。

- [ ] **Step 2: 重写空状态布局**

将欢迎语、点阵核心、在线状态和快捷问题放入居中内容区；快捷问题点击后仍调用现有 `send`。

- [ ] **Step 3: 重写消息排版**

用户消息使用低对比背景和右侧对齐；AI 消息采用文档式正文。引用仍使用标签触发右侧 Drawer，附件摘要显示在用户消息下方。

- [ ] **Step 4: 重写输入工作台**

输入区使用 `Input.TextArea`，底部工具栏依次放置：智能体选择、附件按钮、文件夹按钮、当前状态、发送/停止按钮。移动端允许工具栏换行。

- [ ] **Step 5: 接入附件生命周期**

点击附件按钮选择文件；若当前没有远端会话，先创建远端会话，再上传附件并轮询状态。发送时过滤失败附件，将可用的远端 ID 传给 `chatWithRag`。删除附件时调用远端 DELETE，并同步清理内存状态。

- [ ] **Step 6: 接入 RAG 状态**

将 `onToolCall` 映射到 `AssistantStatus`：检索工具显示 `searching`，附件事件显示 `reading`，重排显示 `organizing`；首次答案增量显示 `generating`，完成后显示 `done` 并收起状态。

- [ ] **Step 7: 更新本地降级路径**

本地答案路径不发送附件到本地规则引擎；如果 RAG 未配置且用户选择了附件，显示“当前服务未连接，附件未参与分析”，不能让用户误以为附件已被读取。

- [ ] **Step 8: 运行类型检查和构建**

运行：`npx tsc --noEmit`、`npm run build`

预期：页面完成编译，原有登录、路由、会话删除和引用抽屉不回归。

---

### Task 5: 浏览器验证桌面端、移动端和关键权限流

**Files:**
- Modify: `src/index.css`（仅在验证发现布局问题时）
- Modify: `src/pages/AiAssistant.tsx`（仅在验证发现交互问题时）

- [ ] **Step 1: 启动服务**

启动 WeKnora：`docker compose up -d`，启动前端：`npm run dev`。

- [ ] **Step 2: 验证空状态和输入区**

访问 `http://localhost:5173`，进入 AI 页面，确认欢迎区居中、快捷问题可点击、输入工作台固定在底部，页面无横向滚动。

- [ ] **Step 3: 验证权限选择**

使用低权限角色确认未授权智能体和文件夹不可见；使用高权限角色确认默认勾选全部允许的文件夹，取消选择后显示数量正确。

- [ ] **Step 4: 验证附件流程**

选择一个文档附件，确认上传进度和解析状态可见；发送问题后检查请求包含 `attachment_ids` 和所选 `knowledge_base_ids`；删除附件后确认调用 DELETE。

- [ ] **Step 5: 验证流式状态和引用**

发送问题，确认状态依次变化、回答流式出现、引用标签可打开 Drawer；服务不可用时确认本地降级提示不声称已读取附件。

- [ ] **Step 6: 验证响应式布局**

在 375x812 和桌面宽度下检查输入工具栏、选择器、附件预览和 Drawer；确认移动端没有输入区遮挡和横向滚动。

- [ ] **Step 7: 最终检查**

运行：`npx tsc --noEmit`、`npm run build`、`npm run lint`

记录任何现有 lint 问题与本次新增问题的区别。
