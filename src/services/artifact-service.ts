import { RAG_CONFIG, ragReady } from '../config/rag-config';
import { gatewayHeaders } from '../config/gateway-auth';

export interface ArtifactMeta {
  index: number;
  file_name: string;
  file_type: string;
  file_size: number;
  source_path: string;
  mod_time: string;
  created_at: string;
}

function headers(): HeadersInit {
  return gatewayHeaders();
}

export async function listSessionArtifacts(sessionId: string): Promise<ArtifactMeta[]> {
  if (!ragReady() || !sessionId) return [];
  const response = await fetch(`${RAG_CONFIG.baseUrl}/sessions/${sessionId}/artifacts`, { headers: headers() });
  if (!response.ok) return [];
  const body = (await response.json()) as { data?: ArtifactMeta[] };
  return body.data ?? [];
}

export async function listMessageArtifacts(sessionId: string, messageId: string): Promise<ArtifactMeta[]> {
  if (!ragReady() || !sessionId || !messageId) return [];
  const response = await fetch(`${RAG_CONFIG.baseUrl}/sessions/${sessionId}/messages/${messageId}/artifacts`, { headers: headers() });
  if (!response.ok) return [];
  const body = (await response.json()) as { data?: ArtifactMeta[] };
  return body.data ?? [];
}

export async function downloadArtifact(sessionId: string, messageId: string, index: number): Promise<Blob> {
  const response = await fetch(`${RAG_CONFIG.baseUrl}/sessions/${sessionId}/messages/${messageId}/artifacts/${index}/download`, { headers: headers() });
  if (!response.ok) throw new Error(`下载文件失败 HTTP ${response.status}`);
  return response.blob();
}
