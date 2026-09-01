import { useEffect, useState } from 'react';
import { BulbOutlined, CheckCircleOutlined, SearchOutlined, CloseCircleOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';

/** 时间轴事件（与 WeKnora agentEventStream 对齐） */
export interface TimelineEvent {
  kind: 'thinking' | 'tool';
  /** thinking: 轮次 event_id；tool: tool_call_id */
  id: string;
  /** thinking 内容 / tool 名称 */
  name?: string;
  content?: string;
  args?: unknown;
  /** tool 结果 */
  success?: boolean;
  output?: string;
  /** 后端返回的结构化数据（total_matches, fetched_chunks, knowledge_title 等） */
  data?: Record<string, unknown>;
  durationMs?: number;
  /** 是否进行中 */
  pending?: boolean;
  /** 事件到达顺序（用于排序） */
  seq: number;
}

const TOOL_LABEL: Record<string, string> = {
  retrieval: '知识检索',
  search_knowledge: '知识检索',
  knowledge_search: '知识检索',
  grep_chunks: '片段检索',
  list_knowledge_chunks: '读取知识块',
  get_document_content: '读取文档内容',
  get_document_info: '获取文档信息',
  rerank: '结果重排',
  query_understand: '问题理解',
  query_rewrite: '问题改写',
  web_search: '联网搜索',
  web_fetch: '网页抓取',
  read_skill: '读取技能',
  execute_skill_script: '执行技能脚本',
  data_analysis: '数据分析',
  data_schema: '数据表结构',
  database_query: '数据库查询',
  read: '文档读取',
  reflection: '反思',
  generation: '答案生成',
  thinking: '深度思考',
};

function labelOf(name: string): string {
  const lower = name.toLowerCase();
  for (const key of Object.keys(TOOL_LABEL)) {
    if (lower.includes(key)) return TOOL_LABEL[key];
  }
  return name;
}

/** 格式化工具标题，包含搜索关键词（对齐 WeKnora 样式） */
function formatToolTitle(name: string, args: unknown, data: Record<string, unknown> | undefined, pending: boolean): string {
  const lower = name.toLowerCase();
  
  // grep_chunks: "搜索关键词：「xxx」"
  if (lower.includes('grep')) {
    const query = extractQueryFromArgs(args);
    if (query) return `搜索关键词：「${query}」`;
    return '搜索关键词';
  }
  
  // search_knowledge / knowledge_search: "检索知识库：「xxx」"
  if (lower.includes('search') || lower.includes('retriev')) {
    const query = extractQueryFromArgs(args);
    if (query) return `检索知识库：「${query}」`;
    return pending ? '正在检索知识库...' : '检索知识库';
  }
  
  // list_knowledge_chunks: "查看 xxx.md"
  if (lower.includes('list') || lower.includes('chunk')) {
    if (!pending && data) {
      const title = extractDocTitle(data);
      if (title) return `查看 ${title}`;
    }
    return '读取知识块';
  }
  
  return labelOf(name);
}

/** 把形参 args 截短成一行 hint */
function argHint(args: unknown): string {
  if (!args) return '';
  if (typeof args === 'string') return args.length > 40 ? args.slice(0, 40) + '…' : args;
  try {
    const text = JSON.stringify(args);
    return text.length > 60 ? text.slice(0, 60) + '…' : text;
  } catch {
    return '';
  }
}

/** 工具结果摘要（一行） */
function resultHint(output: string): string {
  if (!output) return '';
  const flat = output.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? flat.slice(0, 60) + '…' : flat;
}

/** 格式化耗时 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return `${min}m ${rest}s`;
}

/** 从 args 中提取搜索关键词/模式 */
function extractQueryFromArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const record = args as Record<string, unknown>;
  // 提取 query 或 queries
  const query = record.query || record.queries;
  if (typeof query === 'string') return query;
  if (Array.isArray(query) && query.length > 0) return query.join('、');
  // 提取 pattern/patterns
  const pattern = record.pattern || record.patterns;
  if (typeof pattern === 'string') return pattern;
  if (Array.isArray(pattern) && pattern.length > 0) return pattern.join('、');
  return '';
}

/** 从 data 中提取结果摘要 */
function extractResultSummary(toolName: string, data: Record<string, unknown> | undefined): string {
  if (!data) return '';
  
  const lower = toolName.toLowerCase();
  
  // grep_chunks: "找到 N 个匹配片段，来自 M 个文档"
  if (lower.includes('grep')) {
    const totalMatches = data.total_matches ?? data.totalMatches;
    const docCount = data.document_count ?? data.documentCount ?? data.result_count;
    if (totalMatches !== undefined && docCount !== undefined) {
      return `找到 ${totalMatches} 个匹配片段，来自 ${docCount} 个文档`;
    }
  }
  
  // search_knowledge / knowledge_search: "找到 N 个结果，来自 M 个文件"
  if (lower.includes('search') || lower.includes('retriev')) {
    const results = data.results;
    const resultCount = data.result_count ?? data.count ?? (Array.isArray(results) ? results.length : undefined);
    const kbCounts = data.kb_counts ?? data.kbCounts;
    if (resultCount !== undefined) {
      if (kbCounts && typeof kbCounts === 'object' && Object.keys(kbCounts).length > 0) {
        return `找到 ${resultCount} 个结果，来自 ${Object.keys(kbCounts).length} 个文件`;
      }
      return `找到 ${resultCount} 个结果`;
    }
  }

  // list_knowledge_chunks: "已加载 N/M 个分块"
  if (lower.includes('list') || lower.includes('chunk')) {
    const fetched = data.fetched_chunks ?? data.fetchedChunks;
    const total = data.total_chunks ?? data.totalChunks;
    if (fetched !== undefined && total !== undefined) {
      return `已加载 ${fetched} / ${total} 个分块`;
    }
  }
  
  return '';
}

/** 从 data 中提取文档标题 */
function extractDocTitle(data: Record<string, unknown> | undefined): string {
  if (!data) return '';
  const title = data.knowledge_title ?? data.knowledgeTitle ?? data.knowledge_id;
  if (typeof title === 'string' && title) return title;
  const faqQuestion = data.faq_question ?? data.faqQuestion;
  if (typeof faqQuestion === 'string' && faqQuestion) return `FAQ: ${faqQuestion}`;
  return '';
}

/** WeKnora 风格时间轴：竖向连接线 + 左侧图标 + 步骤名（多轮思考 + 工具配对 + 结果摘要） */
export default function ThinkingPanel({
  events,
  startedAt,
  endedAt,
  defaultOpen,
}: {
  events: TimelineEvent[];
  startedAt?: number;
  endedAt?: number;
  defaultOpen?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [endedAt]);

  const isDone = Boolean(endedAt);
  const [expanded, setExpanded] = useState(defaultOpen ?? !isDone);
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});

  if (events.length === 0) {
    // 消息已创建（startedAt 有值）但还没收到 SSE 事件 → 显示加载态
    if (startedAt && !isDone) {
      return (
        <div className="ai-thinking-panel">
          <div className="ai-thinking-root ai-thinking-loading">
            <span className="ai-thinking-status">
              <BulbOutlined />
              正在思考...
            </span>
          </div>
        </div>
      );
    }
    return null;
  }

  const thinkingRounds = events.filter((e) => e.kind === 'thinking').length;
  const toolCount = events.filter((e) => e.kind === 'tool').length;
  const duration = endedAt && startedAt ? endedAt - startedAt : startedAt ? now - startedAt : 0;

  const summaryParts: string[] = [];
  if (thinkingRounds > 0) summaryParts.push(`思考 ${thinkingRounds} 轮`);
  if (toolCount > 0) summaryParts.push(`调用 ${toolCount} 次工具`);
  summaryParts.push(`耗时 ${formatDuration(duration)}`);
  const summaryText = summaryParts.join(' · ');

  const toggleDetail = (id: string) => setOpenDetails((current) => ({ ...current, [id]: !current[id] }));

  return (
    <div className="ai-thinking-panel">
      {/* 顶部折叠行（仿 WeKnora tree-root） */}
      <button type="button" className="ai-thinking-root" onClick={() => setExpanded((v) => !v)}>
        <span className="ai-thinking-status">
          {isDone ? <CheckCircleOutlined /> : <BulbOutlined />}
          {summaryText}
        </span>
        <span className="ai-thinking-chevron">{expanded ? <DownOutlined /> : <RightOutlined />}</span>
      </button>

      {/* 时间轴子树（按事件到达顺序渲染） */}
      {expanded && (
        <ul className="ai-tree">
          {events.map((event, index) => {
            const isLast = index === events.length - 1;
            const isPending = !isDone && isLast && event.pending !== false;
            const detailOpen = openDetails[event.id];
            const classes = `ai-tree-child ${isLast ? 'ai-tree-child-last' : ''} ${isPending ? 'ai-tree-pending' : ''} ${event.kind === 'tool' && event.success === false ? 'ai-tree-error' : ''}`;
            if (event.kind === 'thinking') {
              const hasContent = Boolean(event.content);
              return (
                <li key={event.id} className={classes}>
                  <span className="ai-tree-icon">{isPending ? <span className="ai-tree-dot" /> : <BulbOutlined />}</span>
                  <div className="ai-tree-content">
                    <button type="button" className="ai-tree-title" onClick={hasContent ? () => toggleDetail(event.id) : undefined} disabled={!hasContent}>
                      <span className="ai-tree-name">思考</span>
                      {event.durationMs ? <span className="ai-tree-badge">{formatDuration(event.durationMs)}</span> : null}
                      {!detailOpen && hasContent && (
                        <span className="ai-tree-summary">{event.content!.slice(0, 60).replace(/\s+/g, ' ')}{event.content!.length > 60 ? '…' : ''}</span>
                      )}
                    </button>
                    {detailOpen && hasContent && <div className="ai-tree-detail">{event.content}</div>}
                  </div>
                </li>
              );
            }
            return (
              <li key={event.id} className={classes}>
                <span className="ai-tree-icon">
                  {isPending ? <span className="ai-tree-dot" /> : event.success === false ? <CloseCircleOutlined /> : <SearchOutlined />}
                </span>
                <div className="ai-tree-content">
                  <div className="ai-tree-title-row">
                    <span className="ai-tree-name">{formatToolTitle(event.name ?? '', event.args, event.data, event.pending ?? false)}</span>
                    {event.durationMs ? <span className="ai-tree-badge">{formatDuration(event.durationMs)}</span> : null}
                  </div>
                  {event.pending && argHint(event.args) && <div className="ai-tree-summary">{argHint(event.args)}</div>}
                  {!event.pending && event.data && extractResultSummary(event.name ?? '', event.data) && (
                    <div className="ai-tree-summary">{extractResultSummary(event.name ?? '', event.data)}</div>
                  )}
                  {!event.pending && !event.data && event.output && <div className="ai-tree-summary">{resultHint(event.output)}</div>}
                  {!event.pending && !event.data && !event.output && argHint(event.args) && <div className="ai-tree-summary">{argHint(event.args)}</div>}
                </div>
              </li>
            );
          })}
          {isDone && (
            <li className="ai-tree-child ai-tree-child-last ai-tree-done">
              <span className="ai-tree-icon"><CheckCircleOutlined /></span>
              <div className="ai-tree-content">
                <span className="ai-tree-name">完成</span>
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
