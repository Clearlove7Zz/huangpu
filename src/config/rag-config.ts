/**
 * RAG 服务配置（经后端网关访问 WeKnora）
 * - 开发环境：走 vite 代理 /api/v1 → 后端网关 http://127.0.0.1:8090（见 vite.config.ts），
 *   网关再转发 WeKnora 并执行角色调度 / 凭据持有 / 输出对账（工作区 huangpu-gateway/）。
 * - 生产环境：改成网关实际地址（如 https://gw.example.com/api/v1）。
 *
 * WeKnora scoped API Key 由网关持有（网关 .env），浏览器仅持网关令牌（gateway-auth.ts），
 * 未登录或网关/服务不可用时，前端自动降级为本地规则引擎（answer-engine）。
 */
export const RAG_CONFIG = {
  /** 总开关：false 时永远走本地演示引擎 */
  enabled: true,
  /** API 基础路径（含 /api/v1，实际指向后端网关） */
  baseUrl: '/api/v1',
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
  // 网关令牌由请求头动态附加（gatewayHeaders），此处不再要求本端持有任何密钥
  return RAG_CONFIG.enabled && RAG_CONFIG.knowledgeBaseIds.length > 0;
}
