/**
 * 角色权限模型（双维度）：角色 → { 可检索知识库, 可用智能体 }
 * - 知识库按名称关键词匹配（ID 为运行时动态获取）
 * - 智能体：内置按 ID 白名单；自定义智能体（利润推演智能体等）按名称关键词匹配，
 *   因其 ID 由 WeKnora 生成、库重建后会漂移
 * - 本文件仅负责界面过滤（可被篡改）；真正的强制在网关 lib/rbac.mjs，两处需保持一致
 */

export interface RbacScope {
  /** 允许检索的知识库名称关键词（'*' = 当前空间全部知识库） */
  kbKeywords: string[];
  /** 可用智能体 ID 白名单（内置） */
  agentIds: string[];
  /** 按名称关键词匹配的自定义智能体 */
  agentNameKeywords: string[];
  /** 默认智能体：优先按 defaultAgentName 从列表解析，失败回退 defaultAgentId */
  defaultAgentId: string;
  defaultAgentName?: string;
}

const HIGH_PRIV_AGENTS = ['builtin-quick-answer', 'builtin-smart-reasoning', 'builtin-data-analyst'];
const LOW_PRIV_AGENTS = ['builtin-quick-answer'];

/** 利润推演智能体（引擎 MCP 工具承载者，网关同名强制） */
export const PROFIT_AGENT_NAME = '利润推演智能体';

export const ROLE_RBAC: Record<string, RbacScope> = {
  '指挥部-商务部': {
    kbKeywords: ['*'],
    agentIds: HIGH_PRIV_AGENTS,
    agentNameKeywords: [PROFIT_AGENT_NAME],
    defaultAgentId: 'builtin-smart-reasoning',
    defaultAgentName: PROFIT_AGENT_NAME,
  },
  '指挥部-财务部': {
    kbKeywords: ['*'],
    agentIds: HIGH_PRIV_AGENTS,
    agentNameKeywords: [PROFIT_AGENT_NAME],
    defaultAgentId: 'builtin-smart-reasoning',
    defaultAgentName: PROFIT_AGENT_NAME,
  },
  '全权限测试账号': {
    kbKeywords: ['*'],
    agentIds: HIGH_PRIV_AGENTS,
    agentNameKeywords: [PROFIT_AGENT_NAME],
    defaultAgentId: 'builtin-smart-reasoning',
    defaultAgentName: PROFIT_AGENT_NAME,
  },
  '股份领导/指挥长': {
    kbKeywords: ['项目', '现金流'],
    agentIds: LOW_PRIV_AGENTS,
    agentNameKeywords: [PROFIT_AGENT_NAME],
    defaultAgentId: 'builtin-quick-answer',
  },
  '指挥部-工程技术部': {
    kbKeywords: ['项目'],
    agentIds: LOW_PRIV_AGENTS,
    agentNameKeywords: [PROFIT_AGENT_NAME],
    defaultAgentId: 'builtin-quick-answer',
  },
  '指挥部-外协部': {
    kbKeywords: ['项目'],
    agentIds: LOW_PRIV_AGENTS,
    agentNameKeywords: [PROFIT_AGENT_NAME],
    defaultAgentId: 'builtin-quick-answer',
  },
  '安全员': {
    kbKeywords: ['项目'],
    agentIds: LOW_PRIV_AGENTS,
    agentNameKeywords: [],
    defaultAgentId: 'builtin-quick-answer',
  },
};

export function getRbac(role: string): RbacScope {
  return ROLE_RBAC[role] ?? {
    kbKeywords: ['项目'],
    agentIds: LOW_PRIV_AGENTS,
    agentNameKeywords: [],
    defaultAgentId: 'builtin-quick-answer',
  };
}

/** 按角色过滤知识库列表 */
export function filterKbsByRole(role: string, kbs: { id: string; name: string }[]): { id: string; name: string }[] {
  const scope = getRbac(role);
  if (scope.kbKeywords.includes('*')) return kbs;
  return kbs.filter((kb) => scope.kbKeywords.some((kw) => kb.name.includes(kw)));
}

/** 按角色过滤智能体列表（内置 ID 白名单 + 自定义名称关键词） */
export function filterAgentsByRole(
  role: string,
  agents: { id: string; name: string; mode: string; builtin: boolean }[],
): { id: string; name: string; mode: string; builtin: boolean }[] {
  const scope = getRbac(role);
  return agents.filter(
    (a) => scope.agentIds.includes(a.id) || scope.agentNameKeywords.some((kw) => a.name.includes(kw)),
  );
}

/** 解析角色默认智能体 ID：优先按名称精确匹配，失败回退内置默认 */
export function resolveDefaultAgent(
  role: string,
  agents: { id: string; name: string; mode: string; builtin: boolean }[],
): string {
  const scope = getRbac(role);
  if (scope.defaultAgentName) {
    const hit = agents.find((a) => a.name === scope.defaultAgentName);
    if (hit) return hit.id;
  }
  return scope.defaultAgentId;
}
