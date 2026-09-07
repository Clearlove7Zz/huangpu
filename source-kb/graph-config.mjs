/**
 * 更新五库图谱抽取配置（nodeExtract）——走正确通道 PUT /initialization/config/:kbId。
 *
 * ⚠️ 历史坑（2026-09-07 石锤）：PUT /knowledge-bases/:id 的 body 里塞 extract_config 会被
 * Go 结构体（KnowledgeBaseConfig）静默丢弃——该字段不在其中；正确字段名是 nodeExtract，
 * 且接口同时要求 llmModelId + documentSplitting。Strategy 为指针字段，缺省=不改动（保 auto）。
 * graph-config 旧版 PUT 200 全是假成功，tags/nodes/relations 从未写入过。
 *
 * 用法：node graph-config.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
for (const line of fs.readFileSync(path.join(ROOT, 'huangpu-gateway', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && m[1] in process.env === false) process.env[m[1]] = m[2];
}
const BASE = (process.env.WEKNORA_URL || 'http://127.0.0.1:8080') + '/api/v1';
const H = { 'X-API-Key': process.env.WEKNORA_API_KEY || '', 'Content-Type': 'application/json' };
const DRY = process.argv.includes('--dry');

const LLM_MODEL_ID = 'b1f3bb81-ec07-4244-92eb-fa0b73230c15';      // qwen3.7-flash-2026-07-15
const EMBED_MODEL_ID = 'f9ee7230-6ea4-43ab-9a13-82333115872e';    // qwen3.7-text-embedding-flash

const KB = {
  contract: { id: '14bcd117-9352-42f8-a824-b47dabbb2add', name: '合同资料' },
  cost: { id: 'c3ee40ea-0815-43d8-b52f-783dc9c1f5d2', name: '成本月报' },
  overview: { id: 'e3ddfa30-84d6-446e-a27e-d2fdf71df7e1', name: '综合月报' },
  policy: { id: 'da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed', name: '制度文件' },
  cashflow: { id: 'a00aaf1f-bf35-4802-9548-508263452f55', name: '现金流库' },
};

const NORM = '命名归一（硬性）：项目实体一律命名为「镇龙东F10」（项目全称写入其 attributes，禁止把全称/合同名/简称变体单独建成实体）；金额类实体命名带数值（如「预估合同价12.7317亿」）；文档实体名与文档标题一致。\n';

const CONFIGS = [
  {
    ...KB.contract,
    custom_instructions: `本库收录镇龙东F10标前测算的招标与合同要点。项目全称：广州市黄埔区新龙镇镇龙村（西片区）城中村改造项目（镇龙东片区）复建F10地块（简称镇龙东F10）。
重点提取：
1) 实体类型：项目（镇龙东F10）、招标控制价、预估合同价、商务条款（每条款一个实体，名称含关键比例如"预付款20%"）、分部分项科目（前期工程/土方及基坑支护工程/地下室/人防工程/高层住宅/公建配套/幼儿园/外墙/精装修/室外景观工程/其他专业工程）。
2) 金额实体把数值写进属性（如"预估合同价 12.7317亿元"）。
3) 关系：条款-约束于-项目；科目-构成-项目。
不要抽取：表格标题行、页码引用、叙述性说明。`,
    text: '镇龙东F10标前测算合同要点：预付款为工程施工费的20%；高层住宅为最大分项（控制价4.2385亿元）。',
    tags: ['约束于', '构成'],
    nodes: [
      { name: '镇龙东F10', attributes: ['项目全称：广州市黄埔区新龙镇镇龙村（西片区）城中村改造项目（镇龙东片区）复建F10地块，EPC总承包，标前测算阶段'] },
      { name: '预付款20%', attributes: ['工程施工费合同价（不含暂列金额暂估价）的20%，依据17.2.1 P150'] },
      { name: '高层住宅', attributes: ['分部分项科目，控制价4.2385亿元，利润率12.63%'] },
    ],
    relations: [
      { node1: '预付款20%', node2: '镇龙东F10', type: '约束于' },
      { node1: '高层住宅', node2: '镇龙东F10', type: '构成' },
    ],
  },
  {
    ...KB.cost,
    custom_instructions: `本库收录镇龙东F10标前成本测算汇总与两算对比。项目全称：广州市黄埔区新龙镇镇龙村（西片区）城中村改造项目（镇龙东片区）复建F10地块（简称镇龙东F10）。
重点提取：
1) 实体类型：项目（镇龙东F10）、成本测算文档（标题含基准日2026-06-10）、成本科目（11科目+其他直接费/综合管理费/税金/总价措施费）、费用子项、材料实体（属性带单价与数量）、利润指标。
2) 数值必须连同单位写入属性。
3) 关系：成本测算文档-报告对象-项目；科目-构成-项目；费用子项-归属-科目；材料-用于-科目；文档-披露-利润指标。
不要抽取：markdown 表格分隔行、来源声明。`,
    text: '镇龙东F10标前成本测算：内部测算成本10.8509亿元，文明施工费2627.50万元，钢筋3000元/吨25504.18吨。',
    tags: ['报告对象', '构成', '归属', '用于', '披露'],
    nodes: [
      { name: '镇龙东F10', attributes: ['项目锚点实体：广州市黄埔区新龙镇镇龙村（西片区）城中村改造项目（镇龙东片区）复建F10地块'] },
      { name: '镇龙东F10标前成本测算汇总（2026-06-10）', attributes: ['基准日2026-06-10，测算成本10.8509亿元，利润率14.77%（相对合同价）'] },
      { name: '其他直接费', attributes: ['6018.76万元，含文明施工2627.50万、临时设施费800万等'] },
      { name: '钢筋', attributes: ['目标单价3000元/吨，总量25504.18吨'] },
    ],
    relations: [
      { node1: '镇龙东F10标前成本测算汇总（2026-06-10）', node2: '镇龙东F10', type: '报告对象' },
      { node1: '钢筋', node2: '其他直接费', type: '用于' },
    ],
  },
  {
    ...KB.overview,
    custom_instructions: `本库收录镇龙东F10项目概况、商务结构与分包计划全量明细。项目全称：广州市黄埔区新龙镇镇龙村（西片区）城中村改造项目（镇龙东片区）复建F10地块（简称镇龙东F10）。
重点提取：
1) 实体类型：项目（镇龙东F10）、参与方（上海城建市政工程（集团）有限公司=承包人/税务主体、业主方、股东方）、上缴科目（上缴公司利润8%/项目管理费1.3%/上缴税金0.837%）、对下合同细项（劳务/专业/材料逐项，属性带金额与税率）、税务指标。
2) 金额与费率连同单位写入属性。
3) 关系：参与方-承建-项目；上缴科目-计提于-项目；合同细项-构成-对下合同；文档-披露-指标。
不要抽取：整段复述、来源声明。`,
    text: '镇龙东F10商务结构：上海城建市政工程承建，代缴代扣10.14%，股东方剩余利润8737.77万元；劳务类3%简易计税、材料类13%。',
    tags: ['承建', '计提于', '构成', '披露', '报告对象'],
    nodes: [
      { name: '镇龙东F10', attributes: ['项目锚点实体：广州市黄埔区新龙镇镇龙村（西片区）城中村改造项目（镇龙东片区）复建F10地块'] },
      { name: '上海城建市政工程（集团）有限公司', attributes: ['承包人与税务主体，广州当地预缴、上海机构缴纳'] },
      { name: '上缴公司利润8%', attributes: ['10185.36万元，固定上缴负担之一'] },
      { name: '股东方剩余利润', attributes: ['8737.77万元，剩余利润率6.86%'] },
    ],
    relations: [
      { node1: '上海城建市政工程（集团）有限公司', node2: '镇龙东F10', type: '承建' },
      { node1: '上缴公司利润8%', node2: '镇龙东F10', type: '计提于' },
    ],
  },
  {
    ...KB.policy,
    custom_instructions: `本库收录镇龙东F10推演基线口径表与商务常量推导。项目全称：广州市黄埔区新龙镇镇龙村（西片区）城中村改造项目（镇龙东片区）复建F10地块（简称镇龙东F10）。
重点提取：
1) 实体类型：项目（镇龙东F10）、推演引擎字段（bid_price_yi/target_cost_yi/profit_rate/profit_red_line/steel_share_pct/critical_balance_wan等，属性写取值与口径）、推导规则（如"红线=8%+1.3%+0.837%"）。
2) 每个引擎字段的取值必须写入属性。
3) 关系：引擎字段-锚定于-项目；推导规则-推导出-引擎字段。
不要抽取：markdown 表格框架、来源声明。`,
    text: '镇龙东F10推演基线：bid_price_yi=12.7317亿，profit_red_line=10.14%（由上缴结构推导），steel_share_pct=7.08%。',
    tags: ['锚定于', '推导出'],
    nodes: [
      { name: '镇龙东F10', attributes: ['项目锚点实体：广州市黄埔区新龙镇镇龙村（西片区）城中村改造项目（镇龙东片区）复建F10地块'] },
      { name: 'profit_red_line', attributes: ['目标利润率红线10.14%，推导：上缴8%+管理费1.3%+税金0.837%'] },
      { name: 'bid_price_yi', attributes: ['预估合同价12.7317亿元，汇总表口径'] },
      { name: 'steel_share_pct', attributes: ['钢筋成本份额7.08%：钢材7683.43万÷测算成本10.8509亿'] },
    ],
    relations: [
      { node1: 'bid_price_yi', node2: '镇龙东F10', type: '锚定于' },
      { node1: 'steel_share_pct', node2: '镇龙东F10', type: '锚定于' },
    ],
  },
  {
    ...KB.cashflow,
    custom_instructions: `本库收录镇龙东F10预付款与税负资金安排。项目全称：广州市黄埔区新龙镇镇龙村（西片区）城中村改造项目（镇龙东片区）复建F10地块（简称镇龙东F10）。
重点提取：
1) 实体类型：项目（镇龙东F10）、预付款实体（属性写金额24810.78万元与比例20%）、税种（增值税/城建税/教育费附加/地方教育附加，属性带税率与税额）、合同（钢筋采购合同等，属性带签订金额）、税务方案、现金流口径声明。
2) 金额连同单位写入属性；负值保留负号。
3) 关系：预付款-支付于-项目；税种-预缴于-项目；合同-签订于-项目；税务方案-应对-税负缺口。
不要抽取：表格分隔行、申请表格式栏。`,
    text: '镇龙东F10税负安排：预付款24810.78万元，广州预缴509.87万元，需增加进项最小值1001.96万元。',
    tags: ['支付于', '预缴于', '签订于', '应对'],
    nodes: [
      { name: '镇龙东F10', attributes: ['项目锚点实体：广州市黄埔区新龙镇镇龙村（西片区）城中村改造项目（镇龙东片区）复建F10地块'] },
      { name: '预付款24810.78万元', attributes: ['工程施工费20%，含税248107773.97元，预交2%+其余7%'] },
      { name: '需增加进项最小值', attributes: ['10019592.06元，税务筹划核心约束'] },
      { name: '钢筋采购合同', attributes: ['与云链签订，提前锁定5000万货款100%支付'] },
    ],
    relations: [
      { node1: '预付款24810.78万元', node2: '镇龙东F10', type: '支付于' },
      { node1: '钢筋采购合同', node2: '镇龙东F10', type: '签订于' },
    ],
  },
];

const j = async (r) => {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { raw: t }; }
};

for (const cfg of CONFIGS) {
  const body = {
    llmModelId: LLM_MODEL_ID,
    embeddingModelId: EMBED_MODEL_ID,
    documentSplitting: {
      chunkSize: 512,
      chunkOverlap: 80,
      separators: ['\n\n', '\n', '。', '！', '？', ';', '；'],
      parserEngineRules: [{ engine: 'anydoc', fileTypes: ['pdf'] }, { engine: 'anydoc', fileTypes: ['docx', 'doc'] }, { engine: 'anydoc', fileTypes: ['pptx', 'ppt'] }, { engine: 'anydoc', fileTypes: ['xlsx', 'xls'] }],
      enableParentChild: true,
      parentChunkSize: 4096,
      childChunkSize: 384,
      // Strategy/TokenLimit/Languages 缺省 = 无变更（保住刚切的 auto）
    },
    nodeExtract: {
      enabled: true,
      text: cfg.text,
      tags: cfg.tags,
      nodes: cfg.nodes,
      relations: cfg.relations,
      customInstructions: NORM + cfg.custom_instructions,
    },
    questionGeneration: { enabled: false, questionCount: 3, customInstructions: '' },
  };
  if (DRY) { console.log(`[graph] [${cfg.name}] (dry) tags=${cfg.tags.join('/')}`); continue; }
  const res = await j(await fetch(`${BASE}/initialization/config/${cfg.id}`, {
    method: 'PUT', headers: H, body: JSON.stringify(body),
  }));
  const ok = (res.data ?? res)?.success ?? false;
  console.log(`[graph] [${cfg.name}] PUT initialization/config ${ok ? '200 成功' : JSON.stringify(res).slice(0, 220)}`);
}
