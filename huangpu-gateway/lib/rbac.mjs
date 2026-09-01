/**
 * 角色权限模型（服务端版）——从 huangpu-react/src/config/rbac.ts 移植并扩展。
 * 前端 rbac.ts 仅负责界面过滤（可被篡改）；真正的强制在网关：本文件的
 * agentIds / agentNameKeywords / kbKeywords / canAskProfit 是越权拦截的依据。两处需保持一致。
 *
 * 自定义智能体（如「利润推演智能体」）的 ID 由 WeKnora 生成，库重建后会漂移，
 * 故按名称关键词匹配；内置智能体 ID 固定，按 ID 白名单。
 */

export const HIGH_PRIV_AGENTS = ['builtin-quick-answer', 'builtin-smart-reasoning', 'builtin-data-analyst'];
export const LOW_PRIV_AGENTS = ['builtin-quick-answer'];

/** 利润推演智能体的名称关键词（网关按上游 agents 列表解析为 ID） */
export const PROFIT_AGENT_NAME = '利润推演智能体';

export const ROLE_RBAC = {
  '指挥部-商务部': { kbKeywords: ['*'], agentIds: HIGH_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: 'builtin-smart-reasoning', defaultAgentName: PROFIT_AGENT_NAME, canAskProfit: true },
  '指挥部-财务部': { kbKeywords: ['*'], agentIds: HIGH_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: 'builtin-smart-reasoning', defaultAgentName: PROFIT_AGENT_NAME, canAskProfit: true },
  '全权限测试账号': { kbKeywords: ['*'], agentIds: HIGH_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: 'builtin-smart-reasoning', defaultAgentName: PROFIT_AGENT_NAME, canAskProfit: true },
  // 低权限角色可选利润推演智能体（可见可选），默认仍为快速问答
  '股份领导/指挥长': { kbKeywords: ['项目', '现金流'], agentIds: LOW_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: 'builtin-quick-answer', canAskProfit: true },
  '指挥部-工程技术部': { kbKeywords: ['项目'], agentIds: LOW_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: 'builtin-quick-answer', canAskProfit: true },
  '指挥部-外协部': { kbKeywords: ['项目'], agentIds: LOW_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: 'builtin-quick-answer', canAskProfit: true },
  // 安全员不可问利润（PRD REQ-06 六角色权限控制），利润推演智能体对其不可见
  '安全员': { kbKeywords: ['项目'], agentIds: LOW_PRIV_AGENTS, agentNameKeywords: [], defaultAgentId: 'builtin-quick-answer', canAskProfit: false },
};

const FALLBACK = {
  kbKeywords: ['项目'],
  agentIds: LOW_PRIV_AGENTS,
  agentNameKeywords: [],
  defaultAgentId: 'builtin-quick-answer',
  canAskProfit: false,
};

export function getRbac(role) {
  return ROLE_RBAC[role] ?? FALLBACK;
}

/** 智能体越权判定：ID 白名单或名称关键词命中即放行 */
export function agentAllowed(scope, agentId, agentName) {
  if (scope.agentIds.includes(String(agentId))) return true;
  if (agentName && (scope.agentNameKeywords ?? []).some((kw) => agentName.includes(kw))) return true;
  return false;
}
