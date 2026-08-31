/**
 * 角色权限模型（服务端版）——从 huangpu-react/src/config/rbac.ts 移植并扩展。
 * 前端 rbac.ts 仅负责界面过滤（可被篡改）；真正的强制在网关：本文件的
 * agentIds / kbKeywords / canAskProfit 是越权拦截的依据。两处需保持一致。
 */

export const HIGH_PRIV_AGENTS = ['builtin-quick-answer', 'builtin-smart-reasoning', 'builtin-data-analyst'];
export const LOW_PRIV_AGENTS = ['builtin-quick-answer'];

export const ROLE_RBAC = {
  '指挥部-商务部': { kbKeywords: ['*'], agentIds: HIGH_PRIV_AGENTS, defaultAgentId: 'builtin-smart-reasoning', canAskProfit: true },
  '指挥部-财务部': { kbKeywords: ['*'], agentIds: HIGH_PRIV_AGENTS, defaultAgentId: 'builtin-smart-reasoning', canAskProfit: true },
  '全权限测试账号': { kbKeywords: ['*'], agentIds: HIGH_PRIV_AGENTS, defaultAgentId: 'builtin-smart-reasoning', canAskProfit: true },
  '股份领导/指挥长': { kbKeywords: ['项目', '现金流'], agentIds: LOW_PRIV_AGENTS, defaultAgentId: 'builtin-quick-answer', canAskProfit: true },
  '指挥部-工程技术部': { kbKeywords: ['项目'], agentIds: LOW_PRIV_AGENTS, defaultAgentId: 'builtin-quick-answer', canAskProfit: true },
  '指挥部-外协部': { kbKeywords: ['项目'], agentIds: LOW_PRIV_AGENTS, defaultAgentId: 'builtin-quick-answer', canAskProfit: true },
  // 安全员不可问利润（PRD REQ-06 六角色权限控制）
  '安全员': { kbKeywords: ['项目'], agentIds: LOW_PRIV_AGENTS, defaultAgentId: 'builtin-quick-answer', canAskProfit: false },
};

export function getRbac(role) {
  return ROLE_RBAC[role] ?? {
    kbKeywords: ['项目'],
    agentIds: LOW_PRIV_AGENTS,
    defaultAgentId: 'builtin-quick-answer',
    canAskProfit: false,
  };
}
