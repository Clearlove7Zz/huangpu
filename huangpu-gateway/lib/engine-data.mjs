/**
 * 推演引擎数据（demo 数据）
 *
 * ⚠️ 同源声明：本文件数值复制自
 *   - huangpu-react/src/data/mock-data.ts（projects / profitRedLine）
 *   - huangpu-react/src/data/cost-data.ts（cashflowDetail.monthly / criticalBalance）
 * 两侧任一处改动必须同步，否则网关对账的"逐位一致"基准会漂移。
 * ⚠️ demo 数据非业务事实（PRD §3 非目标）：仅用于演示管道，M3 接入真实台账时整体替换。
 */

/** 目标利润率红线（mock-data.ts profitRedLine，分包成本控制口径） */
export const PROFIT_RED_LINE = 16.66;

/** 2026-06 现金流预测结余（cost-data.ts cashflowDetail.monthly forecastBalance） */
export const CASHFLOW_JUN = 420;

/** 现金流临界预警线（cost-data.ts cashflowDetail.criticalBalance） */
export const CRITICAL_BALANCE = 200;

/**
 * 四地块项目数据（仅保留引擎与对账所需字段；
 * 来源 mock-data.ts projects，删除了 area/startDate/output 等无关字段）
 */
export const PROJECTS = [
  {
    id: 'xl_fj01',
    name: '新联复建01地块',
    shortName: '新联01',
    progress: 42.8,
    lagNodes: 2,
    profitRate: 17.2,
    paymentRate: 92.3,
    costCompletion: 78.5,
    risks: { total: 12, red: 2 },
    cost: { bidPrice: 5.87, targetCost: 4.58, actualCost: 4.72, topOverruns: ['外墙工程', '精装修', '土方工程'] },
  },
  {
    id: 'jyje_az01',
    name: '均一均二复建AZ-01地块',
    shortName: 'AZ-01',
    progress: 28.5,
    lagNodes: 1,
    profitRate: 15.8,
    paymentRate: 88.6,
    costCompletion: 65.2,
    risks: { total: 8, red: 1 },
    cost: { bidPrice: 8.66, targetCost: 6.85, actualCost: 7.05, topOverruns: ['地下室工程', '桩基工程'] },
  },
  {
    id: 'yt_az01',
    name: '洋田复建AZ-01地块',
    shortName: '洋田AZ-01',
    progress: 18.2,
    lagNodes: 0,
    profitRate: 18.5,
    paymentRate: 95.1,
    costCompletion: 52.8,
    risks: { total: 5, red: 0 },
    cost: { bidPrice: 6.03, targetCost: 4.72, actualCost: 4.68, topOverruns: [] },
  },
  {
    id: 'jyje_az02',
    name: '均一均二复建AZ-02地块',
    shortName: 'AZ-02',
    progress: 5.0,
    lagNodes: 0,
    profitRate: 17.8,
    paymentRate: 100,
    costCompletion: 12.5,
    risks: { total: 3, red: 0 },
    cost: { bidPrice: 4.65, targetCost: 3.42, actualCost: 3.38, topOverruns: [] },
  },
];
