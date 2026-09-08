/**
 * 角色权限模型（服务端版）——从 huangpu-react/src/config/rbac.ts 移植并扩展。
 * 前端 rbac.ts 仅负责界面过滤（可被篡改）；真正的强制在网关：本文件的
 * agentIds / agentNameKeywords / kbIds / canAskProfit 是越权拦截的依据。两处需保持一致。
 *
 * 自定义智能体（如「利润推演智能体」）的 ID 由 WeKnora 生成，库重建后会漂移，
 * 故按名称关键词匹配；内置智能体 ID 固定，按 ID 白名单。
 *
 * 知识库授权（2026-09-08 设计定案）：显式库 ID 白名单，不再按库名关键词匹配——
 * 子串匹配依赖命名约定，库名一变权限就漂（"成本月报"→"成本测算"时即失效）。
 * 新建库默认对所有角色不可见，需显式加进角色矩阵（申请制）。
 */

export const HIGH_PRIV_AGENTS = ['builtin-quick-answer', 'builtin-smart-reasoning', 'builtin-data-analyst'];
export const LOW_PRIV_AGENTS = ['builtin-quick-answer'];

/** 利润研判（原利润推演智能体）的名称关键词（网关按上游 agents 列表解析为 ID） */
export const PROFIT_AGENT_NAME = '利润研判';
/** 决策研判（指挥长专属默认，结论式输出；仅指挥长可见） */
export const DECISION_AGENT_NAME = '决策研判';

/** 在册知识库 ID ↔ 名称对照（库改名不动授权；换库/建库时同步本表与角色矩阵） */
export const KB_IDS = {
  '14bcd117-9352-42f8-a824-b47dabbb2add': '合同资料',
  'c3ee40ea-0815-43d8-b52f-783dc9c1f5d2': '成本测算',
  'e3ddfa30-84d6-446e-a27e-d2fdf71df7e1': '商务概况',
  'da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed': '口径制度',
  'a00aaf1f-bf35-4802-9548-508263452f55': '资金税务',
};

export const KB_ALL = Object.keys(KB_IDS);

export const ROLE_RBAC = {
  '指挥部-商务部': { kbAll: true, kbIds: KB_ALL, agentIds: HIGH_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: 'builtin-smart-reasoning', defaultAgentName: PROFIT_AGENT_NAME, canAskProfit: true },
  '指挥部-财务部': { kbAll: true, kbIds: KB_ALL, agentIds: HIGH_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: 'builtin-smart-reasoning', defaultAgentName: PROFIT_AGENT_NAME, canAskProfit: true },
  '全权限测试账号': { kbAll: true, kbIds: KB_ALL, agentIds: HIGH_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: 'builtin-smart-reasoning', defaultAgentName: PROFIT_AGENT_NAME, canAskProfit: true },
  // 低权限角色可选利润推演智能体（可见可选），默认仍为快速问答
  '股份领导/指挥长': { kbAll: true, kbIds: KB_ALL, agentIds: LOW_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME, DECISION_AGENT_NAME], defaultAgentId: 'builtin-quick-answer', defaultAgentName: DECISION_AGENT_NAME, canAskProfit: true },
  // 工程技术部：合同/成本/口径可见，商务与资金不可见
  '指挥部-工程技术部': { kbAll: false, kbIds: ['14bcd117-9352-42f8-a824-b47dabbb2add', 'c3ee40ea-0815-43d8-b52f-783dc9c1f5d2', 'da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed'], agentIds: LOW_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: 'builtin-quick-answer', canAskProfit: true },
  // 外协部：合同/商务/资金可见，成本与口径不可见
  '指挥部-外协部': { kbAll: false, kbIds: ['14bcd117-9352-42f8-a824-b47dabbb2add', 'e3ddfa30-84d6-446e-a27e-d2fdf71df7e1', 'a00aaf1f-bf35-4802-9548-508263452f55'], agentIds: LOW_PRIV_AGENTS, agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: 'builtin-quick-answer', canAskProfit: true },
  // 安全员不可问利润（PRD REQ-06 六角色权限控制），利润推演智能体对其不可见；仅看口径制度
  '安全员': { kbAll: false, kbIds: ['da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed'], agentIds: LOW_PRIV_AGENTS, agentNameKeywords: [], defaultAgentId: 'builtin-quick-answer', canAskProfit: false },
};

const FALLBACK = {
  kbAll: false,
  kbIds: ['da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed'],
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
