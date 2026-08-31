// 成本测算子系统数据结构 v1.3
Object.assign(MOCK_DATA, {

  // ===== 表一：工程审核对比表（广联达造价+施工深化图纸） =====
  auditCompare: {
    projectList: [
      { id: 'basement', name: '地下室-地下室工程', submit: 101073953.98, audit: 88796970.77, diff: -12276983.21 },
      { id: 'earthwork', name: '土石方工程', submit: 8500000, audit: 7837140, diff: -662860 },
      { id: 'residential', name: '高层住宅', submit: 452000000, audit: 428000000, diff: -24000000 }
    ],
    // 总表（各单项工程汇总）
    masterSummary: [
      { seq: 1, name: '地下室工程', submit: 101073953.98, audit: 88796970.77, increase: 36075162.39, decrease: 48352145.6, diff: -12276983.21 },
      { seq: 2, name: '土石方工程', submit: 8500000, audit: 7837140, increase: 120000, decrease: 782860, diff: -662860 },
      { seq: 3, name: '高层住宅', submit: 452000000, audit: 428000000, increase: 8500000, decrease: 32500000, diff: -24000000 }
    ],
    units: {
      basement: {
        name: '地下室-地下室工程',
        summary: [
          { seq: 1, name: '分部分项合计', submit: 73945464.56, audit: 63685487.03, increase: 29428552.65, decrease: 39688530.18, diff: -10259977.53 },
          { seq: 2, name: '措施合计', submit: 15277686.14, audit: 14753021.54, increase: 3667926.61, decrease: 4192591.21, diff: -524664.6 },
          { seq: '2.1', name: '绿色施工安全防护措施费', submit: 4173827.07, audit: 3522438.09, increase: 363614.85, decrease: 1015003.83, diff: -651388.98 },
          { seq: '2.2', name: '其他措施费', submit: 11103859.07, audit: 11230583.45, increase: 3304311.76, decrease: 3177587.38, diff: 126724.38 },
          { seq: 3, name: '其他项目', submit: 3505247.45, audit: 3026602.23, increase: 0, decrease: 478645.22, diff: -478645.22 },
          { seq: 4, name: '税前工程造价', submit: 92728398.15, audit: 81465110.8, increase: 33096479.26, decrease: 44359766.61, diff: -11263287.35 },
          { seq: 5, name: '增值税销项税额', submit: 8345555.83, audit: 7331859.97, increase: 2978683.13, decrease: 3992378.99, diff: -1013695.86 },
          { seq: 6, name: '总造价', submit: 101073953.98, audit: 88796970.77, increase: 36075162.39, decrease: 48352145.6, diff: -12276983.21 }
        ],
        boq: [
          { code: '010101004001', name: '挖基础土方', unit: 'm3', submitQty: 14615.28, submitPrice: 10.26, submitAmt: 149952.77, auditQty: 13700.24, auditPrice: 10.26, auditAmt: 140564.46, increase: 0, decrease: 9388.31, diff: -9388.31, note: '[调量]' },
          { code: '010103001001', name: '回填方', unit: 'm3', submitQty: 2975.06, submitPrice: 21.91, submitAmt: 65183.56, auditQty: 5424.13, auditPrice: 21.91, auditAmt: 118842.69, increase: 53659.13, decrease: 0, diff: 53659.13, note: '[调量]' },
          { code: '010103002001', name: '余方弃置', unit: 'm3', submitQty: 11900.22, submitPrice: 50.87, submitAmt: 605364.19, auditQty: 8276.11, auditPrice: 50.89, auditAmt: 421171.24, increase: 0, decrease: 184192.95, diff: -184192.95, note: '[调量,调价]' },
          { code: '010402001004', name: '砌块墙200mm', unit: 'm3', submitQty: 2866.02, submitPrice: 475.13, submitAmt: 1361732.08, auditQty: 2721.03, auditPrice: 559.21, auditAmt: 1521627.19, increase: 159895.11, decrease: 0, diff: 159895.11, note: '[调量,调价]' },
          { code: '010501003002', name: '筏板基础', unit: 'm3', submitQty: 7506.11, submitPrice: 589.54, submitAmt: 4425152.09, auditQty: 9078.3, auditPrice: 589.54, auditAmt: 5352020.98, increase: 926868.89, decrease: 0, diff: 926868.89, note: '[调量]' },
          { code: '010504001005', name: '地下室侧墙', unit: 'm3', submitQty: 2121.2, submitPrice: 627.67, submitAmt: 1331413.6, auditQty: 2401.73, auditPrice: 627.67, auditAmt: 1507493.87, increase: 176080.27, decrease: 0, diff: 176080.27, note: '[调量]' }
        ],
        ownerVsAudit: [
          { item: '挖基础土方', unit: 'm³', ownerQty: 14615, ownerPrice: 10.26, ownerAmt: 149953, auditQty: 13700, auditPrice: 10.26, auditAmt: 140564, qtyDiff: -915, priceDiff: 0, diff: -9389, note: '业主量偏大，按深化图纸核减' },
          { item: '余方弃置', unit: 'm³', ownerQty: 11900, ownerPrice: 50.87, ownerAmt: 605364, auditQty: 8276, auditPrice: 50.89, auditAmt: 421171, qtyDiff: -3624, priceDiff: 0.02, diff: -184193, note: '运距及工程量双偏差' },
          { item: '筏板基础', unit: 'm³', ownerQty: 9078, ownerPrice: 589.54, ownerAmt: 5352021, auditQty: 9078, auditPrice: 589.54, auditAmt: 5352021, qtyDiff: 0, priceDiff: 0, diff: 0, note: '量核一致' },
          { item: '砌块墙200mm', unit: 'm³', ownerQty: 2721, ownerPrice: 559.21, ownerAmt: 1521627, auditQty: 2721, auditPrice: 559.21, auditAmt: 1521627, qtyDiff: 0, priceDiff: 0, diff: 0, note: '—' }
        ]
      },
      earthwork: {
        name: '土石方工程（新联01）',
        summary: [
          { seq: 1, name: '分部分项合计', submit: 7190000, audit: 7190000, increase: 0, decrease: 0, diff: 0 },
          { seq: 2, name: '措施合计', submit: 850000, audit: 820000, increase: 0, decrease: 30000, diff: -30000 },
          { seq: 3, name: '总造价', submit: 8500000, audit: 7837140, increase: 120000, decrease: 782860, diff: -662860 }
        ],
        boq: [
          { code: '1', name: '大土方开挖及外运', unit: 'M3', submitQty: 150000, submitPrice: 39, submitAmt: 5850000, auditQty: 150000, auditPrice: 39, auditAmt: 5850000, increase: 0, decrease: 0, diff: 0, note: '' },
          { code: '2', name: '桩芯土淤泥外运', unit: 'M3', submitQty: 6000, submitPrice: 39, submitAmt: 234000, auditQty: 6000, auditPrice: 39, auditAmt: 234000, increase: 0, decrease: 0, diff: 0, note: '' },
          { code: '3', name: '土方回填', unit: 'M3', submitQty: 34000, submitPrice: 10, submitAmt: 340000, auditQty: 34000, auditPrice: 10, auditAmt: 340000, increase: 0, decrease: 0, diff: 0, note: '' },
          { code: '4', name: '小土方开挖外运', unit: 'M3', submitQty: 18000, submitPrice: 39, submitAmt: 702000, auditQty: 18000, auditPrice: 39, auditAmt: 702000, increase: 0, decrease: 0, diff: 0, note: '' },
          { code: '5', name: '清表', unit: 'M2', submitQty: 20000, submitPrice: 3.2, submitAmt: 64000, auditQty: 20000, auditPrice: 3.2, auditAmt: 64000, increase: 0, decrease: 0, diff: 0, note: '' }
        ],
        ownerVsAudit: []
      },
      residential: {
        name: '高层住宅',
        summary: [
          { seq: 1, name: '分部分项合计', submit: 380000000, audit: 360000000, increase: 5200000, decrease: 25200000, diff: -20000000 },
          { seq: 2, name: '措施合计', submit: 42000000, audit: 40000000, increase: 1800000, decrease: 3800000, diff: -2000000 },
          { seq: 3, name: '总造价', submit: 452000000, audit: 428000000, increase: 8500000, decrease: 32500000, diff: -24000000 }
        ],
        boq: [
          { code: '010101', name: '主体结构混凝土', unit: 'm3', submitQty: 28500, submitPrice: 580, submitAmt: 16530000, auditQty: 27200, auditPrice: 580, auditAmt: 15776000, increase: 0, decrease: 754000, diff: -754000, note: '[调量]' },
          { code: '010201', name: 'HRB400钢筋', unit: 't', submitQty: 8200, submitPrice: 4350, submitAmt: 35670000, auditQty: 7800, auditPrice: 4280, auditAmt: 33384000, increase: 0, decrease: 2286000, diff: -2286000, note: '[调量,调价]' },
          { code: '010301', name: '砌体工程', unit: 'm3', submitQty: 12500, submitPrice: 520, submitAmt: 6500000, auditQty: 12000, auditPrice: 520, auditAmt: 6240000, increase: 0, decrease: 260000, diff: -260000, note: '[调量]' }
        ],
        ownerVsAudit: [
          { item: '主体结构混凝土', unit: 'm³', ownerQty: 28500, ownerAmt: 16530000, auditQty: 27200, auditAmt: 15776000, qtyDiff: -1300, diff: -754000, note: '业主量偏大' }
        ]
      }
    }
  },

  // ===== 表二：三算对比表 =====
  threeValueCompare: {
    summary: [
      { id: 'division', name: '一、分部分项及单价措施工程费', tender: 113876.28, contract: 108182.47, internalCost: 85348.10, profit: 22834.36, profitRate: 21.11, actualCost: 87250.50, actualProfit: 20931.97, actualRate: 19.35, variance: -1.76, warn: true, analysis: '地下室实际成本超测算约1.9%，主要因钢筋单价上涨' },
      { id: 'early', name: '　前期工程', tender: 122.43, contract: 116.31, internalCost: 82.90, profit: 33.41, profitRate: 28.72, actualCost: 85.20, actualProfit: 31.11, actualRate: 26.75, variance: -1.97, warn: false, analysis: '基本吻合' },
      { id: 'earth', name: '　土方及基坑支护工程', tender: 7628.93, contract: 7247.49, internalCost: 5566.02, profit: 1681.47, profitRate: 23.20, actualCost: 5680.30, actualProfit: 1567.19, actualRate: 21.62, variance: -1.58, warn: false, analysis: '浚凯土石方中标价控制良好' },
      { id: 'basement', name: '　地下室', tender: 30173.75, contract: 28665.06, internalCost: 22021.92, profit: 6643.14, profitRate: 23.17, actualCost: 23150.80, actualProfit: 5514.26, actualRate: 19.24, variance: -3.93, warn: true, analysis: '实际成本超测算5.1%，筏板工程量增加+钢筋涨价' },
      { id: 'residential', name: '　高层住宅', tender: 42385.38, contract: 40266.11, internalCost: 33115.85, profit: 7150.26, profitRate: 17.76, actualCost: 33820.00, actualProfit: 6446.11, actualRate: 16.01, variance: -1.75, warn: true, analysis: '接近红线16.66%，需关注装饰分包价' },
      { id: 'facade', name: '　外墙', tender: 3160.55, contract: 3002.52, internalCost: 2212.39, profit: 790.13, profitRate: 26.32, actualCost: 2180.50, actualProfit: 822.02, actualRate: 27.38, variance: 1.06, warn: false, analysis: '优于测算' },
      { id: 'decoration', name: '　精装修', tender: 17132.91, contract: 16276.26, internalCost: 11991.55, profit: 4284.71, profitRate: 26.32, actualCost: 12350.00, actualProfit: 3926.26, actualRate: 24.12, variance: -2.20, warn: false, analysis: '华南装饰进度款控制中' },
      { id: 'measure', name: '二、总价措施费', tender: 4200.00, contract: 3980.00, internalCost: 3100.00, profit: 880.00, profitRate: 22.11, actualCost: 3150.00, actualProfit: 830.00, actualRate: 20.85, variance: -1.26, warn: false, analysis: '' },
      { id: 'other', name: '三、其他项目费', tender: 3500.00, contract: 3300.00, internalCost: 0, profit: 0, profitRate: 0, actualCost: 0, actualProfit: 0, actualRate: 0, variance: 0, warn: false, analysis: '含预算包干费924.98万、暂列金2101.62万' },
      { id: 'otherDirect', name: '四、其他直接费', tender: 3550.00, contract: 3380.00, internalCost: 3380.00, profit: 0, profitRate: 0, actualCost: 3420.00, actualProfit: -40.00, actualRate: -1.18, variance: -1.18, warn: true, analysis: '安全文明施工费实际略高于测算' },
      { id: 'indirect', name: '五、间接费', tender: 2800.00, contract: 2660.00, internalCost: 2660.00, profit: 0, profitRate: 0, actualCost: 2680.00, actualProfit: -20.00, actualRate: -0.75, variance: -0.75, warn: false, analysis: '' },
      { id: 'tax', name: '六、税金', tender: 10248.87, contract: 9736.42, internalCost: 9736.42, profit: 0, profitRate: 0, actualCost: 9850.00, actualProfit: -113.58, actualRate: -1.17, variance: -1.17, warn: false, analysis: '' },
      { id: 'total', name: '合计', tender: 131975.15, contract: 125338.89, internalCost: 101464.52, profit: 23874.37, profitRate: 19.05, actualCost: 103150.50, actualProfit: 22188.39, actualRate: 17.70, variance: -1.35, warn: true, analysis: '整体低于目标16.66%红线边缘，地下室和住宅需重点纠偏' }
    ],
    details: {
      basement: [
        { name: '土石方工程', tender: 820.50, contract: 780.00, internalCost: 680.58, actualCost: 695.20, variance: 14.62, analysis: '回填方量增加' },
        { name: '砌筑工程', tender: 1969.02, contract: 1870.00, internalCost: 1523.99, actualCost: 1580.50, variance: 56.51, analysis: '砌块墙单价上涨' },
        { name: '混凝土及钢筋混凝土', tender: 45200.00, contract: 42940.00, internalCost: 33100.00, actualCost: 34850.00, variance: 1750.00, analysis: '筏板/侧墙工程量增加' },
        { name: '钢筋工程', tender: 14560.00, contract: 13832.00, internalCost: 11200.00, actualCost: 11850.00, variance: 650.00, analysis: 'HRB400钢筋超预算7.8%' }
      ],
      earth: [
        { name: '大土方开挖及外运', tender: 637.65, contract: 605.78, internalCost: 520.00, actualCost: 520.00, variance: 0, analysis: '按中标价执行' },
        { name: '清表', tender: 6.98, contract: 6.63, internalCost: 5.50, actualCost: 5.50, variance: 0, analysis: '' }
      ]
    }
  },

  // ===== 表三：实际成本清单 =====
  actualCostList: {
    subcontracts: [
      { id: 'FB-001', name: '土石方工程', supplier: '广州浚凯土石方工程有限公司', scope: '大土方开挖外运、回填、清表等', budgetPrice: 850, actualBidPrice: 783.7, content: '土石方专业分包全部内容', status: '执行中', paid: 520 },
      { id: 'FB-002', name: '精装修工程', supplier: '华南装饰工程', scope: '室内精装修全部内容', budgetPrice: 1950, actualBidPrice: 1850, content: '地砖、墙砖、吊顶、门窗套等', status: '执行中', paid: 920 },
      { id: 'FB-003', name: '机电安装工程', supplier: '广达机电安装', scope: '给排水、电气、暖通安装', budgetPrice: 1300, actualBidPrice: 1250, content: '地下室及住宅机电安装', status: '执行中', paid: 890 },
      { id: 'FB-004', name: '防水工程', supplier: '上海诺浦建设集团', scope: '地下室及屋面防水', budgetPrice: 420, actualBidPrice: 398, content: '卷材防水、涂膜防水', status: '筹备', paid: 0 },
      { id: 'FB-005', name: '桩基支护工程', supplier: '广东广强基础工程', scope: '桩基及基坑支护', budgetPrice: 720, actualBidPrice: 680, content: '钻孔灌注桩、基坑支护', status: '已完成', paid: 680 }
    ],
    materials: [
      { id: 'CL-001', name: 'HRB400钢筋', supplier: '上海建元云链科技', unit: 't', budgetQty: 3200, budgetPrice: 4200, actualQty: 3450, actualPrice: 4350, purchased: 3580, content: '主体结构用钢筋', warn: true },
      { id: 'CL-002', name: 'C30商品混凝土', supplier: '广州市长运预拌混凝土', unit: 'm³', budgetQty: 12500, budgetPrice: 420, actualQty: 11800, actualPrice: 415, purchased: 12200, content: '地下室及主体结构', warn: false },
      { id: 'CL-003', name: '蒸压加气砌块', supplier: '广州市九环新型建材', unit: 'm³', budgetQty: 8500, budgetPrice: 285, actualQty: 8200, actualPrice: 278, purchased: 8300, content: '内墙砌筑', warn: false },
      { id: 'CL-004', name: '模板方木', supplier: '广州麒塑建材', unit: 'm²', budgetQty: 28000, budgetPrice: 42, actualQty: 25800, actualPrice: 40, purchased: 26500, content: '主体结构模板', warn: false },
      { id: 'CL-005', name: '湿拌砂浆', supplier: '广州稔华建材', unit: 't', budgetQty: 4200, budgetPrice: 480, actualQty: 4520, actualPrice: 495, purchased: 4650, content: '砌筑及抹灰砂浆', warn: true }
    ],
    bidBoq: [
      { seq: 1, name: '大土方开挖及外运', unit: 'M3', qty: 150000, priceNoTax: 39, totalNoTax: 5850000, tax: '9%', supplier: '广州浚凯土石方', type: '分包' },
      { seq: 2, name: '桩芯土淤泥外运', unit: 'M3', qty: 6000, priceNoTax: 39, totalNoTax: 234000, tax: '9%', supplier: '广州浚凯土石方', type: '分包' },
      { seq: 3, name: '土方回填', unit: 'M3', qty: 34000, priceNoTax: 10, totalNoTax: 340000, tax: '9%', supplier: '广州浚凯土石方', type: '分包' },
      { seq: 4, name: '小土方开挖外运', unit: 'M3', qty: 18000, priceNoTax: 39, totalNoTax: 702000, tax: '9%', supplier: '广州浚凯土石方', type: '分包' },
      { seq: 5, name: '清表', unit: 'M2', qty: 20000, priceNoTax: 3.2, totalNoTax: 64000, tax: '9%', supplier: '广州浚凯土石方', type: '分包' }
    ]
  },

  // ===== 动态现金流（细化） =====
  cashflowDetail: {
    assumptions: [
      '回款周期：业主付款后15个工作日到账',
      '分包付款：按月度进度款80%支付',
      '材料付款：月结30天',
      '临界结余预警线：200万元'
    ],
    monthly: [
      { month: '2026-01', ownerPayment: 2800, otherIncome: 120, forecastIncome: 2950, outputValue: 2650, subcontract: 1580, material: 680, labor: 320, manage: 180, tax: 150, actualBalance: 610, forecastBalance: 580, actualExpense: 2910, forecastExpense: 2940 },
      { month: '2026-02', ownerPayment: 3100, otherIncome: 80, forecastIncome: 3250, outputValue: 2880, subcontract: 1720, material: 750, labor: 350, manage: 190, tax: 165, actualBalance: 805, forecastBalance: 750, actualExpense: 2375, forecastExpense: 2430 },
      { month: '2026-03', ownerPayment: 3400, otherIncome: 100, forecastIncome: 3580, outputValue: 3120, subcontract: 1850, material: 820, labor: 380, manage: 200, tax: 180, actualBalance: 670, forecastBalance: 700, actualExpense: 2630, forecastExpense: 2600 },
      { month: '2026-04', ownerPayment: 3700, otherIncome: 90, forecastIncome: 3920, outputValue: 3450, subcontract: 1920, material: 880, labor: 400, manage: 210, tax: 195, actualBalance: 785, forecastBalance: 820, actualExpense: 2605, forecastExpense: 2570 },
      { month: '2026-05', ownerPayment: 4000, otherIncome: 110, forecastIncome: 4280, outputValue: 3780, subcontract: 2100, material: 950, labor: 420, manage: 220, tax: 210, actualBalance: 610, forecastBalance: 650, actualExpense: 2900, forecastExpense: 2860 },
      { month: '2026-06', ownerPayment: 3800, otherIncome: 80, forecastIncome: 4100, outputValue: 3950, subcontract: 2050, material: 920, labor: 410, manage: 215, tax: 205, actualBalance: null, forecastBalance: 420, actualExpense: null, forecastExpense: 3460, warn: true }
    ],
    byProject: [
      { project: '新联复建01', month: '2026-05', ownerPayment: 1750, subcontract: 920, material: 420, labor: 180, manage: 95, tax: 88, balance: 220, forecast: 260, collectionRate: 92.3, warn: false },
      { project: '均一均二AZ-01', month: '2026-05', ownerPayment: 1280, subcontract: 680, material: 310, labor: 140, manage: 72, tax: 65, balance: 150, forecast: 120, collectionRate: 88.6, warn: true },
      { project: '洋田AZ-01', month: '2026-05', ownerPayment: 980, subcontract: 520, material: 230, labor: 100, manage: 55, tax: 48, balance: 180, forecast: 200, collectionRate: 95.1, warn: false },
      { project: '均一均二AZ-02', month: '2026-05', ownerPayment: 640, subcontract: 380, material: 180, labor: 80, manage: 42, tax: 38, balance: 130, forecast: 100, collectionRate: 100, warn: true }
    ],
    sensitivity: [
      { scenario: '基准预测', junForecast: 420, desc: '按当前回款及付款节奏' },
      { scenario: '业主回款延迟15天', junForecast: 280, desc: '6月结余降至临界值以下' },
      { scenario: '钢筋涨价5%', junForecast: 350, desc: '材料支出增加约85万' },
      { scenario: '加速地下室施工', junForecast: 180, desc: '分包付款前置，现金流承压' }
    ],
    criticalBalance: 200
  },

  // Jarvis BIM 进度展示
  jarvisBim: {
    url: 'https://ee.jarvisbim.com.cn',
    account: 'isbimpublic@jarvis.net.cn',
    password: 'public123456',
    note: '体验账号 · 内部形象进度展示入口'
  }
});
