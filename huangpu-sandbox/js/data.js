// 黄埔区城更数字沙盘 - Demo 模拟数据（v1.2）
const MOCK_DATA = {
  currentUser: { name: '艾经理', role: '指挥部-商务部', avatar: '艾' },
  profitRedLine: 16.66, // 项目目标利润率（通过分包成本控制）
  ownerProfitRate: 5, // 业主给予的总包利润（EPC费率下浮5%）
  materialWarnThreshold: 10,

  roles: {
    '股份领导/指挥长': { nav: ['dashboard', 'project', 'decision-system'], name: '宁总' },
    '指挥部-商务部': { nav: ['dashboard', 'project', 'decision-system', 'progress-system', 'design-control', 'documents', 'work-mgmt', 'cost-system', 'material', 'supplier-system', 'cashflow', 'reports', 'sync'], name: '艾经理' },
    '指挥部-外协部': { nav: ['dashboard', 'project', 'decision-system', 'documents', 'work-mgmt', 'coordination', 'reports', 'sync'], name: '吴主任' },
    '指挥部-工程技术部': { nav: ['dashboard', 'project', 'decision-system', 'progress-system', 'design-control', 'documents', 'work-mgmt', 'risk-system', 'safety-log', 'reports', 'sync'], name: '曹经理' },
    '安全员': { nav: ['dashboard', 'project', 'progress-system', 'risk-system', 'safety-log', 'documents', 'reports', 'sync'], name: '熊安全员' },
    '指挥部-财务部': { nav: ['dashboard', 'project', 'decision-system', 'documents', 'supplier-system', 'cashflow', 'reports', 'sync'], name: '王会计' }
  },

  // 四个地块（来源：黄埔城更项目现场情况和需求PPT）
  projects: [
    {
      id: 'xl_fj01',
      name: '新联复建01地块',
      shortName: '新联01',
      status: 'pilot',
      statusLabel: '首期试点',
      builder: '市政集团',
      area: 156000,
      totalCost: 6.18,
      contractMode: 'EPC（费率下浮5%）',
      startDate: '2025-03-15',
      endDate: '2027-12-31',
      progress: 42.8,
      lagNodes: 2,
      outputTotal: 2.65,
      outputMonth: 0.48,
      costCompletion: 78.5,
      profitRate: 17.2,
      paymentRate: 92.3,
      risks: { total: 12, red: 2, yellow: 5, blue: 5, pending: 4, overThreshold: 1 },
      cost: { tenderPrice: 6.18, bidPrice: 5.87, targetCost: 4.58, actualCost: 4.72, overrunItems: 3, topOverruns: ['外墙工程', '精装修', '土方工程'] }
    },
    {
      id: 'jyje_az01',
      name: '均一均二复建AZ-01地块',
      shortName: 'AZ-01',
      status: 'normal',
      statusLabel: '在建',
      builder: '市政集团',
      area: 198000,
      totalCost: 9.12,
      contractMode: 'EPC（费率下浮5%）',
      startDate: '2025-06-01',
      endDate: '2028-06-30',
      progress: 28.5,
      lagNodes: 1,
      outputTotal: 2.12,
      outputMonth: 0.35,
      costCompletion: 65.2,
      profitRate: 15.8,
      paymentRate: 88.6,
      risks: { total: 8, red: 1, yellow: 3, blue: 4, pending: 2, overThreshold: 1 },
      cost: { tenderPrice: 9.12, bidPrice: 8.66, targetCost: 6.85, actualCost: 7.05, overrunItems: 2, topOverruns: ['地下室工程', '桩基工程'] }
    },
    {
      id: 'yt_az01',
      name: '洋田复建AZ-01地块',
      shortName: '洋田AZ-01',
      status: 'normal',
      statusLabel: '在建',
      builder: '市政集团',
      area: 188062,
      totalCost: 6.35,
      contractMode: 'EPC（费率下浮5%）',
      startDate: '2025-09-01',
      endDate: '2028-03-31',
      progress: 18.2,
      lagNodes: 0,
      outputTotal: 0.98,
      outputMonth: 0.22,
      costCompletion: 52.8,
      profitRate: 18.5,
      paymentRate: 95.1,
      risks: { total: 5, red: 0, yellow: 2, blue: 3, pending: 1, overThreshold: 0 },
      cost: { tenderPrice: 6.35, bidPrice: 6.03, targetCost: 4.72, actualCost: 4.68, overrunItems: 0, topOverruns: [] }
    },
    {
      id: 'jyje_az02',
      name: '均一均二复建AZ-02地块',
      shortName: 'AZ-02',
      status: 'planning',
      statusLabel: '筹备中',
      builder: '上海路桥',
      area: 125000,
      totalCost: 4.89,
      contractMode: 'EPC（费率下浮5%）',
      startDate: '2026-03-01',
      endDate: '2029-03-31',
      progress: 5.0,
      lagNodes: 0,
      outputTotal: 0,
      outputMonth: 0,
      costCompletion: 12.5,
      profitRate: 17.8,
      paymentRate: 100,
      risks: { total: 3, red: 0, yellow: 1, blue: 2, pending: 2, overThreshold: 0 },
      cost: { tenderPrice: 4.89, bidPrice: 4.65, targetCost: 3.42, actualCost: 3.38, overrunItems: 0, topOverruns: [] }
    }
  ],

  // 航拍图 + AI 进展对比标注
  aerialPhotos: [
    { month: '2026-01', label: '1月', desc: '场地清表完成，基坑支护施工启动，临设搭建完毕。', photos: ['1月-1.jpg', '1月-2.jpg', '1月-3.jpg'], aiCompare: false },
    { month: '2026-02', label: '2月', desc: '基坑开挖至-3层，塔吊安装完成2台，桩基工程收尾。', photos: ['2月-1.jpg', '2月-2.jpg'], aiCompare: true, compareWith: '1月',
      aiSummary: '较1月：基坑开挖加深约3m，新增塔吊2台，临设区扩大',
      annotations: { '2月-1.jpg': [{ x: 45, y: 55, label: '基坑开挖加深', type: 'progress' }, { x: 72, y: 30, label: '塔吊新增2台', type: 'new' }] } },
    { month: '2026-03', label: '3月', desc: '地下室底板浇筑，材料堆场规范化，施工道路硬化。', photos: ['3月-1.jpg', '3月-2.jpg'], aiCompare: true, compareWith: '2月',
      aiSummary: '较2月：底板浇筑完成约60%，道路硬化，堆场规范化',
      annotations: { '3月-1.jpg': [{ x: 38, y: 48, label: '底板浇筑区域', type: 'new' }, { x: 15, y: 70, label: '硬化道路', type: 'progress' }] } },
    { month: '2026-04', label: '4月', desc: '地下室负二层结构施工，塔吊增至4台，现场文明施工提升。', photos: ['4月-1.jpg', '4月-2.jpg', '4月-3.jpg'], aiCompare: true, compareWith: '3月',
      aiSummary: '较3月：负二层结构成型，塔吊增至4台，绿网覆盖提升',
      annotations: { '4月-1.jpg': [{ x: 42, y: 40, label: '负二层结构', type: 'progress' }, { x: 65, y: 22, label: '塔吊+2台', type: 'new' }, { x: 25, y: 65, label: '绿网覆盖', type: 'progress' }] } },
    { month: '2026-05', label: '5月', desc: '地下室负一层结构完成80%，正在进行三层底板浇筑。', photos: ['5月-1.jpg', '5月-2.jpg'], aiCompare: true, compareWith: '4月',
      aiSummary: '较4月：负一层结构完成80%，新增1台塔吊，材料堆场调整',
      annotations: { '5月-1.jpg': [{ x: 40, y: 35, label: '负一层结构80%', type: 'progress' }, { x: 78, y: 28, label: '塔吊增至5台', type: 'new' }, { x: 55, y: 62, label: '三层底板浇筑', type: 'new' }],
        '5月-2.jpg': [{ x: 50, y: 45, label: '施工面扩大', type: 'progress' }, { x: 20, y: 75, label: '堆场调整', type: 'change' }] } }
  ],

  // 四地块每周排名（第21周）
  weeklyRanking: {
    week: '2026年第21周',
    period: '5.19 - 5.25',
    dimensions: ['综合得分', '进度完成', '安全文明', '成本管控', '出图完成'],
    rankings: [
      { rank: 1, projectId: 'xl_fj01', name: '新联复建01', scores: { overall: 92, progress: 95, safety: 88, cost: 90, design: 85 }, trend: 'up' },
      { rank: 2, projectId: 'yt_az01', name: '洋田AZ-01', scores: { overall: 86, progress: 82, safety: 92, cost: 88, design: 90 }, trend: 'up' },
      { rank: 3, projectId: 'jyje_az01', name: '均一均二AZ-01', scores: { overall: 78, progress: 75, safety: 85, cost: 72, design: 78 }, trend: 'down' },
      { rank: 4, projectId: 'jyje_az02', name: '均一均二AZ-02', scores: { overall: 65, progress: 60, safety: 80, cost: 70, design: 55 }, trend: 'flat' }
    ]
  },

  // 项目大事记
  majorEvents: [
    { date: '2025-03-15', project: '新联复建01', title: '项目正式开工', type: '里程碑', desc: '举行开工仪式，桩基工程启动', image: 'assets/aerial/1月-1.jpg' },
    { date: '2025-04-20', project: '新联复建01', title: '一期施工许可证取得', type: '证照', desc: '完成一期施工许可办理', image: 'assets/aerial/1月-2.jpg' },
    { date: '2025-06-30', project: '新联复建01', title: '桩基工程完成', type: '进度', desc: '全部桩基施工完成，延期8天', image: 'assets/aerial/2月-1.jpg' },
    { date: '2025-09-01', project: '洋田AZ-01', title: '洋田地块开工', type: '里程碑', desc: '洋田复建AZ-01地块正式开工', image: 'assets/aerial/3月-1.jpg' },
    { date: '2025-11-15', project: '均一均二AZ-01', title: '地下室开工', type: '进度', desc: 'AZ-01地块地下室结构施工启动', image: 'assets/aerial/3月-2.jpg' },
    { date: '2026-01-10', project: '新联复建01', title: '地下室底板浇筑', type: '进度', desc: '完成地下室底板混凝土浇筑', image: 'assets/aerial/4月-1.jpg' },
    { date: '2026-03-20', project: '新联复建01', title: '二星智慧工地申报', type: '创奖', desc: '启动二星智慧工地评级申报', image: 'assets/aerial/4月-2.jpg' },
    { date: '2026-05-08', project: '均一均二AZ-01', title: '利润率低于红线预警', type: '成本', desc: '当前实际利润率15.8%，低于目标16.66%', image: 'assets/aerial/5月-1.jpg' },
    { date: '2026-05-18', project: '新联复建01', title: '钢筋超量预警', type: '物资', desc: 'HRB400钢筋消耗超预算7.8%', image: 'assets/aerial/4月-3.jpg' },
    { date: '2026-05-25', project: '新联复建01', title: '负一层结构完成80%', type: '进度', desc: '航拍确认地下室负一层主体结构完成80%', image: 'assets/aerial/5月-2.jpg' }
  ],

  // 施工进度与出图计划（工程技术部）
  progressSystem: {
    syncSource: 'Excel导入 / Jarvis进度展示',
    syncStatus: '接口对接中（待定）',
    fallbackMethod: 'Excel表格导入 / 图片识别',
    lastImport: '2026-05-26 16:30',
    defaultProjectId: 'xl_fj01',
    milestonesByProject: {
      xl_fj01: [
        { name: '桩基工程完成', plan: '2025-06-30', actual: '2025-07-08', status: 'lag', lagDays: 8, weight: 8 },
        { name: '地下室结构封顶', plan: '2025-12-31', actual: '—', status: 'doing', lagDays: 0, weight: 22 },
        { name: '主体结构封顶', plan: '2026-08-31', actual: '—', status: 'pending', lagDays: 0, weight: 35 },
        { name: '外立面完成', plan: '2027-03-31', actual: '—', status: 'pending', lagDays: 0, weight: 15 },
        { name: '竣工验收', plan: '2027-12-31', actual: '—', status: 'pending', lagDays: 0, weight: 20 }
      ],
      jyje_az01: [
        { name: '土方工程完成', plan: '2025-10-31', actual: '2025-11-05', status: 'done', lagDays: 5, weight: 12 },
        { name: '地下室结构封顶', plan: '2026-06-30', actual: '—', status: 'doing', lagDays: 0, weight: 28 },
        { name: '主体结构封顶', plan: '2027-02-28', actual: '—', status: 'pending', lagDays: 0, weight: 35 },
        { name: '竣工验收', plan: '2028-06-30', actual: '—', status: 'pending', lagDays: 0, weight: 25 }
      ],
      yt_az01: [
        { name: '桩基工程完成', plan: '2026-03-31', actual: '2026-04-02', status: 'done', lagDays: 2, weight: 10 },
        { name: '地下室结构封顶', plan: '2026-09-30', actual: '—', status: 'doing', lagDays: 0, weight: 30 },
        { name: '主体结构封顶', plan: '2027-06-30', actual: '—', status: 'pending', lagDays: 0, weight: 40 },
        { name: '竣工验收', plan: '2028-03-31', actual: '—', status: 'pending', lagDays: 0, weight: 20 }
      ],
      jyje_az02: [
        { name: '场地移交', plan: '2026-01-31', actual: '—', status: 'doing', lagDays: 0, weight: 8 },
        { name: '桩基工程完成', plan: '2026-08-31', actual: '—', status: 'pending', lagDays: 0, weight: 15 },
        { name: '主体结构封顶', plan: '2028-12-31', actual: '—', status: 'pending', lagDays: 0, weight: 45 },
        { name: '竣工验收', plan: '2029-12-31', actual: '—', status: 'pending', lagDays: 0, weight: 32 }
      ]
    },
    wbsByProject: {
      xl_fj01: [
        { id: '1', wbs: '1', name: '项目准备', start: '2025-03-15', end: '2025-04-30', progress: 100, isCritical: false },
        { id: '2', wbs: '2', name: '桩基工程', start: '2025-05-01', end: '2025-07-15', progress: 100, isCritical: true },
        { id: '3', wbs: '3', name: '地下室结构', start: '2025-07-16', end: '2025-12-31', progress: 72, isCritical: true },
        { id: '3.1', wbs: '3.1', name: '负二层结构', start: '2025-07-16', end: '2025-09-30', progress: 100, isCritical: true },
        { id: '3.2', wbs: '3.2', name: '负一层结构', start: '2025-10-01', end: '2025-12-31', progress: 80, isCritical: true },
        { id: '4', wbs: '4', name: '主体结构', start: '2026-01-01', end: '2026-08-31', progress: 15, isCritical: true },
        { id: '4.1', wbs: '4.1', name: '标准层施工', start: '2026-03-01', end: '2026-07-31', progress: 5, isCritical: true },
        { id: '5', wbs: '5', name: '装饰装修', start: '2026-09-01', end: '2027-06-30', progress: 0, isCritical: false },
        { id: '6', wbs: '6', name: '机电安装', start: '2026-06-01', end: '2027-09-30', progress: 0, isCritical: false },
        { id: '7', wbs: '7', name: '竣工验收', start: '2027-10-01', end: '2027-12-31', progress: 0, isCritical: true }
      ],
      jyje_az01: [
        { id: '1', wbs: '1', name: '土方及基坑', start: '2025-06-01', end: '2025-11-30', progress: 100, isCritical: true },
        { id: '2', wbs: '2', name: '地下室结构', start: '2025-12-01', end: '2026-06-30', progress: 45, isCritical: true },
        { id: '3', wbs: '3', name: '主体结构', start: '2026-07-01', end: '2027-02-28', progress: 0, isCritical: true },
        { id: '4', wbs: '4', name: '外立面与精装', start: '2027-03-01', end: '2028-03-31', progress: 0, isCritical: false },
        { id: '5', wbs: '5', name: '竣工验收', start: '2028-04-01', end: '2028-06-30', progress: 0, isCritical: true }
      ],
      yt_az01: [
        { id: '1', wbs: '1', name: '桩基工程', start: '2025-11-01', end: '2026-04-15', progress: 100, isCritical: true },
        { id: '2', wbs: '2', name: '地下室结构', start: '2026-04-16', end: '2026-09-30', progress: 28, isCritical: true },
        { id: '3', wbs: '3', name: '主体结构', start: '2026-10-01', end: '2027-06-30', progress: 0, isCritical: true },
        { id: '4', wbs: '4', name: '竣工验收', start: '2028-01-01', end: '2028-03-31', progress: 0, isCritical: true }
      ],
      jyje_az02: [
        { id: '1', wbs: '1', name: '前期准备', start: '2026-01-01', end: '2026-06-30', progress: 20, isCritical: false },
        { id: '2', wbs: '2', name: '桩基工程', start: '2026-07-01', end: '2026-12-31', progress: 0, isCritical: true },
        { id: '3', wbs: '3', name: '主体结构', start: '2027-01-01', end: '2028-12-31', progress: 0, isCritical: true }
      ]
    },
    constructionNodes: [
      { project: '新联复建01', node: '桩基工程', plan: '2025-06-30', actual: '2025-07-08', rate: 100, status: 'lag', lagDays: 8 },
      { project: '新联复建01', node: '地下室结构', plan: '2025-12-31', actual: '—', rate: 72, status: 'doing', lagDays: 0 },
      { project: '新联复建01', node: '主体结构', plan: '2026-08-31', actual: '—', rate: 15, status: 'pending', lagDays: 0 },
      { project: '均一均二AZ-01', node: '土方工程', plan: '2025-10-31', actual: '2025-11-05', rate: 100, status: 'done', lagDays: 5 },
      { project: '均一均二AZ-01', node: '地下室结构', plan: '2026-06-30', actual: '—', rate: 45, status: 'doing', lagDays: 0 },
      { project: '洋田AZ-01', node: '桩基工程', plan: '2026-03-31', actual: '2026-04-02', rate: 100, status: 'done', lagDays: 2 },
      { project: '洋田AZ-01', node: '地下室结构', plan: '2026-09-30', actual: '—', rate: 28, status: 'doing', lagDays: 0 }
    ],
    productionUnits: [
      { project: '新联复建01', unit: '地下室土建班组', monthOutput: 4800, cumOutput: 26500, reporter: '张工', date: '2026-05-31', status: '已审核' },
      { project: '新联复建01', unit: '机电安装班组', monthOutput: 1200, cumOutput: 6500, reporter: '李工', date: '2026-05-31', status: '已审核' },
      { project: '均一均二AZ-01', unit: '土方班组', monthOutput: 3500, cumOutput: 21200, reporter: '王工', date: '2026-05-30', status: '已审核' },
      { project: '洋田AZ-01', unit: '桩基班组', monthOutput: 2200, cumOutput: 9800, reporter: '赵工', date: '2026-05-29', status: '待审核' }
    ],
    drawingPlan: [
      { project: '新联复建01', major: '建筑', planDate: '2025-02-28', actualDate: '2025-03-05', rate: 100, status: 'done' },
      { project: '新联复建01', major: '结构', planDate: '2025-03-15', actualDate: '2025-03-20', rate: 100, status: 'done' },
      { project: '新联复建01', major: '机电', planDate: '2025-05-30', actualDate: '2025-06-18', rate: 85, status: 'lag' },
      { project: '新联复建01', major: '景观', planDate: '2025-07-31', actualDate: '—', rate: 60, status: 'lag' },
      { project: '均一均二AZ-01', major: '建筑', planDate: '2025-08-31', actualDate: '2025-09-10', rate: 100, status: 'done' },
      { project: '均一均二AZ-01', major: '结构', planDate: '2025-09-30', actualDate: '2025-10-08', rate: 100, status: 'done' },
      { project: '均一均二AZ-01', major: '机电', planDate: '2026-01-31', actualDate: '—', rate: 70, status: 'doing' },
      { project: '洋田AZ-01', major: '建筑', planDate: '2025-11-30', actualDate: '2025-12-05', rate: 100, status: 'done' },
      { project: '洋田AZ-01', major: '结构', planDate: '2026-01-31', actualDate: '2026-02-10', rate: 100, status: 'done' },
      { project: '洋田AZ-01', major: '精装修', planDate: '2026-06-30', actualDate: '—', rate: 35, status: 'doing' }
    ]
  },

  // 供应商库子系统
  suppliers: {
    material: [
      { id: 'GYS-M001', name: '广州钢铁贸易公司', controller: '陈志明', products: 'HRB400钢筋、型钢', qualification: '钢材经销资质', hasBid: true, bidPrice: 4200, won: true, contact: '13800138001', phone: '020-88888001', projects: ['新联01', 'AZ-01'] },
      { id: 'GYS-M002', name: '广东建材集团', controller: '刘伟', products: '商品混凝土C30/C35', qualification: '建材生产许可', hasBid: true, bidPrice: 420, won: true, contact: '13900139002', phone: '020-88888002', projects: ['新联01', '洋田AZ-01'] },
      { id: 'GYS-M003', name: '鑫达砌块厂', controller: '王芳', products: '蒸压加气砌块', qualification: '建材备案', hasBid: true, bidPrice: 285, won: false, contact: '13700137003', phone: '020-88888003', projects: [] },
      { id: 'GYS-M004', name: '华南水泥销售', controller: '张建国', products: '水泥、预拌砂浆', qualification: '经销资质', hasBid: true, bidPrice: 480, won: true, contact: '13600136004', phone: '020-88888004', projects: ['新联01'] },
      { id: 'GYS-M005', name: '广州模板租赁', controller: '李强', products: '木模板、脚手架', qualification: '租赁资质', hasBid: false, bidPrice: null, won: false, contact: '13500135005', phone: '020-88888005', projects: [] }
    ],
    construction: [
      { id: 'GYS-C001', name: '广州浚凯土石方工程', controller: '黄俊凯', products: '土石方开挖外运', qualification: '土石方专业承包', hasBid: true, bidPrice: 783.7, won: true, contact: '黄俊凯', phone: '13800138801', projects: ['新联01'] },
      { id: 'GYS-C002', name: '华南装饰工程', controller: '周建华', products: '精装修工程', qualification: '装修装饰一级', hasBid: true, bidPrice: 1850, won: true, contact: '周建华', phone: '13800138802', projects: ['新联01', 'AZ-01'] },
      { id: 'GYS-C003', name: '广达机电安装', controller: '吴国栋', products: '机电安装工程', qualification: '机电安装一级', hasBid: true, bidPrice: 1250, won: true, contact: '吴国栋', phone: '13800138803', projects: ['新联01'] },
      { id: 'GYS-C004', name: '粤建桩基工程', controller: '林建设', products: '桩基工程', qualification: '地基基础一级', hasBid: true, bidPrice: 680, won: false, contact: '林建设', phone: '13800138804', projects: [] },
      { id: 'GYS-C005', name: '绿景园林工程', controller: '赵绿景', products: '室外景观绿化', qualification: '园林二级', hasBid: true, bidPrice: 520, won: true, contact: '赵绿景', phone: '13800138805', projects: ['洋田AZ-01'] },
      { id: 'GYS-C006', name: '广州幕墙工程', controller: '孙幕墙', products: '外墙幕墙工程', qualification: '幕墙专业承包', hasBid: true, bidPrice: 1120, won: false, contact: '孙幕墙', phone: '13800138806', projects: [] }
    ]
  },

  projectDetails: {
    xl_fj01: {
      licenses: [
        { name: '施工许可证（一期）', status: 'done', date: '2025-04-20', deadline: '—', warn: false },
        { name: '施工许可证（二期）', status: 'doing', date: '—', deadline: '2026-06-30', warn: true },
        { name: '临水临电', status: 'done', date: '2025-03-28', deadline: '—', warn: false },
        { name: '林地林牌', status: 'done', date: '2025-05-15', deadline: '—', warn: false }
      ],
      designProgress: [
        { major: '建筑', plan: '2025-02-28', actual: '2025-03-05', rate: 100, lag: false },
        { major: '结构', plan: '2025-03-15', actual: '2025-03-20', rate: 100, lag: false },
        { major: '机电', plan: '2025-05-30', actual: '2025-06-18', rate: 85, lag: true },
        { major: '景观', plan: '2025-07-31', actual: '—', rate: 60, lag: true }
      ],
      milestones: [
        { name: '桩基工程完成', plan: '2025-06-30', actual: '2025-07-08', status: 'lag', reason: '地质条件复杂，桩基施工延期8天' },
        { name: '地下室结构封顶', plan: '2025-12-31', actual: '—', status: 'doing', reason: '' },
        { name: '主体结构封顶', plan: '2026-08-31', actual: '—', status: 'pending', reason: '' },
        { name: '外立面完成', plan: '2027-03-31', actual: '—', status: 'pending', reason: '' },
        { name: '竣工验收', plan: '2027-12-31', actual: '—', status: 'pending', reason: '' }
      ],
      risks: {
        engineering: [
          { level: 'red', desc: '地下室防水施工质量隐患', owner: '李工', status: '处理中', deadline: '2026-05-15' },
          { level: 'yellow', desc: '塔吊附墙方案审批滞后', owner: '王工', status: '待处理', deadline: '2026-05-20' }
        ],
        economic: [
          { level: 'yellow', desc: '钢筋实际消耗超预算7.8%，成本上升约86万', owner: '商务部', status: '处理中', deadline: '2026-05-31' },
          { level: 'blue', desc: '分包合同变更影响成本约12万', owner: '商务部', status: '已评估', deadline: '2026-05-10' }
        ],
        design: [
          { level: 'yellow', desc: '机电专业出图滞后18天', owner: '工程技术部', status: '处理中', deadline: '2026-06-01' }
        ]
      },
      costSections: [
        { name: '前期工程', value: 0.12, pct: 2.0 },
        { name: '土方及基坑', value: 0.76, pct: 12.9 },
        { name: '地下室', value: 3.02, pct: 51.4 },
        { name: '高层住宅', value: 1.42, pct: 24.2 },
        { name: '公建配套', value: 0.18, pct: 3.1 },
        { name: '外墙', value: 0.32, pct: 5.4 },
        { name: '其他', value: 0.05, pct: 1.0 }
      ],
      threeValueCompare: [
        { major: '土方及基坑', tender: 0.76, bid: 0.72, target: 0.56, actual: 0.58 },
        { major: '地下室', tender: 3.02, bid: 2.87, target: 2.20, actual: 2.28 },
        { major: '高层住宅', tender: 1.52, bid: 1.42, target: 1.15, actual: 1.18 },
        { major: '外墙', tender: 0.35, bid: 0.32, target: 0.22, actual: 0.24 },
        { major: '精装修', tender: 0.68, bid: 0.63, target: 0.48, actual: 0.51 }
      ],
      benchmarkTop: [
        { item: '外墙保温工程', diff: 8.6, amount: 96.5, reason: '材料品牌升级' },
        { item: '精装修地砖', diff: 7.2, amount: 45.2, reason: '规格变更' },
        { item: '土方外运', diff: 6.1, amount: 38.8, reason: '运距增加' }
      ],
      benchmarkSave: [
        { item: '混凝土工程', diff: -8.5, amount: -52.3, reason: '批量采购优惠' },
        { item: '钢筋工程', diff: -6.2, amount: -38.1, reason: '指标价优化' }
      ],
      otherDirectCosts: {
        versions: ['标前版', '第三方版', '一体化单位版'],
        items: [
          { name: '临时设施费', v1: 320, v2: 335, v3: 328 },
          { name: '安全文明施工费', v1: 580, v2: 590, v3: 585 },
          { name: '管理费', v1: 1250, v2: 1280, v3: 1265 },
          { name: '利润', v1: 980, v2: 995, v3: 988 }
        ]
      },
      subcontracts: [
        { company: '广州浚凯土石方', contract: 784, paid: 520, remain: 264, overpay: false },
        { company: '华南装饰', contract: 1850, paid: 920, remain: 930, overpay: false },
        { company: '广达机电', contract: 1250, paid: 890, remain: 360, overpay: true }
      ],
      materials: [
        { name: '商品混凝土C30', budget: 12500, purchased: 12200, consumed: 11800, unit: 'm³', warn: false, source: '供应链平台' },
        { name: 'HRB400钢筋', budget: 3200, purchased: 3580, consumed: 3450, unit: 't', warn: true, source: '供应链平台' },
        { name: '蒸压加气砌块', budget: 8500, purchased: 8300, consumed: 8200, unit: 'm³', warn: false, source: '供应链平台' },
        { name: '预拌砂浆', budget: 4200, purchased: 4650, consumed: 4520, unit: 't', warn: true, source: '供应链平台' },
        { name: '模板', budget: 28000, purchased: 26500, consumed: 25800, unit: 'm²', warn: false, source: '供应链平台' }
      ],
      outputByMajor: [
        { major: '土建', value: 1.55 },
        { major: '安装', value: 0.65 },
        { major: '装饰', value: 0.32 },
        { major: '景观', value: 0.13 }
      ],
      honors: [
        { name: '二星智慧工地评级', date: '2026-06-30', status: '申报中', cert: false },
        { name: '广州市绿色施工样板工地', date: '2026-08-31', status: '筹备', cert: false },
        { name: '广州市"五羊杯"优质工程', date: '2027-06-30', status: '筹备', cert: false }
      ],
      inspections: [
        { date: '2026-05-25', type: '安全巡检', result: '发现2项隐患', status: '整改中', inspector: '质量安全部' },
        { date: '2026-05-20', type: '质量巡检', result: '合格', status: '已关闭', inspector: '质量安全部' },
        { date: '2026-05-15', type: '文明施工', result: '1项待改进', status: '已关闭', inspector: '工程技术部' }
      ],
      majorEvents: [
        { date: '2025-03-15', title: '项目正式开工', type: '里程碑', desc: '举行开工仪式', image: 'assets/aerial/1月-1.jpg' },
        { date: '2025-04-20', title: '一期施工许可证取得', type: '证照', desc: '完成一期施工许可', image: 'assets/aerial/1月-2.jpg' },
        { date: '2026-01-10', title: '地下室底板浇筑', type: '进度', desc: '底板混凝土浇筑完成', image: 'assets/aerial/4月-1.jpg' },
        { date: '2026-05-25', title: '负一层结构完成80%', type: '进度', desc: '航拍AI确认进展', image: 'assets/aerial/5月-2.jpg' }
      ]
    }
  },

  // 中标工程量清单（来源：商务部Excel - 新联01土石方工程）
  bidBoq: [
    { seq: 1, name: '大土方开挖及外运', unit: 'M3', qty: 150000, priceNoTax: 39, totalNoTax: 5850000, tax: '9%', priceTax: 42.51, totalTax: 6376500 },
    { seq: 2, name: '桩芯土和旋挖桩淤泥装车外运', unit: 'M3', qty: 6000, priceNoTax: 39, totalNoTax: 234000, tax: '9%', priceTax: 42.51, totalTax: 255060 },
    { seq: 3, name: '土方开挖场内回填、外购土方回填', unit: 'M3', qty: 34000, priceNoTax: 10, totalNoTax: 340000, tax: '9%', priceTax: 10.9, totalTax: 370600 },
    { seq: 4, name: '承台等小土方开挖装车外运', unit: 'M3', qty: 18000, priceNoTax: 39, totalNoTax: 702000, tax: '9%', priceTax: 42.51, totalTax: 765180 },
    { seq: 5, name: '清表', unit: 'M2', qty: 20000, priceNoTax: 3.2, totalNoTax: 64000, tax: '9%', priceTax: 3.49, totalTax: 69800 }
  ],

  // 地下室工程审核对比（来源：商务部Excel）
  basementReview: [
    { seq: 1, name: '分部分项合计', submitAmt: 73945464.56, auditAmt: 63685487.03, diff: -10259977.53 },
    { seq: 2, name: '措施合计', submitAmt: 15277686.14, auditAmt: 14753021.54, diff: -524664.6 },
    { seq: '2.1', name: '绿色施工安全防护措施费', submitAmt: 4173827.07, auditAmt: 3522438.09, diff: -651388.98 },
    { seq: '2.2', name: '其他措施费', submitAmt: 11103859.07, auditAmt: 11230583.45, diff: 126724.38 },
    { seq: 3, name: '其他项目', submitAmt: 3505247.45, auditAmt: 3026602.23, diff: -478645.22 },
    { seq: 4, name: '税前工程造价', submitAmt: 92728398.15, auditAmt: 81465110.8, diff: -11263287.35 }
  ],

  basementBoqCompare: [
    { code: '010101004001', name: '挖基础土方', unit: 'm3', submitQty: 14615.28, submitPrice: 10.26, submitAmt: 149952.77, auditQty: 13700.24, auditPrice: 10.26, auditAmt: 140564.46, diff: -9388.31 },
    { code: '010103001001', name: '回填方', unit: 'm3', submitQty: 2975.06, submitPrice: 21.91, submitAmt: 65183.56, auditQty: 5424.13, auditPrice: 21.91, auditAmt: 118842.69, diff: 53659.13 },
    { code: '010103002001', name: '余方弃置', unit: 'm3', submitQty: 11900.22, submitPrice: 50.87, submitAmt: 605364.19, auditQty: 8276.11, auditPrice: 50.89, auditAmt: 421171.24, diff: -184192.95 },
    { code: '010402001004', name: '砌块墙200mm', unit: 'm3', submitQty: 2866.02, submitPrice: 475.13, submitAmt: 1361732.08, auditQty: 2721.03, auditPrice: 559.21, auditAmt: 1521627.19, diff: 159895.11 },
    { code: '010501003002', name: '筏板基础', unit: 'm3', submitQty: 7506.11, submitPrice: 589.54, submitAmt: 4425152.09, auditQty: 9078.3, auditPrice: 589.54, auditAmt: 5352020.98, diff: 926868.89 }
  ],

  // 成本测算汇总（来源：镇龙东项目成本测算Excel - 汇总表）
  costSummary: [
    { name: '前期工程', tender: 122.4, contract: 116.3, internalCost: 82.9, internalProfit: 28.7, internalRate: 24.7, integrationCost: 90.8, integrationProfit: 25.5, integrationRate: 22.0 },
    { name: '土方及基坑支护', tender: 7628.9, contract: 7247.5, internalCost: 5566.0, internalProfit: 1681.5, internalRate: 23.2, integrationCost: 6252.5, integrationProfit: 995.0, integrationRate: 13.7 },
    { name: '地下室', tender: 30173.7, contract: 28665.1, internalCost: 22021.9, internalProfit: 6643.1, internalRate: 23.2, integrationCost: 26302.4, integrationProfit: 2362.7, integrationRate: 8.2 },
    { name: '高层住宅', tender: 42385.4, contract: 40266.1, internalCost: 33115.9, internalProfit: 7150.3, internalRate: 17.8, integrationCost: 36606.7, integrationProfit: 3659.4, integrationRate: 9.1 },
    { name: '外墙', tender: 3160.6, contract: 3002.5, internalCost: 2212.4, internalProfit: 790.1, internalRate: 26.3, integrationCost: 2022.3, integrationProfit: 980.2, integrationRate: 32.6 },
    { name: '精装修', tender: 17132.9, contract: 16276.3, internalCost: 11991.5, internalProfit: 4284.7, internalRate: 26.3, integrationCost: 12325.7, integrationProfit: 3950.6, integrationRate: 24.3 }
  ],

  // 业主算量 vs 我方询价（profitRate 为我方通过分包成本控制后的实际利润率，目标16.66%）
  quantityCompare: [
    { item: '挖基础土方', unit: 'm³', ownerQty: 14615, ownerPrice: 10.26, ownerAmt: 149953, ourQty: 13700, ourPrice: 10.26, ourAmt: 140564, qtyDiff: -915, priceDiff: 0, profitRate: 18.2, issue: '', warn: false },
    { item: '余方弃置', unit: 'm³', ownerQty: 11900, ownerPrice: 50.87, ownerAmt: 605364, ourQty: 11900, ourPrice: 54.20, ourAmt: 644980, qtyDiff: 0, priceDiff: 3.33, profitRate: 14.5, issue: '分包单价偏高', warn: true },
    { item: '筏板基础', unit: 'm³', ownerQty: 9078, ownerPrice: 589.54, ownerAmt: 5352021, ourQty: 7506, ourPrice: 589.54, ourAmt: 4425152, qtyDiff: -1572, priceDiff: 0, profitRate: 13.8, issue: '工程量偏差', warn: true },
    { item: '现浇构件钢筋', unit: 't', ownerQty: 2800, ownerPrice: 5200, ownerAmt: 14560000, ourQty: 2800, ourPrice: 4980, ourAmt: 13944000, qtyDiff: 0, priceDiff: -220, profitRate: 19.5, issue: '', warn: false },
    { item: '砌块墙200mm', unit: 'm³', ownerQty: 2721, ownerPrice: 559.21, ownerAmt: 1521627, ourQty: 2866, ourPrice: 475.13, ourAmt: 1361732, qtyDiff: 145, priceDiff: -84.08, profitRate: 21.2, issue: '', warn: false },
    { item: '综合脚手架', unit: 'm²', ownerQty: 45000, ownerPrice: 35, ownerAmt: 1575000, ourQty: 42000, ourPrice: 38, ourAmt: 1596000, qtyDiff: -3000, priceDiff: 3, profitRate: 15.2, issue: '量+价双偏差', warn: true }
  ],

  billOfQuantities: [
    { code: '010101004001', name: '挖基础土方', unit: 'm³', qty: 13700.24, price: 10.26, tax: '9%', total: 140564.46 },
    { code: '010103002001', name: '余方弃置', unit: 'm³', qty: 8276.11, price: 50.89, tax: '9%', total: 421171.24 },
    { code: '010501003002', name: '筏板基础', unit: 'm³', qty: 9078.3, price: 589.54, tax: '9%', total: 5352020.98 },
    { code: '010515001', name: '现浇构件钢筋', unit: 't', qty: 2800, price: 5200, tax: '13%', total: 14560000 },
    { code: '010402001004', name: '砌块墙200mm', unit: 'm³', qty: 2721.03, price: 559.21, tax: '9%', total: 1521627.19 }
  ],

  costIndex: [
    { category: '劳务', item: '混凝土工', unit: '工日', price: 320, region: '广州', valid: '2026-12-31' },
    { category: '劳务', item: '钢筋工', unit: '工日', price: 350, region: '广州', valid: '2026-12-31' },
    { category: '材料', item: 'C30商品混凝土', unit: 'm³', price: 420, region: '广州', valid: '2026-06-30' },
    { category: '材料', item: 'HRB400 Φ12-25', unit: 't', price: 4200, region: '广州', valid: '2026-06-30' },
    { category: '分包', item: '外墙保温', unit: 'm²', price: 185, region: '广州', valid: '2026-12-31' },
    { category: '分包', item: '精装修', unit: 'm²', price: 680, region: '广州', valid: '2026-12-31' }
  ],

  // 动态现金流（商务部 · 四项目汇总）
  cashflow: {
    projects: ['新联复建01', '均一均二AZ-01', '洋田AZ-01', '均一均二AZ-02'],
    items: [
      { month: '2026-01', income: 3200, expense: 2680, balance: 520, forecast: 480, forecastIncome: 3350, outputValue: 2650 },
      { month: '2026-02', income: 3580, expense: 3420, balance: 680, forecast: 620, forecastIncome: 3680, outputValue: 2880 },
      { month: '2026-03', income: 3920, expense: 4050, balance: 550, forecast: 580, forecastIncome: 4050, outputValue: 3120 },
      { month: '2026-04', income: 4280, expense: 4180, balance: 650, forecast: 680, forecastIncome: 4420, outputValue: 3450 },
      { month: '2026-05', income: 4650, expense: 4820, balance: 480, forecast: 520, forecastIncome: 4780, outputValue: 3780 },
      { month: '2026-06', income: 0, expense: 0, balance: 0, forecast: 380, forecastIncome: 4100, outputValue: 3950, warn: true }
    ],
    byProject: [
      { project: '新联复建01', income: 1750, expense: 1820, balance: 220, forecast: 260, warn: false },
      { project: '均一均二AZ-01', income: 1280, expense: 1350, balance: 150, forecast: 120, warn: true },
      { project: '洋田AZ-01', income: 980, expense: 920, balance: 180, forecast: 200, warn: false },
      { project: '均一均二AZ-02', income: 640, expense: 730, balance: 130, forecast: 100, warn: true }
    ],
    criticalBalance: 200,
    warnMonth: '2026-06'
  },

  // 外协协调（外协部需求）
  coordination: [
    { id: 'WX-001', type: '前期手续', title: '二期施工许可证办理协调', project: '新联复建01', status: '进行中', owner: '外协部', deadline: '2026-06-30', mentions: ['@吴主任', '@艾经理'], note: '@艾经理 请提供成本测算支撑材料' },
    { id: 'WX-002', type: '党建联建', title: '与属地街道联建活动', project: '均一均二AZ-01', status: '已完成', owner: '外协部', deadline: '2026-05-15', mentions: ['@吴主任'], note: '活动照片已归档' },
    { id: 'WX-003', type: '应急事件', title: '暴雨期间基坑排水应急', project: '新联复建01', status: '已关闭', owner: '外协部', deadline: '2026-04-28', mentions: ['@曹经理', '@吴主任'], note: '@曹经理 现场处置已完成' },
    { id: 'WX-004', type: '外部协调', title: '临电扩容报装协调', project: '洋田AZ-01', status: '待启动', owner: '外协部', deadline: '2026-07-15', mentions: ['@王会计'], note: '@王会计 请确认资金支付节点' }
  ],

  // 周期数据变化（日报/周报/月报/季报/年报）
  periodReports: {
    daily: {
      label: '日报', period: '2026-05-31',
      summary: '当日四地块运行平稳，新联01负一层结构持续推进，协调事项1项待跟进。',
      metrics: [
        { name: '新增证照', value: '0 本', delta: '—', note: '二期施工许可办理中' },
        { name: '新增供应商', value: '1 家', delta: '+1', note: '材料类入库审核通过' },
        { name: '协调事项解决', value: '1 项', delta: '+1', note: '党建联建活动闭环' },
        { name: '整体进度', value: '28.6%', delta: '+0.2%', note: '四项目加权平均' },
        { name: '实际利润率', value: '17.1%', delta: '-0.1%', note: '目标固定 16.66%' }
      ],
      byDept: [
        { dept: '商务部', detail: '完成5月现金流核对；物资钢筋超量预警跟进中' },
        { dept: '工程技术部', detail: '地下室结构巡检1次；产值报审2条' },
        { dept: '外协部', detail: '二期施工许可协调推进；@艾经理 待回复材料清单' },
        { dept: '财务部', detail: '分包进度款审批3笔，合计1280万' }
      ],
      focus: [
        { level: '中', title: '均一均二AZ-01利润率15.8%', desc: '低于目标16.66%，需成本复盘' },
        { level: '高', title: '6月现金流预测420万', desc: '低于临界值200万预警线需关注' }
      ]
    },
    weekly: {
      label: '周报', period: '2026年第22周（5.26 - 6.1）',
      summary: '本周四地块综合排名稳定，新联01保持第一；证照新增0本，供应商新增2家。',
      metrics: [
        { name: '新增证照', value: '1 本', delta: '+1', note: '洋田临水临电备案' },
        { name: '新增供应商', value: '2 家', delta: '+2', note: '1材料+1施工' },
        { name: '协调事项解决', value: '3 项', delta: '+3', note: '含1项应急关闭' },
        { name: '整体进度', value: '+1.8%', delta: '↑', note: '较上周四项目均值' },
        { name: '实际利润率', value: '17.1%', delta: '-0.3%', note: 'AZ-01拖累均值' }
      ],
      byDept: [
        { dept: '商务部', detail: '产值确认1.05亿；三值对比修订版提交' },
        { dept: '工程技术部', detail: '出图滞后2专业；安全巡检4次' },
        { dept: '外协部', detail: '协调事项关闭3项，新增1项临电报装' },
        { dept: '财务部', detail: '业主回款4650万，分包支出2900万' }
      ],
      focus: [
        { level: '高', title: '新联01钢筋超量7.8%', desc: '影响实际利润率，建议集采议价' },
        { level: '中', title: '机电出图滞后18天', desc: '影响地下室后续工序' }
      ]
    },
    monthly: {
      label: '月报', period: '2026年5月',
      summary: '5月四项目累计产值1.05亿，整体进度提升3.2%，实际利润率均值17.1%。',
      metrics: [
        { name: '新增证照', value: '2 本', delta: '+2', note: '含1本施工相关' },
        { name: '新增供应商', value: '5 家', delta: '+5', note: '3材料2施工' },
        { name: '协调事项解决', value: '8 项', delta: '+8', note: '闭环率80%' },
        { name: '整体进度', value: '+3.2%', delta: '↑', note: '较4月末' },
        { name: '实际利润率', value: '17.1%', delta: '-0.5%', note: '较4月均值' }
      ],
      byDept: [
        { dept: '商务部', detail: '5月结余610万，低于预测650万；物资预警2项' },
        { dept: '工程技术部', detail: '产值报审26500万（新联01累计）；滞后节点2个' },
        { dept: '外协部', detail: '协调台账4项在办，1项高优先级' },
        { dept: '财务部', detail: '回款率91.2%；6月预测结余420万预警' }
      ],
      focus: [
        { level: '高', title: '6月现金流低于临界值风险', desc: '敏感性分析显示回款延迟15天将触发预警' },
        { level: '中', title: '四地块排名AZ-01下滑', desc: '成本维度72分，需加强分包管控' }
      ]
    },
    quarterly: {
      label: '季报', period: '2026年Q2',
      summary: '二季度EPC四地块全面推进，累计产值3.28亿，Q2实际利润率较Q1下降0.8pct。',
      metrics: [
        { name: '新增证照', value: '4 本', delta: '+4', note: 'Q2累计' },
        { name: '新增供应商', value: '12 家', delta: '+12', note: '入库审核通过' },
        { name: '协调事项解决', value: '18 项', delta: '+18', note: '含2项应急' },
        { name: '整体进度', value: '+8.5%', delta: '↑', note: '较Q1末' },
        { name: '实际利润率', value: '17.1%', delta: '-0.8%', note: '较Q1均值' }
      ],
      byDept: [
        { dept: '商务部', detail: 'Q2三值对比节约率整体12.3%；2项超支Top跟踪' },
        { dept: '工程技术部', detail: 'Q2完成桩基/底板等里程碑5个；AI航拍对比4期' },
        { dept: '外协部', detail: 'Q2党建联建2次；前期手续协调6项' },
        { dept: '财务部', detail: 'Q2净现金流1850万；6月垫资压力上升' }
      ],
      focus: [
        { level: '高', title: '地下室成本超支趋势', desc: '实际成本接近目标成本102%，需一体化决策推演' },
        { level: '中', title: 'AZ-02筹备期风险', desc: '证照与供应商储备不足' }
      ]
    },
    yearly: {
      label: '年报', period: '2026年度（截至5月）',
      summary: '2026年前5月四地块累计产值6.75亿，年化进度符合总控计划，实际利润率整体达标。',
      metrics: [
        { name: '新增证照', value: '6 本', delta: '+6', note: 'YTD' },
        { name: '新增供应商', value: '18 家', delta: '+18', note: 'YTD入库' },
        { name: '协调事项解决', value: '32 项', delta: '+32', note: 'YTD闭环' },
        { name: '整体进度', value: '23.6%', delta: '+23.6%', note: '较年初' },
        { name: '实际利润率', value: '17.1%', delta: '+0.4%', note: '较2025同期' }
      ],
      byDept: [
        { dept: '商务部', detail: 'YTD产值6.75亿；目标利润率16.66%管控有效' },
        { dept: '工程技术部', detail: 'YTD安全质量巡检48次；智慧工地申报推进' },
        { dept: '外协部', detail: 'YTD协调事项36项，办结率89%' },
        { dept: '财务部', detail: 'YTD回款率90.5%；现金流敏感性预案已建立' }
      ],
      focus: [
        { level: '中', title: '下半年主体结构峰值', desc: '产值与现金流同步上行，需提前锁定分包额度' },
        { level: '提示', title: '创奖申报节点', desc: '二星智慧工地6月截止材料提交' }
      ]
    }
  },

  reports: [
    { id: 'r1', name: '多项目核心指标汇总表', category: '沙盘', format: ['Excel', 'PDF'] },
    { id: 'r2', name: '项目进度偏差分析报告', category: '沙盘', format: ['Excel', 'PDF'] },
    { id: 'r3', name: '项目风险汇总及处理台账', category: '沙盘', format: ['Excel', 'PDF'] },
    { id: 'r4', name: '产值与回款统计报表', category: '沙盘', format: ['Excel', 'PDF'] },
    { id: 'r5', name: '分部分项造价汇总表', category: '成本', format: ['Excel', 'PDF'] },
    { id: 'r6', name: '成本指标对标分析报告', category: '成本', format: ['Excel', 'PDF'] },
    { id: 'r7', name: '其他直接费多版本对比表', category: '成本', format: ['Excel', 'PDF'] },
    { id: 'r8', name: '专业分包付款台账', category: '成本', format: ['Excel', 'PDF'] },
    { id: 'r9', name: '项目总成本分析报表', category: '成本', format: ['Excel', 'PDF'] },
    { id: 'r10', name: '人材机费用汇总表', category: '成本', format: ['Excel', 'PDF'] },
    { id: 'r11', name: '物资消耗预算对比预警表', category: '成本', format: ['Excel', 'PDF'] },
    { id: 'r12', name: '业主算量与我方询价差异分析报告', category: '成本', format: ['Excel', 'PDF'] },
    { id: 'r13', name: '地下室工程审核对比表', category: '成本', format: ['Excel', 'PDF'] },
    { id: 'r14', name: '动态现金流预测表', category: '财务', format: ['Excel', 'PDF'] },
    { id: 'r16', name: '四地块每周排名报表', category: '沙盘', format: ['Excel', 'PDF'] },
    { id: 'r17', name: '项目大事记汇总', category: '沙盘', format: ['Excel', 'PDF'] },
    { id: 'r18', name: '供应商库台账', category: '成本', format: ['Excel', 'PDF'] },
    { id: 'r19', name: '施工进度与出图计划报表', category: '沙盘', format: ['Excel', 'PDF'] },
    { id: 'r20', name: '航拍AI进展对比报告', category: '沙盘', format: ['PDF'] }
  ],

  // 数字沙盘 · 进度产值（四项目汇总，万元）
  outputValue: {
    projectName: '黄埔区城更四项目群',
    contractWorkload: 223893.52,
    buildPeriod: '2024/05 ~ 2028/12',
    totalPlan: 223893.52,
    cumPhysical: 67500,
    cumMeasured: 42000,
    physicalRate: 30.15,
    measuredRate: 18.76,
    timeline: [
      { year: 2025, plan: 12000, physicalCum: 10200, measuredCum: 6200, done: true },
      { year: 2026, plan: 48503, physicalCum: 18500, measuredCum: 11000, done: true },
      { year: 2027, plan: 60690, physicalCum: null, measuredCum: null, done: false },
      { year: 2028, plan: 16500.52, physicalCum: null, measuredCum: null, done: false }
    ],
    yearlyChart: [
      { year: 2025, plan: 12000, physical: 10200, measured: 6200 },
      { year: 2026, plan: 48503, physical: 18500, measured: 11000 },
      { year: 2027, plan: 60690, physical: 0, measured: 0 },
      { year: 2028, plan: 16500.52, physical: 0, measured: 0 }
    ],
    monthly: {
      plan: [2400, 800, 1200, 1500, 2800, 3200, 4500, 5200, 4800, 4100, 3800, 3509],
      physical: [2266.92, 856.40, 1105.20, 1420.50, 2545.10, null, null, null, null, null, null, null],
      measured: [2100.00, 720.00, 980.50, 1250.00, 1997.12, null, null, null, null, null, null, null]
    },
    monthCumPlan: 16709,
    yearPlan: 50003,
    monthCumPhysical: 10194.22,
    monthCumVariance: -6514.78,
    monthCumRate: 61.01,
    yearRate: 20.39,
    monthCumMeasured: 7047.62
  },

  documentManagement: {
    breadcrumb: ['黄埔区城更', '文档管理', '全部文件'],
    folders: [
      { id: 'root', name: '全部文件', children: [
        { id: 'contract', name: '合同资料', children: [
          { id: 'xl', name: '新联复建01地块' },
          { id: 'az01', name: '均一均二AZ-01地块' },
          { id: 'yt', name: '洋田AZ-01地块' }
        ]},
        { id: 'meeting', name: '三会资料' },
        { id: 'design', name: '设计管控资料' },
        { id: 'ops', name: '运营期资料' },
        { id: 'build', name: '建设期资料' }
      ]}
    ],
    files: [
      { name: '合同资料', type: 'folder', version: '/', size: '-', modifier: '艾经理', time: '2025-11-19 17:03:42' },
      { name: '三会资料', type: 'folder', version: '/', size: '-', modifier: '曹经理', time: '2025-10-08 09:15:20' },
      { name: '设计管控资料', type: 'folder', version: '/', size: '-', modifier: '曹经理', time: '2026-03-12 14:22:08' },
      { name: '运营期资料', type: 'folder', version: '/', size: '-', modifier: '王会计', time: '2026-01-05 11:00:00' },
      { name: '建设期资料', type: 'folder', version: '/', size: '-', modifier: '艾经理', time: '2025-08-20 16:45:33' },
      { name: 'EPC总承包合同（新联01）.pdf', type: 'file', version: 'V3.0', size: '12.6 MB', modifier: '商务部', time: '2026-04-10 10:20:15' },
      { name: '施工组织设计报审表.xlsx', type: 'file', version: 'V1.2', size: '856 KB', modifier: '工程技术部', time: '2026-05-18 15:30:00' }
    ]
  },

  workManagement: {
    reports: {
      daily: [
        { project: '新联复建01', date: '2026-05-31', author: '张工', summary: '负一层结构浇筑完成80%，安全巡检1次', status: '已提交' },
        { project: '均一均二AZ-01', date: '2026-05-31', author: '王工', summary: '地下室底板施工，产值报审3500万', status: '已提交' },
        { project: '洋田AZ-01', date: '2026-05-31', author: '赵工', summary: '桩基收尾，临电扩容协调中', status: '草稿' }
      ],
      weekly: [
        { project: '新联复建01', period: '2026-W22', author: '项目部', summary: '本周产值4800万，滞后节点2个', status: '已审核' },
        { project: '黄埔四项目群', period: '2026-W22', author: '指挥部', summary: '四地块综合排名稳定，证照新增0本', status: '已审核' }
      ],
      monthly: [
        { project: '黄埔四项目群', period: '2026-05', author: '商务部', summary: '5月累计产值1.05亿，利润率均值17.1%', status: '已发布' }
      ],
      quarterly: [
        { project: '黄埔四项目群', period: '2026-Q2', author: '指挥部', summary: 'Q2累计产值3.28亿，EPC四地块全面推进', status: '编制中' }
      ]
    },
    notifications: [
      { subProject: '新联复建01', title: '监理指令及回复单', occurDate: '2026-05-20', deadline: '2026-05-27', completeDate: '2026-05-26' },
      { subProject: '新联复建01', title: '监理隐患通知及回复单', occurDate: '2026-05-15', deadline: '2026-05-22', completeDate: '2026-05-21' },
      { subProject: '新联复建01', title: '监理隐患整改单', occurDate: '2026-05-10', deadline: '2026-05-17', completeDate: '2026-05-16' },
      { subProject: '均一均二AZ-01', title: '建设单位隐患整改单', occurDate: '2026-04-28', deadline: '2026-05-05', completeDate: '2026-05-04' }
    ],
    regulations: [
      { project: '黄埔四项目群', subItem: '指挥部', phase: '建设期', type: '安全管理制度', name: '施工现场安全检查管理办法', revision: '明确巡检频次与闭环时限', reason: '集团制度更新', effective: '2026-01-01', apply: '2025-12-15', approve: '2025-12-28', status: '已生效' },
      { project: '新联复建01', subItem: '新联01', phase: '建设期', type: '质量管理制度', name: '分项工程验收管理规定', revision: '补充地下室防水验收条款', reason: '现场质量隐患复盘', effective: '2026-03-01', apply: '2026-02-10', approve: '2026-02-25', status: '已生效' },
      { project: '洋田AZ-01', subItem: '洋田AZ-01', phase: '筹备期', type: '进度管理制度', name: '产值报审与审核流程', revision: '—', reason: '新项目启用', effective: '—', apply: '2026-05-20', approve: '—', status: '审核中' }
    ]
  },

  designControl: {
    phaseKeys: [
      { key: 'initiation', name: '立项阶段' },
      { key: 'scheme', name: '方案设计' },
      { key: 'preliminary', name: '初步设计' },
      { key: 'construction', name: '施工图阶段' },
      { key: 'asbuilt', name: '竣工图阶段' }
    ],
    plots: [
      {
        id: 'xl_plot', name: '新联片区',
        projects: [
          {
            id: 'xl_fj01', name: '新联复建01地块',
            overallProgress: 58, deviationRate: 12.4,
            changeImpact: { count: 7, scheduleDays: 48, costWan: 520 },
            phases: {
              initiation: { plan: '2024-03', actual: '2024-03', progress: 100, status: 'done', disciplines: [{ name: '立项批复', rate: 100, status: 'done' }] },
              scheme: { plan: '2024-08', actual: '2024-09', progress: 100, status: 'done', disciplines: [{ name: '建筑方案', rate: 100, status: 'done' }, { name: '结构方案', rate: 100, status: 'done' }] },
              preliminary: { plan: '2025-02', actual: '2025-03', progress: 100, status: 'done', disciplines: [{ name: '建筑', rate: 100, status: 'done' }, { name: '结构', rate: 100, status: 'done' }, { name: '机电', rate: 100, status: 'done' }] },
              construction: { plan: '2025-12', actual: '—', progress: 62, status: 'doing', disciplines: [{ name: '建筑', rate: 100, status: 'done' }, { name: '结构', rate: 85, status: 'doing' }, { name: '机电', rate: 60, status: 'lag' }, { name: '景观', rate: 35, status: 'lag' }] },
              asbuilt: { plan: '2027-10', actual: '—', progress: 0, status: 'pending', disciplines: [{ name: '竣工图编制', rate: 0, status: 'pending' }] }
            },
            drawingChanges: [
              { no: 'DC-2025-012', phase: '施工图', reason: '地下室防水做法调整', scheduleDays: 12, costWan: 86, date: '2025-06-18' },
              { no: 'DC-2025-028', phase: '施工图', reason: '机电管线综合优化', scheduleDays: 8, costWan: 42, date: '2025-09-05' },
              { no: 'DC-2026-003', phase: '施工图', reason: '外立面材料规格变更', scheduleDays: 18, costWan: 125, date: '2026-02-20' }
            ]
          }
        ]
      },
      {
        id: 'jyje_plot', name: '均一均二片区',
        projects: [
          {
            id: 'jyje_az01', name: '均一均二复建AZ-01地块',
            overallProgress: 52, deviationRate: 8.6,
            changeImpact: { count: 4, scheduleDays: 22, costWan: 180 },
            phases: {
              initiation: { plan: '2024-06', actual: '2024-06', progress: 100, status: 'done', disciplines: [{ name: '立项批复', rate: 100, status: 'done' }] },
              scheme: { plan: '2024-11', actual: '2024-12', progress: 100, status: 'done', disciplines: [{ name: '方案评审', rate: 100, status: 'done' }] },
              preliminary: { plan: '2025-08', actual: '2025-09', progress: 100, status: 'done', disciplines: [{ name: '建筑', rate: 100, status: 'done' }, { name: '结构', rate: 100, status: 'done' }] },
              construction: { plan: '2026-03', actual: '—', progress: 55, status: 'doing', disciplines: [{ name: '建筑', rate: 100, status: 'done' }, { name: '结构', rate: 100, status: 'done' }, { name: '机电', rate: 70, status: 'doing' }] },
              asbuilt: { plan: '2028-04', actual: '—', progress: 0, status: 'pending', disciplines: [] }
            },
            drawingChanges: [
              { no: 'DC-AZ01-008', phase: '施工图', reason: '基坑支护方案调整', scheduleDays: 10, costWan: 65, date: '2025-11-12' }
            ]
          },
          {
            id: 'jyje_az02', name: '均一均二复建AZ-02地块',
            overallProgress: 18, deviationRate: 5.2,
            changeImpact: { count: 1, scheduleDays: 5, costWan: 28 },
            phases: {
              initiation: { plan: '2025-08', actual: '2025-08', progress: 100, status: 'done', disciplines: [{ name: '立项批复', rate: 100, status: 'done' }] },
              scheme: { plan: '2026-01', actual: '—', progress: 75, status: 'doing', disciplines: [{ name: '建筑方案', rate: 80, status: 'doing' }, { name: '景观方案', rate: 60, status: 'doing' }] },
              preliminary: { plan: '2026-06', actual: '—', progress: 0, status: 'pending', disciplines: [] },
              construction: { plan: '2027-03', actual: '—', progress: 0, status: 'pending', disciplines: [] },
              asbuilt: { plan: '2029-06', actual: '—', progress: 0, status: 'pending', disciplines: [] }
            },
            drawingChanges: []
          }
        ]
      },
      {
        id: 'yt_plot', name: '洋田片区',
        projects: [
          {
            id: 'yt_az01', name: '洋田复建AZ-01地块',
            overallProgress: 45, deviationRate: 6.8,
            changeImpact: { count: 3, scheduleDays: 15, costWan: 95 },
            phases: {
              initiation: { plan: '2024-09', actual: '2024-09', progress: 100, status: 'done', disciplines: [{ name: '立项批复', rate: 100, status: 'done' }] },
              scheme: { plan: '2025-01', actual: '2025-02', progress: 100, status: 'done', disciplines: [{ name: '方案评审', rate: 100, status: 'done' }] },
              preliminary: { plan: '2025-10', actual: '2025-11', progress: 100, status: 'done', disciplines: [{ name: '建筑', rate: 100, status: 'done' }, { name: '结构', rate: 100, status: 'done' }] },
              construction: { plan: '2026-06', actual: '—', progress: 38, status: 'doing', disciplines: [{ name: '建筑', rate: 100, status: 'done' }, { name: '结构', rate: 100, status: 'done' }, { name: '精装修', rate: 35, status: 'doing' }] },
              asbuilt: { plan: '2028-01', actual: '—', progress: 0, status: 'pending', disciplines: [] }
            },
            drawingChanges: [
              { no: 'DC-YT-005', phase: '施工图', reason: '桩基设计优化', scheduleDays: 6, costWan: 32, date: '2026-03-10' }
            ]
          }
        ]
      }
    ],
    overallSummary: {
      totalProjects: 4, avgDeviationRate: 8.3, totalChanges: 15,
      totalScheduleDays: 90, totalCostWan: 823, onTrack: 2, lagging: 2
    }
  },

  syncLogs: [
    { system: 'Jarvis进度展示', time: '2026-05-27 09:05:32', status: 'warning', records: 0, method: '新窗口登录（接口对接中）' },
    { system: '成本测算子系统', time: '2026-05-27 09:05:28', status: 'success', records: 89, method: '内部接口' },
    { system: '供应链平台（物资）', time: '2026-05-27 08:30:10', status: 'success', records: 328, method: '标准接口' },
    { system: '广联达算量软件', time: '2026-05-26 18:00:00', status: 'success', records: 1, method: '文件导入' },
  ]
};
