import { RAG_CONFIG, ragReady } from '../config/rag-config';

export type TemporaryAttachmentStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface TemporaryAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  status: TemporaryAttachmentStatus;
  progress?: number;
  error?: string;
}

interface AttachmentResponse {
  success?: boolean;
  data?: {
    id: string;
    file_name: string;
    file_size: number;
    status: TemporaryAttachmentStatus;
    error_message?: string;
  };
}

function headers(): HeadersInit {
  return RAG_CONFIG.apiKey ? { 'X-API-Key': RAG_CONFIG.apiKey } : {};
}

function mapAttachment(data: NonNullable<AttachmentResponse['data']>, progress?: number): TemporaryAttachment {
  return {
    id: data.id,
    fileName: data.file_name,
    fileSize: data.file_size,
    status: data.status,
    progress,
    error: data.error_message,
  };
}

export async function createRemoteSession(): Promise<string> {
  if (!ragReady()) throw new Error('RAG 服务未配置');
  const response = await fetch(`${RAG_CONFIG.baseUrl}/sessions`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '城建利润问答', description: '来自数字沙盘前端' }),
  });
  if (!response.ok) throw new Error(`创建会话失败 HTTP ${response.status}`);
  const body = (await response.json()) as { data?: { id?: string } };
  if (!body.data?.id) throw new Error('创建会话未返回 ID');
  return body.data.id;
}

export function uploadTemporaryAttachment(
  sessionId: string,
  file: File,
  agentId?: string,
  onProgress?: (percent: number) => void,
): Promise<TemporaryAttachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${RAG_CONFIG.baseUrl}/sessions/${sessionId}/attachments`);
    if (RAG_CONFIG.apiKey) xhr.setRequestHeader('X-API-Key', RAG_CONFIG.apiKey);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded * 100) / event.total));
    };
    xhr.onerror = () => reject(new Error('附件上传失败'));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`附件上传失败 HTTP ${xhr.status}`));
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText) as AttachmentResponse;
        if (!body.data) throw new Error('附件上传响应无数据');
        resolve(mapAttachment(body.data, 100));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('附件上传响应解析失败'));
      }
    };
    const form = new FormData();
    form.append('file', file);
    form.append('parser_engine', 'auto');
    if (agentId) form.append('agent_id', agentId);
    xhr.send(form);
  });
}

export async function getTemporaryAttachment(sessionId: string, attachmentId: string): Promise<TemporaryAttachment> {
  const response = await fetch(`${RAG_CONFIG.baseUrl}/sessions/${sessionId}/attachments/${attachmentId}`, {
    headers: headers(),
  });
  if (!response.ok) throw new Error(`查询附件状态失败 HTTP ${response.status}`);
  const body = (await response.json()) as AttachmentResponse;
  if (!body.data) throw new Error('附件状态响应无数据');
  return mapAttachment(body.data);
}

export async function deleteTemporaryAttachment(sessionId: string, attachmentId: string): Promise<void> {
  const response = await fetch(`${RAG_CONFIG.baseUrl}/sessions/${sessionId}/attachments/${attachmentId}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!response.ok && response.status !== 404) throw new Error(`删除附件失败 HTTP ${response.status}`);
}
