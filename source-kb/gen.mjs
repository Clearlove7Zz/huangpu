/**
 * 生成「项目原始资料」多源演示文档，按知识库分目录（4 项目 × 3 类 + 4 全局 = 16 份）。
 * 用法：node gen.mjs   （输出到 source-kb/docs/{合同资料,成本月报,综合月报,制度文件,现金流库}/）
 * ⚠️ 全部为演示数据，非业务事实。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'docs');
for (const d of ['合同资料', '成本月报', '综合月报', '制度文件', '现金流库']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const DEMO_NOTE = '\n---\n\n> 本文档为数字沙盘演示数据，非业务事实。\n';
const P = [
  {
    short: '新联01', name: '新联复建01地块', contract: 'HP-EPC-2024-011', span: '2024-05 ~ 2028-12',
    bid: 5.87, target: 4.58, actual: 4.72, profitRate: 19.59, payment: 92.3, progress: 42.8,
    costCompletion: 78.5, lag: 2, riskTotal: 12, riskRed: 2, overruns: '外墙工程、精装修、土方工程', steelOver: '钢筋采购累计超预算 7.8%（量超 4.4%、价涨 3.2%）',
  },
  {
    short: 'AZ-01', name: '均一均二复建AZ-01地块', contract: 'HP-EPC-2024-017', span: '2024-08 ~ 2029-06',
    bid: 8.66, target: 6.85, actual: 7.05, profitRate: 18.59, payment: 88.6, progress: 28.5,
    costCompletion: 65.2, lag: 1, riskTotal: 8, riskRed: 1, overruns: '地下室工程、桩基工程', steelOver: '',
  },
  {
    short: '洋田AZ-01', name: '洋田复建AZ-01地块', contract: 'HP-EPC-2024-023', span: '2025-03 ~ 2029-12',
    bid: 6.03, target: 4.72, actual: 4.68, profitRate: 22.39, payment: 95.1, progress: 18.2,
    costCompletion: 52.8, lag: 0, riskTotal: 5, riskRed: 0, overruns: '无', steelOver: '',
  },
  {
    short: 'AZ-02', name: '均一均二复建AZ-02地块', contract: 'HP-EPC-2024-028', span: '2025-06 ~ 2030-06',
    bid: 4.65, target: 3.42, actual: 3.38, profitRate: 27.31, payment: 100, progress: 5.0,
    costCompletion: 12.5, lag: 0, riskTotal: 3, riskRed: 0, overruns: '无', steelOver: '',
  },
];

// 标题与正文一律使用项目全称（短名括注）——短名单独出现会造成跨项目检索歧义
const t = (p, suffix) => `${p.name}（${p.short}）${suffix}`;

for (const p of P) {
  fs.writeFileSync(path.join(OUT, '合同资料', `${t(p, 'EPC总承包合同（要点摘录）')}.md`), `# ${t(p, ' EPC 总承包合同（要点摘录）')}

- 项目全称：${p.name}（简称：${p.short}）
- 合同编号：${p.contract}
- 发包人：广州市黄埔区城市更新建设有限公司
- 承包人：广东宏基建设集团有限公司（EPC 工程总承包）
- 承包范围：勘察设计、采购、施工总承包
- **中标合同价：${p.bid} 亿元**（含税；EPC 费率下浮 5% 后确定）
- 合同工期：${p.span}
- 付款条款：进度款按月度经监理与跟踪审计确认产值的 80% 支付；竣工验收后付至合同价 95%，其余待缺陷责任期满
${DEMO_NOTE}`);
  fs.writeFileSync(path.join(OUT, '成本月报', `${t(p, '2026年6月成本月报')}.md`), `# ${t(p, ' 2026年6月成本月报')}

编报单位：指挥部商务组　　　截数日期：2026-06-30　　　项目全称：${p.name}（简称：${p.short}）

- **目标成本：${p.target} 亿元**（2026-03 版责任成本，经指挥部批准）
- **累计实际成本：${p.actual} 亿元**
- **当前实际利润率：${p.profitRate}%**（口径：实际利润率 =（中标合同价 − 实际成本）/ 中标合同价）
- **成本完成度：${p.costCompletion}%**
- 主要超支分项：${p.overruns}${p.steelOver ? `\n- 材料专项：${p.steelOver}` : ''}
- 下月管控重点：${p.overruns === '无' ? '维持现有成本控制节奏，按周更新三算对比' : '对上述超支分项执行限额领料与专项纠偏'}

> 情景推演数值以推演引擎实时输出为准，本报告不预写推演结果。
${DEMO_NOTE}`);
  fs.writeFileSync(path.join(OUT, '综合月报', `${t(p, '2026年6月项目综合月报')}.md`), `# ${t(p, ' 2026年6月项目综合月报')}

编报单位：项目组/监理联审　　　报告期：2026-06-01 ~ 2026-06-30　　　项目全称：${p.name}（简称：${p.short}）

- **形象进度：${p.progress}%**（监理确认口径）
- **滞后里程碑：${p.lag} 个**${p.lag > 0 ? '（详见周例会纪要追赶措施）' : '（无新增滞后）'}
- **风险台账：在册 ${p.riskTotal} 项，其中红色 ${p.riskRed} 项**
- **截至 6 月累计回款率：${p.paymentRate}%**（按合同付款条款口径）
- 现场要情：${p.lag > 0 ? '滞后节点已编制赶工方案，纳入周例会跟踪' : '现场进展平稳，无重大异常'}
${DEMO_NOTE}`);
}

fs.writeFileSync(path.join(OUT, '制度文件', '三算对比与利润红线管理办法（摘录）.md'), `# 三算对比与利润红线管理办法（摘录）

发文单位：指挥部商务组　　　适用范围：全部在管复建地块

- **目标利润率红线：16.66%**（分包成本控制口径，按"实际利润率 =（中标合同价 − 实际成本）/ 中标合同价"计算）
- 任一地块实际利润率跌破红线，**48 小时内启动三算对比复核**，由商务部牵头、财务部联审
- 三算对比（估算/目标成本/实际）每月随成本月报滚动更新，作为利润管控基准
${DEMO_NOTE}`);

fs.writeFileSync(path.join(OUT, '现金流库', '资金管理办法（摘录）.md'), `# 资金管理办法（摘录）

发文单位：指挥部财务组　　　适用范围：全部在管复建地块

- **项目群现金流临界预警线：200 万元**（按月末预测结余口径）
- 月末预测结余低于临界线时触发财务预警，财务部协同外协部推进回款、调整分包付款节奏
- 现金流预测表每月随资金计划滚动更新
${DEMO_NOTE}`);

fs.writeFileSync(path.join(OUT, '制度文件', '项目成本管理制度（钢筋份额口径）.md'), `# 项目成本管理制度（钢筋份额口径 · 摘录）

发文单位：指挥部工程技术组/商务组联签

- **钢筋成本份额：18%**——钢筋目标成本 = 项目目标成本 × 18%，用于材料涨价情景的敏感度测算
- 钢材价格波动 ±X% 对利润的影响 = 钢筋目标成本 × X%，统一由推演引擎计算，人工估算仅作参考
${DEMO_NOTE}`);

fs.writeFileSync(path.join(OUT, '现金流库', '2026年6月资金计划（项目群）.md'), `# 2026年6月资金计划（项目群）

编报单位：指挥部财务组　　　报告期：2026-06

- **2026-06 全项目群预测现金流结余：420 万元**（按业主付款计划与分包/材料付款节奏测算）
- 主要前提：业主进度款按月支付、分包按月度进度款 80% 支付、材料月结 30 天
- 风险情景：业主回款延迟 15 天时，结余将逼近临界预警线，需提前启动回款催收
${DEMO_NOTE}`);

const count = ['合同资料', '成本月报', '综合月报', '制度文件', '现金流库']
  .reduce((n, d) => n + fs.readdirSync(path.join(OUT, d)).length, 0);
console.log('[gen] 生成完成：', count, '份文档（按 5 个知识库目录分置）->', OUT);
