import { RAG_CONFIG, ragReady } from '../config/rag-config';
import { gatewayHeaders } from '../config/gateway-auth';

/** WeKnora 知识库管理客户端（文档管理页 = 知识库管理界面） */

export interface KbInfo {
  id: string;
  name: string;
  description: string;
  type: string;
}

export interface KbFileInfo {
  id: string;
  name: string;
  title: string;
  fileType: string;
  fileSize: number;
  parseStatus: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
}

export interface KbListResult {
  items: KbFileInfo[];
  total: number;
}

export interface KbFolderNode {
  path: string;
  name: string;
  document_count: number;
  total_count: number;
  children?: KbFolderNode[];
}

export interface KbFolderTree {
  root_document_count: number;
  total_document_count: number;
  folders: KbFolderNode[];
}

async function request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    ...gatewayHeaders(),
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  const res = await fetch(`${RAG_CONFIG.baseUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 100)}`);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return json;
}

/** 获取空间下所有知识库 */
export async function listKnowledgeBases(): Promise<KbInfo[]> {
  if (!ragReady()) return [];
  const j = await request('/knowledge-bases');
  const data = (j.data ?? []) as Record<string, unknown>[];
  return data.map((kb) => ({
    id: String(kb.id ?? ''),
    name: String(kb.name ?? '未命名知识库'),
    description: String(kb.description ?? ''),
    type: String(kb.type ?? 'document'),
  }));
}

/** 列出知识库下的知识文件（分页拉取） */
export async function listKnowledge(kbId: string, page = 1, pageSize = 200): Promise<KbListResult> {
  const j = await request(`/knowledge-bases/${kbId}/knowledge?page=${page}&page_size=${pageSize}`);
  const data = (j.data ?? []) as Record<string, unknown>[];
  return {
    total: Number(j.total ?? data.length),
    items: data.map((k) => ({
      id: String(k.id ?? ''),
      name: String(k.file_name ?? k.title ?? ''),
      title: String(k.title ?? ''),
      fileType: String(k.file_type ?? ''),
      fileSize: Number(k.file_size ?? 0),
      parseStatus: String(k.parse_status ?? ''),
      folder: String(k.folder_path ?? ''),
      createdAt: String(k.created_at ?? ''),
      updatedAt: String(k.updated_at ?? ''),
    })),
  };
}

/** 上传文件到知识库（multipart，WeKnora 异步解析/分块/向量化） */
export async function uploadKnowledgeFile(kbId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = gatewayHeaders();
  const res = await fetch(`${RAG_CONFIG.baseUrl}/knowledge-bases/${kbId}/knowledge/file`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`上传失败 HTTP ${res.status} ${text.slice(0, 100)}`);
  }
}

/** 删除单个知识 */
export async function deleteKnowledge(knowledgeId: string): Promise<void> {
  const headers: Record<string, string> = gatewayHeaders();
  const res = await fetch(`${RAG_CONFIG.baseUrl}/knowledge/${knowledgeId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`删除失败 HTTP ${res.status}`);
}

/** 预览知识原文（文本类文件在新窗口打开） */
export async function previewKnowledge(knowledgeId: string): Promise<string> {
  const headers: Record<string, string> = gatewayHeaders();
  const res = await fetch(`${RAG_CONFIG.baseUrl}/knowledge/${knowledgeId}/preview`, { headers });
  if (!res.ok) throw new Error(`预览失败 HTTP ${res.status}`);
  return res.text();
}

/** 获取知识库文件夹树 */
export async function listKnowledgeFolders(kbId: string): Promise<KbFolderTree> {
  const j = await request(`/knowledge-bases/${kbId}/knowledge/folders`);
  const d = (j.data ?? {}) as Record<string, unknown>;
  return {
    root_document_count: Number(d.root_document_count ?? 0),
    total_document_count: Number(d.total_document_count ?? 0),
    folders: (d.folders ?? []) as KbFolderNode[],
  };
}

/** 移动知识到文件夹（folder_path 不存在时会自动创建） */
export async function moveKnowledgeToFolder(kbId: string, knowledgeIds: string[], folderPath: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...gatewayHeaders() };
  const res = await fetch(`${RAG_CONFIG.baseUrl}/knowledge/folder`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kb_id: kbId, knowledge_ids: knowledgeIds, folder_path: folderPath }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`移动失败 HTTP ${res.status} ${text.slice(0, 100)}`);
  }
}

/** 创建知识库（前端"新建文件夹"） */
export async function createKnowledgeBase(name: string, description = ''): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...gatewayHeaders() };
  const res = await fetch(`${RAG_CONFIG.baseUrl}/knowledge-bases`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`创建知识库失败 HTTP ${res.status} ${text.slice(0, 100)}`);
  }
  const j = (await res.json().catch(() => ({}))) as { data?: { id?: string } };
  return String(j.data?.id ?? '');
}

/** 重命名知识库（前端"重命名文件夹"） */
export async function renameKnowledgeBase(kbId: string, name: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...gatewayHeaders() };
  const res = await fetch(`${RAG_CONFIG.baseUrl}/knowledge-bases/${kbId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`重命名失败 HTTP ${res.status}`);
}

/** 删除知识库（前端"删除文件夹"，连带文件） */
export async function deleteKnowledgeBase(kbId: string): Promise<void> {
  const headers: Record<string, string> = gatewayHeaders();
  const res = await fetch(`${RAG_CONFIG.baseUrl}/knowledge-bases/${kbId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`删除知识库失败 HTTP ${res.status}`);
}

/** 跨知识库移动知识（异步任务，前端"移动文件"） */
export async function moveKnowledgeAcrossKb(
  sourceKbId: string,
  targetKbId: string,
  knowledgeIds: string[],
  mode: 'reuse_vectors' | 'reparse' = 'reuse_vectors',
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...gatewayHeaders() };
  const res = await fetch(`${RAG_CONFIG.baseUrl}/knowledge/move`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ knowledge_ids: knowledgeIds, source_kb_id: sourceKbId, target_kb_id: targetKbId, mode }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`移动失败 HTTP ${res.status} ${text.slice(0, 100)}`);
  }
}

/** 获取当前空间可用智能体（按角色权限过滤用） */
export async function listAgents(): Promise<{ id: string; name: string; description: string; mode: string; builtin: boolean }[]> {
  if (!ragReady()) return [];
  const j = await request('/agents');
  const data = (j.data ?? []) as Record<string, unknown>[];
  return data.map((a) => ({
    id: String(a.id ?? ''),
    name: String(a.name ?? ''),
    description: String(a.description ?? ''),
    mode: String((a.config as Record<string, unknown> | null)?.agent_mode ?? ''),
    builtin: Boolean(a.is_builtin),
  }));
}

/** 解析状态展示 */
export function parseStatusMeta(status: string): { label: string; color: string } {
  switch (status) {
    case 'completed':
      return { label: '已入库', color: 'success' };
    case 'processing':
    case 'finalizing':
      return { label: '解析中', color: 'processing' };
    case 'pending':
      return { label: '等待中', color: 'default' };
    case 'failed':
      return { label: '解析失败', color: 'error' };
    case 'cancelled':
      return { label: '已取消', color: 'default' };
    default:
      return { label: status || '未知', color: 'default' };
  }
}
