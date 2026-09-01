/**
 * ai-service（FastAPI + YOLOv8 PPE）客户端
 * 服务地址：huangpu-react/ai-service，启动命令：
 *   cd huangpu-react/ai-service && python -m uvicorn app:app --host 127.0.0.1 --port 8765
 */

export const SAFETY_AI_API = (window as unknown as { SAFETY_AI_API?: string }).SAFETY_AI_API || 'http://127.0.0.1:8765';

export interface HealthResult {
  ok: boolean;
  model_loaded: boolean;
  model_path: string | null;
  error: string | null;
  classes?: string[];
}

export interface Hazard {
  class: string;
  confidence: number;
  bbox?: number[];
  label_zh: string;
  level: '重大关注' | '一般隐患' | '合规';
  suggestion: string;
}

export interface InspectionSummary {
  person_count: number;
  hazard_count: number;
  highest_level: string;
  hazard_situation: string;
  suggestion: string;
}

export interface InspectionRecord {
  id: string;
  project: string;
  area: string;
  inspector: string;
  check_date: string;
  created_at: string;
  person_count: number;
  hazard_count: number;
  highest_level: string;
  hazard_situation: string;
  suggestion: string;
  rectify_person: string;
  rectify_time: string;
  recheck_plan: string;
  recheck_status: string;
  written_to_log: boolean;
  hazards: Hazard[];
  annotated_url: string;
  original_url: string;
}

export interface InspectResult {
  record_id: string;
  project: string;
  area: string;
  inspector: string;
  check_date: string;
  created_at: string;
  hazards: Hazard[];
  detections: { class: string; confidence: number; bbox: number[] }[];
  summary: InspectionSummary;
  annotated_url: string;
  original_url: string;
}

/**
 * 页面展示视图：AI 识别即时返回（InspectResult，含 record_id/summary）与已入库记录
 * （InspectionRecord，扁平字段）的字段并集，共有字段必填、各自独有字段可选。
 * SafetyLog 的 lastResult 两种来源都可能，展示层用 ?? 链兼容。
 */
export type InspectionView = Pick<
  InspectionRecord,
  'project' | 'area' | 'inspector' | 'check_date' | 'created_at' | 'hazards' | 'annotated_url' | 'original_url'
> &
  Partial<Pick<InspectResult, 'record_id' | 'summary' | 'detections'>> &
  Partial<
    Pick<
      InspectionRecord,
      | 'id'
      | 'person_count'
      | 'hazard_count'
      | 'highest_level'
      | 'hazard_situation'
      | 'suggestion'
      | 'rectify_person'
      | 'rectify_time'
      | 'recheck_plan'
      | 'recheck_status'
      | 'written_to_log'
    >
  >;

function apiUrl(path: string): string {
  return SAFETY_AI_API.replace(/\/$/, '') + path;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: string };
      detail = j.detail || JSON.stringify(j);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return res as unknown as T;
}

/** 健康检查：模型是否已加载 */
export async function checkHealth(): Promise<HealthResult> {
  try {
    return await request<HealthResult>('/api/health');
  } catch (e) {
    return { ok: false, model_loaded: false, model_path: null, error: (e as Error).message };
  }
}

/** 上传巡检图片进行 AI 识别 */
export async function inspectImage(
  file: File,
  meta: { project: string; area: string; inspector: string; checkDate: string },
): Promise<InspectResult> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('project', meta.project);
  fd.append('area', meta.area);
  fd.append('inspector', meta.inspector);
  fd.append('check_date', meta.checkDate);
  return request<InspectResult>('/api/inspect', { method: 'POST', body: fd });
}

/** 历史巡检记录 */
export async function listRecords(limit = 50): Promise<{ items: InspectionRecord[] }> {
  return request<{ items: InspectionRecord[] }>(`/api/records?limit=${limit}`);
}

/** 单条记录 */
export async function getRecord(recordId: string): Promise<InspectionRecord> {
  return request<InspectionRecord>(`/api/records/${recordId}`);
}

/** 更新记录（写入日志 / 登记整改人） */
export async function patchRecord(
  recordId: string,
  body: {
    rectify_person?: string;
    rectify_time?: string;
    recheck_plan?: string;
    recheck_status?: string;
    written_to_log?: boolean;
    hazard_situation?: string;
    suggestion?: string;
  },
): Promise<InspectionRecord> {
  return request<InspectionRecord>(`/api/records/${recordId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 图片地址（标注图/原图） */
export function imageUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return apiUrl(path);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function levelColor(level: string): string {
  if (level === '重大关注') return 'error';
  if (level === '一般隐患') return 'warning';
  return 'success';
}
