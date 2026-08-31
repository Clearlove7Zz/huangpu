// 数字沙盘看板模块 v1.8
window.DashboardUI = (function () {
  const STORAGE_KEY = 'huangpu_dashboard_modules';
  const MODULES = [
    { id: 'stats', label: '核心指标卡片', default: true },
    { id: 'ranking', label: '四地块每周排名', default: true },
    { id: 'charts', label: '进度与三值图表', default: true },
    { id: 'period', label: '周期数据变化与报表', default: true },
    { id: 'focus', label: '重点关注事项', default: true },
    { id: 'outputValue', label: '进度产值', default: true },
    { id: 'progress', label: '进度管控概览', default: true, nav: 'progress-system' },
    { id: 'cashflow', label: '动态现金流概览', default: true, nav: 'cashflow' },
    { id: 'projects', label: '项目列表', default: true, nav: 'project' }
  ];

  const STAT_NAV = {
    plots: { view: 'project', label: '在管地块' },
    output: { view: 'progress-system', progressTab: 'output', label: '累计产值' },
    risk: { view: 'risk-system', label: '风险总数' },
    profit: { view: 'cost-system', label: '利润/物资预警' }
  };

  function getVisibleModules() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids) && ids.length) return ids;
      }
    } catch (_) { /* ignore */ }
    return MODULES.filter((m) => m.default).map((m) => m.id);
  }

  function saveVisibleModules(ids) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }

  function isVisible(id) {
    return getVisibleModules().includes(id);
  }

  function avgActualProfitRate(projects) {
    if (!projects.length) return 0;
    return +(projects.reduce((s, p) => s + p.profitRate, 0) / projects.length).toFixed(2);
  }

  function downloadCsv(filename, rows) {
    const bom = '\uFEFF';
    const body = rows.map((r) => r.map((c) => {
      const s = String(c ?? '').replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([bom + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function buildPeriodExportRows(periodKey, scope) {
    const pr = MOCK_DATA.periodReports[periodKey];
    const dept = scope === 'all' ? '全项目群' : scope;
    const rows = [
      ['黄埔区城更数字沙盘', `${pr.label}报表`],
      ['统计周期', pr.period],
      ['导出范围', dept],
      ['导出时间', new Date().toLocaleString('zh-CN')],
      [],
      ['指标', '本期值', '较上期变化', '说明']
    ];
    pr.metrics.forEach((m) => {
      rows.push([m.name, m.value, m.delta, m.note || '']);
    });
    rows.push([]);
    rows.push(['部门/维度', '明细']);
    pr.byDept.forEach((d) => {
      if (scope !== 'all' && d.dept !== scope) return;
      rows.push([d.dept, d.detail]);
    });
    rows.push([]);
    rows.push(['重点关注事项']);
    pr.focus.forEach((f) => rows.push([f.level, f.title, f.desc]));
    return rows;
  }

  function exportPeriodReport(periodKey, scope) {
    const pr = MOCK_DATA.periodReports[periodKey];
    const scopeLabel = scope === 'all' ? '整体' : scope;
    const filename = `黄埔沙盘_${pr.label}_${scopeLabel}_${pr.period.replace(/\s/g, '')}.csv`;
    downloadCsv(filename, buildPeriodExportRows(periodKey, scope));
    window.showToast?.(`已导出 ${pr.label}（${scopeLabel}）`);
  }

  function generateFocusAlerts(projects) {
    const alerts = [];
    projects.forEach((p) => {
      if (p.profitRate < MOCK_DATA.profitRedLine) {
        alerts.push({ level: 'danger', title: `${p.shortName} 实际利润率 ${p.profitRate}%`, desc: `低于目标利润率 ${MOCK_DATA.profitRedLine}%，建议进入成本测算子系统复核三值对比。`, nav: 'cost-system' });
      }
      if (p.lagNodes > 0) {
        alerts.push({ level: 'warning', title: `${p.shortName} 进度滞后 ${p.lagNodes} 个节点`, desc: '建议查看施工进度管控与证照办理进度。', nav: 'progress-system' });
      }
      if (p.risks.red > 0) {
        alerts.push({ level: 'danger', title: `${p.shortName} 红色风险 ${p.risks.red} 项`, desc: '请进入风险管理系统跟踪闭环。', nav: 'risk-system' });
      }
    });
    const warnMat = (MOCK_DATA.projectDetails?.xl_fj01?.materials || []).filter((m) => m.warn);
    if (warnMat.length) {
      alerts.push({ level: 'warning', title: `物资超量预警 ${warnMat.length} 项`, desc: warnMat.map((m) => m.name).join('、') + ' 超预算，影响实际利润率。', nav: 'material' });
    }
    if (!alerts.length) {
      alerts.push({ level: 'normal', title: '整体指标可控', desc: '四地块进度、成本、质量指标均在预警线以内，继续保持周度跟踪。', nav: 'dashboard' });
    }
    return alerts.slice(0, 8);
  }

  function renderCustomizer(onApply) {
    const visible = getVisibleModules();
    return `
      <div class="dash-customizer card" id="dash-customizer">
        <div class="card-header">
          <div class="card-title">自定义看板模块</div>
          <button type="button" class="btn btn-ghost btn-sm" id="dash-customizer-close">收起</button>
        </div>
        <p class="text-muted" style="font-size:12px;margin-bottom:12px">勾选要在看板展示的模块，设置将保存在本浏览器。</p>
        <div class="dash-module-checks">
          ${MODULES.map((m) => `<label class="dash-check"><input type="checkbox" data-module="${m.id}" ${visible.includes(m.id) ? 'checked' : ''}> ${m.label}</label>`).join('')}
        </div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button type="button" class="btn btn-primary btn-sm" id="dash-customizer-apply" style="width:auto">应用</button>
          <button type="button" class="btn btn-ghost btn-sm" id="dash-customizer-reset" style="width:auto">恢复默认</button>
        </div>
      </div>`;
  }

  function bindCustomizer(onApply) {
    $('#dash-customizer-apply')?.addEventListener('click', () => {
      const ids = [...document.querySelectorAll('#dash-customizer input[data-module]:checked')].map((el) => el.dataset.module);
      if (!ids.length) { window.showToast?.('至少保留一个模块'); return; }
      saveVisibleModules(ids);
      onApply();
    });
    $('#dash-customizer-reset')?.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      onApply();
    });
    $('#dash-customizer-close')?.addEventListener('click', () => {
      $('#dash-customizer')?.remove();
    });
  }

  function renderStatCards(projects, extras) {
    const totalOutput = projects.reduce((s, p) => s + p.outputTotal, 0);
    const totalRisks = projects.reduce((s, p) => s + p.risks.total, 0);
    const redRisks = projects.reduce((s, p) => s + p.risks.red, 0);
    const lowProfit = projects.filter((p) => p.profitRate < MOCK_DATA.profitRedLine).length;
    const avgProfit = avgActualProfitRate(projects);
    const warnMaterials = extras.warnMaterials;

    return `
      <div class="grid grid-4 dash-stat-grid" style="margin-bottom:24px">
        <div class="card stat-card dash-clickable" data-dash-nav="plots" title="点击进入单项目详情">
          <div class="label">在管地块</div><div class="value">4 <span class="unit">个</span></div>
          <div class="trend trend-up">首期试点：新联复建01地块</div><div class="icon-bg">🏗️</div>
          <div class="dash-nav-hint">点击查看 →</div>
        </div>
        <div class="card stat-card dash-clickable" data-dash-nav="output" title="点击进入施工进度管控">
          <div class="label">累计产值</div><div class="value">${totalOutput.toFixed(2)} <span class="unit">亿元</span></div>
          <div class="trend trend-up">↑ 本月 +1.05 亿</div><div class="icon-bg">📈</div>
          <div class="dash-nav-hint">点击查看 →</div>
        </div>
        <div class="card stat-card dash-clickable" data-dash-nav="risk" title="点击进入风险管理系统">
          <div class="label">风险总数</div><div class="value">${totalRisks} <span class="unit">项</span></div>
          <div class="trend trend-warn">红色 ${redRisks} · 待处理 9</div><div class="icon-bg">⚠️</div>
          <div class="dash-nav-hint">点击查看 →</div>
        </div>
        <div class="card stat-card dash-clickable" data-dash-nav="profit" title="点击进入成本测算子系统">
          <div class="label">实际利润率（均）</div>
          <div class="value ${avgProfit < MOCK_DATA.profitRedLine ? 'text-danger' : 'text-success'}">${avgProfit}<span class="unit">%</span></div>
          <div class="trend ${lowProfit || warnMaterials ? 'trend-down' : 'trend-up'}">目标利润率 ${MOCK_DATA.profitRedLine}%（固定）· 预警 ${lowProfit + warnMaterials}项</div>
          <div class="icon-bg">💰</div>
          <div class="dash-nav-hint">点击查看 →</div>
        </div>
      </div>`;
  }

  function renderPeriodSection() {
    const periods = [
      { key: 'daily', label: '日报' },
      { key: 'weekly', label: '周报' },
      { key: 'monthly', label: '月报' },
      { key: 'quarterly', label: '季报' },
      { key: 'yearly', label: '年报' }
    ];
    const depts = ['all', '商务部', '工程技术部', '外协部', '财务部'];
    return `
      <div class="card dash-period-card" style="margin-bottom:24px" id="dash-period-section">
        <div class="card-header">
          <div class="card-title">📅 周期数据变化</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <select id="dash-period-scope" class="select-dark select-compact">${depts.map((d) =>
              `<option value="${d}">${d === 'all' ? '整体导出' : d}</option>`).join('')}</select>
            <button type="button" class="btn btn-ghost btn-sm" id="dash-period-export" style="width:auto">导出当前报表</button>
          </div>
        </div>
        <div class="tabs dash-period-tabs" id="dash-period-tabs">
          ${periods.map((p, i) => `<button type="button" class="tab-btn ${i === 0 ? 'active' : ''}" data-period="${p.key}">${p.label}</button>`).join('')}
        </div>
        <div id="dash-period-body"></div>
      </div>`;
  }

  function renderPeriodBody(periodKey) {
    const pr = MOCK_DATA.periodReports[periodKey];
    if (!pr) return '';
    return `
      <p class="text-muted" style="font-size:13px;margin-bottom:12px">${pr.period} · ${pr.summary}</p>
      <div class="grid grid-3" style="margin-bottom:16px">
        ${pr.metrics.map((m) => `<div class="card metric-mini">
          <div class="m-label">${m.name}</div>
          <div class="m-value">${m.value}</div>
          <div class="m-delta ${String(m.delta).startsWith('+') || String(m.delta).startsWith('↑') ? 'text-success' : String(m.delta).startsWith('-') || String(m.delta).startsWith('↓') ? 'text-danger' : ''}">${m.delta}</div>
        </div>`).join('')}
      </div>
      <div class="table-wrap" style="margin-bottom:12px"><table class="cost-table readonly-table"><thead><tr>
        <th>部门/维度</th><th>本期变化明细</th></tr></thead><tbody>
        ${pr.byDept.map((d) => `<tr><td>${d.dept}</td><td>${d.detail}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function renderFocusSection(projects) {
    const alerts = generateFocusAlerts(projects);
    return `
      <div class="card dash-focus-card" style="margin-bottom:24px">
        <div class="card-header"><div class="card-title">🔔 近期重点关注（自动识别）</div></div>
        <div class="focus-list">
          ${alerts.map((a) => `<div class="focus-item level-${a.level} dash-clickable" data-dash-nav-view="${a.nav}">
            <div class="focus-title"><span class="alert-tag alert-${a.level === 'danger' ? 'danger' : a.level === 'warning' ? 'warning' : 'normal'}">${a.level === 'danger' ? '高' : a.level === 'warning' ? '中' : '提示'}</span> ${a.title}</div>
            <div class="focus-desc">${a.desc}</div>
          </div>`).join('')}
        </div>
      </div>`;
  }

  function bindPeriodTabs(onExport) {
    let currentPeriod = 'daily';
    const render = () => {
      const body = $('#dash-period-body');
      if (body) body.innerHTML = renderPeriodBody(currentPeriod);
    };
    render();
    $$('#dash-period-tabs .tab-btn').forEach((btn) => {
      btn.onclick = () => {
        currentPeriod = btn.dataset.period;
        $$('#dash-period-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        render();
      };
    });
    $('#dash-period-export')?.addEventListener('click', () => {
      const scope = $('#dash-period-scope')?.value || 'all';
      exportPeriodReport(currentPeriod, scope);
      onExport?.(currentPeriod, scope);
    });
  }

  function bindDashNavigation(navigateFn, roleHasView) {
    $$('[data-dash-nav]').forEach((el) => {
      el.onclick = () => {
        const key = el.dataset.dashNav;
        const cfg = STAT_NAV[key];
        if (!cfg) return;
        if (cfg.view === 'cost-system' && !roleHasView('cost-system')) {
          navigateFn('project', { projectId: 'xl_fj01', tab: 'cost' });
          return;
        }
        if (cfg.view === 'risk-system' && !roleHasView('risk-system')) {
          window.showToast?.('当前角色无风险管理权限，已跳转单项目风险页');
          navigateFn('project', { projectId: 'xl_fj01', tab: 'risk' });
          return;
        }
        if (cfg.view === 'progress-system' && !roleHasView('progress-system')) {
          navigateFn('project', { projectId: 'xl_fj01', tab: 'construction' });
          return;
        }
        const opts = cfg.view === 'project' ? { projectId: 'xl_fj01' } : {};
        if (cfg.progressTab) opts.progressTab = cfg.progressTab;
        navigateFn(cfg.view === 'project' ? 'project' : cfg.view, opts);
      };
    });
    $$('[data-dash-nav-view]').forEach((el) => {
      el.onclick = () => navigateFn(el.dataset.dashNavView, el.dataset.dashNavView === 'project' ? { projectId: 'xl_fj01' } : {});
    });
    $$('.dash-module-card[data-dash-goto]').forEach((el) => {
      el.onclick = () => {
        const view = el.dataset.dashGoto;
        if (view && roleHasView(view)) navigateFn(view);
        else if (view) window.showToast?.('当前角色无此模块权限');
      };
    });
  }

  function renderThreeValueChart(projects, chartInstances) {
    const ctx2 = document.getElementById('chart-three-value');
    if (!ctx2) return;
    chartInstances.push(new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: projects.map((p) => p.shortName),
        datasets: [
          { label: '招标控制价', data: projects.map((p) => p.cost.tenderPrice), backgroundColor: '#597ef7' },
          { label: '中标价', data: projects.map((p) => p.cost.bidPrice), backgroundColor: '#36cfc9' },
          { label: '目标成本', data: projects.map((p) => p.cost.targetCost), backgroundColor: '#ffc53d' },
          { label: '实际成本', data: projects.map((p) => p.cost.actualCost ?? +(p.cost.targetCost * 1.02).toFixed(2)), backgroundColor: '#ff7875' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8ba3c7' } } },
        scales: {
          y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } },
          x: { grid: { display: false }, ticks: { color: '#8ba3c7' } }
        }
      }
    }));
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  return {
    MODULES, isVisible, getVisibleModules, renderCustomizer, bindCustomizer,
    renderStatCards, renderPeriodSection, renderPeriodBody, renderFocusSection,
    bindPeriodTabs, bindDashNavigation, renderThreeValueChart,
    exportPeriodReport, generateFocusAlerts, avgActualProfitRate
  };
})();
