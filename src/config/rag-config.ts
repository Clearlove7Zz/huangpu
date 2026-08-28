/**
 * RAG 服务配置（WeKnora）
 * - 开发环境：走 vite 代理 /api/v1 → http://127.0.0.1:8080（见 vite.config.ts）
 * - 生产环境：改成 WeKnora 实际地址（如 https://rag.example.com/api/v1）
 *
 * apiKey 为 WeKnora 签发的 scoped API Key（WebUI → 密钥管理）。
 * 未填或服务不可用时，前端自动降级为本地规则引擎（answer-engine）。
 */
export const RAG_CONFIG = {
  /** 总开关：false 时永远走本地演示引擎 */
  enabled: true,
  /** API 基础路径（含 /api/v1） */
  baseUrl: '/api/v1',
  /** WeKnora scoped API Key（在 WebUI 密钥管理中创建后填入）
   *  通过 Vite 环境变量 VITE_RAG_API_KEY 注入（见 .env.local，不入版本库）。
   *  未填或服务不可用时，前端自动降级为本地规则引擎（answer-engine）。 */
  apiKey: import.meta.env.VITE_RAG_API_KEY ?? '',
  /** 知识库 ID 列表（可在 WebUI 知识库详情 URL 中查看） */
  knowledgeBaseIds: ['173b5610-d346-40d3-aee0-b0ff229a673a'],
  /** 自定义 Agent ID（预留：后续配置利润研判 Agent 后填写） */
  agentId: '',
  /** 全局输出长度限制指令（留空 = 不限制；决策推演页有自己的专属指令） */
  maxOutputHint: '',
  /** 单次请求超时（毫秒） */
  timeoutMs: 90000,
  /** WeKnora 管理后台地址（文档管理页「管理知识库」入口，建库/配模型/分块都在后台完成）
   *  - 本机/局域网访问：前端自动使用「http://当前hostname」，无需填
   *  - 公网（Cloudflare 临时隧道）访问：前端使用本配置，请填写 WeKnora 后台隧道地址 */
  adminUrl: 'https://roads-groundwater-metal-reservation.trycloudflare.com',
};

export function ragReady(): boolean {
  return RAG_CONFIG.enabled && Boolean(RAG_CONFIG.apiKey) && RAG_CONFIG.knowledgeBaseIds.length > 0;
}
