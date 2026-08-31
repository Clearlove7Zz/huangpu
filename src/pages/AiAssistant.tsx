import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Drawer, Empty, Input, Tag } from 'antd';
import { DeleteOutlined, MessageOutlined, PaperClipOutlined, PlusOutlined, SendOutlined, UserOutlined } from '@ant-design/icons';
import { abortCurrentChat, chatWithRag } from '../services/chat-service';
import { ragReady } from '../config/rag-config';
import { listAgents, listKnowledgeBases } from '../services/kb-service';
import { filterAgentsByRole, filterKbsByRole, getRbac } from '../config/rbac';
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
import { continueKnowledgeStream, deleteRemoteSession, listRemoteMessages } from '../services/rag';
import type { RemoteMessage } from '../services/rag';
import { createRemoteSession, deleteTemporaryAttachment, getTemporaryAttachment, uploadTemporaryAttachment } from '../services/attachment-service';
import { downloadArtifact, listMessageArtifacts } from '../services/artifact-service';
import type { ArtifactMeta } from '../services/artifact-service';

interface ChatMsg {
  id: number;
  role: 'user' | 'ai';
  content: string;
  references?: { title: string; detail: string }[];
  streaming?: boolean;
  attachments?: { id: string; name: string; size: number; status: string }[];
  source?: 'rag' | 'local';
  remoteMessageId?: string;
  artifacts?: ArtifactMeta[];
  /** 网关对账裁决（demo 后端网关回写，直连 WeKnora 时无） */
  gatewayAudit?: { verdict: 'pass' | 'mismatch' | 'reject'; message: string };
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
  const [refDrawer, setRefDrawer] = useState<{ open: boolean; refs: { title: string; detail: string }[] }>({ open: false, refs: [] });
  const [activeRagSessionId, setActiveRagSessionId] = useState<string>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const shouldFollowRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  // active 解析：优先找 activeSessionId；找不到时优先回退到空会话（避免删除老
// 会话后仍渲染老消息），最后才回退到 sessions 末尾（最近创建的新会话）。
const active = sessions.find((session) => session.id === activeSessionId)
  ?? sessions.find((session) => session.messages.length === 0)
  ?? sessions[sessions.length - 1];
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
    const role = user?.role ?? '';
    void Promise.all([listKnowledgeBases(), listAgents()]).then(([kbs, agents]) => {
      const allowedKbs = filterKbsByRole(role, kbs);
      const allowedAgents = filterAgentsByRole(role, agents);
      setAvailableKbs(allowedKbs);
      setAvailableAgents(allowedAgents);
      setSelectedKbIds(allowedKbs.map((kb) => kb.id));
      setSelectedAgentId(getRbac(role).defaultAgentId);
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
      const references = (item.knowledge_references ?? [])
        .map((ref) => {
          const r = ref as { knowledge_title?: string; knowledge_filename?: string; content?: string };
          const title = r.knowledge_title ?? r.knowledge_filename ?? '';
          return title ? { title, detail: r.content ?? '' } : null;
        })
        .filter((ref): ref is { title: string; detail: string } => ref !== null);
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
      setBusy(true);
      void continueKnowledgeStream(ragSessionId, incompleteId, {
        onAnswerDelta: (delta) => {
          updateSession(sessionIdNumber, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, source: 'rag', content: message.content + delta } : message) }));
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
          updateSession(sessionIdNumber, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, streaming: false, endedAt: Date.now() } : message) }));
          setBusy(false);
        },
        onAbort: () => {
          updateSession(sessionIdNumber, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, streaming: false, endedAt: Date.now() } : message) }));
          setBusy(false);
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
        setBusy(false);
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

  const send = (text: string) => {
    const query = text.trim();
    if (!query || busy) return;
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
    setBusy(true);
    setAssistantState('understanding');
    let remoteMessageId = '';
    // 时间轴事件操作器：按 id 定位 thinking/tool 事件（与 WeKnora _eventMap/_pendingToolCalls 同思路）
    const patchTimeline = (sessionId: number, msgId: number, fn: (events: TimelineEvent[]) => TimelineEvent[]) => {
      updateSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((message) => message.id === msgId ? { ...message, timeline: fn(message.timeline ?? []) } : message),
      }));
    };
    let timelineSeq = 0;
    void chatWithRag(query, activeRagSessionId ?? active.ragSessionId ?? null, {
      onMessageId: (messageId) => {
        remoteMessageId = messageId;
        updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, remoteMessageId: messageId } : message) }));
      },
      onToolCallStart: (toolCallId, toolName, args) => {
        if (toolName.toLowerCase().includes('retriev') || toolName.toLowerCase().includes('search')) setAssistantState('searching');
        else if (toolName.toLowerCase().includes('rerank')) setAssistantState('organizing');
        else if (toolName.toLowerCase().includes('understand') || toolName.toLowerCase().includes('query')) setAssistantState('understanding');
        patchTimeline(sessionId, aiMsg.id, (events) => {
          const existing = events.find((e) => e.kind === 'tool' && e.id === toolCallId);
          if (existing) return events;
          return [...events, { kind: 'tool', id: toolCallId, name: toolName, args, pending: true, seq: ++timelineSeq }];
        });
      },
      onToolCallEnd: (toolCallId, _toolName, success, output, durationMs, data) => {
        patchTimeline(sessionId, aiMsg.id, (events) => events.map((event) => event.kind === 'tool' && event.id === toolCallId ? { ...event, pending: false, success, output, durationMs, data } : event));
      },
      onToolCall: (toolName) => {
        if (toolName.includes('retriev')) setAssistantState('searching');
        else if (toolName.includes('rerank')) setAssistantState('organizing');
        else if (toolName.includes('understand') || toolName.includes('query')) setAssistantState('understanding');
      },
      onGatewayAudit: (audit) => {
        updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, gatewayAudit: { verdict: audit.verdict, message: audit.message } } : message) }));
        if (audit.verdict === 'reject' && audit.engineAnswer) {
          // 数值铁律：网关拒收了模型自算的回答，追加确定性引擎兜底答案
          updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, content: `${message.content}\n\n---\n\n${audit.engineAnswer}` } : message) }));
        }
      },
      onThinkingDelta: (eventId, delta, done, durationMs) => {
        patchTimeline(sessionId, aiMsg.id, (events) => {
          const existing = events.find((e) => e.kind === 'thinking' && e.id === eventId);
          if (!existing) {
            return [...events, { kind: 'thinking', id: eventId, content: delta, pending: !done, durationMs: done ? durationMs : undefined, seq: ++timelineSeq }];
          }
          return events.map((event) => event.kind === 'thinking' && event.id === eventId
            ? { ...event, content: (event.content ?? '') + delta, pending: !done, durationMs: done ? (durationMs ?? event.durationMs) : event.durationMs }
            : event);
        });
      },
      onDelta: (delta) => {
        setAssistantState('generating');
        updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, source: 'rag', content: message.content + delta } : message) }));
      },
      onReferences: (refs) => {
        setAssistantState('organizing');
        updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, references: refs.map((ref) => ({ title: ref.title, detail: ref.content })) } : message) }));
      },
      onLocalAnswer: (answer) => {
        updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, source: 'local' } : message) }));
        streamLocalAnswer(sessionId, aiMsg, answer);
      },
      onAbort: () => {
        // 用户主动停止：仅结束当前消息，不触发任何本地兜底
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id && message.streaming ? { ...message, streaming: false, endedAt: Date.now() } : message) }));
        setAssistantState('done');
        setBusy(false);
      },
      onDone: () => {
        if (!timerRef.current) {
          setAssistantState('done');
          updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, streaming: false, endedAt: Date.now() } : message) }));
          setBusy(false);
        }
      },
    }, {
      knowledgeBaseIds: selectedKbIds,
      agentId: selectedAgentId || undefined,
      agentEnabled: selectedAgentId !== 'builtin-quick-answer',
      attachmentIds: attachments.filter((file) => file.remoteId && file.status !== 'failed').map((file) => file.remoteId as string),
    }).then(async (outcome) => {
      if (outcome.sessionId) {
        setActiveRagSessionId(outcome.sessionId);
        updateSession(sessionId, (session) => ({ ...session, ragSessionId: outcome.sessionId ?? undefined }));
      }
      if (outcome.source === 'rag' && outcome.sessionId && remoteMessageId) {
        const artifacts = await listMessageArtifacts(outcome.sessionId, remoteMessageId);
        if (artifacts.length) updateSession(sessionId, (session) => ({ ...session, messages: session.messages.map((message) => message.id === aiMsg.id ? { ...message, artifacts } : message) }));
      }
    });
  };

  /** 用户点击"停止生成"：中断 RAG SSE 流 + 停掉本地打字机 + 立即结束当前消息 */
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
    setAssistantState('done');
    setBusy(false);
  };

  const newSession = () => {
    const id = Date.now();
    setSessions((current) => [...current, { id, title: '新对话', messages: [] }]);
    setActiveSessionId(id);
    shouldFollowRef.current = true;
    setActiveRagSessionId(undefined);
    setAttachments([]);
    setAssistantState('idle');
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
          {sessions.map((session) => <div className={`ai-session-item ${session.id === activeSessionId ? 'is-active' : ''}`} key={session.id} onClick={() => { shouldFollowRef.current = true; setActiveSessionId(session.id); setActiveRagSessionId(session.ragSessionId); }}>
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
              {message.content && <div className="ai-message-content">{message.role === 'ai' ? <MarkdownView source={message.content} /> : message.content}</div>}
              {message.attachments && message.attachments.length > 0 && <div className="ai-message-attachments">{message.attachments.map((file) => <Tag key={file.id} icon={<PaperClipOutlined />}>{file.name}</Tag>)}</div>}
              {message.source && !message.streaming && <div className="ai-source-badge"><span className={`ai-source-dot ai-source-dot-${message.source}`} />{message.source === 'rag' ? 'RAG 在线回答' : '本地演示引擎'}</div>}
              {message.gatewayAudit && !message.streaming && <div className={`ai-gateway-audit ai-gateway-audit-${message.gatewayAudit.verdict}`}>{message.gatewayAudit.verdict === 'pass' ? '✓ ' : '⚠ '}{message.gatewayAudit.message}</div>}
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
              {message.references && message.references.length > 0 && !message.streaming && <div className="ai-reference-row"><span className="ai-reference-label">引用 {message.references.length}</span>{message.references.map((reference) => <Tag key={reference.title} className="ai-ref-chip" onClick={() => setRefDrawer({ open: true, refs: message.references ?? [] })}><span className="ai-ref-icon">📄</span>{reference.title}</Tag>)}</div>}
            </div>
          </div>)}
          <div ref={bottomRef} />
        </section>

        <section className="ai-composer-wrap">
          <AttachmentPreview files={attachments} onRemove={removeAttachment} disabled={busy} />
          <div className="ai-composer">
            <Input.TextArea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(input); } }} autoSize={{ minRows: 1, maxRows: 5 }} variant="borderless" disabled={busy} placeholder="直接向模型提问" />
            <div className="ai-composer-tools">
              <div className="ai-composer-left">
                <AgentPicker agents={availableAgents} value={selectedAgentId} onChange={setSelectedAgentId} disabled={busy || !ragReady()} />
                <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.xml,.html,.jpg,.jpeg,.png,.mp3,.wav,.m4a" />
                <Button type="text" className="composer-icon-button" icon={<PaperClipOutlined />} aria-label="上传附件" disabled={busy || !ragReady()} onClick={() => fileInputRef.current?.click()} />
                <KnowledgeFolderPicker folders={availableKbs} selectedIds={selectedKbIds} onChange={setSelectedKbIds} disabled={busy || !ragReady()} />
              </div>
              {busy ? (
                <button type="button" className="ai-stop-btn" aria-label="停止生成" onClick={stopGeneration}>
                  <StopGlyph />
                </button>
              ) : (
                <Button type="primary" shape="circle" icon={<SendOutlined />} aria-label="发送" disabled={!input.trim()} onClick={() => send(input)} />
              )}
            </div>
          </div>
        </section>
      </main>

      <Drawer title={`引用来源（${refDrawer.refs.length}）`} open={refDrawer.open} onClose={() => setRefDrawer({ open: false, refs: [] })} width={460}>
        {refDrawer.refs.length === 0 ? <Empty description="暂无引用" /> : refDrawer.refs.map((reference, index) => <div className="reference-card" key={`${reference.title}-${index}`}><strong>{index + 1}. {reference.title}</strong><p>{reference.detail === '知识库内联引用' ? '该回答内联引用了此文档。' : reference.detail}</p></div>)}
      </Drawer>
    </div>
  );
}

