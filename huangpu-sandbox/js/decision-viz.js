// 决策推演可视化：进度网络图 · S 曲线 · EVM · 现金流
window.DecisionViz = (function () {
  const DAY_MS = 86400000;

  function parseDate(s) {
    if (!s || s === '—') return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function daysBetween(a, b) {
    if (!a || !b) return 30;
    return Math.max(1, Math.round((b - a) / DAY_MS));
  }

  function buildScheduleNetwork(projectId, factors) {
    const acts = [...(MOCK_DATA.progressSystem?.wbsByProject?.[projectId] || [])];
    acts.sort((a, b) => {
      const sa = parseDate(a.start)?.getTime() || 0;
      const sb = parseDate(b.start)?.getTime() || 0;
      return sa - sb;
    });
    const delay = factors.progressDelay || 0;
    const nodes = acts.map((a, i) => {
      const dur = daysBetween(parseDate(a.start), parseDate(a.end));
      const doing = a.progress > 0 && a.progress < 100;
      const extra = a.isCritical && doing ? Math.round(delay * 0.6) : (a.isCritical && delay > 0 && a.progress === 0 ? Math.round(delay * 0.2) : 0);
      return {
        id: a.id,
        label: a.name,
        wbs: a.wbs,
        col: i,
        row: a.isCritical ? 1 : 0,
        duration: dur,
        simDuration: dur + extra,
        progress: a.progress,
        critical: a.isCritical,
        delayed: extra > 0
      };
    });
    const edges = [];
    const critIds = acts.filter((a) => a.isCritical).map((a) => a.id);
    for (let i = 1; i < acts.length; i++) {
      const prev = acts[i - 1];
      const curr = acts[i];
      const linkCritical = prev.isCritical && curr.isCritical;
      const sameParent = curr.wbs.startsWith(prev.wbs + '.');
      if (linkCritical || sameParent || (prev.isCritical && !curr.isCritical)) {
        edges.push({ from: prev.id, to: curr.id, critical: linkCritical });
      }
    }
    if (critIds.length >= 2) {
      for (let i = 1; i < critIds.length; i++) {
        if (!edges.some((e) => e.from === critIds[i - 1] && e.to === critIds[i])) {
          edges.push({ from: critIds[i - 1], to: critIds[i], critical: true });
        }
      }
    }
    return { nodes, edges, delay };
  }

  function renderScheduleNetworkSvg(net) {
    if (!net.nodes.length) return '<p class="text-muted">暂无 WBS 活动数据</p>';
    const colW = 132;
    const rowH = 72;
    const padX = 48;
    const padY = 36;
    const maxCol = net.nodes.length;
    const w = padX * 2 + maxCol * colW;
    const h = padY * 2 + rowH * 2 + 40;
    const pos = {};
    net.nodes.forEach((n) => {
      pos[n.id] = { x: padX + n.col * colW, y: padY + (1 - n.row) * rowH };
    });

    const nodeSvg = net.nodes.map((n) => {
      const x = pos[n.id].x;
      const y = pos[n.id].y;
      const fill = n.progress >= 100 ? '#52c41a33' : n.critical ? '#fa8c1633' : '#1890ff22';
      const stroke = n.delayed ? '#ff4d4f' : n.critical ? '#fa8c16' : '#1890ff';
      const pct = n.progress;
      return `<g class="net-node" transform="translate(${x},${y})">
        <rect width="118" height="52" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <text x="8" y="16" fill="#8ba3c7" font-size="10">WBS ${n.wbs}</text>
        <text x="8" y="32" fill="#e6f4ff" font-size="11" font-weight="600">${n.label.length > 8 ? n.label.slice(0, 8) + '…' : n.label}</text>
        <text x="8" y="46" fill="#8ba3c7" font-size="10">${pct}% · ${n.duration}天${n.delayed ? ' →' + n.simDuration + '天' : ''}</text>
        ${n.critical ? '<text x="96" y="14" fill="#fa8c16" font-size="9">关键</text>' : ''}
      </g>`;
    }).join('');

    const edgeSvg = net.edges.map((e) => {
      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b) return '';
      const x1 = a.x + 118;
      const y1 = a.y + 26;
      const x2 = b.x;
      const y2 = b.y + 26;
      const color = e.critical ? '#fa8c16' : '#5B8FF9';
      return `<path d="M${x1} ${y1} C${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="2" marker-end="url(#arrow)"/>`;
    }).join('');

    return `<div class="net-scroll">
      <svg class="schedule-network-svg" viewBox="0 0 ${w} ${h}" width="100%" style="min-width:${Math.min(w, 900)}px">
        <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#8ba3c7"/></marker></defs>
        ${edgeSvg}${nodeSvg}
      </svg>
      <div class="net-legend">
        <span><i class="net-dot crit"></i>关键路径</span>
        <span><i class="net-dot done"></i>已完成</span>
        <span><i class="net-dot delay"></i>推演延误</span>
        ${net.delay > 0 ? `<span class="text-warning">扰动：关键节点 +${net.delay} 天</span>` : ''}
      </div>
    </div>`;
  }

  function buildSCurveSeries(project, factors) {
    const bac = project.cost.targetCost * 10000;
    const months = 14;
    const progress = project.progress / 100;
    const delay = factors.progressDelay || 0;
    const evLag = Math.max(0.75, 1 - delay / 120);
    const costInfl = 1 + (factors.steelPrice || 0) / 100 * 0.15 + (factors.concreteQty || 0) / 100 * 0.08;
    const subSpread = (factors.subcontractDelta || 0);

    const labels = [];
    const pv = [];
    const ev = [];
    const ac = [];
    const pvSim = [];
    const evSim = [];
    const acSim = [];

    for (let m = 1; m <= months; m++) {
      labels.push(`${m}月`);
      const t = m / months;
      const planT = Math.min(1, Math.pow(t, 1.15));
      const actualT = Math.min(progress * 1.05, planT * evLag);
      const pvVal = +(bac * planT).toFixed(0);
      const evVal = +(bac * actualT).toFixed(0);
      const acVal = +(evVal * 1.03 * costInfl + subSpread * t).toFixed(0);
      const evSimT = Math.min(progress * 1.05, planT * Math.max(0.65, evLag - 0.08));
      pv.push(pvVal);
      ev.push(evVal);
      ac.push(acVal);
      pvSim.push(pvVal);
      evSim.push(+(bac * evSimT).toFixed(0));
      acSim.push(+(evSim[evSim.length - 1] * 1.05 * costInfl + subSpread * t * 1.1).toFixed(0));
    }
    return { labels, pv, ev, ac, pvSim, evSim, acSim, bac };
  }

  function buildEvmSeries(project, factors) {
    const evSnap = calcEvSnapshot(project, factors);
    return buildEvmClassicData(project, factors, evSnap);
  }

  function buildEvmClassicData(project, factors, evSnap) {
    evSnap = evSnap || calcEvSnapshot(project, factors);
    const bac = evSnap.bac;
    const mr = +(bac * 0.05).toFixed(0);
    const projectBudget = bac + mr;
    const segments = 24;
    const dataIdx = Math.round(segments * Math.min(0.82, Math.max(0.38, project.progress / 100 + 0.1)));
    const delay = factors.progressDelay || 0;
    const evLag = Math.max(0.68, 1 - delay / 130);

    const pvFull = [];
    const evHist = [];
    const acHist = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const planT = Math.min(1, Math.pow(t, 1.12));
      pvFull.push(+(bac * planT).toFixed(1));
    }

    for (let i = 0; i <= dataIdx; i++) {
      const t = dataIdx > 0 ? i / dataIdx : 1;
      const evShape = Math.pow(t, 1.22) * evLag;
      const acShape = Math.pow(t, 1.08);
      evHist.push(+(evSnap.ev * Math.min(1, evShape)).toFixed(1));
      acHist.push(+(evSnap.ac * Math.min(1, acShape)).toFixed(1));
    }
    if (dataIdx >= 0) {
      evHist[dataIdx] = evSnap.ev;
      acHist[dataIdx] = evSnap.ac;
    }

    const pvAtData = pvFull[dataIdx] ?? evSnap.pv;
    const acAtData = evSnap.ac;
    const eac = evSnap.eac;

    return {
      bac,
      mr,
      projectBudget,
      eac,
      etc: evSnap.etc,
      vac: evSnap.vac,
      segments,
      dataIdx,
      pvFull,
      evHist,
      acHist,
      pvAtData,
      acAtData,
      evSnap,
      dataDateLabel: '2026-06-04',
      endDateLabel: (project.endDate || '2027-12-31').slice(0, 7)
    };
  }

  function renderEvmClassicSvg(data) {
    const PL = 88;
    const PR = 610;
    const PT = 52;
    const PB = 352;
    const PW = PR - PL;
    const PH = PB - PT;
    const LR = 628;
    const maxY = data.projectBudget * 1.12;
    const yOf = (v) => PB - (v / maxY) * PH;
    const xOf = (i) => PL + (i / data.segments) * PW;

    const linePath = (vals, endIdx) => {
      const pts = [];
      for (let i = 0; i <= endIdx; i++) {
        if (vals[i] == null) continue;
        pts.push(`${xOf(i).toFixed(1)},${yOf(vals[i]).toFixed(1)}`);
      }
      return pts.length ? `M${pts.join(' L')}` : '';
    };

    const dx = xOf(data.dataIdx);
    const endX = xOf(data.segments);
    const acY = yOf(data.acAtData);
    const eacY = yOf(data.eac);
    const bacY = yOf(data.bac);
    const budY = yOf(data.projectBudget);
    const etcX = LR + 58;

    const pvPath = linePath(data.pvFull, data.segments);
    const evPath = linePath(data.evHist, data.dataIdx);
    const acPath = linePath(data.acHist, data.dataIdx);
    const eacPath = `M${dx.toFixed(1)},${acY.toFixed(1)} L${endX.toFixed(1)},${eacY.toFixed(1)}`;

    const fmtYi = (v) => (v / 10000).toFixed(2);
    const statusNote = data.evSnap.ac > data.evSnap.pv && data.evSnap.ev < data.evSnap.pv
      ? '超支且滞后'
      : data.evSnap.ac > data.evSnap.ev
        ? '成本超支'
        : data.evSnap.ev < data.evSnap.pv
          ? '进度滞后'
          : '态势正常';

    const yTicks = [0, data.bac * 0.5, data.bac].map((v) => ({
      v,
      y: yOf(v),
      label: v === 0 ? '0' : `${(v / 10000).toFixed(1)}亿`
    }));

    return `<div class="evm-classic-chart">
      <div class="evm-chart-head">
        <span class="evm-chart-title">累计成本曲线</span>
        <span class="evm-status-tag ${data.eac > data.bac ? 'warn' : 'ok'}">${statusNote}</span>
      </div>
      <svg viewBox="0 0 880 400" width="100%" role="img" aria-label="挣值推演图">
        <rect x="${PL}" y="${PT}" width="${PW}" height="${PH}" fill="rgba(0,0,0,0.15)" rx="4"/>

        <rect x="${PL}" y="${yOf(data.bac).toFixed(1)}" width="${PW}" height="${(yOf(0) - yOf(data.bac)).toFixed(1)}" fill="rgba(139,163,199,0.07)" stroke="none"/>
        <rect x="${PL}" y="${budY.toFixed(1)}" width="${PW}" height="${(yOf(data.bac) - budY).toFixed(1)}" fill="rgba(82,196,26,0.1)" stroke="none"/>

        ${yTicks.map((t) => `
          <line x1="${PL}" y1="${t.y.toFixed(1)}" x2="${PR}" y2="${t.y.toFixed(1)}" stroke="rgba(139,163,199,0.12)" stroke-width="1"/>
          <text x="${PL - 10}" y="${(t.y + 4).toFixed(1)}" fill="#8ba3c7" font-size="10" text-anchor="end">${t.label}</text>
        `).join('')}

        <line x1="${PL}" y1="${bacY.toFixed(1)}" x2="${PR}" y2="${bacY.toFixed(1)}" stroke="rgba(139,163,199,0.28)" stroke-width="1" stroke-dasharray="4,3"/>
        <line x1="${PL}" y1="${budY.toFixed(1)}" x2="${PR}" y2="${budY.toFixed(1)}" stroke="rgba(82,196,26,0.35)" stroke-width="1" stroke-dasharray="4,3"/>

        <line x1="${dx.toFixed(1)}" y1="${PT}" x2="${dx.toFixed(1)}" y2="${PB}" stroke="rgba(230,244,255,0.45)" stroke-width="1.5" stroke-dasharray="5,4"/>
        <text x="${dx.toFixed(1)}" y="${PT - 10}" fill="#c9d8ef" font-size="10" text-anchor="middle">数据日期</text>

        <path d="${pvPath}" fill="none" stroke="#5B8FF9" stroke-width="2"/>
        <path d="${evPath}" fill="none" stroke="#52c41a" stroke-width="2"/>
        <path d="${acPath}" fill="none" stroke="#ff7875" stroke-width="2"/>
        <path d="${eacPath}" fill="none" stroke="#ff7875" stroke-width="1.5" stroke-dasharray="6,5" opacity="0.85"/>

        <circle cx="${endX.toFixed(1)}" cy="${eacY.toFixed(1)}" r="3" fill="#ff7875"/>
        <line x1="${etcX}" y1="${acY.toFixed(1)}" x2="${etcX}" y2="${eacY.toFixed(1)}" stroke="rgba(139,163,199,0.5)" stroke-width="1"/>
        <text x="${etcX + 8}" y="${((acY + eacY) / 2 + 4).toFixed(1)}" fill="#8ba3c7" font-size="10">ETC</text>

        <text x="${PL}" y="${PB + 22}" fill="#8ba3c7" font-size="10">开工</text>
        <text x="${dx.toFixed(1)}" y="${PB + 22}" fill="#8ba3c7" font-size="10" text-anchor="middle">${data.dataDateLabel.slice(0, 7)}</text>
        <text x="${endX.toFixed(1)}" y="${PB + 22}" fill="#8ba3c7" font-size="10" text-anchor="middle">完工 ${data.endDateLabel}</text>

        <text x="${LR}" y="${(bacY + 4).toFixed(1)}" fill="#8ba3c7" font-size="10">BAC ${fmtYi(data.bac)}亿</text>
        <text x="${LR}" y="${((bacY + budY) / 2 + 4).toFixed(1)}" fill="#95de64" font-size="10">管理储备</text>
        <text x="${LR}" y="${(budY + 4).toFixed(1)}" fill="#95de64" font-size="10">项目预算 ${fmtYi(data.projectBudget)}亿</text>
        <text x="${LR}" y="${(eacY + 4).toFixed(1)}" fill="#ff7875" font-size="10">EAC ${fmtYi(data.eac)}亿</text>
      </svg>
      <div class="evm-classic-legend">
        <span><i class="evm-dot pv"></i>PV 计划</span>
        <span><i class="evm-dot ev"></i>EV 挣值</span>
        <span><i class="evm-dot ac"></i>AC 实际</span>
        <span><i class="evm-dot eac"></i>EAC 预测</span>
      </div>
    </div>`;
  }

  function renderEvmMetricsHtml(evSnap) {
    if (!evSnap) return '';
    const fmt = (v) => (v / 10000).toFixed(2);
    const items = [
      { label: 'PV', value: `${fmt(evSnap.pv)}亿`, warn: false },
      { label: 'EV', value: `${fmt(evSnap.ev)}亿`, warn: evSnap.ev < evSnap.pv },
      { label: 'AC', value: `${fmt(evSnap.ac)}亿`, warn: evSnap.ac > evSnap.ev },
      { label: 'SPI', value: String(evSnap.spi), warn: evSnap.spi < 1 },
      { label: 'CPI', value: String(evSnap.cpi), warn: evSnap.cpi < 1 },
      { label: 'EAC', value: `${fmt(evSnap.eac)}亿`, warn: evSnap.eac > evSnap.bac },
      { label: 'VAC', value: `${fmt(evSnap.vac)}亿`, warn: evSnap.vac < 0 }
    ];
    return `<div class="evm-metrics-strip">${items.map((it) =>
      `<div class="evm-metric ${it.warn ? 'warn' : ''}"><span class="evm-metric-label">${it.label}</span><span class="evm-metric-value">${it.value}</span></div>`
    ).join('')}</div>`;
  }

  function calcEvSnapshot(project, factors) {
    const ev = DecisionEngine.calcEarnedValue(project, factors);
    return ev;
  }

  function buildCashflowSim(project, factors) {
    const cf = MOCK_DATA.cashflowDetail;
    if (!cf?.monthly) return { labels: [], baseline: [], simulated: [] };
    const payDelay = factors.paymentDelay || 0;
    const costUp = (factors.steelPrice || 0) / 100 * 120 + (factors.subcontractDelta || 0) * 0.15;

    return {
      labels: cf.monthly.map((m) => m.month.replace('2026-', '') + '月'),
      baseline: cf.monthly.map((m) => m.forecastBalance ?? 0),
      simulated: cf.monthly.map((m, i) => {
        let v = m.forecastBalance ?? 420;
        v -= payDelay * 2.5;
        v -= costUp * (i / cf.monthly.length);
        if (payDelay > 25) v -= 60;
        return Math.round(v);
      }),
      actual: cf.monthly.map((m) => m.actualBalance),
      critical: cf.criticalBalance || 200,
      projectName: project.name
    };
  }

  function chartOpts() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8ba3c7', boxWidth: 12 } } },
      scales: {
        y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } },
        x: { grid: { display: false }, ticks: { color: '#8ba3c7', font: { size: 10 } } }
      }
    };
  }

  function pushChart(store, id, chart) {
    chart._chartId = id;
    store.push(chart);
  }

  function initSCurve(canvasId, series, chartInstances) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    pushChart(chartInstances, canvasId, new Chart(el, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          { label: '计划 PV（累计）', data: series.pv.map((v) => v / 100), borderColor: '#5B8FF9', backgroundColor: 'transparent', tension: 0.35, borderWidth: 2 },
          { label: '挣值 EV（累计）', data: series.ev.map((v) => v / 100), borderColor: '#52c41a', tension: 0.35, borderWidth: 2 },
          { label: '实际 AC（累计）', data: series.ac.map((v) => v / 100), borderColor: '#fa8c16', tension: 0.35, borderWidth: 2 },
          { label: '推演 EV', data: series.evSim.map((v) => v / 100), borderColor: '#52c41a', borderDash: [6, 4], tension: 0.35 },
          { label: '推演 AC', data: series.acSim.map((v) => v / 100), borderColor: '#ff4d4f', borderDash: [6, 4], tension: 0.35 }
        ]
      },
      options: {
        ...chartOpts(),
        plugins: {
          legend: { labels: { color: '#8ba3c7', boxWidth: 12 } },
          title: { display: true, text: '成本 S 曲线（累计，百万元）', color: '#8ba3c7', font: { size: 12 } }
        }
      }
    }));
  }


  function initCashflowChart(canvasId, data, chartInstances) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    pushChart(chartInstances, canvasId, new Chart(el, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          { label: '基准预测结余', data: data.baseline, borderColor: '#5B8FF9', tension: 0.3, borderWidth: 2 },
          { label: '推演预测结余', data: data.simulated, borderColor: '#ff7875', borderDash: [6, 4], tension: 0.3, borderWidth: 2 },
          {
            label: '临界线',
            data: data.labels.map(() => data.critical),
            borderColor: '#ff4d4f',
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        ...chartOpts(),
        plugins: {
          legend: { labels: { color: '#8ba3c7' } },
          title: { display: true, text: `动态现金流 · ${data.projectName}（万元）`, color: '#8ba3c7', font: { size: 12 } }
        }
      }
    }));
  }

  function renderVizPanel(simType, project, factors) {
    if (simType === 'schedule') {
      const net = buildScheduleNetwork(project.id, factors);
      return {
        title: '项目进度网络图 · 可视化推演',
        subtitle: '箭头表示逻辑关系 · 橙色为关键路径 · 虚线标注为扰动后工期',
        html: renderScheduleNetworkSvg(net),
        charts: []
      };
    }
    if (simType === 'cost') {
      return {
        title: '成本 S 曲线',
        subtitle: '累计 PV / EV / AC · 实线为现状，虚线为扰动推演',
        html: '<div class="chart-container dec-viz-chart"><canvas id="dec-scurve-chart"></canvas></div>',
        charts: ['scurve']
      };
    }
    if (simType === 'overall') {
      const evmData = buildEvmClassicData(project, factors);
      return {
        title: '挣值推演图',
        subtitle: 'PV / EV / AC 累计曲线 · 数据日期后 EAC 预测 · 成本基准与管理储备',
        html: `<div class="dec-overall-viz">
          ${renderEvmClassicSvg(evmData)}
          ${renderEvmMetricsHtml(evmData.evSnap)}
          <div class="card dec-cashflow-card">
            <div class="card-header" style="padding-bottom:0">
              <div class="card-title" style="font-size:14px">动态现金流推演</div>
            </div>
            <div class="chart-container dec-cashflow-slot"><canvas id="dec-cashflow-chart"></canvas></div>
          </div>
        </div>`,
        charts: ['cashflow']
      };
    }
    return { title: '', subtitle: '', html: '', charts: [] };
  }

  function update(simType, project, factors, chartInstances) {
    const panel = renderVizPanel(simType, project, factors);
    const titleEl = document.getElementById('dec-viz-title');
    const subEl = document.getElementById('dec-viz-subtitle');
    const contentEl = document.getElementById('dec-viz-content');
    const wrap = document.getElementById('dec-viz-panel');
    if (!contentEl) return panel;

    if (titleEl) titleEl.textContent = panel.title;
    if (subEl) subEl.textContent = panel.subtitle;
    contentEl.innerHTML = panel.html;
    if (wrap) wrap.classList.toggle('hidden', !panel.title);
    if (panel.charts.includes('scurve')) {
      initSCurve('dec-scurve-chart', buildSCurveSeries(project, factors), chartInstances);
    }
    if (panel.charts.includes('cashflow')) {
      initCashflowChart('dec-cashflow-chart', buildCashflowSim(project, factors), chartInstances);
    }
    return panel;
  }

  return {
    buildScheduleNetwork,
    renderScheduleNetworkSvg,
    buildSCurveSeries,
    buildEvmSeries,
    buildEvmClassicData,
    renderEvmClassicSvg,
    buildCashflowSim,
    renderVizPanel,
    update
  };
})();
