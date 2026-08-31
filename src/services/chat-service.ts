import { abortCurrentRag, streamKnowledgeChat } from './rag';
import type { RagReference } from './rag';
import { ragReady, RAG_CONFIG } from '../config/rag-config';
import { generateAnswer } from '../utils/answer-engine';
import type { AiAnswer } from '../utils/answer-engine';

/** 统一问答入口：远端 RAG 优先，失败自动降级本地规则引擎 */

export interface LocalReference {
  title: string;
  detail: string;
}

export interface ChatCallbacks {
  /** 远端流式增量 */
  onDelta?: (delta: string) => void;
  /** 远端引用事件 */
  onReferences?: (refs: RagReference[]) => void;
  /** 思考增量（eventId 区分多轮；done 表示该轮结束） */
  onThinkingDelta?: (eventId: string, delta: string, done: boolean, durationMs?: number) => void;
  /** 工具调用开始（toolCallId 配对） */
  onToolCallStart?: (toolCallId: string, toolName: string, args: unknown) => void;
  /** 工具调用结束 */
  onToolCallEnd?: (toolCallId: string, toolName: string | undefined, success: boolean, output: string, durationMs?: number, data?: Record<string, unknown>) => void;
  /** RAG 流水线步骤（兼容旧接口：仅 tool_name） */
  onToolCall?: (toolName: string, args: unknown) => void;
  /** Agent 整轮完成 */
  onComplete?: (info: { totalDurationMs?: number; totalSteps?: number }) => void;
  /** 服务端确认停止 */
  onStop?: () => void;
  /** 网关对账裁决（demo 后端网关回写：pass=引擎已参与 / reject=拒收+引擎答案） */
  onGatewayAudit?: (audit: { verdict: 'pass' | 'mismatch' | 'reject'; message: string; mismatched?: string[]; engineAnswer?: string }) => void;
  onMessageId?: (messageId: string) => void;
  /** 用户主动停止（不触发本地兜底） */
  onAbort?: () => void;
  /** 流被意外中断（空闲超时/断网，非用户停止）：后端可能仍在生成，可提供"继续生成" */
  onInterrupted?: (info: { sessionId: string }) => void;
  /** 降级本地：完整答案（调用方自行做打字机效果） */
  onLocalAnswer?: (answer: AiAnswer) => void;
  /** 全部完成（自然结束或错误降级后） */
  onDone?: () => void;
}

export interface ChatOutcome {
  sessionId: string | null;
  source: 'rag' | 'local';
}

/** 中断当前 RAG 问答（前端"停止生成"按钮调用） */
export function abortCurrentChat(): void {
  abortCurrentRag();
}

export interface ChatOptions {
  /** 覆盖全局输出长度指令；传 null 表示本次不附加限制 */
  maxOutputHint?: string | null;
  /** 检索知识库范围（按角色权限传入，缺省用全局配置） */
  knowledgeBaseIds?: string[];
  /** 智能体 ID（按角色权限传入） */
  agentId?: string;
  /** 当前问题的临时附件 ID */
  attachmentIds?: string[];
  /** 是否启用 WeKnora Agent 工具调用 */
  agentEnabled?: boolean;
  /** 当前轮次允许使用的 Skill 名称 */
  skillNames?: string[];
  /** 当前轮次允许使用的 MCP 服务 ID */
  mcpServiceIds?: string[];
}

export async function chatWithRag(
  query: string,
  sessionId: string | null,
  callbacks: ChatCallbacks,
  options?: ChatOptions,
): Promise<ChatOutcome> {
  // 未配置 → 直接本地
  if (!ragReady()) {
    callbacks.onLocalAnswer?.(generateAnswer(query));
    callbacks.onDone?.();
    return { sessionId, source: 'local' };
  }

  // 附加输出长度限制指令（RAG API 无请求级 max_tokens，用 Prompt 控制篇幅）
  const hint = options?.maxOutputHint !== undefined ? options.maxOutputHint : RAG_CONFIG.maxOutputHint;
  const finalQuery = hint ? `${query}\n\n【输出要求】${hint}` : query;

  let usedRemote = false;
  let nextSessionId = sessionId;

  const returnedSession = await streamKnowledgeChat(
    finalQuery,
    sessionId,
    {
      onAnswerDelta: (delta) => {
        usedRemote = true;
        callbacks.onDelta?.(delta);
      },
      onReferences: (refs) => callbacks.onReferences?.(refs),
      onThinkingDelta: (eventId, delta, done, durationMs) => {
        usedRemote = true;
        callbacks.onThinkingDelta?.(eventId, delta, done, durationMs);
      },
      onToolCallStart: (toolCallId, toolName, args) => {
        usedRemote = true;
        callbacks.onToolCallStart?.(toolCallId, toolName, args);
      },
      onToolCallEnd: (toolCallId, toolName, success, output, durationMs, data) => callbacks.onToolCallEnd?.(toolCallId, toolName, success, output, durationMs, data),
      onToolCall: (toolName, args) => callbacks.onToolCall?.(toolName, args),
      onComplete: (info) => callbacks.onComplete?.(info),
      onStop: () => callbacks.onStop?.(),
      onGatewayAudit: (audit) => callbacks.onGatewayAudit?.(audit),
      onMessageId: (messageId) => callbacks.onMessageId?.(messageId),
      onAbort: () => callbacks.onAbort?.(),
      onInterrupted: (info) => callbacks.onInterrupted?.(info),
      onError: () => {
        // 远端失败：若已收到部分内容则保留，否则降级本地
        if (!usedRemote) {
          callbacks.onLocalAnswer?.(generateAnswer(query));
        }
      },
      onDone: () => {
        if (!usedRemote) {
          callbacks.onLocalAnswer?.(generateAnswer(query));
        }
        callbacks.onDone?.();
      },
    },
    {
      knowledgeBaseIds: options?.knowledgeBaseIds,
      agentId: options?.agentId,
      attachmentIds: options?.attachmentIds,
      agentEnabled: options?.agentEnabled,
      skillNames: options?.skillNames,
      mcpServiceIds: options?.mcpServiceIds,
    },
  );
  nextSessionId = returnedSession || nextSessionId;

  return { sessionId: nextSessionId, source: usedRemote ? 'rag' : 'local' };
}
