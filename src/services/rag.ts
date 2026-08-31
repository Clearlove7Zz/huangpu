import { RAG_CONFIG, ragReady } from '../config/rag-config';
import { gatewayHeaders } from '../config/gateway-auth';

/** WeKnora SSE 流式客户端（knowledge-chat / agent-chat） */

export interface RagReference {
  title: string;
  content: string;
}

export interface RagStreamEvents {
  onAnswerDelta?: (delta: string) => void;
  onReferences?: (refs: RagReference[]) => void;
  /** 思考增量（eventId 区分多轮；delta 为空表示该轮结束） */
  onThinkingDelta?: (eventId: string, delta: string, done: boolean, durationMs?: number) => void;
  /** 工具调用开始（toolCallId 配对后续 tool_result） */
  onToolCallStart?: (toolCallId: string, toolName: string, args: unknown) => void;
  /** 工具调用结束（成功/失败 + 输出摘要 + 耗时） */
  onToolCallEnd?: (toolCallId: string, toolName: string | undefined, success: boolean, output: string, durationMs?: number, data?: Record<string, unknown>) => void;
  /** 网关对账裁决（demo 后端网关回写；直连 WeKnora 时无此事件）
   *  pass=数字与引擎逐位一致；mismatch=出现引擎外数字；reject=有数字但引擎未参与（含兜底答案） */
  onGatewayAudit?: (audit: { verdict: 'pass' | 'mismatch' | 'reject'; message: string; mismatched?: string[]; engineAnswer?: string }) => void;
  /** 网关打回重算通知：第一轮回答对账未过被拒，正文将被清空并由第二轮回答替换（服务端会话仍留痕） */
  onRetryNotice?: (info: { attempt: number; message: string }) => void;
  /** RAG 流水线步骤（兼容旧接口：仅 tool_name） */
  onToolCall?: (toolName: string, args: unknown) => void;
  /** Agent 整轮完成（total_duration_ms / total_steps） */
  onComplete?: (info: { totalDurationMs?: number; totalSteps?: number }) => void;
  /** 服务端确认停止（response_type=stop） */
  onStop?: () => void;
  onMessageId?: (messageId: string) => void;
  onError?: (message: string) => void;
  /** 用户主动停止（abort 后触发，区别于"自然结束 onDone"，避免触发本地兜底） */
  onAbort?: () => void;
  /** 流被意外中断（空闲超时/连接断开，非用户主动停止）：
   *  后端可能仍在生成（旧版超时路径不通知后端停止），可走 continue-stream 断线续流接回 */
  onInterrupted?: (info: { sessionId: string }) => void;
  onDone?: () => void;
}

/** 当前正在进行的 RAG 请求句柄（供前端"停止生成"调用 abort 中断 SSE 流 + 通知后端停止生成） */
const currentAbortRef: { controller: AbortController | null; sessionId: string; messageId: string } = {
  controller: null,
  sessionId: '',
  messageId: '',
};

/** 当前流的空闲看门狗停止函数（abortCurrentRag 需要连看门狗一起清掉） */
let activeWatchdogStop: (() => void) | null = null;

/** 是否为用户主动停止：手动"停止生成"置位；用于把用户停止与空闲超时/断网区分开 */
let userStopRequested = false;

/**
 * 空闲看门狗：timeoutMs 内没有任何流活动（建连/任意数据块）才触发 onTimeout。
 * 替代旧版"总时长超时"——agent 深度推理经常超过 90 秒，按总时长掐会误截断长回答（PRD M2.0 缺陷）。
 */
function createIdleWatchdog(timeoutMs: number, onTimeout: () => void): { kick: () => void; stop: () => void } {
  let timer: number | null = null;
  const stop = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (activeWatchdogStop === stop) activeWatchdogStop = null;
  };
  const kick = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(onTimeout, timeoutMs);
  };
  activeWatchdogStop = stop;
  return { kick, stop };
}

/** 中断当前 RAG 流 + 通知 WeKnora 后端停止生成（前端停止生成按钮调用） */
export function abortCurrentRag(): void {
  userStopRequested = true;
  activeWatchdogStop?.();
  try {
    currentAbortRef.controller?.abort();
  } catch {
    // 忽略重复 abort 抛错
  }
  const { sessionId, messageId } = currentAbortRef;
  currentAbortRef.controller = null;
  currentAbortRef.sessionId = '';
  currentAbortRef.messageId = '';

  // 同时通知 WeKnora 后端真的停止生成（不仅关闭前端 SSE 连接）。
  // 注意：空闲超时/断网的意外中断不走这里——后端继续生成，事件留在缓存供断线续流接回。
  if (sessionId && messageId) {
    void notifyBackendStop(sessionId, messageId);
  }
}

/** 调 WeKnora 后端 stop endpoint（fire-and-forget；失败也不影响前端 abort） */
async function notifyBackendStop(sessionId: string, messageId: string): Promise<void> {
  try {
    await fetch(`${RAG_CONFIG.baseUrl}/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...gatewayHeaders() },
      body: JSON.stringify({ message_id: messageId }),
    });
  } catch {
    // 后端通知失败不影响前端 abort 行为
  }
}

interface SseEvent {
  event: string;
  data: string;
}

/** 解析 SSE 文本流：按空行切分事件块，data 多行合并 */
function parseSseChunk(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  const blocks = raw.split('\n\n');
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length) {
      events.push({ event, data: dataLines.join('\n') });
    }
  }
  return events;
}

interface ChatResponseEvent {
  response_type?: string;
  content?: string;
  done?: boolean;
  data?: unknown;
  error?: string;
  references?: unknown[];
  knowledge_references?: unknown[];
  message_id?: string;
  id?: string;
  assistant_message_id?: string;
}

function extractReferences(payload: ChatResponseEvent): RagReference[] | null {
  const raw = payload.references ?? payload.knowledge_references;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw
    .map((r) => {
      const item = r as Record<string, unknown>;
      const title = String(item.knowledge_title ?? item.knowledge_filename ?? item.title ?? '知识库引用');
      const content = String(item.content ?? item.chunk_text ?? item.text ?? '');
      const score = typeof item.score === 'number' ? item.score : null;
      return { title, content: score !== null ? `${content}（相关度 ${score.toFixed(2)}）` : content };
    })
    .filter((r) => r.title || r.content);
}

/** 删除远端会话（前端删除会话时同步清理 WeKnora 侧，避免堆积） */
export async function deleteRemoteSession(sessionId: string): Promise<void> {
  if (!ragReady() || !sessionId) return;
  try {
    await fetch(`${RAG_CONFIG.baseUrl}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: gatewayHeaders(),
    });
  } catch {
    // 远端删除失败不影响本地删除
  }
}

/**
 * 发起 RAG 流式问答（POST + SSE，WeKnora 不支持 EventSource）
 * @param query 用户问题
 * @param sessionId 会话 ID（复用历史会话；不传则创建新会话）
 * @param events 流式事件回调
 * @param override 覆盖全局配置（知识库范围 / 智能体，按角色权限动态传入）
 * @returns 会话 ID（供后续多轮复用）
 */
export async function streamKnowledgeChat(
  query: string,
  sessionId: string | null,
  events: RagStreamEvents,
  override?: {
    knowledgeBaseIds?: string[];
    agentId?: string;
    attachmentIds?: string[];
    agentEnabled?: boolean;
    skillNames?: string[];
    mcpServiceIds?: string[];
  },
): Promise<string> {
  if (!ragReady()) {
    events.onError?.('RAG 未配置（缺 API Key），已降级本地引擎');
    return sessionId ?? '';
  }

    const kbIds = override?.knowledgeBaseIds ?? RAG_CONFIG.knowledgeBaseIds;
    const agentId = override?.agentId ?? RAG_CONFIG.agentId;
    const agentEnabled = override?.agentEnabled ?? Boolean(agentId && agentId !== 'builtin-quick-answer');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...gatewayHeaders(),
  };

  let sid = sessionId ?? '';
  let streamStarted = false; // 是否已进入 SSE 消费阶段（此后断开=意外中断，可续流）
  const controller = new AbortController();
  const watchdog = createIdleWatchdog(RAG_CONFIG.idleTimeoutMs, () => controller.abort());
  watchdog.kick(); // 覆盖建会话与建连阶段
  userStopRequested = false;
  currentAbortRef.controller = controller;
  currentAbortRef.sessionId = sid;
  currentAbortRef.messageId = '';
  try {
    // 1. 无会话时创建
    if (!sid) {
      const createRes = await fetch(`${RAG_CONFIG.baseUrl}/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: '城建利润问答', description: '来自数字沙盘前端' }),
      });
      if (!createRes.ok) throw new Error(`创建会话失败 HTTP ${createRes.status}`);
      const created = (await createRes.json()) as { data?: { id?: string } };
      sid = created.data?.id ?? '';
      if (!sid) throw new Error('创建会话未返回 ID');
      currentAbortRef.sessionId = sid;
    }

    // 2. 发起流式问答
    const endpoint = agentEnabled ? 'agent-chat' : 'knowledge-chat';
    const body: Record<string, unknown> = {
      query,
      knowledge_base_ids: kbIds,
      channel: 'web',
    };
    if (agentEnabled) body.agent_enabled = true;
    if (agentId) body.agent_id = agentId;
    if (override?.attachmentIds?.length) body.attachment_ids = override.attachmentIds;
    if (override?.skillNames?.length) body.skill_names = override.skillNames;
    if (override?.mcpServiceIds?.length) body.mcp_service_ids = override.mcpServiceIds;

    const res = await fetch(`${RAG_CONFIG.baseUrl}/${endpoint}/${sid}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      throw new Error(`RAG 服务错误 HTTP ${res.status} ${errText.slice(0, 120)}`);
    }

    streamStarted = true;
    await consumeSseStream(res.body, events, watchdog.kick);

    events.onDone?.();
    return sid;
  } catch (err) {
    const byUser = userStopRequested;
    userStopRequested = false;
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    if (isAbort && byUser) {
      // 用户主动停止：仅触发 onAbort，**不**走 onDone / onError（避免被前端误判为"未拿到回答 → 降级本地"）
      events.onAbort?.();
    } else if (isAbort) {
      // 空闲超时（连接静默被判死）：后端可能仍在生成，发 onInterrupted 供前端提供"继续生成"
      events.onInterrupted?.({ sessionId: sid });
    } else if (streamStarted) {
      // 流中途网络断开（网关/上游重启、断网等）：同属意外中断，可从服务端续流；
      // 不发 onError——此时可能已有部分内容，且后端仍在生成，本地兜底/报错都不合适
      events.onInterrupted?.({ sessionId: sid });
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      events.onError?.(msg);
    }
    return sessionId ?? sid;
  } finally {
    watchdog.stop();
    currentAbortRef.controller = null;
  }
}

interface InlineRefCollector {
  refs: RagReference[];
  seen: Set<string>;
}

/** 剥离 <kb ... /> 内联引用占位符，并收集 doc 名（去重） */
function stripInlineKbTags(content: string, collector: InlineRefCollector): string {
  return content.replace(/<kb\b[^>]*?\/?>/gi, (tag) => {
    const docMatch = tag.match(/doc="([^"]*)"/);
    const doc = docMatch ? docMatch[1] : '';
    if (doc && !collector.seen.has(doc)) {
      collector.seen.add(doc);
      collector.refs.push({ title: doc, content: '知识库内联引用' });
    }
    return '';
  });
}

function handleEvent(ev: SseEvent, events: RagStreamEvents, inlineRefs: InlineRefCollector) {
  try {
    const payload = JSON.parse(ev.data) as ChatResponseEvent;
    if (payload.error) {
      events.onError?.(payload.error);
      return;
    }
    // data 载荷：thinking/tool_call/tool_result 等事件的结构化字段
    const dataPayload = (payload.data ?? null) as {
      event_id?: string;
      tool_call_id?: string;
      tool_name?: string;
      arguments?: unknown;
      success?: boolean;
      output?: string;
      error?: string;
      duration?: number;
      duration_ms?: number;
      total_duration_ms?: number;
      total_steps?: number;
      reason?: string;
      message_id?: string;
      assistant_message_id?: string;
    } | null;

    switch (payload.response_type) {
      case 'answer': {
        if (payload.content) {
          // 剥离 WeKnora 内联引用占位符 <kb doc="..." chunk_id="..." kb_id="..." />，
          // 并收集为引用（doc 名去重），避免标签原样漏给用户
          const cleaned = stripInlineKbTags(payload.content, inlineRefs);
          if (cleaned) events.onAnswerDelta?.(cleaned);
        }
        break;
      }
      case 'references': {
        const refs = extractReferences(payload);
        if (refs) events.onReferences?.(refs);
        break;
      }
      case 'error':
        events.onError?.(payload.error ?? payload.content ?? 'RAG 服务返回错误');
        break;
      case 'thinking': {
        // 多轮思考：event_id 区分轮次；done=true 表示该轮结束
        const eventId = dataPayload?.event_id || 'thinking';
        const delta = payload.content ?? '';
        const done = payload.done === true;
        if (delta || done) {
          events.onThinkingDelta?.(eventId, delta, done, dataPayload?.duration_ms ?? dataPayload?.duration);
        }
        break;
      }
      case 'tool_call': {
        const toolName = dataPayload?.tool_name ?? '';
        if (!toolName) break;
        const toolCallId = dataPayload?.tool_call_id || `${toolName}-${payload.id ?? Date.now()}`;
        events.onToolCallStart?.(toolCallId, toolName, dataPayload?.arguments);
        events.onToolCall?.(toolName, dataPayload?.arguments);
        break;
      }
      case 'tool_result': {
        const toolName = dataPayload?.tool_name;
        const toolCallId = dataPayload?.tool_call_id || toolName || '';
        const success = dataPayload?.success !== false;
        const output = String(success ? dataPayload?.output ?? payload.content ?? '' : dataPayload?.error ?? payload.content ?? '');
        events.onToolCallEnd?.(toolCallId, toolName, success, output, dataPayload?.duration_ms ?? dataPayload?.duration, dataPayload as Record<string, unknown> | undefined);
        break;
      }
      case 'gateway_audit': {
        // 网关对账裁决（huangpu-gateway 回写，流末尾追加）
        const d = (payload.data ?? {}) as { verdict?: string; message?: string; mismatched?: string[]; engine_answer?: string };
        if (d.verdict === 'pass' || d.verdict === 'mismatch' || d.verdict === 'reject') {
          events.onGatewayAudit?.({ verdict: d.verdict, message: d.message ?? '', mismatched: d.mismatched, engineAnswer: d.engine_answer });
        }
        break;
      }
      case 'gateway_retry': {
        // 网关打回重算：清空第一轮正文，第二轮回答随后替换呈现
        const d = (payload.data ?? {}) as { attempt?: number; message?: string };
        events.onRetryNotice?.({ attempt: Number(d.attempt ?? 0), message: d.message ?? '' });
        break;
      }
      case 'complete': {
        events.onComplete?.({
          totalDurationMs: dataPayload?.total_duration_ms,
          totalSteps: dataPayload?.total_steps,
        });
        break;
      }
      case 'stop': {
        events.onStop?.();
        break;
      }
      case 'session_title':
      case 'agent_query':
      case 'reflection': {
        break;
      }
      default:
        if (payload.content) events.onAnswerDelta?.(payload.content);
        break;
    }
    const eventData = payload.data as { message_id?: string; assistant_message_id?: string } | null;
    const messageId = payload.assistant_message_id ?? payload.message_id ?? eventData?.assistant_message_id ?? eventData?.message_id;
    if (messageId) {
      currentAbortRef.messageId = String(messageId);
      events.onMessageId?.(String(messageId));
    }
  } catch {
    // 非 JSON 事件忽略
  }
}

/** 读取并分发 SSE 流（knowledge-chat / agent-chat / continue-stream 共用）；每个数据块回调 onActivity 供空闲看门狗重置 */
async function consumeSseStream(body: ReadableStream<Uint8Array>, events: RagStreamEvents, onActivity?: () => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const inlineRefs: InlineRefCollector = { refs: [], seen: new Set() };

  const dispatch = (chunk: string) => {
    for (const ev of parseSseChunk(chunk)) {
      handleEvent(ev, events, inlineRefs);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onActivity?.();
    buffer += decoder.decode(value, { stream: true });

    // 按事件边界切分
    let boundary: number;
    while ((boundary = buffer.search(/\n\n/)) !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      dispatch(chunk);
    }
  }
  // 尾部残留
  if (buffer.trim()) dispatch(buffer);

  // 补充 answer 内联引用（doc 名）
  if (inlineRefs.refs.length > 0) {
    events.onReferences?.(inlineRefs.refs);
  }
}

/**
 * 断线续流：重新连接未完成消息的 SSE 流（先回放历史事件再继续推送）
 * @param sessionId 会话 ID
 * @param messageId 未完成的助手消息 ID（来自 load 接口 is_completed=false 的消息）
 * @param events 流式事件回调（与 streamKnowledgeChat 相同）
 */
export async function continueKnowledgeStream(
  sessionId: string,
  messageId: string,
  events: RagStreamEvents,
): Promise<void> {
  if (!ragReady() || !sessionId || !messageId) return;
  const headers: Record<string, string> = gatewayHeaders();

  const controller = new AbortController();
  const watchdog = createIdleWatchdog(RAG_CONFIG.idleTimeoutMs, () => controller.abort());
  watchdog.kick();
  userStopRequested = false;
  currentAbortRef.controller = controller;
  currentAbortRef.sessionId = sessionId;
  currentAbortRef.messageId = messageId;

  try {
    const res = await fetch(`${RAG_CONFIG.baseUrl}/sessions/continue-stream/${sessionId}?message_id=${encodeURIComponent(messageId)}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      // 404 = 该消息已无流事件（可能已完成），静默结束
      events.onDone?.();
      return;
    }
    await consumeSseStream(res.body, events, watchdog.kick);
    events.onDone?.();
  } catch (err) {
    const byUser = userStopRequested;
    userStopRequested = false;
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    if (isAbort && byUser) {
      events.onAbort?.();
    } else if (!byUser) {
      // 续流本身也被中断/断网：标记可再次续流；onDone 照发以免调用方 busy 卡死
      events.onInterrupted?.({ sessionId });
      events.onDone?.();
    } else {
      events.onDone?.();
    }
  } finally {
    watchdog.stop();
    currentAbortRef.controller = null;
  }
}

export interface RemoteMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  is_completed?: boolean;
  knowledge_references?: unknown[];
  agent_steps?: unknown[];
  created_at?: string;
}

/**
 * 拉取会话历史消息（服务端持久化，分页）
 * @param sessionId 会话 ID
 * @param beforeTime 上一页最早一条消息的 created_at（为空拉最近一页）
 * @param limit 每页条数（默认 20）
 */
export async function listRemoteMessages(sessionId: string, beforeTime?: string, limit = 20): Promise<RemoteMessage[]> {
  if (!ragReady() || !sessionId) return [];
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeTime) params.set('before_time', beforeTime);
  try {
    const res = await fetch(`${RAG_CONFIG.baseUrl}/messages/${sessionId}/load?${params.toString()}`, { headers: gatewayHeaders() });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: RemoteMessage[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

