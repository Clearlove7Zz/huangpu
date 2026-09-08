/**
 * 角色权限模型（服务端版，单一事实源）——登录/取 me 时整包 scope 下发给前端，
 * 前端只做界面呈现，不再本地重算矩阵（rbac.ts 仅保留类型与兜底）。
 *
 * 授权模型：角色 → {
 *   kbIds / kbAll        知识库可见范围（显式 ID 白名单；新建库默认不可见，申请制）
 *   kbWrite              库/文档管理权（建库、删库、上传、改文档；仅数据归口角色）
 *   pages                可见页面 nav（菜单 + 路由守卫共用，替代前端 mock nav）
 *   agentIds / agentNameKeywords / defaultAgentId / defaultAgentName
 *   canAskProfit         利润类问题总闸
 * }
 *
 * 自定义智能体（利润研判/决策研判）ID 由 WeKnora 生成、会漂移，按名称关键词
 * 匹配；内置智能体 ID 固定，按 ID 白名单。
 */

/** 内置智能体不再分配给任何角色（builtin-quick-answer 为 kb all 全库检索，
 *  分配给角色即绕开库授权；管理员可从 WebUI 直接使用） */
export const HIGH_PRIV_AGENTS = [];
export const LOW_PRIV_AGENTS = [];

/** 利润研判（原利润推演智能体）的名称关键词（网关按上游 agents 列表解析为 ID） */
export const PROFIT_AGENT_NAME = '利润研判';
/** 决策研判（指挥长专属默认，结论式输出；仅指挥长可见） */
export const DECISION_AGENT_NAME = '决策研判';
/** 角色专属检索问答（各角色一个，库绑定=角色 kbIds，agent 层与网关层双重强制） */
export const ENG_AGENT_NAME = '工程问答';
export const COORD_AGENT_NAME = '外协问答';
export const SAFETY_AGENT_NAME = '安全问答';

/** 在册知识库 ID ↔ 名称对照（库改名不动授权；换库/建库时同步本表与角色矩阵） */
export const KB_IDS = {
  '14bcd117-9352-42f8-a824-b47dabbb2add': '合同资料',
  'c3ee40ea-0815-43d8-b52f-783dc9c1f5d2': '成本测算',
  'e3ddfa30-84d6-446e-a27e-d2fdf71df7e1': '商务概况',
  'da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed': '口径制度',
  'a00aaf1f-bf35-4802-9548-508263452f55': '资金税务',
};

export const KB_ALL = Object.keys(KB_IDS);

/** 页面 nav 常量（与前端路由 key 对齐） */
export const PAGES = {
  biz: ['dashboard', 'project', 'decision-system', 'progress-system', 'design-control', 'documents', 'work-mgmt', 'cost-system', 'material', 'supplier-system', 'cashflow', 'reports', 'sync'],
  leader: ['dashboard', 'project', 'decision-system'],
  eng: ['dashboard', 'project', 'decision-system', 'progress-system', 'design-control', 'documents', 'work-mgmt', 'risk-system', 'safety-log', 'reports', 'sync'],
  coord: ['dashboard', 'project', 'decision-system', 'documents', 'work-mgmt', 'coordination', 'reports', 'sync'],
  // 安全员：无 documents 页——与其"仅口径制度库"的知识库授权对齐（原则性修正）
  safety: ['dashboard', 'project', 'progress-system', 'risk-system', 'safety-log', 'reports', 'sync'],
};

export const ROLE_RBAC = {
  '指挥部-商务部': { kbAll: true, kbIds: KB_ALL, kbWrite: true, pages: PAGES.biz, agentIds: [], agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: '', defaultAgentName: PROFIT_AGENT_NAME, canAskProfit: true },
  '指挥部-财务部': { kbAll: true, kbIds: KB_ALL, kbWrite: true, pages: PAGES.biz, agentIds: [], agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: '', defaultAgentName: PROFIT_AGENT_NAME, canAskProfit: true },
  '全权限测试账号': { kbAll: true, kbIds: KB_ALL, kbWrite: true, pages: PAGES.biz, agentIds: [], agentNameKeywords: [PROFIT_AGENT_NAME], defaultAgentId: '', defaultAgentName: PROFIT_AGENT_NAME, canAskProfit: true },
  // 指挥长：全域可见、库只读（kbWrite:false）、默认决策研判（结论式输出）
  '股份领导/指挥长': { kbAll: true, kbIds: KB_ALL, kbWrite: false, pages: PAGES.leader, agentIds: [], agentNameKeywords: [PROFIT_AGENT_NAME, DECISION_AGENT_NAME], defaultAgentId: '', defaultAgentName: DECISION_AGENT_NAME, canAskProfit: true },
  // 工程技术部：合同/成本/口径可见，商务与资金不可见；库只读
  '指挥部-工程技术部': { kbAll: false, kbIds: ['14bcd117-9352-42f8-a824-b47dabbb2add', 'c3ee40ea-0815-43d8-b52f-783dc9c1f5d2', 'da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed'], kbWrite: false, pages: PAGES.eng, agentIds: [], agentNameKeywords: [ENG_AGENT_NAME], defaultAgentId: '', defaultAgentName: ENG_AGENT_NAME, canAskProfit: true },
  // 外协部：合同/商务/资金可见，成本与口径不可见；库只读
  '指挥部-外协部': { kbAll: false, kbIds: ['14bcd117-9352-42f8-a824-b47dabbb2add', 'e3ddfa30-84d6-446e-a27e-d2fdf71df7e1', 'a00aaf1f-bf35-4802-9548-508263452f55'], kbWrite: false, pages: PAGES.coord, agentIds: [], agentNameKeywords: [COORD_AGENT_NAME], defaultAgentId: '', defaultAgentName: COORD_AGENT_NAME, canAskProfit: true },
  // 安全员不可问利润（PRD REQ-06 六角色权限控制），利润研判对其不可见；仅口径制度库、无文档管理页
  '安全员': { kbAll: false, kbIds: ['da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed'], kbWrite: false, pages: PAGES.safety, agentIds: [], agentNameKeywords: [SAFETY_AGENT_NAME], defaultAgentId: '', defaultAgentName: SAFETY_AGENT_NAME, canAskProfit: false },
};

const FALLBACK = {
  kbAll: false,
  kbIds: ['da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed'],
  kbWrite: false,
  pages: ['dashboard', 'project', 'decision-system'],
  agentIds: [],
  agentNameKeywords: [SAFETY_AGENT_NAME],
  defaultAgentId: '',
  defaultAgentName: SAFETY_AGENT_NAME,
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
