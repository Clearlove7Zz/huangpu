/**
 * 角色权限模型（双维度）：角色 → { 可检索知识库, 可用智能体 }
 * - 知识库按名称关键词匹配（ID 为运行时动态获取）
 * - 智能体按 ID 白名单，低权限角色看不到可调工具的智能体
 */

export interface RbacScope {
  /** 允许检索的知识库名称关键词（'*' = 当前空间全部知识库） */
  kbKeywords: string[];
  /** 可用智能体 ID 白名单 */
  agentIds: string[];
  /** 默认智能体 */
  defaultAgentId: string;
}

const HIGH_PRIV_AGENTS = ['builtin-quick-answer', 'builtin-smart-reasoning', 'builtin-data-analyst'];
const LOW_PRIV_AGENTS = ['builtin-quick-answer'];

export const ROLE_RBAC: Record<string, RbacScope> = {
  '指挥部-商务部': {
    kbKeywords: ['*'],
    agentIds: HIGH_PRIV_AGENTS,
    defaultAgentId: 'builtin-smart-reasoning',
  },
  '指挥部-财务部': {
    kbKeywords: ['*'],
    agentIds: HIGH_PRIV_AGENTS,
    defaultAgentId: 'builtin-smart-reasoning',
  },
  '全权限测试账号': {
    kbKeywords: ['*'],
    agentIds: HIGH_PRIV_AGENTS,
    defaultAgentId: 'builtin-smart-reasoning',
  },
  '股份领导/指挥长': {
    kbKeywords: ['项目', '现金流'],
    agentIds: LOW_PRIV_AGENTS,
    defaultAgentId: 'builtin-quick-answer',
  },
  '指挥部-工程技术部': {
    kbKeywords: ['项目'],
    agentIds: LOW_PRIV_AGENTS,
    defaultAgentId: 'builtin-quick-answer',
  },
  '指挥部-外协部': {
    kbKeywords: ['项目'],
    agentIds: LOW_PRIV_AGENTS,
    defaultAgentId: 'builtin-quick-answer',
  },
  '安全员': {
    kbKeywords: ['项目'],
    agentIds: LOW_PRIV_AGENTS,
    defaultAgentId: 'builtin-quick-answer',
  },
};

export function getRbac(role: string): RbacScope {
  return ROLE_RBAC[role] ?? {
    kbKeywords: ['项目'],
    agentIds: LOW_PRIV_AGENTS,
    defaultAgentId: 'builtin-quick-answer',
  };
}

/** 按角色过滤知识库列表 */
export function filterKbsByRole(role: string, kbs: { id: string; name: string }[]): { id: string; name: string }[] {
  const scope = getRbac(role);
  if (scope.kbKeywords.includes('*')) return kbs;
  return kbs.filter((kb) => scope.kbKeywords.some((kw) => kb.name.includes(kw)));
}

/** 按角色过滤智能体列表 */
export function filterAgentsByRole(
  role: string,
  agents: { id: string; name: string; mode: string; builtin: boolean }[],
): { id: string; name: string; mode: string; builtin: boolean }[] {
  const scope = getRbac(role);
  return agents.filter((a) => scope.agentIds.includes(a.id));
}
