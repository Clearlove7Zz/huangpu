/**
 * 推演引擎数据（真实基线，2026-09-07 从 demo 四地块整体替换为镇龙东F10）
 *
 * ⚠️ 数值来源：source-kb/gen-real.py（真实标前测算工作簿 2026.6.10 抽取，断言锁定）；
 *   口径细则见知识库《镇龙东F10 推演基线口径表与商务常量推导（2026.6.10）》，
 *   任一侧改动必须同步，否则网关对账的"逐位一致"基准会漂移。
 * 标前口径：未中标未开工——进度/回款/实际成本/风险/现金流结余均为 0（真实口径，非缺数）。
 */

/** 目标利润率红线（%）：固定上缴负担 = 上缴利润 8% + 项目管理费 1.3% + 上缴税金 0.837%（相对含税合同价，推导值非制度原文） */
export const PROFIT_RED_LINE = 10.14;

/** 本期现金流预测结余（万）：标前无现金流测算（源工作簿文件名自标），按 0 */
export const CASHFLOW_JUN = 0;

/** 现金流临界预警线（万）：标前未设定，按 0 计即仅负结余预警 */
export const CRITICAL_BALANCE = 0;

/** 钢筋成本份额（引擎口径：钢筋目标成本 = 测算成本 × 7.08% = 钢材 7683.43 万，与 KB 文档同源） */
export const STEEL_SHARE = 0.0708;

/**
 * 在册项目（仅镇龙东F10）。字段口径与 demo 版一致（MCP schema baseline 的内嵌形态）。
 * profitRate 取"相对合同价"口径 14.77%（=（12.7317-10.8509)/12.7317），与引擎公式自洽。
 */
export const PROJECTS = [
  {
    id: 'zld_f10',
    name: '镇龙东片区复建F10地块',
    shortName: '镇龙东F10',
    progress: 0,
    lagNodes: 0,
    profitRate: 14.77,
    paymentRate: 0,
    costCompletion: 0,
    risks: { total: 0, red: 0 },
    cost: {
      bidPrice: 12.7317,   // 预估合同价（亿），标前未中标，控制价下浮测算值
      targetCost: 10.8509, // 内部测算成本（亿）
      actualCost: 0,       // 标前未开工
      topOverruns: [],
    },
  },
];
