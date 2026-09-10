/**
 * 角色权限模型（双维度）：角色 → { 可检索知识库, 可用智能体 }
 * - 知识库授权为显式库 ID 白名单（不依赖命名；新建库默认不可见，需显式加进角色矩阵）
 * - 智能体：内置按 ID 白名单；自定义智能体（利润推演智能体等）按名称关键词匹配，
 *   因其 ID 由 WeKnora 生成、库重建后会漂移
 * - 本文件仅负责界面过滤（可被篡改）；真正的强制在网关 lib/rbac.mjs，两处需保持一致
 */

export const KB_IDS: Record<string, string> = {
  '14bcd117-9352-42f8-a824-b47dabbb2add': '合同资料',
  'c3ee40ea-0815-43d8-b52f-783dc9c1f5d2': '成本测算',
  'e3ddfa30-84d6-446e-a27e-d2fdf71df7e1': '商务概况',
  'da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed': '口径制度',
  'a00aaf1f-bf35-4802-9548-508263452f55': '资金税务',
};

export interface RbacScope {
  /** 允许检索的知识库 ID 白名单 */
  kbIds: string[];
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
/** 利润研判（原利润推演智能体） */
export const PROFIT_AGENT_NAME = '利润研判';
/** 决策研判（指挥长专属默认，结论式输出；仅指挥长可见） */
export const DECISION_AGENT_NAME = '决策研判';
/** 工程/外协/安全角色专属智能体（名称与网关 lib/rbac.mjs 的 agentNameKeywords 对齐） */
export const ENG_AGENT_NAME = '工程问答';
export const COORD_AGENT_NAME = '外协问答';
export const SAFETY_AGENT_NAME = '安全问答';

const KB_ALL = Object.keys(KB_IDS);

export const ROLE_RBAC: Record<string, RbacScope> = {
  '指挥部-商务部': {
    kbIds: KB_ALL,
    agentIds: HIGH_PRIV_AGENTS,
    agentNameKeywords: [PROFIT_AGENT_NAME],
    defaultAgentId: 'builtin-smart-reasoning',
    defaultAgentName: PROFIT_AGENT_NAME,
  },
  '指挥部-财务部': {
    kbIds: KB_ALL,
    agentIds: HIGH_PRIV_AGENTS,
    agentNameKeywords: [PROFIT_AGENT_NAME],
    defaultAgentId: 'builtin-smart-reasoning',
    defaultAgentName: PROFIT_AGENT_NAME,
  },
  '全权限测试账号': {
    kbIds: KB_ALL,
    agentIds: HIGH_PRIV_AGENTS,
    agentNameKeywords: [PROFIT_AGENT_NAME],
    defaultAgentId: 'builtin-smart-reasoning',
    defaultAgentName: PROFIT_AGENT_NAME,
  },
  '股份领导/指挥长': {
    kbIds: KB_ALL,
    agentIds: LOW_PRIV_AGENTS,
    agentNameKeywords: [PROFIT_AGENT_NAME, DECISION_AGENT_NAME], defaultAgentName: DECISION_AGENT_NAME,
    defaultAgentId: 'builtin-quick-answer',
  },
  '指挥部-工程技术部': {
    kbIds: ['14bcd117-9352-42f8-a824-b47dabbb2add', 'c3ee40ea-0815-43d8-b52f-783dc9c1f5d2', 'da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed'],
    agentIds: [],
    agentNameKeywords: [ENG_AGENT_NAME],
    defaultAgentName: ENG_AGENT_NAME, defaultAgentId: '',
  },
  '指挥部-外协部': {
    kbIds: ['14bcd117-9352-42f8-a824-b47dabbb2add', 'e3ddfa30-84d6-446e-a27e-d2fdf71df7e1', 'a00aaf1f-bf35-4802-9548-508263452f55'],
    agentIds: [],
    agentNameKeywords: [COORD_AGENT_NAME],
    defaultAgentName: COORD_AGENT_NAME, defaultAgentId: '',
  },
  '安全员': {
    kbIds: ['da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed'],
    agentIds: [],
    agentNameKeywords: [SAFETY_AGENT_NAME],
    defaultAgentName: SAFETY_AGENT_NAME, defaultAgentId: '',
  },
};

export function getRbac(role: string): RbacScope {
  return ROLE_RBAC[role] ?? {
    kbIds: ['da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed'],
    agentIds: LOW_PRIV_AGENTS,
    agentNameKeywords: [],
    defaultAgentId: 'builtin-quick-answer',
  };
}

/**
 * 以下过滤函数已升级为 scope 优先：登录后网关下发的 scope（auth.tsx 存于
 * UserInfo.scope）是单一事实源；role 参数仅作 scope 缺失（离线演示模式）的兜底。
 */
export function filterKbsByRole(
  roleOrScope: string | RbacScope,
  kbs: { id: string; name: string }[],
): { id: string; name: string }[] {
  const scope = typeof roleOrScope === 'string' ? getRbac(roleOrScope) : roleOrScope;
  return kbs.filter((kb) => (scope.kbIds ?? []).includes(kb.id));
}

export function filterAgentsByRole(
  roleOrScope: string | RbacScope,
  agents: { id: string; name: string; mode: string; builtin: boolean }[],
): { id: string; name: string; mode: string; builtin: boolean }[] {
  const scope = typeof roleOrScope === 'string' ? getRbac(roleOrScope) : roleOrScope;
  return agents.filter(
    (a) =>
      (scope.agentIds ?? []).includes(a.id) ||
      (scope.agentNameKeywords ?? []).some((kw) => a.name.includes(kw)),
  );
}

export function resolveDefaultAgent(
  roleOrScope: string | RbacScope,
  agents: { id: string; name: string; mode: string; builtin: boolean }[],
): string {
  const scope = typeof roleOrScope === 'string' ? getRbac(roleOrScope) : roleOrScope;
  if (scope.defaultAgentName) {
    const hit = agents.find((a) => a.name === scope.defaultAgentName);
    if (hit) return hit.id;
  }
  return scope.defaultAgentId ?? 'builtin-quick-answer';
}
