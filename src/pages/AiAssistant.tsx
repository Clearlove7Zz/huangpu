import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Drawer, Empty, Input, Tag, message as antdMessage } from 'antd';
import { DeleteOutlined, MessageOutlined, PaperClipOutlined, PlusOutlined, SendOutlined, UserOutlined } from '@ant-design/icons';
import { abortCurrentChat, chatWithRag } from '../services/chat-service';
import { ragReady } from '../config/rag-config';
import { listAgents, listKnowledgeBases } from '../services/kb-service';
import { filterAgentsByRole, filterKbsByRole, resolveDefaultAgent } from '../config/rbac';
import { useAuth } from '../auth';
import type { ThinkingOrbState } from '../components/ThinkingOrb';
import AgentPicker from '../components/AgentPicker';
import KnowledgeFolderPicker from '../components/KnowledgeFolderPicker';
import AttachmentPreview from '../components/AttachmentPreview';
import type { AttachmentView } from '../components/AttachmentPreview';
import ArtifactList from '../components/ArtifactList';
import AssistantLogo from '../components/AssistantLogo';
import MarkdownView from '../components/MarkdownView';
import ThinkingPanel, { type TimelineEvent } from '../components/ThinkingPanel';
import type { AiAnswer } from '../utils/answer-engine';
import { continueKnowledgeStream, deleteRemoteSession, listRemoteMessages, renderInlineKbTags, steerSession, promoteSteer, removeSteer } from '../services/rag';
import type { RagReference, RagStreamEvents, RemoteMessage, SteerQueueItem } from '../services/rag';
import type { CitationInfo } from '../components/MarkdownView';
import type { ChatCallbacks } from '../services/chat-service';
import { createRemoteSession, deleteTemporaryAttachment, getTemporaryAttachment, uploadTemporaryAttachment } from '../services/attachment-service';
import { downloadArtifact, listMessageArtifacts } from '../services/artifact-service';
import type { ArtifactMeta } from '../services/artifact-service';

interface ChatMsg {
  id: number;
  role: 'user' | 'ai';
  content: string;
  references?: RagReference[];
  streaming?: boolean;
  attachments?: { id: string; name: string; size: number; status: string }[];
  source?: 'rag' | 'local';
  remoteMessageId?: string;
  artifacts?: ArtifactMeta[];
  /** 网关对账裁决（demo 后端网关回写，直连 WeKnora 时无） */
  gatewayAudit?: { verdict: 'pass' | 'mismatch' | 'reject'; message: string };
  /** 流被意外中断（空闲超时/断网，非用户主动停止）：可提供"继续生成"断线续流 */
  interrupted?: boolean;
  /** 时间轴事件流（thinking 多轮 + tool_call/result 配对，按到达顺序） */
  timeline?: TimelineEvent[];
  startedAt?: number;
  endedAt?: number;
}

interface ChatSession {
  id: number;
  title: string;
  messages: ChatMsg[];
  ragSessionId?: string;
}

const QUICK_QUESTIONS = [
  '洋田AZ-01地下室结构目前的施工进度与计划完工时间是什么？',
  '现金流库月度明细中2026年4月至6月的收支结余和产值预测变化趋势是什么？',
  '精装修工程三算对比中目标利润率与实际利润率的偏差如何解读和分析？',
  '四地块项目概览中各项目风险总数、等级分布及超阈值情况如何？',
  '均一均二AZ-01项目现金流收支明细与结余预测情况如何？',
  '工程项目材料采购三算对比表怎么做？',
];

const WELCOME_TEXT = '你好，我可以帮你查询和分析项目资料。\n\n你可以直接提问，也可以选择文件夹、智能体或上传附件。';

/** 全局唯一消息 ID（用 Date.now+Math.random 避免同会话快速发问时撞 key） */
let _msgCounter = 0;
function nextMsgId(): number {
  _msgCounter += 1;
  return Date.now() * 1000 + _msgCounter;
}

/**
 * 流式文本渲染节流器：delta 攒进 buffer，50ms 批量上屏。
 * 每个 delta 直接 setState 会让全文 markdown 管线（remark/rehype/katex/highlight）
 * 以每秒几十次的频率重跑且成本随内容增长（O(n²)），是流式卡顿的根因；
 * 节流后重解析频率 ≤20/s，与 WeKnora 的 marked 轻量同步解析观感对齐。
 * 结束时必须 flush()（done/abort/error 路径），否则最后一段内容丢失。
 */
function createStreamThrottle(onFlush: (chunk: string) => void) {
  let buffer = '';
  let timer: number | null = null;
  const flush = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (!buffer) return;
    const chunk = buffer;
    buffer = '';
    onFlush(chunk);
  };
  return {
    push(delta: string) {
      buffer += delta;
      if (timer === null) {
        timer = window.setTimeout(() => {
          timer = null;
          flush();
        }, 50);
      }
    },
    flush,
  };
}

/** 引用卡片唯一 key（对齐 WeKnora resolveReferenceHighlightKey 的匹配键思路） */
function referenceCardKey(ref: RagReference, index: number): string {
  return `${ref.knowledgeId ?? ''}|${ref.chunkId ?? ''}|${ref.title}|${index}`;
}

/** 徽章点击的定位信息是否命中此引用卡片（chunkId 优先，doc 名兜底） */
function matchHighlight(ref: RagReference, highlight?: CitationInfo): boolean {
  if (!highlight) return false;
  if (highlight.chunkId && ref.chunkId) return ref.chunkId === highlight.chunkId;
  return ref.title === highlight.doc || ref.filename === highlight.doc;
}

/** 停止生成图标：方形容器内白色实心正方形（仿 Claude/Anthropic stop 按钮风格） */
function StopGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden focusable="false">
      <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}

function loadSessions(storageKey: string): { sessions: ChatSession[]; activeId: number } {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatSession[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const migrated = parsed.map((session) => ({
          ...session,
          messages: session.messages.map((message) => {
            const content = message.content.includes('城建利润助手') ? WELCOME_TEXT : message.content;
            // 历史消息中残留的 streaming=true 一律视为已完成（避免光标残留 / 状态卡死）
            return { ...message, content, streaming: false, endedAt: message.endedAt ?? Date.now() };
          }),
        }));
        return { sessions: migrated, activeId: migrated[0].id };
      }
    }
  } catch {
    // 损坏的历史数据回退到新会话
  }
  const id = Date.now();
return { sessions: [{ id, title: '新对话', messages: [] }], activeId: id };
}

export default function AiAssistant() {
  const { user } = useAuth();
  const storageKey = `hp-ai-sessions-${user?.name ?? 'guest'}`;
  const [initial] = useState(() => loadSessions(storageKey));
  const [sessions, setSessions] = useState<ChatSession[]>(initial.sessions);
  const [activeSessionId, setActiveSessionId] = useState(initial.activeId);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [availableKbs, setAvailableKbs] = useState<{ id: string; name: string }[]>([]);
  const [availableAgents, setAvailableAgents] = useState<{ id: string; name: string; mode: string; builtin: boolean }[]>([]);
  const [attachments, setAttachments] = useState<AttachmentView[]>([]);
  const [, setAssistantState] = useState<ThinkingOrbState>('idle');
  const [refDrawer, setRefDrawer] = useState<{ open: boolean; refs: RagReference[]; highlight?: CitationInfo }>({ open: false, refs: [] });
  /** 抽屉内展开完整摘要的卡片 key（点击切换，对齐 WeKnora toggleDocumentSnippet） */
  const [expandedRefKey, setExpandedRefKey] = useState<string | null>(null);

  // 徽章/引用点击打开抽屉后：滚动定位到高亮卡片（等 Drawer portal 挂载完成）
  useEffect(() => {
    if (!refDrawer.open || !refDrawer.highlight) return;
    const timer = window.setTimeout(() => {
      document.querySelector('.reference-card--highlight')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [refDrawer.open, refDrawer.highlight]);
  const [activeRagSessionId, setActiveRagSessionId] = useState<string>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const shouldFollowRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  /** 当前活跃流的答案节流器（主路径/续流共用，结束时 flush 防丢尾段） */
  const answerThrottleRef = useRef<ReturnType<typeof createStreamThrottle> | null>(null);
  /** —— 流式中追加消息（steer，对齐上游 v0.8.0 #3123）——
   *  steerSessionIdRef：流一建立就持有会话 ID（首答生成期间即可 steer）；
   *  busyRef/steerQueueRef：busy 与排队区的镜像，供异步回调读到新值 */
  const steerSessionIdRef = useRef('');
  const busyRef = useRef(false);
  const steerQueueRef = useRef<SteerQueueItem[]>([]);
  /** 排队区可见项（流式中发送的消息；注入后从队列移除、落进消息时间线） */
  const [steerQueue, setSteerQueue] = useState<SteerQueueItem[]>([]);

  // active 解析：优先找 activeSessionId；找不到时优先回退到空会话（避免删除老
// 会话后仍渲染老消息），最后才回退到 sessions 末尾（最近创建的新会话）。
const active = sessions.find((session) => session.id === activeSessionId)
  ?? sessions.find((session) => session.messages.length === 0)
  ?? sessions[sessions.length - 1];

  /** 最新消息列表镜像（stable 引用回调里读取，避免 memo 闭包旧化） */
  const messagesRef = useRef<ChatMsg[]>([]);
  useEffect(() => {
    messagesRef.current = active?.messages ?? [];
  }, [active?.messages]);
  /** busy 与排队区状态镜像（异步回调里读 ref，避免闭包旧值） */
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { steerQueueRef.current = steerQueue; }, [steerQueue]);

  /** 引用徽章点击（stable 引用：MarkdownView memo 跳过重渲染后闭包依然正确） */
  const handleCitationClick = useCallback((msgId: number, info: CitationInfo) => {
    const msg = messagesRef.current.find((m) => m.id === msgId);
    setExpandedRefKey(null);
    setRefDrawer({ open: true, refs: msg?.references ?? [], highlight: info });
  }, []);
  const streaming = useMemo(() => active?.messages.some((message) => message.streaming), [active?.messages]);

  useEffect(() => {
    const loaded = loadSessions(`hp-ai-sessions-${user?.name ?? 'guest'}`);
    setSessions(loaded.sessions);
    setActiveSessionId(loaded.activeId);
  }, [user?.name]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(sessions)); } catch { /* localStorage 不可用时不阻断问答 */ }
  }, [sessions, storageKey]);

  useEffect(() => {
    if (!ragReady()) return;
    const scope = user?.scope;
    const role = user?.role ?? '';
    void Promise.all([listKnowledgeBases(), listAgents()]).then(([kbs, agents]) => {
      const allowedKbs = scope ? filterKbsByRole(scope, kbs) : filterKbsByRole(role, kbs);
      const allowedAgents = scope ? filterAgentsByRole(scope, agents) : filterAgentsByRole(role, agents);
      setAvailableKbs(allowedKbs);
      setAvailableAgents(allowedAgents);
      setSelectedKbIds(allowedKbs.map((kb) => kb.id));
      setSelectedAgentId(scope ? resolveDefaultAgent(scope, allowedAgents) : resolveDefaultAgent(role, allowedAgents));
    }).catch(() => undefined);
  }, [user?.role]);

useEffect(() => {
    const hasStreamingMessage = active?.messages.some((message) => message.streaming) ?? false;
    if (hasStreamingMessage && shouldFollowRef.current && conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [active?.messages]);

  // —— 服务端历史加载 + 断线续流 ——
  // RemoteMessage → ChatMsg（解析 <think> 标签、knowledge_references → 引用）
  const convertRemoteMessages = (remote: RemoteMessage[]): { messages: ChatMsg[]; incompleteId?: string } => {
    let incompleteId: string | undefined;
    const messages: ChatMsg[] = [];
    // API 按 created_at 升序返回（user 在 assistant 前）
    for (const item of remote) {
      if (item.role === 'user') {
        messages.push({ id: nextMsgId(), role: 'user', content: item.content, streaming: false });
        continue;
      }
      // assistant：剥离 <think>...</think> 前缀到 timeline
      let content = item.content ?? '';
      const timeline: TimelineEvent[] = [];
      const thinkMatch = content.match(/^<think>([\s\S]*?)(<\/think>)?/);
      if (thinkMatch) {
        timeline.push({ kind: 'thinking', id: `history-thinking-${messages.length}`, content: thinkMatch[1].trim(), pending: false, seq: 0 });
        content = content.slice(thinkMatch[0].length).trim();
      }
      // 服务端存储的是原始 <kb/> 标签：转成可点击徽章 HTML（否则 react-markdown
      // 会把标签解析为 HTML 块吞掉后续正文，表现为"刷新后回答断流"）
      content = renderInlineKbTags(content).replace(/<kb\b[^>]*$/i, '');
      const references = (item.knowledge_references ?? []).flatMap((ref): RagReference[] => {
        const r = ref as {
          knowledge_title?: string;
          knowledge_filename?: string;
          content?: string;
          chunk_id?: string;
          knowledge_id?: string;
          knowledge_base_id?: string;
          chunk_index?: number;
        };
        const title = r.knowledge_title ?? r.knowledge_filename ?? '';
        if (!title) return [];
        return [{
          title,
          content: r.content ?? '',
          chunkId: r.chunk_id || undefined,
          knowledgeId: r.knowledge_id || undefined,
          knowledgeBaseId: r.knowledge_base_id || undefined,
          chunkIndex: r.chunk_index,
          filename: r.knowledge_filename,
        }];
      });
      const completed = item.is_completed !== false;
      if (!completed) incompleteId = item.id;
      messages.push({
        id: nextMsgId(),
        role: 'ai',
        content,
        references: references.length > 0 ? references : undefined,
        streaming: false,
        timeline: timeline.length > 0 ? timeline : undefined,
        remoteMessageId: item.id,
        endedAt: Date.now(),
      });
    }
    return { messages, incompleteId };
  };

  // 从服务端拉历史 + 恢复未完成流（进入页面 / 切换会话时触发）
  const hydrateFromRemote = async (sessionIdNumber: number, ragSessionId: string) => {
    const remote = await listRemoteMessages(ragSessionId, undefined, 20);
    if (remote.length === 0) return;
    const { messages, incompleteId } = convertRemoteMessages(remote);
    setSessions((current) => current.map((session) => session.id === sessionIdNumber ? {
      ...session,
      ragSessionId,
      messages: messages,
    } : session));
    // 断线续流：存在未完成的 assistant 消息 → 接着收
    if (incompleteId) {
      const aiMsg: ChatMsg = { id: nextMsgId(), role: 'ai', content: '', streaming: true, timeline: [], startedAt: Date.now() };
      setSessions((current) => current.map((session) => session.id === sessionIdNumber ? { ...session, messages: [...session.messages, aiMsg] } : session));
      setBusyNow(true);
      const throttle = createStreamThrottle((chunk) => updateSession(sessionIdNumber, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, source: 'rag', content: message.content + chunk } : message) })));
      answerThrottleRef.current = throttle;
      void continueKnowledgeStream(ragSessionId, incompleteId, {
        onAnswerDelta: (delta) => {
          throttle.push(delta);
        },
        onThinkingDelta: (eventId, delta, done) => {
          updateSession(sessionIdNumber, (session) => ({
            ...session,
            messages: session.messages.map((message) => {
              if (message.id !== aiMsg.id) return message;
              const timeline = message.timeline ?? [];
              const existing = timeline.find((e) => e.kind === 'thinking' && e.id === eventId);
              const nextTimeline = existing
                ? timeline.map((e) => e.kind === 'thinking' && e.id === eventId ? { ...e, content: (e.content ?? '') + delta, pending: !done } : e)
                : [...timeline, { kind: 'thinking' as const, id: eventId, content: delta, pending: !done, seq: timeline.length }];
              return { ...message, timeline: nextTimeline };
            }),
          }));
        },
        onDone: () => {
          throttle.flush();
          updateSession(sessionIdNumber, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, streaming: false, endedAt: Date.now() } : message) }));
          setBusyNow(false);
        },
        onAbort: () => {
          throttle.flush();
          updateSession(sessionIdNumber, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, streaming: false, endedAt: Date.now() } : message) }));
          setBusyNow(false);
        },
      });
    }
  };

  // 进入页面 / 切换会话时：有 ragSessionId 就从服务端 hydrate
  useEffect(() => {
    if (!ragReady()) return;
    const ragSessionId = active?.ragSessionId;
    if (!ragSessionId) return;
    // 已 hydrate 过的会话跳过（用消息里是否已有 remoteMessageId 判断）
    if (active?.messages.some((message) => message.remoteMessageId)) return;
    void hydrateFromRemote(active.id, ragSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, active?.ragSessionId]);

  // 进入页面 / 切换会话时滚到最新消息
  useEffect(() => {
    shouldFollowRef.current = true;
    const element = conversationRef.current;
    if (!element) return;
    // 等 DOM 完成一帧渲染再算 scrollHeight
    const id = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [activeSessionId]);

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  if (!active) return null;

  const updateSession = (sessionId: number, updater: (session: ChatSession) => ChatSession) => {
    setSessions((current) => current.map((session) => session.id === sessionId ? updater(session) : session));
  };

  const streamLocalAnswer = (sessionId: number, aiMsg: ChatMsg, answer: AiAnswer) => {
    setAssistantState('generating');
    let index = 0;
    timerRef.current = window.setInterval(() => {
      index = Math.min(index + 4, answer.text.length);
      updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, content: answer.text.slice(0, index) } : message) }));
      if (index >= answer.text.length) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, content: answer.text, references: answer.references, streaming: false, endedAt: Date.now() } : message) }));
        setAssistantState('done');
        setBusyNow(false);
      }
    }, 14);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length || busy) return;
    if (attachments.length + files.length > 5) return;
    let remoteSessionId = activeRagSessionId ?? active.ragSessionId;
    try {
      if (!remoteSessionId) {
        remoteSessionId = await createRemoteSession();
        setActiveRagSessionId(remoteSessionId);
        updateSession(active.id, (session) => ({ ...session, ragSessionId: remoteSessionId }));
      }
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) continue;
        const localId = `${Date.now()}-${file.name}`;
        setAttachments((current) => [...current, { localId, name: file.name, size: file.size, status: 'uploading', progress: 0 }]);
        try {
          const uploaded = await uploadTemporaryAttachment(remoteSessionId, file, selectedAgentId, (progress) => setAttachments((current) => current.map((item) => item.localId === localId ? { ...item, progress } : item)));
          setAttachments((current) => current.map((item) => item.localId === localId ? { ...item, remoteId: uploaded.id, status: uploaded.status, progress: 100 } : item));
          if (uploaded.status !== 'ready' && uploaded.status !== 'failed') {
            const poll = async () => {
              try {
                const latest = await getTemporaryAttachment(remoteSessionId as string, uploaded.id);
                setAttachments((current) => current.map((item) => item.localId === localId ? { ...item, status: latest.status, error: latest.error } : item));
                if (latest.status !== 'ready' && latest.status !== 'failed') window.setTimeout(poll, 900);
              } catch (error) {
                setAttachments((current) => current.map((item) => item.localId === localId ? { ...item, status: 'failed', error: error instanceof Error ? error.message : '解析失败' } : item));
              }
            };
            void poll();
          }
        } catch (error) {
          setAttachments((current) => current.map((item) => item.localId === localId ? { ...item, status: 'failed', error: error instanceof Error ? error.message : '上传失败' } : item));
        }
      }
    } catch {
      setAttachments((current) => [...current, ...files.map((file, index) => ({ localId: `${Date.now()}-${index}`, name: file.name, size: file.size, status: 'failed', error: '无法创建远端会话' }))]);
    }
  };

  const removeAttachment = async (localId: string) => {
    const target = attachments.find((file) => file.localId === localId);
    setAttachments((current) => current.filter((file) => file.localId !== localId));
    if (target?.remoteId && (activeRagSessionId ?? active.ragSessionId)) await deleteTemporaryAttachment(activeRagSessionId ?? active.ragSessionId as string, target.remoteId).catch(() => undefined);
  };

  /**
   * 流式回调工厂：send 与"继续生成"共用同一套时间轴/增量/审计处理。
   * ragEvents 供 continue-stream 直用；chatCallbacks 供 chatWithRag（onDelta/onLocalAnswer 差异做适配）。
   */
  const makeStreamHandlers = (sessionId: number, aiMsgId: number) => {
    let timelineSeq = 0;
    let lastMessageId = '';
    // steer 注入分叉后流式目标切换到续段消息（闭包变量，flush/patch 读实时值）
    let currentAiId = aiMsgId;
    // 答案增量节流（50ms 批量上屏）：全文 markdown 重解析是流式卡顿根因
    const answerThrottle = createStreamThrottle((chunk) => updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === currentAiId ? { ...message, source: 'rag', content: message.content + chunk } : message) })));
    answerThrottleRef.current = answerThrottle;
    const patchTimeline = (fn: (events: TimelineEvent[]) => TimelineEvent[]) => {
      updateSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((message) => message.id === currentAiId ? { ...message, timeline: fn(message.timeline ?? []) } : message),
      }));
    };
    const patchMessage = (extra: Partial<ChatMsg>) => {
      updateSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((message) => message.id === currentAiId ? { ...message, ...extra } : message),
      }));
    };
    /** steer 注入落进时间线：封口当前段 → 插入用户气泡 → 开新续段接流（对齐上游 forkAfterInjectedUser） */
    const forkForInjected = (info: { steerId: string; content: string; userMessageId?: string; assistantMessageId?: string }) => {
      updateSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((m) => m.id === currentAiId ? { ...m, streaming: false, endedAt: Date.now() } : m),
      }));
      const userMsg: ChatMsg = { id: nextMsgId(), role: 'user', content: info.content, streaming: false, remoteMessageId: info.userMessageId };
      const contMsg: ChatMsg = { id: nextMsgId(), role: 'ai', content: '', streaming: true, timeline: [], startedAt: Date.now() };
      updateSession(sessionId, (session) => ({ ...session, messages: [...session.messages, userMsg, contMsg] }));
      currentAiId = contMsg.id;
      // 注入事件带服务端 steer_id；POST 在途时 chip 还挂在 clientId 上，两者都要清
      if (info.steerId) setSteerQueue((queue) => queue.filter((c) => c.steerId !== info.steerId && c.clientId !== info.steerId));
    };
    const stopTypewriter = () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    const ragEvents: RagStreamEvents = {
      onMessageId: (messageId) => {
        lastMessageId = messageId;
        patchMessage({ remoteMessageId: messageId });
      },
      onToolCallStart: (toolCallId, toolName, args) => {
        if (toolName.toLowerCase().includes('retriev') || toolName.toLowerCase().includes('search')) setAssistantState('searching');
        else if (toolName.toLowerCase().includes('rerank')) setAssistantState('organizing');
        else if (toolName.toLowerCase().includes('understand') || toolName.toLowerCase().includes('query')) setAssistantState('understanding');
        patchTimeline((events) => {
          const existing = events.find((e) => e.kind === 'tool' && e.id === toolCallId);
          if (existing) return events;
          return [...events, { kind: 'tool', id: toolCallId, name: toolName, args, pending: true, seq: ++timelineSeq }];
        });
      },
      onToolCallEnd: (toolCallId, _toolName, success, output, durationMs, data) => {
        patchTimeline((events) => events.map((event) => event.kind === 'tool' && event.id === toolCallId ? { ...event, pending: false, success, output, durationMs, data } : event));
      },
      onToolCall: (toolName) => {
        if (toolName.includes('retriev')) setAssistantState('searching');
        else if (toolName.includes('rerank')) setAssistantState('organizing');
        else if (toolName.includes('understand') || toolName.includes('query')) setAssistantState('understanding');
      },
      onThinkingDelta: (eventId, delta, done, durationMs) => {
        patchTimeline((events) => {
          const existing = events.find((e) => e.kind === 'thinking' && e.id === eventId);
          if (!existing) {
            return [...events, { kind: 'thinking', id: eventId, content: delta, pending: !done, durationMs: done ? durationMs : undefined, seq: ++timelineSeq }];
          }
          return events.map((event) => event.kind === 'thinking' && event.id === eventId
            ? { ...event, content: (event.content ?? '') + delta, pending: !done, durationMs: done ? (durationMs ?? event.durationMs) : event.durationMs }
            : event);
        });
      },
      onAnswerDelta: (delta) => {
        setAssistantState('generating');
        answerThrottle.push(delta);
      },
      onReferences: (refs) => {
        setAssistantState('organizing');
        updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsgId ? { ...message, references: refs } : message) }));
      },
      onGatewayAudit: (audit) => {
        patchMessage({ gatewayAudit: { verdict: audit.verdict, message: audit.message } });
        if (audit.verdict === 'reject' && audit.engineAnswer) {
          // 数值铁律：网关拒收了未走引擎的回答，追加确定性引擎兜底答案
          updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsgId ? { ...message, content: `${message.content}\n\n---\n\n${audit.engineAnswer}` } : message) }));
        }
      },
      onAbort: () => {
        // 用户主动停止：仅结束当前消息，不触发任何本地兜底。
        // 上游语义"停止即停止"：排队中的追加消息一并清空（服务端同样丢弃 backlog）
        stopTypewriter();
        answerThrottle.flush();
        patchMessage({ streaming: false, endedAt: Date.now() });
        setSteerQueue([]);
        setAssistantState('done');
        setBusyNow(false);
      },
      onInterrupted: () => {
        // 意外中断（空闲超时/断网）：结束当前消息并标记 interrupted，界面出现"继续生成"
        stopTypewriter();
        answerThrottle.flush();
        patchMessage({ streaming: false, endedAt: Date.now(), interrupted: true });
        setSteerQueue([]);
        setAssistantState('done');
        setBusyNow(false);
      },
      onDone: () => {
        answerThrottle.flush();
        if (!timerRef.current) {
          setAssistantState('done');
          patchMessage({ streaming: false, endedAt: Date.now() });
          finishTurn();
        }
      },
      onSessionId: (sid) => {
        steerSessionIdRef.current = sid;
        setActiveRagSessionId(sid);
        updateSession(sessionId, (session) => ({ ...session, ragSessionId: session.ragSessionId ?? sid }));
      },
      onUserInjected: forkForInjected,
    };
    /**
     * 本轮 SSE 自然结束后的收尾分流（对齐上游 flushSteerAfterTurn/attachSteerFollowUp）：
     * ① 有挂起补发的消息（new_run 时挂起）→ 作为普通发送补发，其余重新走 steer 排队；
     * ② 有服务端排队的 after 消息 → 服务端自动拉起追问轮，轮询接流续渲染（busy 保持）；
     * ③ 无 → 正常结束 busy。
     */
    const finishTurn = () => {
      const chips = steerQueueRef.current;
      const awaiting = chips.filter((c) => c.awaitingIdleSend);
      if (awaiting.length) {
        setSteerQueue((queue) => queue.filter((c) => !c.awaitingIdleSend));
        setBusyNow(false);
        sendCore(awaiting[0].content);
        for (const rest of awaiting.slice(1)) void steerSend(rest.content);
        return;
      }
      if (chips.some((c) => !c.pending && !c.awaitingIdleSend)) {
        void attachSteerFollowUp(sessionId, { setTarget: (id: number) => { currentAiId = id; }, events: ragEvents });
        return;
      }
      setBusyNow(false);
    };
    return {
      getLastMessageId: () => lastMessageId,
      getTargetId: () => currentAiId,
      ragEvents,
      chatCallbacks: {
        ...ragEvents,
        onDelta: (delta: string) => ragEvents.onAnswerDelta?.(delta),
        onLocalAnswer: (answer: AiAnswer) => {
          patchMessage({ source: 'local' });
          streamLocalAnswer(sessionId, { id: currentAiId } as ChatMsg, answer);
        },
      } as ChatCallbacks,
    };
  };

  /** busy 双写：state 供渲染、ref 同步供异步回调即时读取（steer 重试/收尾分流依赖） */
  const setBusyNow = (value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  };

  const send = (text: string) => {
    const query = text.trim();
    if (!query || busyRef.current) return;
    sendCore(query);
  };

  /** 流式中追加一条消息（steer，对齐上游 handleSteerMsg）：排队显示在输入框上方，
   *  默认 delivery=after（本轮结束作为追问）；服务端无运行中轮次（new_run）时短重试，
   *  仍无则回落为普通发送。 */
  const steerSend = async (text: string) => {
    const query = text.trim();
    if (!query) return;
    const sid = steerSessionIdRef.current;
    if (!sid) {
      antdMessage.error('会话尚未就绪，请稍后再试');
      return;
    }
    setInput('');
    const clientId = `steer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setSteerQueue((queue) => [...queue, { steerId: clientId, clientId, content: query, delivery: 'after', pending: true }]);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 900));
      const res = await steerSession(sid, query, 'after');
      if (res.success && res.status === 'queued') {
        setSteerQueue((queue) => queue.map((c) => c.clientId === clientId ? { ...c, pending: false, steerId: res.steerId ?? c.steerId } : c));
        return;
      }
      if (!res.success) break;
      // new_run = 没有运行中的轮次。busy 仍 true（当前流在收尾/追问轮即将拉起）→ 重试；
      // busy 已 false → 会话空闲，直接补发普通消息
      if (!busyRef.current) {
        setSteerQueue((queue) => queue.filter((c) => c.clientId !== clientId));
        sendCore(query);
        return;
      }
    }
    setSteerQueue((queue) => queue.filter((c) => c.clientId !== clientId));
    antdMessage.error('追加消息发送失败，请重试');
  };

  /** 排队中的 after 消息晋升为 inject：让运行中的轮次立刻读取 */
  const promoteSteerChip = async (steerId: string) => {
    const sid = steerSessionIdRef.current;
    const chip = steerQueueRef.current.find((c) => c.steerId === steerId);
    if (!chip || chip.pending || chip.promoting || chip.delivery === 'inject' || !sid) return;
    setSteerQueue((queue) => queue.map((c) => c.steerId === steerId ? { ...c, promoting: true } : c));
    const res = await promoteSteer(sid, steerId);
    if (res.status === 'already_injected') {
      setSteerQueue((queue) => queue.filter((c) => c.steerId !== steerId));
      return;
    }
    if (res.status === 'new_run') {
      if (busyRef.current) {
        setSteerQueue((queue) => queue.map((c) => c.steerId === steerId ? { ...c, promoting: false, awaitingIdleSend: true } : c));
      } else {
        setSteerQueue((queue) => queue.filter((c) => c.steerId !== steerId));
        sendCore(chip.content);
      }
      return;
    }
    setSteerQueue((queue) => queue.map((c) => c.steerId === steerId ? { ...c, promoting: false, delivery: 'inject' } : c));
  };

  /** 撤回排队消息（已注入的服务端返回 already_injected：同样移除，气泡随后由注入事件落地） */
  const removeSteerChip = async (steerId: string) => {
    const chip = steerQueueRef.current.find((c) => c.steerId === steerId);
    if (!chip || chip.pending || chip.promoting) return;
    const sid = steerSessionIdRef.current;
    if (sid) await removeSteer(sid, steerId);
    setSteerQueue((queue) => queue.filter((c) => c.steerId !== steerId));
  };

  /** after 队列的追问轮由服务端自动拉起：轮询消息列表发现新的 assistant 消息后接流续渲染
   *  （对齐上游 attachSteerFollowUp；追问轮的 query 用户行由服务端持久化，气泡以排队芯片内容落地） */
  const attachSteerFollowUp = async (sessionId: number, api: { setTarget: (id: number) => void; events: RagStreamEvents }) => {
    const ragSid = steerSessionIdRef.current;
    if (!ragSid) {
      setBusyNow(false);
      return;
    }
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      if (!busyRef.current) return; // 会话已切换或已停止，放弃接流
      const remote = await listRemoteMessages(ragSid, undefined, 20);
      const rendered = new Set(messagesRef.current.map((m) => m.remoteMessageId).filter(Boolean) as string[]);
      const freshList = [...remote].reverse().filter((m) => m.role === 'assistant' && !rendered.has(m.id));
      const fresh = freshList.find((m) => m.is_completed === false) ?? freshList[0];
      if (!fresh) continue;
      const chips = steerQueueRef.current.filter((c) => !c.pending && !c.awaitingIdleSend);
      const userMsgs: ChatMsg[] = chips.map((c) => ({ id: nextMsgId(), role: 'user', content: c.content, streaming: false }));
      setSteerQueue((queue) => queue.filter((c) => c.pending || c.awaitingIdleSend));
      if (fresh.is_completed === false) {
        const contMsg: ChatMsg = { id: nextMsgId(), role: 'ai', content: '', streaming: true, timeline: [], startedAt: Date.now() };
        updateSession(sessionId, (session) => ({ ...session, messages: [...session.messages, ...userMsgs, contMsg] }));
        api.setTarget(contMsg.id);
        setAssistantState('generating');
        void continueKnowledgeStream(ragSid, fresh.id, api.events);
      } else {
        // 追问轮已瞬时完成：直接落一条完整助手消息（剥 <think> 前缀 + 转 <kb/> 徽章）
        let content = fresh.content ?? '';
        const thinkMatch = content.match(/^<think>([\s\S]*?)(<\/think>)?/);
        if (thinkMatch) content = content.slice(thinkMatch[0].length).trim();
        content = renderInlineKbTags(content).replace(/<kb\b[^>]*$/i, '');
        const aiMsg: ChatMsg = { id: nextMsgId(), role: 'ai', content, streaming: false, remoteMessageId: fresh.id, endedAt: Date.now() };
        updateSession(sessionId, (session) => ({ ...session, messages: [...session.messages, ...userMsgs, aiMsg] }));
        setBusyNow(false);
      }
      return;
    }
    // 轮询超时兜底：不把输入区卡死
    setBusyNow(false);
  };

  const sendCore = (query: string) => {
    const sessionId = active.id;
    shouldFollowRef.current = true;
    const attachmentsForMessage = attachments.map((file) => ({ id: file.remoteId ?? file.localId, name: file.name, size: file.size, status: file.status }));
    const userMsg: ChatMsg = { id: nextMsgId(), role: 'user', content: query, attachments: attachmentsForMessage };
    const aiMsg: ChatMsg = { id: nextMsgId(), role: 'ai', content: '', streaming: true, timeline: [], startedAt: Date.now() };
    updateSession(sessionId, (session) => ({
      ...session,
      title: session.title === '新对话' ? query.slice(0, 22) + (query.length > 22 ? '…' : '') : session.title,
      messages: [...session.messages, userMsg, aiMsg],
    }));
    setInput('');
    setAttachments([]);
    setBusyNow(true);
    setAssistantState('understanding');
    const handlers = makeStreamHandlers(sessionId, aiMsg.id);
    void chatWithRag(query, activeRagSessionId ?? active.ragSessionId ?? null, handlers.chatCallbacks, {
      // 空 kbIds 时不传该字段会退化为 agent 全库？否——agent 侧已绑库（库绑定即权限），
      // 显式传空数组会被上游视为"未指定"，故此处仅在非空时传，空时依赖 agent 库绑定
      ...(selectedKbIds.length ? { knowledgeBaseIds: selectedKbIds } : {}),
      agentId: selectedAgentId || undefined,
      agentEnabled: selectedAgentId !== 'builtin-quick-answer',
      attachmentIds: attachments.filter((file) => file.remoteId && file.status !== 'failed').map((file) => file.remoteId as string),
    }).then(async (outcome) => {
      if (outcome.sessionId) {
        setActiveRagSessionId(outcome.sessionId);
        updateSession(sessionId, (session) => ({ ...session, ragSessionId: outcome.sessionId ?? undefined }));
      }
      if (outcome.source === 'rag' && outcome.sessionId && handlers.getLastMessageId()) {
        const artifacts = await listMessageArtifacts(outcome.sessionId, handlers.getLastMessageId());
        // steer 注入分叉后产物挂在最后一个流式段上（服务端同属一条 assistant 消息）
        const targetId = handlers.getTargetId();
        if (artifacts.length) updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === targetId ? { ...message, artifacts } : message) }));
      }
    });
  };

  /** 空回答重新生成：后端 LLM 失败/超时导致 0 字回答时，复用原问题重跑同一条消息 */
  const retryGeneration = (message: ChatMsg) => {
    if (busy) return;
    const sessionId = active.id;
    const msgs = active.messages;
    const idx = msgs.findIndex((item) => item.id === message.id);
    let query = '';
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        query = msgs[i].content;
        break;
      }
    }
    if (!query.trim()) return;
    shouldFollowRef.current = true;
    setBusyNow(true);
    setAssistantState('understanding');
    updateSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((item) => item.id === message.id ? {
        ...item,
        content: '',
        references: undefined,
        artifacts: undefined,
        gatewayAudit: undefined,
        interrupted: false,
        remoteMessageId: undefined,
        timeline: [],
        streaming: true,
        startedAt: Date.now(),
        endedAt: undefined,
        source: undefined,
      } : item),
    }));
    const handlers = makeStreamHandlers(sessionId, message.id);
    void chatWithRag(query, activeRagSessionId ?? active.ragSessionId ?? null, handlers.chatCallbacks, {
      // 空 kbIds 时不传该字段会退化为 agent 全库？否——agent 侧已绑库（库绑定即权限），
      // 显式传空数组会被上游视为"未指定"，故此处仅在非空时传，空时依赖 agent 库绑定
      ...(selectedKbIds.length ? { knowledgeBaseIds: selectedKbIds } : {}),
      agentId: selectedAgentId || undefined,
      agentEnabled: selectedAgentId !== 'builtin-quick-answer',
    }).then(async (outcome) => {
      if (outcome.sessionId) {
        setActiveRagSessionId(outcome.sessionId);
        updateSession(sessionId, (session) => ({ ...session, ragSessionId: outcome.sessionId ?? undefined }));
      }
      if (outcome.source === 'rag' && outcome.sessionId && handlers.getLastMessageId()) {
        const artifacts = await listMessageArtifacts(outcome.sessionId, handlers.getLastMessageId());
        if (artifacts.length) updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((item) => item.id === message.id ? { ...item, artifacts } : item) }));
      }
    });
  };

  /** 意外中断后的"继续生成"：走 continue-stream 从服务端事件缓存接回 */
  const resumeGeneration = (message: ChatMsg) => {
    const ragSessionId = activeRagSessionId ?? active.ragSessionId;
    if (!ragSessionId || !message.remoteMessageId || busy) return;
    const sessionId = active.id;
    shouldFollowRef.current = true;
    setBusyNow(true);
    setAssistantState('generating');
    updateSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((item) => item.id === message.id ? { ...item, streaming: true, interrupted: false } : item),
    }));
    const handlers = makeStreamHandlers(sessionId, message.id);
    let sawDelta = false;
    const events: RagStreamEvents = {
      ...handlers.ragEvents,
      onAnswerDelta: (delta) => {
        sawDelta = true;
        handlers.ragEvents.onAnswerDelta?.(delta);
      },
      onDone: () => {
        handlers.ragEvents.onDone?.();
        // 续流没带回任何增量（后端可能已生成完毕、流缓存已清）→ 从服务端拉最终全文补齐
        if (!sawDelta && message.remoteMessageId) {
          void syncMessageFromRemote(sessionId, ragSessionId, message.remoteMessageId, message.id);
        }
      },
    };
    void continueKnowledgeStream(ragSessionId, message.remoteMessageId, events);
  };

  /** 从服务端历史拉取该条助手消息的最终全文，比本地长则补齐（覆盖"中断后服务端已生成完"的情况） */
  const syncMessageFromRemote = async (sessionId: number, ragSessionId: string, remoteMessageId: string, localMsgId: number) => {
    const remote = await listRemoteMessages(ragSessionId, undefined, 20);
    const hit = remote.find((item) => item.id === remoteMessageId && item.role === 'assistant');
    if (!hit) return;
    let content = hit.content ?? '';
    const thinkMatch = content.match(/^<think>([\s\S]*?)(<\/think>)?/);
    if (thinkMatch) content = content.slice(thinkMatch[0].length).trim();
    updateSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((item) => {
        if (item.id !== localMsgId || content.length <= item.content.length) return item;
        return { ...item, content, streaming: false, interrupted: false };
      }),
    }));
  };

  /** 用户点击"停止生成"：中断 RAG SSE 流 + 停掉本地打字机 + 立即结束当前消息。
   *  上游语义"停止即停止"：排队中的追加消息一并清空（服务端丢弃 backlog，注入已生效的保留在时间线） */
  const stopGeneration = () => {
    // 1. 中断后端 SSE（abort fetch）
    abortCurrentChat();
    // 2. 停掉本地 answer-engine 打字机
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // 3. 找到当前正在流式输出的 AI 消息，立即标为结束（光标消失、徽章出现）
    setSessions((current) => current.map((session) => session.id === activeSessionId ? {
      ...session,
      messages: session.messages.map((message) => message.streaming ? { ...message, streaming: false, endedAt: Date.now() } : message),
    } : session));
    setSteerQueue([]);
    setAssistantState('done');
    setBusyNow(false);
  };

  const newSession = () => {
    const id = Date.now();
    setSessions((current) => [...current, { id, title: '新对话', messages: [] }]);
    setActiveSessionId(id);
    shouldFollowRef.current = true;
    setActiveRagSessionId(undefined);
    setAttachments([]);
    setAssistantState('idle');
    steerSessionIdRef.current = '';
    setSteerQueue([]);
  };

const deleteSession = (session: ChatSession) => {
  if (session.ragSessionId) void deleteRemoteSession(session.ragSessionId);
  const remaining = sessions.filter((item) => item.id !== session.id);
  if (remaining.length === 0) {
    const id = Date.now();
    setSessions([{ id, title: '新对话', messages: [] }]);
    setActiveSessionId(id);
    setActiveRagSessionId(undefined);
    setAttachments([]);
    setAssistantState('idle');
    return;
  }
  setSessions(remaining);
  if (session.id === activeSessionId) setActiveSessionId(remaining[0].id);
};

  return (
    <div className="ai-workspace">
      <aside className="ai-session-rail">
        <div className="ai-rail-head"><span>对话</span><Button type="text" size="small" icon={<PlusOutlined />} aria-label="新建会话" onClick={newSession} /></div>
        <div className="ai-session-list">
          <div className="ai-session-section-label">最近对话</div>
          {sessions.map((session) => <div className={`ai-session-item ${session.id === activeSessionId ? 'is-active' : ''}`} key={session.id} onClick={() => { shouldFollowRef.current = true; setActiveSessionId(session.id); setActiveRagSessionId(session.ragSessionId); steerSessionIdRef.current = session.ragSessionId ?? ''; setSteerQueue([]); }}>
            <MessageOutlined className="ai-session-icon" /><span>{session.title}</span><Button type="text" size="small" icon={<DeleteOutlined />} aria-label="删除会话" onClick={(event) => { event.stopPropagation(); deleteSession(session); }} />
          </div>)}
        </div>
      </aside>

      <main className="ai-main-panel">
        <section
          ref={conversationRef}
          onScroll={() => {
            const element = conversationRef.current;
            if (!element) return;
            shouldFollowRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
          }}
className={`ai-conversation ${active.messages.length === 0 ? 'is-empty' : ''}`}
        >
          {active.messages.length === 0 && !streaming && <div className="ai-welcome"><h1>你好，想了解什么？</h1><p>从项目资料中查找信息，或直接上传文件进行分析</p><div className="ai-quick-grid">{QUICK_QUESTIONS.map((question) => <button type="button" key={question} disabled={busy} onClick={() => send(question)}>{question}</button>)}</div></div>}
          {active.messages.length > 0 && active.messages.map((message) => <div className={`ai-message ai-message-${message.role}`} key={message.id}>
            <div className="ai-message-avatar">{message.role === 'ai' ? <AssistantLogo size={16} /> : <UserOutlined />}</div>
            <div className="ai-message-body">
              {message.role === 'ai' && message.startedAt && (message.streaming || (message.timeline?.length ?? 0) > 0) && (
                <ThinkingPanel events={message.timeline ?? []} startedAt={message.startedAt} endedAt={message.endedAt} />
              )}
              {message.content && <div className="ai-message-content">{message.role === 'ai' ? <MarkdownView source={message.content} onCitationClick={(info) => handleCitationClick(message.id, info)} /> : message.content}</div>}
              {message.attachments && message.attachments.length > 0 && <div className="ai-message-attachments">{message.attachments.map((file) => <Tag key={file.id} icon={<PaperClipOutlined />}>{file.name}</Tag>)}</div>}
              {message.source && !message.streaming && <div className="ai-source-badge"><span className={`ai-source-dot ai-source-dot-${message.source}`} />{message.source === 'rag' ? 'RAG 在线回答' : '本地演示引擎'}</div>}
              {message.gatewayAudit && !message.streaming && <div className={`ai-gateway-audit ai-gateway-audit-${message.gatewayAudit.verdict}`}>{message.gatewayAudit.verdict === 'pass' ? '✓ ' : '⚠ '}{message.gatewayAudit.message}</div>}
              {message.interrupted && message.remoteMessageId && !message.streaming && (
                <button type="button" className="ai-resume-btn" onClick={() => resumeGeneration(message)}>↻ 继续生成（连接中断，从服务端接回）</button>
              )}
              {!message.streaming && message.role === 'ai' && !message.content.trim() && (
                <button type="button" className="ai-retry-btn" onClick={() => retryGeneration(message)}>↻ 重新生成（上次回答生成失败，内容为空）</button>
              )}
              {message.artifacts && <ArtifactList artifacts={message.artifacts} onDownload={async (artifact) => {
                const remoteSessionId = activeRagSessionId ?? active.ragSessionId;
                if (!remoteSessionId || !message.remoteMessageId) return;
                const blob = await downloadArtifact(remoteSessionId, message.remoteMessageId, artifact.index);
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = artifact.file_name;
                anchor.click();
                URL.revokeObjectURL(url);
              }} />}
              {message.references && message.references.length > 0 && !message.streaming && <div className="ai-reference-row"><span className="ai-reference-label">引用 {message.references.length}</span>{message.references.map((reference) => <Tag key={reference.title} className="ai-ref-chip" onClick={() => { setExpandedRefKey(null); setRefDrawer({ open: true, refs: message.references ?? [], highlight: { doc: reference.title, chunkId: reference.chunkId } }); }}><span className="ai-ref-icon">📄</span>{reference.title}</Tag>)}</div>}
            </div>
          </div>)}
          <div ref={bottomRef} />
        </section>

        <section className="ai-composer-wrap">
          <AttachmentPreview files={attachments} onRemove={removeAttachment} disabled={busy} />
          {steerQueue.length > 0 && (
            <div className="ai-steer-bar">
              <span className="ai-steer-bar__label">追加中</span>
              {steerQueue.map((chip) => (
                <span key={chip.clientId ?? chip.steerId} className={`ai-steer-chip${chip.pending ? ' is-pending' : ''}`} title={chip.content}>
                  <span className="ai-steer-chip__text">{chip.content}</span>
                  {chip.delivery === 'after' && !chip.pending && (
                    <button type="button" className="ai-steer-chip__action" disabled={chip.promoting} onClick={() => promoteSteerChip(chip.steerId)}>{chip.promoting ? '…' : '立即发送'}</button>
                  )}
                  {!chip.pending && (
                    <button type="button" className="ai-steer-chip__action" aria-label="撤回" onClick={() => removeSteerChip(chip.steerId)}>×</button>
                  )}
                  {chip.pending && <span className="ai-steer-chip__hint">排队中</span>}
                </span>
              ))}
            </div>
          )}
          <div className="ai-composer">
            <Input.TextArea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); busy ? steerSend(input) : send(input); } }} autoSize={{ minRows: 1, maxRows: 5 }} variant="borderless" placeholder={busy ? '回答生成中，输入内容可追加到本轮对话' : '直接向模型提问'} />
            <div className="ai-composer-tools">
              <div className="ai-composer-left">
                <AgentPicker agents={availableAgents} value={selectedAgentId} onChange={setSelectedAgentId} disabled={busy || !ragReady()} />
                <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.xml,.html,.jpg,.jpeg,.png,.mp3,.wav,.m4a" />
                <Button type="text" className="composer-icon-button" icon={<PaperClipOutlined />} aria-label="上传附件" disabled={busy || !ragReady()} onClick={() => fileInputRef.current?.click()} />
                <KnowledgeFolderPicker folders={availableKbs} selectedIds={selectedKbIds} onChange={setSelectedKbIds} disabled={busy || !ragReady()} />
              </div>
              <div className="ai-composer-right">
                {busy && (
                  <button type="button" className="ai-stop-btn" aria-label="停止生成" onClick={stopGeneration}>
                    <StopGlyph />
                  </button>
                )}
                <Button type="primary" shape="circle" icon={<SendOutlined />} aria-label={busy ? '追加发送' : '发送'} disabled={!input.trim()} onClick={() => (busy ? steerSend(input) : send(input))} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <Drawer title={`文档来源 · ${refDrawer.refs.length}`} open={refDrawer.open} onClose={() => setRefDrawer({ open: false, refs: [] })} width={460}>
        {refDrawer.refs.length === 0 ? (
          <Empty description="暂无引用" />
        ) : (
          refDrawer.refs.map((reference, index) => {
            const key = referenceCardKey(reference, index);
            const expanded = expandedRefKey === key;
            const highlighted = matchHighlight(reference, refDrawer.highlight);
            return (
              <div
                key={key}
                className={`reference-card${expanded ? ' reference-card--expanded' : ''}${highlighted ? ' reference-card--highlight' : ''}`}
                onClick={() => setExpandedRefKey(expanded ? null : key)}
              >
                <div className="reference-card__head">
                  <span className="reference-card__title">📄 {reference.title}</span>
                  <span className={`reference-card__chevron${expanded ? ' is-open' : ''}`}>›</span>
                </div>
                <p className={`reference-card__summary${expanded ? ' is-expanded' : ''}`}>
                  {reference.content === '知识库内联引用'
                    ? '该回答内联引用了此文档。'
                    : reference.content}
                </p>
              </div>
            );
          })
        )}
      </Drawer>
    </div>
  );
}

