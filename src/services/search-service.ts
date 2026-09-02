import { RAG_CONFIG, ragReady } from '../config/rag-config';
import { gatewayHeaders } from '../config/gateway-auth';

/**
 * 独立检索能力（不经过 LLM）——对齐 WeKnora 原生接口：
 * - FAQ 语义命中：POST /knowledge-bases/{kbId}/faq/search（pgvector 相似度，
 *   命中即标准答案，问答链路外提供秒级口径速查）
 * - 文档搜索：POST /knowledge-search?keyword=（文档级关键词搜索，
 *   WeKnora @文件引用同源接口，返回知识文档卡片）
 */

export interface FaqHit {
  question: string;
  answer: string;
  score?: number;
}

export interface KnowledgeDocHit {
  id: string;
  kbId: string;
  title: string;
  summary: string;
  fileType?: string;
}

/** FAQ 语义命中检索（单个知识库；query_text 非空，match_count 默认 3） */
export async function faqSearch(kbId: string, queryText: string, matchCount = 3): Promise<FaqHit[]> {
  if (!ragReady() || !kbId || !queryText.trim()) return [];
  try {
    const res = await fetch(`${RAG_CONFIG.baseUrl}/knowledge-bases/${encodeURIComponent(kbId)}/faq/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...gatewayHeaders() },
      body: JSON.stringify({ query_text: queryText, match_count: matchCount }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: unknown };
    const raw = Array.isArray(json?.data) ? json.data : [];
    return raw.flatMap((item): FaqHit[] => {
      const r = item as { question?: unknown; content?: unknown; answer?: unknown; score?: unknown; similarity?: unknown };
      const question = String(r.question ?? '').trim();
      const answer = String(r.answer ?? r.content ?? '').trim();
      if (!question && !answer) return [];
      const score = typeof r.score === 'number' ? r.score : typeof r.similarity === 'number' ? r.similarity : undefined;
      return [{ question: question || answer.slice(0, 40), answer: answer || question, score }];
    });
  } catch {
    return [];
  }
}

/** 多知识库 FAQ 并行检索（按分数降序合并） */
export async function faqSearchMany(kbIds: string[], queryText: string, matchCountPerKb = 3): Promise<FaqHit[]> {
  const results = await Promise.all(kbIds.map((kbId) => faqSearch(kbId, queryText, matchCountPerKb)));
  return results
    .flat()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/** 文档级关键词搜索（POST /knowledge-search?keyword=，全租户自有+共享库范围） */
export async function searchKnowledge(keyword: string, limit = 8): Promise<KnowledgeDocHit[]> {
  if (!ragReady() || !keyword.trim()) return [];
  try {
    const params = new URLSearchParams({ keyword: keyword.trim(), offset: '0', limit: String(limit) });
    const res = await fetch(`${RAG_CONFIG.baseUrl}/knowledge-search?${params.toString()}`, {
      method: 'POST',
      headers: gatewayHeaders(),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: unknown };
    const raw = Array.isArray(json?.data) ? json.data : [];
    return raw.flatMap((item): KnowledgeDocHit[] => {
      const r = item as Record<string, unknown>;
      const id = String(r.id ?? '');
      const title = String(r.title ?? r.name ?? '').trim();
      if (!id || !title) return [];
      return [{
        id,
        kbId: String(r.kb_id ?? r.knowledge_base_id ?? ''),
        title,
        summary: String(r.summary ?? r.description ?? '').trim(),
        fileType: r.file_type !== undefined ? String(r.file_type) : undefined,
      }];
    });
  } catch {
    return [];
  }
}
