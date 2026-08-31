// 一体化决策推演引擎 v2.2
const DecisionEngine = (function () {
  const SIM_TYPES = [
    { id: 'overall', label: '整体推演', icon: '🎯', methodDesc: '经典挣值推演图（PV/EV/AC + EAC 预测 + 管理储备），联动动态现金流推演，综合评估项目健康度' },
    { id: 'schedule', label: '进度推演', icon: '📅', methodDesc: '项目进度网络图展示活动逻辑关系，关键路径与扰动后工期可视化' },
    { id: 'cost', label: '成本推演', icon: '💰', methodDesc: '成本 S 曲线（累计 PV/EV/AC），对比现状与扰动推演轨迹' }
  ];

  function showsAiPanel(simType) {
    return simType === 'overall' || simType === 'schedule';
  }
  const FACTORS = [
    { id: 'steelPrice', label: '钢筋单价', unit: '%', min: -10, max: 15, step: 0.5, default: 0, impactWeight: 1.2,
      hint: '相对当前预算价波动', icon: '🔩' },
    { id: 'progressDelay', label: '关键节点延误', unit: '天', min: 0, max: 90, step: 1, default: 0, impactWeight: 1.5,
      hint: '桩基/主体等里程碑延期', icon: '📅' },
    { id: 'subcontractDelta', label: '分包合同变更', unit: '万', min: -200, max: 500, step: 10, default: 0, impactWeight: 1.8,
      hint: '签证/变更累计金额', icon: '📋' },
    { id: 'paymentDelay', label: '业主回款延迟', unit: '天', min: 0, max: 60, step: 5, default: 0, impactWeight: 1.4,
      hint: '较约定账期延长', icon: '💳' },
    { id: 'concreteQty', label: '混凝土用量偏差', unit: '%', min: -8, max: 12, step: 0.5, default: 0, impactWeight: 1.0,
      hint: '相对施工图预算量', icon: '🏗️' },
    { id: 'qualityInvest', label: '质量整改投入', unit: '万', min: 0, max: 300, step: 10, default: 0, impactWeight: 0.9,
      hint: '专项整改与复检费用', icon: '✅' }
  ];

  const PRESETS = [
    { id: 'baseline', label: '当前基准', icon: '📊', values: {} },
    { id: 'steel_up', label: '钢筋涨价8%', icon: '🔩', values: { steelPrice: 8 } },
    { id: 'delay_30', label: '主体延误30天', icon: '⏱️', values: { progressDelay: 30 } },
    { id: 'payment_late', label: '回款延迟30天', icon: '💳', values: { paymentDelay: 30 } },
    { id: 'combo_risk', label: '复合风险情景', icon: '⚠️', values: { steelPrice: 5, progressDelay: 20, subcontractDelta: 80, paymentDelay: 15 } }
  ];

  function getBaseline(project) {
    const bidYi = project.cost.bidPrice;
    const targetYi = project.cost.targetCost;
    const profitWan = (bidYi - targetYi) * 10000;
    const qualityBase = Math.min(98, 82 + project.progress * 0.04 - project.lagNodes * 3);
    const cashflowJun = MOCK_DATA.cashflowDetail?.monthly?.find((m) => m.month === '2026-06')?.forecastBalance ?? 420;
    return {
      progress: project.progress,
      profitRate: project.profitRate,
      profitWan: Math.round(profitWan),
      bidYi,
      targetYi,
      actualCostYi: +(targetYi * (project.costCompletion / 100) + targetYi * 0.08).toFixed(2),
      qualityScore: +qualityBase.toFixed(1),
      safetyScore: Math.min(95, 88 - project.lagNodes * 2 + (project.risks.red > 0 ? -4 : 2)),
      cashflowJun,
      riskCount: project.risks.total,
      redRisks: project.risks.red,
      paymentRate: project.paymentRate,
      endDateShift: 0
    };
  }

  function simulate(project, factors) {
    const base = getBaseline(project);
    const bidWan = base.bidYi * 10000;
    let costDeltaWan = 0;
    let progressDelta = 0;
    let qualityDelta = 0;
    let safetyDelta = 0;
    let cashflowDelta = 0;
    let riskDelta = 0;
    let endDateShift = 0;
    const breakdown = [];

    const steel = factors.steelPrice || 0;
    if (steel !== 0) {
      const steelCostShare = base.targetYi * 0.18 * 10000;
      const d = steelCostShare * (steel / 100);
      costDeltaWan += d;
      breakdown.push({ factor: '钢筋单价', delta: d, unit: '万' });
    }

    const concrete = factors.concreteQty || 0;
    if (concrete !== 0) {
      const concShare = base.targetYi * 0.22 * 10000;
      const d = concShare * (concrete / 100);
      costDeltaWan += d;
      breakdown.push({ factor: '混凝土用量', delta: d, unit: '万' });
    }

    const sub = factors.subcontractDelta || 0;
    if (sub !== 0) {
      costDeltaWan += sub;
      breakdown.push({ factor: '分包变更', delta: sub, unit: '万' });
    }

    const quality = factors.qualityInvest || 0;
    if (quality !== 0) {
      costDeltaWan += quality;
      qualityDelta += Math.min(6, quality / 40);
      riskDelta -= Math.min(2, Math.floor(quality / 80));
      breakdown.push({ factor: '质量整改', delta: quality, unit: '万' });
    }

    const delay = factors.progressDelay || 0;
    if (delay > 0) {
      progressDelta = -(delay / 365) * 28;
      const laborOverrun = delay * 1.2;
      costDeltaWan += laborOverrun;
      endDateShift = delay;
      safetyDelta -= Math.min(8, delay / 12);
      riskDelta += Math.min(3, Math.floor(delay / 20));
      breakdown.push({ factor: '工期延误管理费', delta: laborOverrun, unit: '万' });
    }

    const payDelay = factors.paymentDelay || 0;
    if (payDelay > 0) {
      cashflowDelta = -(payDelay / 30) * 180;
      if (payDelay > 20) {
        costDeltaWan += 35;
        breakdown.push({ factor: '垫资财务成本', delta: 35, unit: '万' });
      }
      riskDelta += Math.min(2, Math.floor(payDelay / 25));
    }

    const newTargetYi = base.targetYi + costDeltaWan / 10000;
    const newProfitWan = bidWan - newTargetYi * 10000;
    // 口径修复（M1）：公式只算增量、字段定水平——推演值 = 基线利润率(字段) + 公式推演值 − 公式基线值。
    // 此前直接取公式推演值，与字段基线（17.2% vs 公式 21.98%）矛盾，导致"钢筋涨价利润反升"的方向性错误。
    const formulaBaseRate = +((bidWan - base.targetYi * 10000) / bidWan * 100).toFixed(2);
    const newProfitRate = +(base.profitRate + +(newProfitWan / bidWan * 100).toFixed(2) - formulaBaseRate).toFixed(2);
    const profitDelta = +(newProfitRate - base.profitRate).toFixed(2);

    let newProgress = +(base.progress + progressDelta).toFixed(1);
    newProgress = Math.max(0, Math.min(100, newProgress));

    const result = {
      baseline: base,
      simulated: {
        progress: newProgress,
        profitRate: newProfitRate,
        profitWan: Math.round(newProfitWan),
        targetYi: +newTargetYi.toFixed(2),
        costDeltaWan: +costDeltaWan.toFixed(1),
        qualityScore: +Math.max(60, Math.min(99, base.qualityScore + qualityDelta)).toFixed(1),
        safetyScore: +Math.max(65, Math.min(98, base.safetyScore + safetyDelta)).toFixed(1),
        cashflowJun: Math.round(base.cashflowJun + cashflowDelta),
        riskCount: Math.max(0, base.riskCount + riskDelta),
        redRisks: Math.max(0, base.redRisks + (profitDelta < -1 ? 1 : 0)),
        paymentRate: +(base.paymentRate - payDelay * 0.15).toFixed(1),
        endDateShift
      },
      deltas: {
        progress: +(newProgress - base.progress).toFixed(1),
        profitRate: profitDelta,
        profitWan: Math.round(newProfitWan - base.profitWan),
        quality: +(qualityDelta).toFixed(1),
        safety: +(safetyDelta).toFixed(1),
        cashflow: Math.round(cashflowDelta),
        risk: riskDelta
      },
      breakdown,
      factors: { ...factors },
      belowRedLine: newProfitRate < MOCK_DATA.profitRedLine,
      criticalCashflow: (base.cashflowJun + cashflowDelta) < (MOCK_DATA.cashflowDetail?.criticalBalance || 200)
    };
    return result;
  }

  const FORMULAS = {
    overall: [
      { name: '综合健康指数', expr: 'HI = 0.35×SPI + 0.35×CPI + 0.3×利润率指数' },
      { name: '利润率指数', expr: '利润率指数 = 实际利润率 / 目标红线利润率 × 100' }
    ],
    schedule: [
      { name: '计划价值 PV', expr: 'PV = 计划完成百分比 × BAC（完工预算）' },
      { name: '挣值 EV', expr: 'EV = 实际完成百分比 × BAC' },
      { name: '实际成本 AC', expr: 'AC = 已完成工作的实际花费' },
      { name: '进度偏差 SV', expr: 'SV = EV − PV（SV<0 进度滞后）' },
      { name: '进度绩效指数 SPI', expr: 'SPI = EV / PV（SPI<1 滞后，SPI>1 超前）' },
      { name: '关键路径影响', expr: '关键活动延误天数 → 项目工期与 SPI 联动下调' }
    ],
    cost: [
      { name: '完工预算 BAC', expr: 'BAC = 目标成本（成本基准）' },
      { name: '完工估算 EAC', expr: 'EAC = BAC / CPI（按当前成本效率预测）' },
      { name: '完工偏差 VAC', expr: 'VAC = BAC − EAC（VAC<0 预测超支）' },
      { name: '成本绩效指数 CPI', expr: 'CPI = EV / AC' },
      { name: '目标成本调整', expr: '新目标成本 = 基准目标成本 + Σ材料/分包/工期扰动' }
    ]
  };

  function calcEarnedValue(project, factors) {
    const progress = project.progress / 100;
    const bac = +(project.cost.targetCost * 10000).toFixed(0);
    const pv = +(bac * Math.min(1, progress + 0.05)).toFixed(0);
    const delay = factors.progressDelay || 0;
    const evFactor = Math.max(0.7, 1 - delay / 200);
    const ev = +(bac * progress * evFactor).toFixed(0);
    const costFactor = 1 + (factors.steelPrice || 0) / 100 * 0.18 + (factors.concreteQty || 0) / 100 * 0.12;
    const ac = +(ev * costFactor + (factors.subcontractDelta || 0)).toFixed(0);
    const spi = pv > 0 ? +(ev / pv).toFixed(3) : 1;
    const cpi = ac > 0 ? +(ev / ac).toFixed(3) : 1;
    const sv = ev - pv;
    const cv = ev - ac;
    const eac = cpi > 0 ? +(bac / cpi).toFixed(0) : bac;
    const etc = eac - ac;
    const vac = bac - eac;
    const tcpi = (bac - ac) > 0 ? +((bac - ev) / (bac - ac)).toFixed(3) : 1;
    const cpImpact = delay > 0
      ? `关键路径活动延误 ${delay} 天，SPI=${spi}，需评估赶工或工序优化`
      : '关键路径未新增延误';
    return { bac, pv, ac, ev, spi, cpi, sv, cv, eac, etc, vac, tcpi, cpImpact, delay };
  }

  function metricItem(label, value, abnormal) {
    return {
      label,
      value,
      status: abnormal ? 'warn' : 'ok',
      stateLabel: abnormal ? '异常' : '正常'
    };
  }

  function getCurrentStatusByType(project, simType) {
    const ev = calcEarnedValue(project, {});
    const costSurplus = project.cost.targetCost - project.cost.actualCost;
    const cashflowJun = MOCK_DATA.cashflowDetail?.monthly?.find((m) => m.month === '2026-06')?.forecastBalance ?? 420;
    const criticalCf = MOCK_DATA.cashflowDetail?.criticalBalance || 200;
    let items = [];
    let suggestions = [];

    if (simType === 'schedule') {
      const lag = project.lagNodes > 0;
      const spiBad = ev.spi < 0.98;
      const svBad = ev.sv < 0;
      items = [
        metricItem('整体进度完成率', `${project.progress}%`, lag || project.progress < 30),
        metricItem('进度绩效 SPI', String(ev.spi), spiBad),
        metricItem('进度偏差 SV', `${ev.sv >= 0 ? '+' : ''}${ev.sv} 万`, svBad),
        metricItem('滞后里程碑', `${project.lagNodes} 个`, lag),
        metricItem('关键路径状态', lag ? '存在滞后节点' : '暂无新增延误', lag)
      ];
      if (lag) {
        suggestions.push({ type: 'warn', title: '里程碑滞后', text: `当前 ${project.lagNodes} 个节点滞后，建议对照 WBS/甘特图锁定关键路径活动，编制赶工或工序穿插方案。` });
      }
      if (spiBad) {
        suggestions.push({ type: 'warn', title: 'SPI 低于 1', text: `SPI=${ev.spi}，实际完成价值低于计划，建议周报跟踪产值确认与证照节点。` });
      }
      if (svBad) {
        suggestions.push({ type: 'action', title: '进度偏差 SV 为负', text: `SV=${ev.sv} 万，优先协调资源投入关键线路，避免非关键线路占用班组。` });
      }
      if (!lag && !spiBad && !svBad) {
        suggestions.push({ type: 'ok', title: '进度指标正常', text: '进度绩效在计划范围内，维持现有节拍并关注下月里程碑。' });
      }
    } else if (simType === 'cost') {
      const cpiBad = ev.cpi < 1;
      const vacBad = ev.vac < 0;
      const profitBad = project.profitRate < MOCK_DATA.profitRedLine;
      const overrun = costSurplus <= 0;
      items = [
        metricItem('成本绩效 CPI', String(ev.cpi), cpiBad),
        metricItem('目标成本结余', `${costSurplus > 0 ? '+' : ''}${costSurplus.toFixed(2)} 亿`, overrun),
        metricItem('实际利润率', `${project.profitRate}%`, profitBad),
        metricItem('完工估算 EAC', `${(ev.eac / 10000).toFixed(2)} 亿`, vacBad),
        metricItem('完工偏差 VAC', `${ev.vac >= 0 ? '+' : ''}${ev.vac} 万`, vacBad)
      ];
      if (profitBad) {
        suggestions.push({ type: 'danger', title: '利润率低于红线', text: `当前 ${project.profitRate}% < 红线 ${MOCK_DATA.profitRedLine}%，48 小时内启动三算对比，锁定 ${(project.cost.topOverruns || []).join('、') || '超支分项'}。` });
      }
      if (cpiBad) {
        suggestions.push({ type: 'warn', title: 'CPI 低于 1', text: `CPI=${ev.cpi}，实际成本高于挣值，建议复核分包签证与钢筋/混凝土采购价。` });
      }
      if (vacBad) {
        suggestions.push({ type: 'action', title: '预测完工超支', text: `VAC=${ev.vac} 万，滚动修订目标成本并对外协变更实行限额审批。` });
      }
      if (costSurplus > 0 && !cpiBad) {
        suggestions.push({ type: 'opportunity', title: '成本有结余空间', text: `结余约 ${costSurplus.toFixed(2)} 亿，可设立风险储备，避免无依据扩大分包范围。` });
      }
      if (!suggestions.length) {
        suggestions.push({ type: 'ok', title: '成本指标正常', text: '成本绩效可控，继续按周更新目标成本滚动表。' });
      }
    } else {
      const lag = project.lagNodes > 0 || ev.spi < 0.98;
      const costIssue = ev.cpi < 1 || project.profitRate < MOCK_DATA.profitRedLine;
      const cfIssue = cashflowJun < criticalCf;
      items = [
        metricItem('整体进度', `${project.progress}%`, lag),
        metricItem('实际利润率', `${project.profitRate}%`, project.profitRate < MOCK_DATA.profitRedLine),
        metricItem('SPI / CPI', `${ev.spi} / ${ev.cpi}`, ev.spi < 1 || ev.cpi < 1),
        metricItem('6月现金流结余', `${cashflowJun} 万`, cfIssue),
        metricItem('滞后节点', `${project.lagNodes} 个`, project.lagNodes > 0)
      ];
      if (costIssue) {
        suggestions.push({ type: 'warn', title: '成本与利润需关注', text: '利润率或 CPI 偏离目标，建议切换「成本推演」查看 EAC/VAC 并联动商务测算。' });
      }
      if (lag) {
        suggestions.push({ type: 'warn', title: '进度需关注', text: '存在滞后节点或 SPI 偏低，建议切换「进度推演」查看 SV 与关键路径。' });
      }
      if (cfIssue) {
        suggestions.push({ type: 'danger', title: '现金流逼近临界', text: `6 月结余 ${cashflowJun} 万，低于临界 ${criticalCf} 万，财务部协同外协推进回款。` });
      }
      if (!costIssue && !lag && !cfIssue) {
        suggestions.push({ type: 'ok', title: '整体态势平稳', text: '进度、成本、现金流均在可控区间，维持周度例会跟踪。' });
      }
    }
    return { items, suggestions, ev, simType };
  }

  function renderCurrentStatus(project, simType) {
    const { items, suggestions } = getCurrentStatusByType(project, simType);
    const metricsHtml = items.map((i) =>
      `<div class="status-metric-row status-row-${i.status}">
        <span class="status-metric-label">${i.label}</span>
        <span class="status-metric-value">${i.value}</span>
        <span class="status-state-tag ${i.status === 'ok' ? 'tag-normal' : 'alert-tag alert-warning'}">${i.stateLabel}</span>
      </div>`
    ).join('');
    const sugHtml = suggestions.length
      ? `<ol class="status-suggest-list">${suggestions.map((s) =>
        `<li class="suggest-li suggest-${s.type}"><strong>${s.title}：</strong>${s.text}</li>`
      ).join('')}</ol>`
      : '';
    return { metricsHtml, sugHtml };
  }

  function renderMethodologyPanel(simType) {
    const meta = SIM_TYPES.find((t) => t.id === simType) || SIM_TYPES[0];
    return `<p class="method-desc">${meta.methodDesc}</p>`;
  }

  function simulateDimension(type, project, factors) {
    const baseResult = simulate(project, factors);
    const ev = calcEarnedValue(project, factors);
    const simEv = calcEarnedValue(project, factors);

    const dims = {
      overall: {
        metrics: [
          { id: 'hi', name: '综合健康指数', base: 82, sim: +(82 + baseResult.deltas.profitRate * 2 + baseResult.deltas.progress * 0.3).toFixed(1), unit: '' },
          { id: 'profit', name: '实际利润率', base: baseResult.baseline.profitRate, sim: baseResult.simulated.profitRate, unit: '%' },
          { id: 'progress', name: '整体进度', base: baseResult.baseline.progress, sim: baseResult.simulated.progress, unit: '%' },
          { id: 'spi', name: 'SPI', base: ev.spi, sim: simEv.spi, unit: '' },
          { id: 'cpi', name: 'CPI', base: ev.cpi, sim: simEv.cpi, unit: '' }
        ],
        chartLabels: ['进度%', '利润率%', 'SPI×100', 'CPI×100'],
        chartBase: [baseResult.baseline.progress, baseResult.baseline.profitRate, ev.spi * 100, ev.cpi * 100],
        chartSim: [baseResult.simulated.progress, baseResult.simulated.profitRate, simEv.spi * 100, simEv.cpi * 100]
      },
      schedule: {
        metrics: [
          { id: 'pv', name: 'PV 计划价值', base: ev.pv, sim: simEv.pv, unit: '万' },
          { id: 'ev', name: 'EV 挣值', base: ev.ev, sim: simEv.ev, unit: '万' },
          { id: 'ac', name: 'AC 实际成本', base: ev.ac, sim: simEv.ac, unit: '万' },
          { id: 'sv', name: 'SV 进度偏差', base: ev.sv, sim: simEv.sv, unit: '万' },
          { id: 'spi', name: 'SPI', base: ev.spi, sim: simEv.spi, unit: '' },
          { id: 'cpi', name: 'CPI', base: ev.cpi, sim: simEv.cpi, unit: '' }
        ],
        chartLabels: ['PV(百万)', 'EV', 'AC', 'SPI×100', 'SV(百万)'],
        chartBase: [ev.pv / 100, ev.ev / 100, ev.ac / 100, ev.spi * 100, ev.sv / 100],
        chartSim: [simEv.pv / 100, simEv.ev / 100, simEv.ac / 100, simEv.spi * 100, simEv.sv / 100]
      },
      cost: {
        metrics: [
          { id: 'bac', name: 'BAC 完工预算', base: ev.bac, sim: simEv.bac, unit: '万' },
          { id: 'eac', name: 'EAC 完工估算', base: ev.eac, sim: simEv.eac, unit: '万' },
          { id: 'etc', name: 'ETC 尚需估算', base: ev.etc, sim: simEv.etc, unit: '万' },
          { id: 'vac', name: 'VAC 完工偏差', base: ev.vac, sim: simEv.vac, unit: '万' },
          { id: 'cpi', name: 'CPI', base: ev.cpi, sim: simEv.cpi, unit: '' },
          { id: 'tcpi', name: 'TCPI', base: ev.tcpi, sim: simEv.tcpi, unit: '' }
        ],
        chartLabels: ['BAC(百万)', 'EAC', 'CPI×100', 'TCPI×100', 'VAC(百万)'],
        chartBase: [ev.bac / 100, ev.eac / 100, ev.cpi * 100, ev.tcpi * 100, ev.vac / 100],
        chartSim: [simEv.bac / 100, simEv.eac / 100, simEv.cpi * 100, simEv.tcpi * 100, simEv.vac / 100]
      }
    };
    return { type, core: baseResult, dimension: dims[type] || dims.overall, formulas: FORMULAS[type] || [], ev: simEv };
  }

  function renderFormulas(type) {
    const list = FORMULAS[type] || [];
    return list.map((f) => `<div class="formula-item"><div class="formula-name">${f.name}</div><code class="formula-expr">${f.expr}</code></div>`).join('');
  }

  function renderDimensionMetrics(metrics) {
    return metrics.map((m) => {
      const delta = +(m.sim - m.base).toFixed(2);
      const cls = delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : '';
      return `<div class="dim-metric card"><div class="dim-metric-name">${m.name}</div>
        <div class="dim-metric-row"><span>${m.base}${m.unit}</span><span>→</span><span class="${cls}">${m.sim}${m.unit}</span></div>
        <div class="dim-metric-delta ${cls}">${delta > 0 ? '+' : ''}${delta}${m.unit}</div></div>`;
    }).join('');
  }

  function initDimensionBarChart(canvasId, dimData, chartInstances) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !dimData) return;
    chartInstances.push(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: dimData.chartLabels,
        datasets: [
          { label: '现有/基准', data: dimData.chartBase, backgroundColor: '#597ef7', borderRadius: 4 },
          { label: '推演', data: dimData.chartSim, backgroundColor: '#52c41a', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8ba3c7' } } },
        scales: { y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7', font: { size: 10 } } } }
      }
    }));
  }

  function buildAiPromptForType(dimResult, project, simType) {
    const status = getCurrentStatusByType(project, simType);
    const typeLabel = SIM_TYPES.find((t) => t.id === simType)?.label || '推演';
    const lines = [];
    lines.push(`【${typeLabel} · AI 研判】`);
    lines.push(`项目：${project.name}`);
    lines.push('');

    lines.push(`【现有情况】`);
    status.items.forEach((i) => lines.push(`· ${i.label}：${i.value}（${i.stateLabel}）`));
    lines.push('');
    lines.push(`【建议措施】`);
    status.suggestions.forEach((s, idx) => lines.push(`${idx + 1}. ${s.title}：${s.text}`));
    lines.push('');

    const d = dimResult.dimension;
    lines.push(`【推演定量结果】`);
    d.metrics.forEach((m) => {
      lines.push(`· ${m.name}：${m.base}${m.unit} → ${m.sim}${m.unit}`);
    });
    lines.push('');

    const ev = dimResult.ev;
    if (simType === 'schedule') {
      lines.push(`【进度专项】PV=${ev.pv}万 EV=${ev.ev}万 AC=${ev.ac}万 SV=${ev.sv}万 SPI=${ev.spi}`);
      lines.push(ev.cpImpact);
    } else if (simType === 'overall') {
      lines.push(`【综合】SPI=${ev.spi} CPI=${ev.cpi} · ${ev.cpImpact}`);
    }

    const core = dimResult.core;
    lines.push('');
    lines.push(`【扰动推演后】利润率 ${core.simulated.profitRate}%（${core.deltas.profitRate >= 0 ? '+' : ''}${core.deltas.profitRate} pct）· 进度 ${core.simulated.progress}%`);
    if (core.belowRedLine) lines.push('⚠️ 推演后利润率低于红线，请优先落实成本与回款措施。');

    return lines.join('\n');
  }

  function buildAiPrompt(result, project, simType = 'overall') {
    const dim = simulateDimension(simType || 'overall', project, result.factors);
    return buildAiPromptForType(dim, project, simType || 'overall');
  }

  function streamText(el, text, onDone) {
    if (!el) return;
    el.textContent = '';
    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'ai-cursor';
    cursor.textContent = '▋';
    el.appendChild(cursor);
    const timer = setInterval(() => {
      if (i < text.length) {
        const chunk = text.slice(i, i + 3);
        el.insertBefore(document.createTextNode(chunk), cursor);
        i += 3;
        el.scrollTop = el.scrollHeight;
      } else {
        clearInterval(timer);
        cursor.remove();
        onDone?.();
      }
    }, 12);
    return () => clearInterval(timer);
  }

  function renderPresets(activeId) {
    return PRESETS.map((p) =>
      `<button type="button" class="preset-chip ${activeId === p.id ? 'active' : ''}" data-preset="${p.id}" title="双击可编辑标签">
        <span>${p.icon}</span> <span class="preset-label">${p.label}</span>
        <span class="preset-edit" data-edit-preset="${p.id}" title="编辑">✎</span>
      </button>`
    ).join('');
  }

  function renderFactorSliders(factors, onChange) {
    return FACTORS.map((f) => {
      const v = factors[f.id] ?? f.default;
      const impact = f.impactWeight ?? 1;
      return `<div class="factor-row" data-factor="${f.id}">
        <div class="factor-head">
          <span class="factor-icon">${f.icon}</span>
          <span class="factor-label editable-label" data-edit-factor-label="${f.id}" title="点击编辑名称">${f.label}</span>
          <span class="factor-value" id="fv-${f.id}">${v > 0 && f.unit !== '天' && f.unit !== '万' ? '+' : ''}${v}<span class="unit">${f.unit}</span></span>
          <span class="factor-edit" data-edit-factor="${f.id}" title="编辑范围/权重">✎</span>
        </div>
        <input type="range" class="factor-slider" id="fs-${f.id}"
          min="${f.min}" max="${f.max}" step="${f.step}" value="${v}"
          data-factor="${f.id}" data-impact="${impact}">
        <div class="factor-hint">${f.hint} · 影响权重 ${impact}x</div>
      </div>`;
    }).join('');
  }

  function getFactorImpacts(factors, project) {
    const result = simulate(project, factors);
    const impacts = result.breakdown.map((b) => ({
      label: b.factor,
      x: Math.abs(b.delta),
      y: Math.abs(b.delta) * (b.unit === '%' ? 8 : b.unit === '天' ? 2 : 1),
      r: Math.min(28, 8 + Math.abs(b.delta) * 0.8)
    }));
    if (!impacts.length) {
      FACTORS.forEach((f) => {
        const v = Math.abs(factors[f.id] || 0);
        if (v > 0) impacts.push({ label: f.label, x: v, y: v * (f.impactWeight || 1), r: 8 + v });
      });
    }
    return impacts.length ? impacts : [{ label: '基准', x: 1, y: 1, r: 10 }];
  }

  function initBubbleChart(canvasId, factors, project, chartInstances) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const bubbles = getFactorImpacts(factors, project);
    chartInstances.push(new Chart(canvas, {
      type: 'bubble',
      data: {
        datasets: [{
          label: '因子影响幅度',
          data: bubbles.map((b) => ({ x: b.x, y: b.y, r: b.r, label: b.label })),
          backgroundColor: 'rgba(24,144,255,0.45)',
          borderColor: '#1890ff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const raw = ctx.raw;
                return `${raw.label || ''}: 扰动 ${raw.x} · 影响指数 ${raw.y.toFixed(1)}`;
              }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: '扰动幅度', color: '#8ba3c7' }, grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } },
          y: { title: { display: true, text: '影响指数', color: '#8ba3c7' }, grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }
        }
      }
    }));
  }

  function editPresetLabel(presetId) {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const label = prompt('编辑快捷情景名称', preset.label);
    if (label != null && label.trim()) preset.label = label.trim();
  }

  function editFactorMeta(factorId) {
    const f = FACTORS.find((x) => x.id === factorId);
    if (!f) return;
    const label = prompt('因子名称', f.label);
    if (label != null && label.trim()) f.label = label.trim();
    const w = prompt('影响权重（数字越大气泡越大）', String(f.impactWeight ?? 1));
    if (w != null && !isNaN(parseFloat(w))) f.impactWeight = parseFloat(w);
  }

  function renderMetricCompare(label, base, sim, unit, lowerIsBetter) {
    const delta = +(sim - base).toFixed(2);
    const worse = lowerIsBetter ? delta < 0 : delta > 0;
    const better = lowerIsBetter ? delta > 0 : delta < 0;
    const cls = delta === 0 ? '' : worse ? 'text-danger' : better ? 'text-success' : '';
    return `<div class="metric-compare card">
      <div class="label">${label}</div>
      <div class="compare-row">
        <span class="base-val">${base}${unit}</span>
        <span class="arrow">→</span>
        <span class="sim-val ${cls}">${sim}${unit}</span>
      </div>
      <div class="delta ${cls}">${delta > 0 ? '+' : ''}${delta}${unit}</div>
    </div>`;
  }

  function initRadarChart(canvasId, result, chartInstances) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const b = result.baseline;
    const s = result.simulated;
    const norm = (v, max) => Math.min(100, Math.max(0, (v / max) * 100));
    chartInstances.push(new Chart(canvas, {
      type: 'radar',
      data: {
        labels: ['进度', '利润率', '质量', '安全', '现金流', '回款率'],
        datasets: [
          {
            label: '当前基准',
            data: [b.progress, b.profitRate * 4, b.qualityScore, b.safetyScore, norm(b.cashflowJun, 800), b.paymentRate],
            borderColor: '#597ef7', backgroundColor: 'rgba(89,126,247,0.15)', pointRadius: 3
          },
          {
            label: '推演情景',
            data: [s.progress, s.profitRate * 4, s.qualityScore, s.safetyScore, norm(s.cashflowJun, 800), s.paymentRate],
            borderColor: s.profitRate < MOCK_DATA.profitRedLine ? '#ff4d4f' : '#52c41a',
            backgroundColor: s.profitRate < MOCK_DATA.profitRedLine ? 'rgba(255,77,79,0.12)' : 'rgba(82,196,26,0.12)',
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8ba3c7', font: { size: 11 } } } },
        scales: {
          r: {
            angleLines: { color: '#1e3a5f' },
            grid: { color: '#1e3a5f' },
            pointLabels: { color: '#8ba3c7', font: { size: 11 } },
            ticks: { display: false, max: 100 }
          }
        }
      }
    }));
  }

  function initBarChart(canvasId, result, chartInstances) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    chartInstances.push(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['进度%', '利润率%', '质量', '安全', '6月结余(百万元)'],
        datasets: [
          { label: '基准', data: [result.baseline.progress, result.baseline.profitRate, result.baseline.qualityScore, result.baseline.safetyScore, result.baseline.cashflowJun / 100],
            backgroundColor: '#597ef7', borderRadius: 4 },
          { label: '推演', data: [result.simulated.progress, result.simulated.profitRate, result.simulated.qualityScore, result.simulated.safetyScore, result.simulated.cashflowJun / 100],
            backgroundColor: result.belowRedLine ? '#ff7875' : '#52c41a', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8ba3c7' } } },
        scales: {
          y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } },
          x: { grid: { display: false }, ticks: { color: '#8ba3c7', font: { size: 10 } } }
        }
      }
    }));
  }

  return {
    SIM_TYPES, FORMULAS, FACTORS, PRESETS, showsAiPanel,
    getBaseline, getCurrentStatusByType, simulate, simulateDimension, calcEarnedValue,
    buildAiPrompt, buildAiPromptForType, streamText,
    renderFactorSliders, renderPresets, renderMetricCompare,
    renderFormulas, renderDimensionMetrics, renderMethodologyPanel, renderCurrentStatus,
    initRadarChart, initBarChart, initBubbleChart, initDimensionBarChart,
    editPresetLabel, editFactorMeta,
    defaultFactors: () => Object.fromEntries(FACTORS.map((f) => [f.id, f.default]))
  };
})();
