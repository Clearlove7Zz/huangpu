// 黄埔区城更数字沙盘平台 v2.5
(function () {
  let currentView = 'dashboard';
  let currentProjectId = 'xl_fj01';
  let currentProjectTab = 'license';
  let currentCostTab = 'audit';
  let chartInstances = [];
  let decisionFactors = DecisionEngine.defaultFactors();
  let decisionPresetId = 'baseline';
  let decisionProjectId = 'xl_fj01';
  let decisionSimType = 'overall';
  let aiStreamCancel = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const VIEW_TITLES = {
    dashboard: '多项目总览', project: '单项目详情', 'progress-system': '施工进度管控',
    'design-control': '设计管控', documents: '文档管理', 'work-mgmt': '工作管理',
    'cost-system': '成本测算子系统', material: '物资消耗管控',
    'supplier-system': '供应商库', coordination: '外协协调',
    cashflow: '动态现金流', 'risk-system': '风险管理系统', 'safety-log': '安全日志 AI巡检',
    'decision-system': '一体化决策推演',
    reports: '报表中心', sync: '数据同步日志'
  };

  function destroyCharts() {
    chartInstances.forEach((c) => c.destroy());
    chartInstances = [];
  }

  function showToast(msg) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
  window.showToast = showToast;

  function tagClass(status) {
    return { pilot: 'tag-pilot', normal: 'tag-normal', planning: 'tag-planning' }[status] || 'tag-normal';
  }

  function riskBadge(level) {
    return { red: 'badge-red', yellow: 'badge-yellow', blue: 'badge-blue' }[level] || '';
  }

  function riskLevelLabel(level) {
    return { red: '红色', yellow: '黄色', blue: '蓝色' }[level] || level;
  }

  function getDetail() {
    return MOCK_DATA.projectDetails[currentProjectId] || MOCK_DATA.projectDetails.xl_fj01;
  }

  function ec(v, w) { return CostUI.ec(v, w); }
  function ecWide(v) { return CostUI.ecWide(v); }
  function ro(v, opts) { return CostUI.ro(v, opts); }
  function tableLegend() { return CostUI.tableLegend(); }

  function milestoneStatusLabel(status) {
    return { done: '已完成', lag: '滞后', doing: '进行中', pending: '待开始' }[status] || status;
  }

  function milestoneStatusTag(status) {
    const tagClass = {
      done: 'tag tag-normal',
      lag: 'alert-tag alert-warning',
      doing: 'tag tag-pilot',
      pending: 'timeline-status-pending'
    }[status] || 'tag tag-pilot';
    return `<span class="${tagClass}">${milestoneStatusLabel(status)}</span>`;
  }

  function renderMilestoneTimeline(items) {
    if (!items?.length) return '<p class="text-muted" style="padding:16px">暂无里程碑数据</p>';
    return `<div class="timeline">${items.map((m) => `
      <div class="timeline-item">
        <div class="timeline-dot ${m.status}"></div>
        <div class="timeline-content">
          <div class="timeline-head">
            <h4>${m.name}</h4>
            ${milestoneStatusTag(m.status)}
          </div>
          <p class="timeline-meta">计划 <span>${m.plan || '—'}</span> · 实际 <span class="${m.status === 'lag' ? 'text-warning' : ''}">${m.actual || '—'}</span></p>
          ${m.reason ? `<p class="timeline-reason">${m.reason}</p>` : ''}
        </div>
      </div>`).join('')}</div>`;
  }

  function materialOverPct(m) {
    return ((m.consumed - m.budget) / m.budget * 100).toFixed(1);
  }

  function getRoleConfig() {
    return MOCK_DATA.roles[MOCK_DATA.currentUser.role];
  }

  function roleHasView(view) {
    return getRoleConfig()?.nav.includes(view);
  }

  function isSandboxOnlyRole() {
    return !roleHasView('cost-system') && !roleHasView('progress-system');
  }

  const PROJECT_TAB_DEFS = [
    { id: 'license', label: '证照办理计划与进度' },
    { id: 'construction', label: '施工计划与进度' },
    { id: 'image', label: '安全巡检与形象进度' },
    { id: 'risk', label: '风险管控' },
    { id: 'cashflow', label: '动态现金流' },
    { id: 'cost', label: '成本管控' },
    { id: 'events', label: '项目大事记' },
    { id: 'output', label: '产值与荣誉' }
  ];

  const PROJECT_TAB_HIDDEN = {
    '股份领导/指挥长': ['cost'],
    '指挥部-工程技术部': ['cost'],
    '指挥部-外协部': ['cost']
  };

  function getProjectTabs() {
    const hidden = PROJECT_TAB_HIDDEN[MOCK_DATA.currentUser.role] || [];
    return PROJECT_TAB_DEFS.filter((t) => !hidden.includes(t.id));
  }

  function renderQuickActions() {
    const nav = getRoleConfig()?.nav || [];
    const items = [
      `<button class="quick-btn" data-action="goto-project" data-id="xl_fj01">🏢 新联复建01详情</button>`
    ];
    items.push(`<button class="quick-btn" data-action="goto-view" data-view="decision-system">🧠 一体化决策推演</button>`);
    if (nav.includes('material')) items.push(`<button class="quick-btn" data-action="goto-view" data-view="material">📦 物资消耗预警</button>`);
    if (nav.includes('cost-system')) items.push(`<button class="quick-btn" data-action="goto-view" data-view="cost-system">💰 成本测算子系统</button>`);
    if (nav.includes('cashflow')) items.push(`<button class="quick-btn" data-action="goto-view" data-view="cashflow">💵 动态现金流</button>`);
    if (nav.includes('progress-system')) items.push(`<button class="quick-btn" data-action="goto-view" data-view="progress-system">📋 进度与产值管控</button>`);
    if (nav.includes('documents')) items.push(`<button class="quick-btn" data-action="goto-view" data-view="documents">📁 文档管理</button>`);
    if (nav.includes('work-mgmt')) items.push(`<button class="quick-btn" data-action="goto-view" data-view="work-mgmt">📝 工作管理</button>`);
    if (nav.includes('design-control')) items.push(`<button class="quick-btn" data-action="goto-view" data-view="design-control">📐 设计管控</button>`);
    if (nav.includes('risk-system')) items.push(`<button class="quick-btn" data-action="goto-view" data-view="risk-system">⚠️ 风险管理系统</button>`);
    if (nav.includes('safety-log')) items.push(`<button class="quick-btn" data-action="goto-view" data-view="safety-log">🦺 安全日志 AI巡检</button>`);
    items.push(`<button class="quick-btn" data-action="refresh">🔄 刷新数据</button>`);
    return items.join('');
  }

  function applyRoleNav(role) {
    const cfg = MOCK_DATA.roles[role];
    if (!cfg) return;
    $$('.nav-item').forEach((item) => {
      item.style.display = cfg.nav.includes(item.dataset.view) ? '' : 'none';
    });
    $$('.nav-group[data-nav-group]').forEach((el) => {
      const group = el.dataset.navGroup;
      if (!group) return;
      const showGroup = [...$$(`.nav-item[data-nav-group="${group}"]`)].some((item) => cfg.nav.includes(item.dataset.view));
      el.style.display = showGroup ? '' : 'none';
    });
  }

  function initSidebar() {
    const sidebar = $('#sidebar');
    const app = $('#app');
    const overlay = $('#sidebar-overlay');
    const toggleBtn = $('#sidebar-toggle');
    const mobileBtn = $('#mobile-nav-btn');
    const STORAGE_KEY = 'hp-sidebar-collapsed';
    const GROUP_KEY = 'hp-nav-groups';

    function setSidebarCollapsed(collapsed) {
      sidebar.classList.toggle('collapsed', collapsed);
      app.classList.toggle('sidebar-collapsed', collapsed);
      toggleBtn.title = collapsed ? '展开侧栏' : '收起侧栏';
      toggleBtn.setAttribute('aria-label', toggleBtn.title);
      try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch (_) {}
    }

    let collapsed = false;
    try { collapsed = localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) {}
    setSidebarCollapsed(collapsed);

    toggleBtn?.addEventListener('click', () => {
      setSidebarCollapsed(!sidebar.classList.contains('collapsed'));
    });

    function closeMobileSidebar() {
      sidebar.classList.remove('mobile-open');
      overlay?.classList.remove('visible');
    }

    mobileBtn?.addEventListener('click', () => {
      sidebar.classList.add('mobile-open');
      overlay?.classList.add('visible');
    });
    overlay?.addEventListener('click', closeMobileSidebar);

    $$('.nav-section-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (sidebar.classList.contains('collapsed') && window.innerWidth > 900) return;
        const group = btn.closest('.nav-group');
        const isCollapsed = group.classList.toggle('collapsed');
        btn.setAttribute('aria-expanded', String(!isCollapsed));
        saveGroupState();
      });
    });

    function saveGroupState() {
      const state = {};
      $$('.nav-group[data-group]').forEach((g) => {
        state[g.dataset.group] = g.classList.contains('collapsed');
      });
      try { localStorage.setItem(GROUP_KEY, JSON.stringify(state)); } catch (_) {}
    }

    function loadGroupState() {
      let state = {};
      try { state = JSON.parse(localStorage.getItem(GROUP_KEY) || '{}'); } catch (_) {}
      $$('.nav-group[data-group]').forEach((g) => {
        const collapsed = state[g.dataset.group];
        if (collapsed) {
          g.classList.add('collapsed');
          g.querySelector('.nav-section-toggle')?.setAttribute('aria-expanded', 'false');
        }
      });
      if (!Object.keys(state).length) {
        const business = $('.nav-group[data-group="business"]');
        if (business) {
          business.classList.add('collapsed');
          business.querySelector('.nav-section-toggle')?.setAttribute('aria-expanded', 'false');
        }
      }
    }
    loadGroupState();

    $$('.nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 900) closeMobileSidebar();
      });
    });
  }

  initSidebar();

  // ===== Login =====
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const role = $('#login-role').value;
    const cfg = MOCK_DATA.roles[role];
    MOCK_DATA.currentUser.role = role;
    MOCK_DATA.currentUser.name = cfg ? cfg.name : '用户';
    MOCK_DATA.currentUser.avatar = MOCK_DATA.currentUser.name[0];
    $('#login-page').classList.add('hidden');
    $('#app').classList.remove('hidden');
    applyRoleNav(role);
    updateUserInfo();
    navigate(cfg?.nav[0] || 'dashboard');
  });

  $('#logout-btn').addEventListener('click', () => {
    $('#app').classList.add('hidden');
    $('#login-page').classList.remove('hidden');
    destroyCharts();
  });

  function updateUserInfo() {
    const u = MOCK_DATA.currentUser;
    $('#user-name').textContent = u.name;
    $('#user-role').textContent = u.role;
    $('#user-avatar').textContent = u.avatar;
  }

  $$('.nav-item').forEach((item) => {
    item.addEventListener('click', () => navigate(item.dataset.view));
  });

  function navigate(view, opts = {}) {
    currentView = view;
    if (opts.projectId) currentProjectId = opts.projectId;
    if (opts.tab) currentProjectTab = opts.tab;
    if (opts.costTab) currentCostTab = opts.costTab;
    if (opts.progressTab) CostUI.setProgressTab(opts.progressTab);

    $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
    destroyCharts();
    $('#breadcrumb').innerHTML = `首页 / <strong>${VIEW_TITLES[view]}</strong>`;

    const renderers = {
      dashboard: renderDashboard, project: renderProjectDetail,
      'progress-system': () => CostUI.renderProgressWithJarvis(bindActions, destroyCharts, chartInstances),
      'design-control': () => BusinessModules.renderDesignControl(bindActions, chartInstances),
      documents: () => BusinessModules.renderDocumentManagement(bindActions),
      'work-mgmt': () => BusinessModules.renderWorkManagement(bindActions),
      'cost-system': () => CostUI.renderCostSystem(currentCostTab, bindActions, destroyCharts, chartInstances, (tab) => { currentCostTab = tab; }),
      material: renderMaterial,
      'supplier-system': () => CostUI.renderSupplierSystem(bindActions),
      coordination: renderCoordination,
      cashflow: () => CostUI.renderCashflowDetail(bindActions, destroyCharts, chartInstances),
      'risk-system': renderRiskSystem,
      'safety-log': () => SafetyAI.render(bindActions),
      'decision-system': renderDecisionSystem,
      reports: renderReports, sync: renderSyncLog
    };
    (renderers[view] || renderDashboard)();
  }

  // ===== Dashboard =====
  function renderDashboard() {
    const projects = MOCK_DATA.projects;
    const warnMaterials = getDetail().materials.filter((m) => m.warn).length;
    const vis = (id) => DashboardUI.isVisible(id);
    const parts = [];

    parts.push(`
      <h1 class="page-title">多项目总览看板</h1>
      <p class="page-desc">黄埔区4个城更地块 · 数据自动同步 · 最后更新 2026-05-27 09:05 · <span class="readonly-badge inline-badge">只读看板 · 禁止编辑</span></p>
      <div class="quick-actions">${renderQuickActions()}</div>
      <div style="margin-bottom:16px">
        <button type="button" class="btn btn-ghost btn-sm" id="dash-toggle-customizer" style="width:auto">⚙️ 自定义看板模块</button>
      </div>
      <div id="dash-customizer-slot"></div>`);

    if (vis('stats')) parts.push(DashboardUI.renderStatCards(projects, { warnMaterials }));
    if (vis('focus')) parts.push(DashboardUI.renderFocusSection(projects));
    if (vis('period')) parts.push(DashboardUI.renderPeriodSection());

    if (vis('outputValue')) parts.push(BusinessModules.renderDashboardOutputModule());

    if (vis('ranking')) {
      parts.push(`
      <div class="card dash-module-card" style="margin-bottom:24px" data-dash-goto="project">
        <div class="card-header"><div class="card-title">🏆 四地块每周排名 · ${MOCK_DATA.weeklyRanking.week}（${MOCK_DATA.weeklyRanking.period}）</div>
          <button class="btn btn-ghost btn-sm" data-action="export-period" data-period="weekly">导出周报</button></div>
        <div class="table-wrap"><table class="cost-table readonly-table"><thead><tr><th>排名</th><th>地块</th><th>综合</th><th>进度</th><th>安全</th><th>成本</th><th>出图</th><th>趋势</th></tr></thead>
        <tbody>${MOCK_DATA.weeklyRanking.rankings.map((r) => `<tr>
          <td><span class="rank-badge rank-${r.rank}">${r.rank}</span></td>
          <td><strong>${r.name}</strong></td>
          <td class="text-center">${r.scores.overall}</td>
          <td class="text-center">${r.scores.progress}</td>
          <td class="text-center">${r.scores.safety}</td>
          <td class="text-center ${r.scores.cost < 80 ? 'text-warning' : ''}">${r.scores.cost}</td>
          <td class="text-center">${r.scores.design}</td>
          <td>${r.trend === 'up' ? '<span class="text-success">↑</span>' : r.trend === 'down' ? '<span class="text-danger">↓</span>' : '—'}</td>
        </tr>`).join('')}</tbody></table></div>
      </div>`);
    }

    if (vis('charts')) {
      parts.push(`
      <div class="grid grid-2 dash-module-card" style="margin-bottom:24px" data-dash-goto="progress-system">
        <div class="card dash-clickable" data-dash-nav="output"><div class="card-header"><div class="card-title">各项目进度对比</div><span class="dash-nav-hint">点击下钻 →</span></div>
          <div class="chart-container"><canvas id="chart-progress"></canvas></div></div>
        <div class="card dash-clickable" data-dash-nav="profit"><div class="card-header"><div class="card-title">三值对比汇总（亿元）</div><span class="dash-nav-hint">含实际成本 →</span></div>
          <div class="chart-container"><canvas id="chart-three-value"></canvas></div></div>
      </div>`);
    }

    if (vis('progress')) {
      parts.push(`
      <div class="card dash-module-card" style="margin-bottom:24px" data-dash-goto="progress-system">
        <div class="card-header"><div class="card-title">四项目进度管控概览</div>
          <button class="btn btn-ghost btn-sm" data-action="goto-view" data-view="progress-system">进入施工进度管控 →</button></div>
        <div class="readonly-badge" style="margin-bottom:12px">只读看板 · 数据自动同步</div>
        <div class="tabs" id="dash-progress-tabs">
          <button class="tab-btn active" data-dptab="license">证照办理计划与进度</button>
          <button class="tab-btn" data-dptab="construction">施工计划与进度</button>
          <button class="tab-btn" data-dptab="output">产值计划与进度</button>
          <button class="tab-btn" data-dptab="image">安全巡检与形象进度</button>
        </div>
        <div id="dash-progress-content"></div>
      </div>`);
    }

    if (vis('cashflow')) {
      parts.push(`
      <div class="card dash-module-card" style="margin-bottom:24px" data-dash-goto="cashflow">
        <div class="card-header"><div class="card-title">💵 动态现金流概览</div>
          ${roleHasView('cashflow') ? '<button class="btn btn-ghost btn-sm" data-action="goto-view" data-view="cashflow">进入现金流子系统 →</button>' : ''}</div>
        ${CostUI.renderCashflowReadonlyPanel('dash-cf')}
      </div>`);
    }

    if (vis('projects')) {
      parts.push(`
      <div class="card-header" style="margin-bottom:12px"><div class="card-title">项目列表</div></div>
      <div class="grid grid-2">${projects.map((p) => `
        <div class="card project-card dash-clickable" data-action="goto-project" data-id="${p.id}">
          <div class="project-card-header"><h3>${p.name}</h3><span class="tag ${tagClass(p.status)}">${p.statusLabel}</span></div>
          <div class="project-metrics">
            <div class="metric-item"><div class="m-label">EPC标的</div><div class="m-value">${p.totalCost}亿</div></div>
            <div class="metric-item"><div class="m-label">累计产值</div><div class="m-value">${p.outputTotal}亿</div></div>
            <div class="metric-item"><div class="m-label">实际利润率</div>
              <div class="m-value ${p.profitRate < MOCK_DATA.profitRedLine ? 'text-danger' : 'text-success'}">${p.profitRate}%</div></div>
          </div>
          <div class="m-label">整体进度 ${p.progress}% · 目标利润率 ${MOCK_DATA.profitRedLine}%</div>
          <div class="progress-bar-wrap"><div class="progress-bar ${p.lagNodes > 0 ? 'warn' : ''}" style="width:${p.progress}%"></div></div>
          <div style="margin-top:12px;font-size:12px;color:var(--text-muted)">${p.builder} · 风险${p.risks.total}项 · 滞后${p.lagNodes}节点</div>
        </div>`).join('')}
      </div>`);
    }

    $('#main-content').innerHTML = parts.join('');

    $('#dash-toggle-customizer')?.addEventListener('click', () => {
      const slot = $('#dash-customizer-slot');
      if ($('#dash-customizer')) { $('#dash-customizer')?.remove(); return; }
      slot.innerHTML = DashboardUI.renderCustomizer();
      DashboardUI.bindCustomizer(() => renderDashboard());
    });

    bindActions();
    DashboardUI.bindDashNavigation(navigate, roleHasView);
    if (vis('period')) DashboardUI.bindPeriodTabs();

    if (vis('charts')) {
      const ctx1 = $('#chart-progress');
      if (ctx1) chartInstances.push(new Chart(ctx1, {
        type: 'bar',
        data: { labels: projects.map((p) => p.shortName), datasets: [{ label: '进度%', data: projects.map((p) => p.progress),
          backgroundColor: projects.map((p) => p.lagNodes > 0 ? '#faad14' : '#1890ff'), borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { y: { max: 100, grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } },
            x: { grid: { display: false }, ticks: { color: '#8ba3c7' } } } }
      }));
      DashboardUI.renderThreeValueChart(projects, chartInstances);
    }
    if (vis('cashflow')) CostUI.initCashflowReadonlyCharts('dash-cf', chartInstances);
    if (vis('outputValue')) BusinessModules.initDashboardOutputCharts(chartInstances);
    if (vis('progress')) {
      renderDashProgressTab('license');
      $$('#dash-progress-tabs .tab-btn').forEach((btn) => {
        btn.onclick = () => {
          $$('#dash-progress-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
          renderDashProgressTab(btn.dataset.dptab);
          bindActions();
        };
      });
    }
  }

  function renderDashProgressTab(tab) {
    const box = $('#dash-progress-content');
    if (!box) return;
    const ps = MOCK_DATA.progressSystem;
    if (tab === 'license') {
      box.innerHTML = CostUI.renderProgressLicenseTable({ readonly: true });
    } else if (tab === 'construction') {
      box.innerHTML = `
        <div class="table-wrap"><table class="cost-table readonly-table"><thead><tr>
        <th>项目</th><th>节点/专业</th><th>计划</th><th>实际</th><th>完成率</th><th>状态</th></tr></thead><tbody>
        ${ps.constructionNodes.slice(0, 6).map((n) => `<tr><td>${n.project}</td><td>${n.node}</td><td>${n.plan}</td><td>${n.actual}</td><td>${n.rate}%</td>
          <td>${n.status === 'lag' ? '<span class="alert-tag alert-warning">滞后</span>' : n.status === 'done' ? '<span class="tag tag-normal">完成</span>' : '进行中'}</td></tr>`).join('')}
        </tbody></table></div>`;
    } else if (tab === 'output') {
      const ov = MOCK_DATA.outputValue;
      box.innerHTML = `<div class="readonly-badge" style="margin-bottom:12px">产值计划与进度 · 只读摘要</div>
        ${BusinessModules.renderOutputSummaryCards(ov, true)}
        <p class="text-muted" style="font-size:13px;margin:12px 0">计量产值累计 ${ov.cumMeasured.toLocaleString()} 万 · 完成率 ${ov.measuredRate}%</p>
        <button class="btn btn-ghost btn-sm" data-action="goto-view" data-view="progress-system" data-progress-tab="output">进入产值计划与进度 →</button>`;
    } else {
      const imageBlocks = `
        <div class="card"><div class="card-title" style="margin-bottom:8px">内部形象进度</div>${CostUI.renderJarvisEmbed()}</div>
        <div class="card" style="margin-top:16px"><div class="card-title" style="margin-bottom:8px">外部形象进度</div>
          <p class="text-muted" style="font-size:13px;margin-bottom:8px">航拍 AI 对比 · 5月已更新3张</p>
          <button class="btn btn-ghost btn-sm" data-action="goto-project" data-id="xl_fj01" data-tab="image">查看新联01 →</button></div>`;
      box.innerHTML = BusinessModules.renderSafetyImageSection(`<div class="dash-image-progress-stack">${imageBlocks}</div>`, MOCK_DATA.projectDetails.xl_fj01.inspections, { editable: false });
    }
  }

  function renderDashboardCharts(projects) {
    DashboardUI.renderThreeValueChart(projects, chartInstances);
  }

  // ===== Project Detail =====
  function renderProjectDetail() {
    const project = MOCK_DATA.projects.find((p) => p.id === currentProjectId) || MOCK_DATA.projects[0];
    const detail = getDetail();
    const tabs = getProjectTabs();
    if (!tabs.some((t) => t.id === currentProjectTab)) currentProjectTab = tabs[0]?.id || 'license';

    $('#main-content').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div><h1 class="page-title">${project.name}</h1>
          <p class="page-desc">${project.builder} · ${project.contractMode} · 建面${(project.area/10000).toFixed(1)}万㎡ · EPC标的${project.totalCost}亿元</p></div>
        <select id="project-selector" class="select-dark">${MOCK_DATA.projects.map((p) =>
          `<option value="${p.id}" ${p.id===currentProjectId?'selected':''}>${p.name}</option>`).join('')}</select>
      </div>
      <div class="grid grid-4" style="margin-bottom:24px">
        <div class="card stat-card"><div class="label">整体进度</div><div class="value">${project.progress}%</div>
          <div class="trend ${project.lagNodes>0?'trend-warn':'trend-up'}">滞后节点 ${project.lagNodes}个</div></div>
        <div class="card stat-card"><div class="label">累计产值</div><div class="value">${project.outputTotal} <span class="unit">亿</span></div>
          <div class="trend">本月 ${project.outputMonth} 亿</div></div>
        <div class="card stat-card"><div class="label">实际利润率</div>
          <div class="value ${project.profitRate<MOCK_DATA.profitRedLine?'text-danger':'text-success'}">${project.profitRate}%</div>
          <div class="trend ${project.profitRate<MOCK_DATA.profitRedLine?'trend-down':'trend-up'}">目标利润率 ${MOCK_DATA.profitRedLine}%（固定）· 业主利润 ${MOCK_DATA.ownerProfitRate}%</div></div>
        <div class="card stat-card"><div class="label">回款率</div><div class="value">${project.paymentRate}%</div>
          <div class="trend">成本完成 ${project.costCompletion}%</div></div>
      </div>
      <div class="tabs" id="project-tabs">
        ${tabs.map((t) => `<button class="tab-btn ${currentProjectTab===t.id?'active':''}" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      <div id="project-tab-content"></div>`;

    $('#project-selector').onchange = (e) => { currentProjectId = e.target.value; renderProjectDetail(); };
    $$('#project-tabs .tab-btn').forEach((btn) => {
      btn.onclick = () => {
        currentProjectTab = btn.dataset.tab;
        $$('#project-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderProjectTab(project, detail);
      };
    });
    renderProjectTab(project, detail);
  }

  function renderAerialGallery() {
    return CostUI.renderAerialGallery();
  }

  function renderRiskContent(project, detail) {
    return `
      <div class="grid grid-4" style="margin-bottom:24px">
        <div class="card stat-card"><div class="label">风险总数</div><div class="value">${project.risks.total}</div></div>
        <div class="card stat-card"><div class="label">红色</div><div class="value text-danger">${project.risks.red}</div></div>
        <div class="card stat-card"><div class="label">待处理</div><div class="value text-warning">${project.risks.pending}</div></div>
        <div class="card stat-card"><div class="label">超阈值</div><div class="value">${project.risks.overThreshold}</div></div>
      </div>
      <div class="risk-grid">${['engineering','economic','design'].map((dim,i)=>{
        const labels=['工程风险','经济风险','设计风险'];
        const items = detail?.risks?.[dim] || [];
        return `<div class="card risk-dimension"><h4>${labels[i]}</h4>
          ${items.length ? items.map((r)=>`<div class="risk-item level-${r.level}"><div class="desc">${r.desc}</div>
            <div class="meta"><span class="tag ${riskBadge(r.level)}">${riskLevelLabel(r.level)}</span>
            <span>${r.owner}</span><span>${r.status}</span><span>${r.deadline}</span></div></div>`).join('')
            : `<p class="text-muted" style="font-size:13px;padding:8px 0">暂无明细 · 请进入单项目详情维护</p>`}
        </div>`;}).join('')}</div>`;
  }

  function renderProjectTab(project, detail) {
    const content = $('#project-tab-content');
    destroyCharts();

    if (currentProjectTab === 'license') {
      content.innerHTML = `
        <div class="card"><div class="card-header"><div class="card-title">证照办理计划与进度</div>
          <div class="card-subtitle">蓝色输入框可编辑 · 灰色为系统字段</div></div>
          ${tableLegend()}
          <div class="table-wrap"><table class="cost-table mixed-table"><thead><tr>
            <th class="col-editable">证照</th><th class="col-editable">状态</th><th class="col-editable">完成时间</th><th class="col-editable">时限</th><th class="col-editable">备注</th>
          </tr></thead>
            <tbody>${detail.licenses.map((l)=>`<tr class="${l.warn?'row-warn':''}"><td>${ecWide(l.name)}</td>
              <td>${ec(l.status==='done'?'已完成':'办理中', '80px')}</td>
              <td>${ec(l.date, '100px')}</td><td class="${l.warn?'text-warning':''}">${ec(l.deadline, '100px')}</td>
              <td>${ecWide(l.remark||'')}</td></tr>`).join('')}</tbody></table></div></div>`;
    } else if (currentProjectTab === 'construction') {
      content.innerHTML = `
        <div class="section-block">
          <h3 class="section-heading">设计进度</h3>
          <div class="card">${tableLegend()}<div class="table-wrap"><table class="cost-table mixed-table"><thead><tr>
            <th class="col-editable">专业</th><th class="col-editable">计划</th><th class="col-editable">实际</th><th class="col-calc">完成率(%)</th>
          </tr></thead>
            <tbody>${detail.designProgress.map((d)=>`<tr><td>${ecWide(d.major)}</td><td>${ec(d.plan, '100px')}</td>
              <td class="${d.lag?'text-warning':''}">${ec(d.actual, '100px')}</td><td>${ro(d.rate)}</td></tr>`).join('')}</tbody></table></div></div>
        </div>
        <div class="section-block">
          <h3 class="section-heading">施工里程碑</h3>
          <div class="card timeline-card">${renderMilestoneTimeline(detail.milestones)}</div>
        </div>`;
    } else if (currentProjectTab === 'image') {
      content.innerHTML = CostUI.renderProgressImageSection();
    } else if (currentProjectTab === 'events') {
      const events = detail.majorEvents || MOCK_DATA.majorEvents.filter((e) => e.project.includes(project.shortName) || e.project.includes(project.name.replace('复建','').replace('地块','')));
      content.innerHTML = `
        <div class="card"><div class="card-header"><div class="card-title">项目大事记</div>
          <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="项目大事记汇总" data-format="Excel">导出</button></div>
          ${events.length ? events.map((e) => `
            <div class="event-item event-with-image">
              ${e.image ? `<div class="event-thumb"><img src="${e.image}" alt="${e.title}" loading="lazy"></div>` : ''}
              <div class="event-body">
                <div class="event-date">${e.date}</div>
                <div class="event-title">${e.title} <span class="tag tag-pilot">${e.type}</span></div>
                <div class="event-desc">${e.desc}</div>
              </div>
            </div>`).join('') : MOCK_DATA.majorEvents.map((e) => `
            <div class="event-item event-with-image">
              ${e.image ? `<div class="event-thumb"><img src="${e.image}" alt="${e.title}" loading="lazy"></div>` : ''}
              <div class="event-body">
                <div class="event-date">${e.date}</div>
                <div class="event-title">${e.title} <span class="tag tag-pilot">${e.type}</span> <span class="text-muted">${e.project}</span></div>
                <div class="event-desc">${e.desc}</div>
              </div>
            </div>`).join('')}
        </div>`;
    } else if (currentProjectTab === 'risk') {
      content.innerHTML = renderRiskContent(project, detail);
    } else if (currentProjectTab === 'cashflow') {
      content.innerHTML = CostUI.renderCashflowReadonlyPanel('proj-cf', { projectName: project.name, title: project.shortName });
      CostUI.initCashflowReadonlyCharts('proj-cf', chartInstances);
    } else if (currentProjectTab === 'cost') {
      content.innerHTML = `
        <div class="grid grid-2" style="margin-bottom:16px">
          <div class="card">
            <div class="card-header">
              <div class="card-title">三值对比（亿元）</div>
              <button class="btn-link" data-action="goto-view" data-view="cost-system">下钻 →</button>
            </div>
            <div class="three-value-legend">
              <span class="legend-item legend-tender">招标控制价</span>
              <span class="legend-item legend-bid">中标合同价</span>
              <span class="legend-item legend-target">目标成本</span>
              <span class="legend-item legend-actual">实际成本</span>
            </div>
            <div class="table-wrap"><table class="cost-table readonly-table three-value-table">
              <thead><tr>
                <th>分部工程</th><th class="text-right">招标控制价</th><th class="text-right">中标合同价</th>
                <th class="text-right">目标成本</th><th class="text-right">实际成本</th><th class="text-right">较目标成本节约率</th>
              </tr></thead>
              <tbody>${detail.threeValueCompare.map((t) => {
                const save = t.target ? ((t.target - (t.actual ?? t.target)) / t.target * 100).toFixed(1) : '0';
                return `<tr>
                  <td>${t.major}</td>
                  <td class="text-right">${t.tender}</td>
                  <td class="text-right">${t.bid}</td>
                  <td class="text-right">${t.target}</td>
                  <td class="text-right">${t.actual ?? '—'}</td>
                  <td class="text-right ${parseFloat(save) >= 0 ? 'text-success' : 'text-danger'}">${save}%</td>
                </tr>`;
              }).join('')}
              </tbody>
            </table></div>
          </div>
          <div class="card"><div class="card-header"><div class="card-title">造价占比</div></div>
            <div class="chart-container"><canvas id="chart-cost-section"></canvas></div></div>
        </div>
        <div class="card" style="margin-bottom:16px"><div class="card-header"><div class="card-title">物资消耗预警</div>
          <button class="btn-link" data-action="goto-view" data-view="material">查看详情 →</button></div>
          <div class="table-wrap">${tableLegend()}<table class="cost-table mixed-table"><thead><tr>
            <th class="col-editable">材料</th><th class="col-editable">预算</th><th class="col-editable">采购</th><th class="col-editable">消耗</th><th class="col-calc">偏差</th><th>状态</th></tr></thead>
          <tbody>${detail.materials.map((m)=>`<tr><td>${ecWide(m.name)}</td><td>${ec(m.budget, '72px')}</td><td>${ec(m.purchased, '72px')}</td>
            <td class="${m.warn?'text-danger':''}">${ec(m.consumed, '72px')}</td>
            <td class="${m.warn?'text-danger':''}">${ro(materialOverPct(m) + '%')}</td>
            <td>${m.warn?'<span class="alert-tag alert-danger">超量预警</span>':ro('正常')}</td></tr>`).join('')}
          </tbody></table></div></div>
        <div class="grid grid-2">
          <div class="card"><div class="card-header"><div class="card-title">超支Top项</div></div>
            <div class="table-wrap"><table class="cost-table editable-table"><thead><tr><th>分项</th><th>差异率</th><th>金额(万)</th></tr></thead>
            <tbody>${detail.benchmarkTop.map((b)=>`<tr><td>${ecWide(b.item)}</td><td class="text-danger">${ec('+'+b.diff, '56px')}%</td><td>${ec(b.amount, '72px')}</td></tr>`).join('')}</tbody></table></div></div>
          <div class="card"><div class="card-header"><div class="card-title">专业分包</div></div>
            <div class="table-wrap"><table class="cost-table editable-table"><thead><tr><th>单位</th><th>合同(万)</th><th>已付(万)</th><th>状态</th></tr></thead>
            <tbody>${detail.subcontracts.map((s)=>`<tr><td>${ecWide(s.company)}</td><td>${ec(s.contract, '72px')}</td><td>${ec(s.paid, '72px')}</td>
              <td>${s.overpay?'<span class="text-danger">超付</span>':'正常'}</td></tr>`).join('')}</tbody></table></div></div>
        </div>`;
      const ctx = $('#chart-cost-section');
      if (ctx) chartInstances.push(new Chart(ctx, {
        type: 'doughnut',
        data: { labels: detail.costSections.map((s)=>s.name), datasets: [{ data: detail.costSections.map((s)=>s.pct),
          backgroundColor: ['#1890ff','#36cfc9','#597ef7','#ffc53d','#ff7875','#52c41a','#9254de'] }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { color: '#8ba3c7', font: { size: 11 } } } } }
      }));
    } else if (currentProjectTab === 'output') {
      content.innerHTML = `
        <div class="grid grid-2">
          <div class="card"><div class="card-header"><div class="card-title">产值按专业</div></div>
            <div class="chart-container"><canvas id="chart-output"></canvas></div></div>
          <div class="card"><div class="card-header"><div class="card-title">创奖评优</div>
            <div class="card-subtitle">二星智慧工地 · 绿色施工 · 五羊杯</div></div>
            ${detail.honors.map((h)=>`<div style="padding:12px 0;border-bottom:1px solid var(--border)">
              <div style="font-weight:600">${h.name}</div>
              <div style="font-size:12px;color:var(--text-muted)">${h.date} · ${h.status}</div></div>`).join('')}
          </div>
        </div>`;
      const ctx = $('#chart-output');
      if (ctx) chartInstances.push(new Chart(ctx, {
        type: 'pie',
        data: { labels: detail.outputByMajor.map((o)=>o.major), datasets: [{ data: detail.outputByMajor.map((o)=>o.value),
          backgroundColor: ['#1890ff','#36cfc9','#ffc53d','#52c41a'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8ba3c7' } } } }
      }));
    }
    bindActions();
  }

  // ===== Decision System =====
  function parseScenarioText(text) {
    const factors = DecisionEngine.defaultFactors();
    const t = text.toLowerCase();
    const num = (re) => { const m = text.match(re); return m ? parseFloat(m[1]) : null; };
    const steel = num(/钢筋.*?([+-]?\d+\.?\d*)\s*%/);
    if (steel != null) factors.steelPrice = Math.max(-10, Math.min(15, steel));
    const delay = num(/延误.*?(\d+)\s*天/) || num(/延期.*?(\d+)\s*天/);
    if (delay != null) factors.progressDelay = Math.min(90, delay);
    const sub = num(/分包.*?([+-]?\d+)\s*万/) || num(/变更.*?(\d+)\s*万/);
    if (sub != null) factors.subcontractDelta = sub;
    const pay = num(/回款.*?延迟.*?(\d+)\s*天/) || num(/回款.*?(\d+)\s*天/);
    if (pay != null) factors.paymentDelay = Math.min(60, pay);
    const conc = num(/混凝土.*?([+-]?\d+\.?\d*)\s*%/);
    if (conc != null) factors.concreteQty = conc;
    const qual = num(/质量.*?(\d+)\s*万/) || num(/整改.*?(\d+)\s*万/);
    if (qual != null) factors.qualityInvest = qual;
    if (/复合|多种|同时/.test(text) && steel == null && delay == null) {
      Object.assign(factors, DecisionEngine.PRESETS.find((p) => p.id === 'combo_risk').values);
    }
    return factors;
  }

  function normalizeDecisionSimType() {
    if (!DecisionEngine.SIM_TYPES.some((t) => t.id === decisionSimType)) decisionSimType = 'overall';
  }

  function toggleDecisionAiZone() {
    const zone = $('#dec-ai-zone');
    if (zone) zone.classList.toggle('hidden', !DecisionEngine.showsAiPanel(decisionSimType));
  }

  function updateDecisionUI() {
    normalizeDecisionSimType();
    const project = MOCK_DATA.projects.find((p) => p.id === decisionProjectId) || MOCK_DATA.projects[0];
    const result = DecisionEngine.simulate(project, decisionFactors);
    const dimResult = DecisionEngine.simulateDimension(decisionSimType, project, decisionFactors);
    const s = result.simulated;

    const profitEl = $('#dec-profit-rate');
    if (profitEl) {
      profitEl.textContent = s.profitRate;
      profitEl.className = `value ${result.belowRedLine ? 'text-danger' : 'text-success'}`;
    }
    const profitDelta = $('#dec-profit-delta');
    if (profitDelta) profitDelta.textContent = `${result.deltas.profitRate >= 0 ? '+' : ''}${result.deltas.profitRate} pct`;

    const methodBox = $('#dec-methodology');
    if (methodBox) methodBox.innerHTML = DecisionEngine.renderMethodologyPanel(decisionSimType);

    const statusBlock = DecisionEngine.renderCurrentStatus(project, decisionSimType);
    const statusBox = $('#dec-current-status');
    if (statusBox) statusBox.innerHTML = statusBlock.metricsHtml;
    const suggestBox = $('#dec-suggestions');
    if (suggestBox) {
      suggestBox.innerHTML = statusBlock.sugHtml
        ? `<div class="status-suggest-title">建议措施</div>${statusBlock.sugHtml}`
        : '';
    }

    const metricsBox = $('#dec-dim-metrics');
    if (metricsBox) metricsBox.innerHTML = DecisionEngine.renderDimensionMetrics(dimResult.dimension.metrics);

    const formulaBox = $('#dec-formulas');
    if (formulaBox) formulaBox.innerHTML = DecisionEngine.renderFormulas(decisionSimType);

    toggleDecisionAiZone();

    const alertBox = $('#dec-alerts');
    if (alertBox) {
      const alerts = [];
      if (result.belowRedLine) alerts.push('<span class="alert-tag alert-danger">利润率低于红线 ' + MOCK_DATA.profitRedLine + '%</span>');
      if (result.criticalCashflow) alerts.push('<span class="alert-tag alert-danger">现金流低于临界值 ' + (MOCK_DATA.cashflowDetail?.criticalBalance || 200) + ' 万</span>');
      if (s.endDateShift > 0) alerts.push('<span class="alert-tag alert-warning">竣工预计推迟 ' + s.endDateShift + ' 天</span>');
      if (!alerts.length) alerts.push('<span class="alert-tag alert-normal">指标在可控范围内</span>');
      alertBox.innerHTML = alerts.join(' ');
    }

    destroyCharts();
    DecisionViz.update(decisionSimType, project, decisionFactors, chartInstances);
    DecisionEngine.initDimensionBarChart('dec-dim-chart', dimResult.dimension, chartInstances);
    if (decisionSimType === 'overall') {
      DecisionEngine.initRadarChart('dec-radar', result, chartInstances);
      DecisionEngine.initBubbleChart('dec-bubble', decisionFactors, project, chartInstances);
    }
    return { result, dimResult, project };
  }

  function runAiAnalysis(payload) {
    if (!DecisionEngine.showsAiPanel(decisionSimType)) return;
    const project = MOCK_DATA.projects.find((p) => p.id === decisionProjectId) || MOCK_DATA.projects[0];
    const dimResult = payload?.dimResult || DecisionEngine.simulateDimension(decisionSimType, project, decisionFactors);
    const aiBox = $('#dec-ai-output');
    const btn = $('#dec-ai-parse-btn');
    if (!aiBox) return;
    if (aiStreamCancel) aiStreamCancel();
    aiBox.innerHTML = '<div class="ai-thinking"><span class="ai-pulse"></span> AI 正在解析情景并生成研判...</div>';
    if (btn) { btn.disabled = true; btn.textContent = '分析中...'; }
    const text = DecisionEngine.buildAiPromptForType(dimResult, project, decisionSimType);
    setTimeout(() => {
      aiBox.textContent = '';
      aiStreamCancel = DecisionEngine.streamText(aiBox, text, () => {
        if (btn) { btn.disabled = false; btn.textContent = '✨ 解析情景并生成研判'; }
      });
    }, 800);
  }

  function bindDecisionEvents() {
    const projectSel = $('#dec-project');
    if (projectSel) {
      projectSel.onchange = (e) => {
        decisionProjectId = e.target.value;
        updateDecisionUI();
      };
    }

    $$('.dec-sim-tab').forEach((tab) => {
      tab.onclick = () => {
        decisionSimType = tab.dataset.simType;
        $$('.dec-sim-tab').forEach((t) => t.classList.toggle('active', t === tab));
        const radarCard = $('#dec-radar-card');
        const bubbleCard = $('#dec-bubble-card');
        if (radarCard) radarCard.classList.toggle('hidden', decisionSimType !== 'overall');
        if (bubbleCard) bubbleCard.classList.toggle('hidden', decisionSimType !== 'overall');
        updateDecisionUI();
      };
    });

    $$('.factor-slider').forEach((slider) => {
      slider.oninput = (e) => {
        const id = e.target.dataset.factor;
        const v = parseFloat(e.target.value);
        decisionFactors[id] = v;
        const f = DecisionEngine.FACTORS.find((x) => x.id === id);
        const el = $(`#fv-${id}`);
        if (el && f) {
          const prefix = v > 0 && f.unit !== '天' && f.unit !== '万' ? '+' : '';
          el.innerHTML = `${prefix}${v}<span class="unit">${f.unit}</span>`;
        }
        decisionPresetId = 'custom';
        $$('.preset-chip').forEach((c) => c.classList.remove('active'));
        updateDecisionUI();
      };
    });

    $$('.preset-chip').forEach((chip) => {
      chip.onclick = (e) => {
        if (e.target.closest('[data-edit-preset]')) return;
        const preset = DecisionEngine.PRESETS.find((p) => p.id === chip.dataset.preset);
        if (!preset) return;
        decisionPresetId = preset.id;
        decisionFactors = { ...DecisionEngine.defaultFactors(), ...preset.values };
        $$('.preset-chip').forEach((c) => c.classList.toggle('active', c === chip));
        renderDecisionSystem(false);
        updateDecisionUI();
      };
      chip.addEventListener('dblclick', (e) => {
        e.preventDefault();
        DecisionEngine.editPresetLabel(chip.dataset.preset);
        renderDecisionSystem(false);
        bindDecisionEvents();
      });
    });

    $$('[data-edit-preset]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        DecisionEngine.editPresetLabel(btn.dataset.editPreset);
        renderDecisionSystem(false);
        bindDecisionEvents();
      };
    });

    $$('[data-edit-factor]').forEach((btn) => {
      btn.onclick = () => {
        DecisionEngine.editFactorMeta(btn.dataset.editFactor);
        renderDecisionSystem(false);
        updateDecisionUI();
        bindDecisionEvents();
      };
    });

    $$('[data-edit-factor-label]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.editFactorLabel;
        DecisionEngine.editFactorMeta(id);
        renderDecisionSystem(false);
        bindDecisionEvents();
      };
    });

    const parseBtn = $('#dec-ai-parse-btn');
    const nlInput = $('#dec-nl-input');
    if (parseBtn && nlInput) {
      parseBtn.onclick = () => {
        const text = nlInput.value.trim();
        if (!text) { showToast('请输入情景描述'); return; }
        setTimeout(() => {
          decisionFactors = parseScenarioText(text);
          decisionPresetId = 'custom';
          renderDecisionSystem(false);
          const payload = updateDecisionUI();
          runAiAnalysis(payload);
          showToast('情景已解析，研判报告已生成');
        }, 600);
      };
    }

    const resetBtn = $('#dec-reset-btn');
    if (resetBtn) {
      resetBtn.onclick = () => {
        decisionFactors = DecisionEngine.defaultFactors();
        decisionPresetId = 'baseline';
        if (nlInput) nlInput.value = '';
        const aiBox = $('#dec-ai-output');
        if (aiBox) aiBox.innerHTML = '';
        renderDecisionSystem(false);
        updateDecisionUI();
      };
    }
  }

  function renderDecisionSystem(runAi = true) {
    normalizeDecisionSimType();
    const project = MOCK_DATA.projects.find((p) => p.id === decisionProjectId) || MOCK_DATA.projects[0];
    const result = DecisionEngine.simulate(project, decisionFactors);
    const simTabs = DecisionEngine.SIM_TYPES.map((t) =>
      `<button type="button" class="tab-btn dec-sim-tab ${decisionSimType === t.id ? 'active' : ''}" data-sim-type="${t.id}">${t.icon} ${t.label}</button>`
    ).join('');
    const showAi = DecisionEngine.showsAiPanel(decisionSimType);

    $('#main-content').innerHTML = `
      <h1 class="page-title">一体化决策推演</h1>
      <p class="page-desc">整体 / 进度 / 成本三类推演 · 挣值指标 · 关键路径 · 目标利润率红线 ${MOCK_DATA.profitRedLine}%</p>
      <div class="info-banner dec-method-banner">
        <strong>推演说明：</strong><span id="dec-methodology"></span>
      </div>
      <div class="card dec-context-card" style="margin-bottom:16px;padding:16px 20px">
        <div class="dec-context-project">
          <label class="dec-proj-label">推演项目</label>
          <select id="dec-project" class="select-dark dec-project-select">${MOCK_DATA.projects.map((p) =>
            `<option value="${p.id}" ${p.id === decisionProjectId ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
          <span class="text-muted dec-proj-meta">利润率 <strong class="${project.profitRate < MOCK_DATA.profitRedLine ? 'text-danger' : 'text-success'}">${project.profitRate}%</strong> · 进度 ${project.progress}%</span>
        </div>
        <div class="dec-context-status">
          <h3 class="dec-context-title">现有情况</h3>
          <div id="dec-current-status" class="status-metric-grid"></div>
          <div id="dec-suggestions" class="dec-suggestions-wrap"></div>
        </div>
      </div>
      <div class="tabs dec-sim-tabs" style="margin-bottom:16px">${simTabs}</div>
      <div id="dec-ai-zone" class="card ai-panel dec-ai-zone ${showAi ? '' : 'hidden'}" style="margin-bottom:16px">
        <div class="card-header">
          <div class="card-title">🤖 AI 情景解析与研判</div>
          <div class="card-subtitle">输入自然语言情景，自动载入扰动因子并生成研判报告</div>
        </div>
        <textarea id="dec-nl-input" class="dec-nl-input" rows="3" placeholder="例：钢筋涨价8%，主体延误30天，业主回款延迟15天"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary btn-sm" id="dec-ai-parse-btn" style="width:auto">✨ 解析情景并生成研判</button>
          <button type="button" class="btn btn-ghost btn-sm" id="dec-reset-btn" style="width:auto">重置</button>
        </div>
        <div id="dec-ai-output" class="ai-output" style="margin-top:12px"></div>
      </div>
      <div class="decision-layout">
        <div class="decision-panel decision-input">
          <div class="card">
            <div class="card-header"><div class="card-title">快捷情景</div>
              <div class="card-subtitle">点击 ✎ 可编辑 · 双击标签改名</div></div>
            <div class="preset-chips">${DecisionEngine.renderPresets(decisionPresetId)}</div>
          </div>
          <div class="card">
            <div class="card-header"><div class="card-title">扰动因子</div>
              <div class="card-subtitle">拖动滑块即时推演</div></div>
            <div class="factor-list">${DecisionEngine.renderFactorSliders(decisionFactors)}</div>
          </div>
        </div>
        <div class="decision-panel decision-output">
          <div class="card dec-hero-card ${result.belowRedLine ? 'hero-warn' : 'hero-ok'}">
            <div class="dec-hero-label">推演后实际利润率</div>
            <div class="dec-hero-row">
              <span class="dec-hero-value ${result.belowRedLine ? 'text-danger' : 'text-success'}" id="dec-profit-rate">${result.simulated.profitRate}</span>
              <span class="dec-hero-unit">%</span>
              <span class="dec-hero-delta" id="dec-profit-delta">${result.deltas.profitRate >= 0 ? '+' : ''}${result.deltas.profitRate} pct</span>
            </div>
            <div class="dec-hero-baseline">基准 ${result.baseline.profitRate}% → 红线 ${MOCK_DATA.profitRedLine}%</div>
            <div id="dec-alerts" style="margin-top:12px"></div>
          </div>
          <div id="dec-viz-panel" class="card dec-viz-panel" style="margin-bottom:16px">
            <div class="card-header">
              <div class="card-title" id="dec-viz-title">可视化推演</div>
              <div class="card-subtitle" id="dec-viz-subtitle"></div>
            </div>
            <div id="dec-viz-content"></div>
          </div>
          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><div class="card-title">定量指标 · 基准 vs 推演</div></div>
            <div id="dec-dim-metrics" class="grid grid-3"></div>
            <div class="chart-container dec-dim-bar-chart" style="height:220px;margin-top:12px"><canvas id="dec-dim-chart"></canvas></div>
          </div>
          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><div class="card-title">模型公式</div></div>
            <div id="dec-formulas" class="formula-list"></div>
          </div>
          <div class="grid grid-2" style="margin-bottom:16px" id="dec-radar-card">
            <div class="card"><div class="card-header"><div class="card-title">整体推演 · 雷达</div></div>
              <div class="chart-container"><canvas id="dec-radar"></canvas></div></div>
            <div class="card" id="dec-bubble-card">
              <div class="card-header"><div class="card-title">因子影响气泡图</div></div>
              <div class="chart-container"><canvas id="dec-bubble"></canvas></div>
            </div>
          </div>
        </div>
      </div>`;

    bindDecisionEvents();
    const radarCard = $('#dec-radar-card');
    const bubbleCard = $('#dec-bubble-card');
    if (radarCard) radarCard.classList.toggle('hidden', decisionSimType !== 'overall');
    if (bubbleCard) bubbleCard.classList.toggle('hidden', decisionSimType !== 'overall');
    const payload = updateDecisionUI();
    if (runAi && DecisionEngine.showsAiPanel(decisionSimType)) runAiAnalysis(payload);
  }

  // ===== Risk System =====
  function renderRiskSystem() {
    const projects = MOCK_DATA.projects;
    const totalRisks = projects.reduce((s, p) => s + p.risks.total, 0);
    const redRisks = projects.reduce((s, p) => s + p.risks.red, 0);
    const pending = projects.reduce((s, p) => s + p.risks.pending, 0);

    $('#main-content').innerHTML = `
      <h1 class="page-title">风险管理系统</h1>
      <p class="page-desc">工程技术部核心关注 · 四地块风险汇总 · 工程/经济/设计三维度管控</p>
      <div class="grid grid-4" style="margin-bottom:24px">
        <div class="card stat-card"><div class="label">在管项目</div><div class="value">${projects.length} <span class="unit">个</span></div></div>
        <div class="card stat-card"><div class="label">风险总数</div><div class="value">${totalRisks}</div></div>
        <div class="card stat-card"><div class="label">红色风险</div><div class="value text-danger">${redRisks}</div></div>
        <div class="card stat-card"><div class="label">待处理</div><div class="value text-warning">${pending}</div></div>
      </div>
      <div class="card" style="margin-bottom:24px">
        <div class="card-header"><div class="card-title">四地块风险概览</div>
          <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="风险汇总报表" data-format="Excel">导出</button></div>
        <div class="table-wrap"><table><thead><tr>
          <th>项目</th><th>风险总数</th><th>红色</th><th>黄色</th><th>蓝色</th><th>待处理</th><th>超阈值</th><th>操作</th>
        </tr></thead><tbody>${projects.map((p) => `<tr>
          <td><strong>${p.name}</strong></td>
          <td class="text-center">${p.risks.total}</td>
          <td class="text-center text-danger">${p.risks.red}</td>
          <td class="text-center text-warning">${p.risks.yellow}</td>
          <td class="text-center">${p.risks.blue}</td>
          <td class="text-center">${p.risks.pending}</td>
          <td class="text-center">${p.risks.overThreshold}</td>
          <td><button class="btn-link" data-action="goto-project" data-id="${p.id}" data-tab="risk">查看详情 →</button></td>
        </tr>`).join('')}</tbody></table></div>
      </div>
      ${projects.map((p) => {
        const detail = MOCK_DATA.projectDetails[p.id];
        return `<div class="section-block"><h3 class="section-heading">${p.name}</h3>${renderRiskContent(p, detail)}</div>`;
      }).join('')}`;
    bindActions();
  }

  // ===== Material Control =====
  function renderMaterial() {
    const detail = getDetail();
    const warnCount = detail.materials.filter((m) => m.warn).length;

    $('#main-content').innerHTML = `
      <h1 class="page-title">物资消耗管控</h1>
      <p class="page-desc">预算用量 vs 供应链实际采购/消耗量 · 超量自动预警 · 数据来源：供应链平台自动同步</p>
      <div class="grid grid-4" style="margin-bottom:24px">
        <div class="card stat-card"><div class="label">管控材料种类</div><div class="value">${detail.materials.length}</div></div>
        <div class="card stat-card"><div class="label">超量预警</div><div class="value text-danger">${warnCount}</div></div>
        <div class="card stat-card"><div class="label">预警阈值</div><div class="value">${MOCK_DATA.materialWarnThreshold}%</div></div>
        <div class="card stat-card"><div class="label">数据同步</div><div class="value" style="font-size:16px">供应链平台</div></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">预算 vs 采购 vs 消耗 对比表</div>
          <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="物资消耗预算对比预警表" data-format="Excel">导出预警报告</button></div>
        <div class="table-wrap"><table><thead><tr>
          <th>材料名称</th><th>单位</th><th>预算用量</th><th>实际采购</th><th>实际消耗</th>
          <th>采购偏差</th><th>消耗偏差</th><th>数据来源</th><th>状态</th><th>影响</th>
        </tr></thead><tbody>${detail.materials.map((m) => {
          const purchasePct = ((m.purchased - m.budget) / m.budget * 100).toFixed(1);
          const consumePct = materialOverPct(m);
          return `<tr class="${m.warn ? 'row-warn' : ''}"><td>${m.name}</td><td>${m.unit}</td>
            <td>${m.budget.toLocaleString()}</td><td>${m.purchased.toLocaleString()}</td>
            <td class="${m.warn ? 'text-danger' : ''}">${m.consumed.toLocaleString()}</td>
            <td class="${purchasePct>0?'text-warning':''}">${purchasePct>0?'+':''}${purchasePct}%</td>
            <td class="${m.warn?'text-danger':''}">${consumePct>0?'+':''}${consumePct}%</td>
            <td>${m.source}</td>
            <td>${m.warn?'<span class="alert-tag alert-danger">超量预警</span>':'正常'}</td>
            <td>${m.warn?'成本上升·利润下降':'—'}</td></tr>`;
        }).join('')}</tbody></table></div>
      </div>
      <div class="card"><div class="card-header"><div class="card-title">消耗趋势对比</div></div>
        <div class="chart-container"><canvas id="chart-material"></canvas></div></div>`;

    const ctx = $('#chart-material');
    if (ctx) chartInstances.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: detail.materials.map((m) => m.name.replace(/C30|HRB400|蒸压/,'')),
        datasets: [
          { label: '预算', data: detail.materials.map((m) => m.budget), backgroundColor: '#597ef7' },
          { label: '采购', data: detail.materials.map((m) => m.purchased), backgroundColor: '#36cfc9' },
          { label: '消耗', data: detail.materials.map((m) => m.consumed), backgroundColor: detail.materials.map((m) => m.warn ? '#ff4d4f' : '#52c41a') }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8ba3c7' } } },
        scales: { y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7', font: { size: 10 } } } } }
    }));
    bindActions();
  }

  // ===== Quantity Compare (广联达) =====
  function renderQuantity() {
    const items = MOCK_DATA.quantityCompare;
    const warnCount = items.filter((i) => i.warn).length;

    $('#main-content').innerHTML = `
      <h1 class="page-title">业主算量 vs 我方询价对比</h1>
      <p class="page-desc">广联达算量（业主深化图纸）vs 我方询价算量 · 目标利润率 ${MOCK_DATA.profitRedLine}%（分包成本控制）· 业主给予总包利润 ${MOCK_DATA.ownerProfitRate}%</p>
      <div class="info-banner">
        <strong>业务规则：</strong>业主给予总包固定利润 <strong>${MOCK_DATA.ownerProfitRate}%</strong>（EPC费率下浮）。我方通过<strong>分包成本控制</strong>，目标实现项目利润率 <strong>${MOCK_DATA.profitRedLine}%</strong>。实际利润率低于 ${MOCK_DATA.profitRedLine}% 时，需分析工程量或材料单价偏差，导出报告与业主沟通。
      </div>
      <div class="grid grid-3" style="margin-bottom:24px">
        <div class="card stat-card"><div class="label">对比清单项</div><div class="value">${items.length}</div></div>
        <div class="card stat-card"><div class="label">低于目标利润率</div><div class="value text-danger">${warnCount}</div></div>
        <div class="card stat-card"><div class="label">目标/业主利润</div><div class="value" style="font-size:18px">${MOCK_DATA.profitRedLine}% / ${MOCK_DATA.ownerProfitRate}%</div></div>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <button class="btn btn-primary btn-sm" style="width:auto" data-action="import-gld">📥 导入广联达算量文件</button>
        <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="业主算量与我方询价差异分析报告" data-format="Excel">📤 导出差异分析报告</button>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="table-wrap"><table><thead><tr>
          <th>清单项</th><th>单位</th><th>业主工程量</th><th>业主单价</th><th>业主合价</th>
          <th>我方工程量</th><th>我方单价</th><th>我方合价</th>
          <th>量差</th><th>价差</th><th>利润率</th><th>偏差原因</th><th>状态</th>
        </tr></thead><tbody>${items.map((i) => `<tr class="${i.warn?'row-warn':''}">
          <td>${i.item}</td><td>${i.unit}</td>
          <td>${i.ownerQty.toLocaleString()}</td><td>${i.ownerPrice}</td><td>${i.ownerAmt.toLocaleString()}</td>
          <td>${i.ourQty.toLocaleString()}</td><td>${i.ourPrice}</td><td>${i.ourAmt.toLocaleString()}</td>
          <td class="${i.qtyDiff?'text-warning':''}">${i.qtyDiff||'—'}</td>
          <td class="${i.priceDiff?'text-warning':''}">${i.priceDiff||'—'}</td>
          <td class="${i.profitRate<MOCK_DATA.profitRedLine?'text-danger':'text-success'}">${i.profitRate}%</td>
          <td>${i.issue||'—'}</td>
          <td>${i.warn?'<span class="alert-tag alert-danger">需沟通</span>':'正常'}</td>
        </tr>`).join('')}</tbody></table></div>
      </div>
      <div class="card"><div class="card-header"><div class="card-title">地下室工程审核对比（商务部Excel）</div></div>
        <div class="table-wrap"><table><thead><tr><th>序号</th><th>项目</th><th>送审(元)</th><th>审定(元)</th><th>增减(元)</th></tr></thead>
        <tbody>${MOCK_DATA.basementReview.map((r)=>`<tr><td>${r.seq}</td><td>${r.name}</td>
          <td>${r.submitAmt.toLocaleString()}</td><td>${r.auditAmt.toLocaleString()}</td>
          <td class="${r.diff<0?'text-success':'text-danger'}">${r.diff.toLocaleString()}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    bindActions();
  }

  // ===== Coordination =====
  function renderCoordination() {
    const mentionUsers = ['@吴主任', '@艾经理', '@曹经理', '@王会计', '@宁总'];
    $('#main-content').innerHTML = `
      <h1 class="page-title">外协协调管理</h1>
      <p class="page-desc">外部协调 · 区域党建联建 · 前期手续 · 应急事件 · 支持 @提醒相关同事</p>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">新建/编辑事项 · @提醒</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          ${mentionUsers.map((u) => `<button type="button" class="mention-chip" data-mention="${u}">${u}</button>`).join('')}
        </div>
        <textarea id="coord-note-input" class="dec-nl-input" rows="2" placeholder="输入协调说明，可点击上方 @同事"></textarea>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>编号</th><th>类型</th><th>事项</th><th>项目</th><th>状态</th><th>负责人</th><th>@提醒</th><th>备注</th><th>截止日期</th></tr></thead>
        <tbody>${MOCK_DATA.coordination.map((c)=>`<tr><td>${c.id}</td><td><span class="tag tag-pilot">${c.type}</span></td>
          <td>${c.title}</td><td>${c.project}</td><td>${c.status}</td><td>${c.owner}</td>
          <td>${(c.mentions||[]).map((m)=>`<span class="mention-tag">${m}</span>`).join(' ')}</td>
          <td style="font-size:12px">${c.note||'—'}</td><td>${c.deadline}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    $$('.mention-chip').forEach((btn) => {
      btn.onclick = () => {
        const ta = $('#coord-note-input');
        if (ta) ta.value = (ta.value + ' ' + btn.dataset.mention).trim();
      };
    });
    bindActions();
  }

  // ===== Progress System (工程技术部) =====
  function renderProgressSystem() {
    const ps = MOCK_DATA.progressSystem;
    $('#main-content').innerHTML = `
      <h1 class="page-title">施工进度与出图管控</h1>
      <p class="page-desc">工程技术部核心关注 · 数据来源：${ps.syncSource} · ${ps.syncStatus}</p>
      <div class="info-banner">
        同步方式：<strong>${ps.fallbackMethod}</strong> · 最后导入：${ps.lastImport} · 接口打通前支持 Excel 表格导入识别，避免重复填报。
      </div>
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <button class="btn btn-primary btn-sm" style="width:auto" data-action="import-excel">📥 导入进度Excel</button>
        <button class="btn btn-ghost btn-sm" data-action="import-excel">📥 导入出图计划表</button>
        <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="施工进度与出图计划报表" data-format="Excel">📤 导出报表</button>
      </div>
      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card"><div class="card-header"><div class="card-title">现场施工进度节点</div>
          <div class="card-subtitle">${ps.syncSource}</div></div>
          <div class="table-wrap"><table><thead><tr><th>项目</th><th>节点</th><th>计划</th><th>实际</th><th>完成率</th><th>状态</th></tr></thead>
          <tbody>${ps.constructionNodes.map((n) => `<tr>
            <td>${n.project}</td><td>${n.node}</td><td>${n.plan}</td>
            <td class="${n.status==='lag'?'text-warning':''}">${n.actual}</td>
            <td>${n.rate}%</td>
            <td>${n.status==='lag'?'<span class="alert-tag alert-warning">滞后'+n.lagDays+'天</span>':n.status==='done'?'<span class="tag tag-normal">完成</span>':n.status==='doing'?'<span class="tag tag-pilot">进行中</span>':'待开始'}</td>
          </tr>`).join('')}</tbody></table></div></div>
        <div class="card"><div class="card-header"><div class="card-title">出图计划与完成情况</div></div>
          <div class="table-wrap"><table><thead><tr><th>项目</th><th>专业</th><th>计划出图</th><th>实际出图</th><th>完成率</th><th>状态</th></tr></thead>
          <tbody>${ps.drawingPlan.map((d) => `<tr>
            <td>${d.project}</td><td>${d.major}</td><td>${d.planDate}</td>
            <td class="${d.status==='lag'?'text-warning':''}">${d.actualDate}</td>
            <td>${d.rate}%</td>
            <td>${d.status==='lag'?'<span class="alert-tag alert-warning">滞后</span>':d.status==='done'?'<span class="tag tag-normal">完成</span>':'<span class="tag tag-pilot">进行中</span>'}</td>
          </tr>`).join('')}</tbody></table></div></div>
      </div>
      <div class="card"><div class="card-header"><div class="card-title">出图完成率对比</div></div>
        <div class="chart-container"><canvas id="chart-drawing"></canvas></div></div>`;

    const byProject = {};
    ps.drawingPlan.forEach((d) => {
      if (!byProject[d.project]) byProject[d.project] = { total: 0, sum: 0 };
      byProject[d.project].total++;
      byProject[d.project].sum += d.rate;
    });
    const labels = Object.keys(byProject);
    const ctx = $('#chart-drawing');
    if (ctx) chartInstances.push(new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: '出图平均完成率%', data: labels.map((p) => (byProject[p].sum / byProject[p].total).toFixed(1)),
        backgroundColor: labels.map((p) => (byProject[p].sum / byProject[p].total) < 80 ? '#faad14' : '#1890ff') }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { max: 100, grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7', font: { size: 10 } } } } }
    }));
    bindActions();
  }

  // ===== Supplier System =====
  function renderSupplierSystem() {
    let supplierTab = 'material';
    $('#main-content').innerHTML = `
      <h1 class="page-title">供应商库子系统</h1>
      <p class="page-desc">材料供应商 · 施工工程供应商 · 实控人/资质/投标/中标/联系方式统一管理</p>
      <div class="tabs" id="supplier-tabs">
        <button class="tab-btn active" data-stab="material">材料供应商 (${MOCK_DATA.suppliers.material.length})</button>
        <button class="tab-btn" data-stab="construction">施工工程供应商 (${MOCK_DATA.suppliers.construction.length})</button>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <button class="btn btn-primary btn-sm" style="width:auto" data-action="import-excel">📥 Excel导入</button>
        <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="供应商库台账" data-format="Excel">📤 导出台账</button>
        <input type="text" placeholder="搜索供应商名称/产品..." style="flex:1;padding:8px 12px;background:var(--bg-dark);border:1px solid var(--border);border-radius:8px;color:var(--text)">
      </div>
      <div id="supplier-content"></div>`;

    function renderSupplierTable(type) {
      const list = MOCK_DATA.suppliers[type];
      $('#supplier-content').innerHTML = `<div class="card"><div class="table-wrap"><table>
        <thead><tr><th>编号</th><th>供应商名称</th><th>实控人</th><th>产品/工程</th><th>资质</th><th>是否投标</th><th>投标价</th><th>是否中标</th><th>联系人</th><th>电话</th><th>合作项目</th></tr></thead>
        <tbody>${list.map((s) => `<tr>
          <td>${s.id}</td><td><strong>${s.name}</strong></td><td>${s.controller}</td><td>${s.products}</td>
          <td style="max-width:120px;font-size:12px">${s.qualification}</td>
          <td>${s.hasBid ? '是' : '否'}</td>
          <td>${s.bidPrice != null ? (type === 'material' ? s.bidPrice : s.bidPrice + '万') : '—'}</td>
          <td>${s.won ? '<span class="tag tag-normal">中标</span>' : '<span class="text-muted">未中标</span>'}</td>
          <td>${s.contact}</td><td>${s.phone}</td>
          <td style="font-size:12px">${s.projects.join('、') || '—'}</td>
        </tr>`).join('')}</tbody></table></div></div>`;
    }

    renderSupplierTable('material');
    $$('#supplier-tabs .tab-btn').forEach((btn) => {
      btn.onclick = () => {
        supplierTab = btn.dataset.stab;
        $$('#supplier-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderSupplierTable(supplierTab);
        bindActions();
      };
    });
    bindActions();
  }

  // ===== Cashflow =====
  function renderCashflow() {
    const cf = MOCK_DATA.cashflow;
    $('#main-content').innerHTML = `
      <h1 class="page-title">动态现金流管控</h1>
      <p class="page-desc">商务部核心关注 · 四项目汇总 · 总包方视角 · 关键数据调整预测 · 临界值 ${cf.criticalBalance} 万提前预警</p>
      <div class="grid grid-4" style="margin-bottom:24px">
        <div class="card stat-card"><div class="label">在管项目</div><div class="value">4</div></div>
        <div class="card stat-card"><div class="label">5月结余</div><div class="value">${cf.items[4].balance} <span class="unit">万</span></div></div>
        <div class="card stat-card"><div class="label">6月预测</div><div class="value text-danger">${cf.items[5].forecast} <span class="unit">万</span></div>
          <div class="trend trend-warn">低于临界值预警</div></div>
        <div class="card stat-card"><div class="label">临界值</div><div class="value">${cf.criticalBalance} <span class="unit">万</span></div></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">四项目汇总现金流（万元）</div>
          <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="动态现金流预测表" data-format="Excel">导出</button></div>
        <div class="chart-container"><canvas id="chart-cashflow"></canvas></div>
      </div>
      <div class="grid grid-2">
        <div class="card"><div class="card-header"><div class="card-title">月度汇总</div></div>
          <div class="table-wrap"><table><thead><tr><th>月份</th><th>收入</th><th>支出</th><th>结余</th><th>预测</th><th>状态</th></tr></thead>
          <tbody>${cf.items.map((i) => `<tr class="${i.warn?'row-warn':''}"><td>${i.month}</td><td>${i.income||'—'}</td><td>${i.expense||'—'}</td>
            <td>${i.balance||'—'}</td><td>${i.forecast}</td>
            <td>${i.warn?'<span class="alert-tag alert-danger">预警</span>':'正常'}</td></tr>`).join('')}
          </tbody></table></div></div>
        <div class="card"><div class="card-header"><div class="card-title">各项目5月现金流（万元）</div></div>
          <div class="table-wrap"><table><thead><tr><th>项目</th><th>收入</th><th>支出</th><th>结余</th><th>预测</th><th>状态</th></tr></thead>
          <tbody>${cf.byProject.map((p) => `<tr class="${p.warn?'row-warn':''}"><td>${p.project}</td><td>${p.income}</td><td>${p.expense}</td>
            <td>${p.balance}</td><td>${p.forecast}</td>
            <td>${p.warn?'<span class="alert-tag alert-danger">预警</span>':'正常'}</td></tr>`).join('')}
          </tbody></table></div></div>
      </div>`;

    const ctx = $('#chart-cashflow');
    if (ctx) chartInstances.push(new Chart(ctx, {
      type: 'line',
      data: {
        labels: cf.items.map((i) => i.month),
        datasets: [
          { label: '收入', data: cf.items.map((i) => i.income), borderColor: '#52c41a', tension: 0.3 },
          { label: '预测收入', data: cf.items.map((i) => i.forecastIncome || i.forecast), borderColor: '#73d13d', borderDash: [4, 4], tension: 0.3 },
          { label: '支出', data: cf.items.map((i) => i.expense), borderColor: '#ff4d4f', tension: 0.3 },
          { label: '确认产值', data: cf.items.map((i) => i.outputValue || null), borderColor: '#36cfc9', tension: 0.3, spanGaps: true },
          { label: '预测结余', data: cf.items.map((i) => i.forecast), borderColor: '#1890ff', borderDash: [5,5], tension: 0.3 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8ba3c7' } } },
        scales: { y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7' } } } }
    }));
    bindActions();
  }

  // ===== Cost System =====
  function renderCostSystem() {
    $('#main-content').innerHTML = `
      <h1 class="page-title">成本测算子系统</h1>
      <p class="page-desc">融入商务部在用的成本测算表 · 新联复建01地块 · 支持Excel导入/版本对比/一体化单位测算</p>
      <div class="tabs" id="cost-tabs">
        <button class="tab-btn ${currentCostTab==='boq'?'active':''}" data-tab="boq">分部分项清单</button>
        <button class="tab-btn ${currentCostTab==='bid-boq'?'active':''}" data-tab="bid-boq">中标工程量清单</button>
        <button class="tab-btn ${currentCostTab==='basement'?'active':''}" data-tab="basement">地下室审核对比</button>
        <button class="tab-btn ${currentCostTab==='summary'?'active':''}" data-tab="summary">成本测算汇总</button>
        <button class="tab-btn ${currentCostTab==='index'?'active':''}" data-tab="index">指标价对标</button>
        <button class="tab-btn ${currentCostTab==='direct'?'active':''}" data-tab="direct">其他直接费</button>
        <button class="tab-btn ${currentCostTab==='sub'?'active':''}" data-tab="sub">专业分包</button>
      </div>
      <div id="cost-tab-content"></div>`;

    $$('#cost-tabs .tab-btn').forEach((btn) => {
      btn.onclick = () => {
        currentCostTab = btn.dataset.tab;
        $$('#cost-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderCostTab();
      };
    });
    renderCostTab();
  }

  function renderCostTab() {
    const content = $('#cost-tab-content');
    const detail = getDetail();

    if (currentCostTab === 'boq') {
      content.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:16px">
          <button class="btn btn-primary btn-sm" style="width:auto" data-action="import-excel">📥 导入Excel</button>
          <button class="btn btn-ghost btn-sm" data-action="export-excel">📤 导出</button>
          <button class="btn btn-ghost btn-sm" data-action="version-compare">版本对比</button>
        </div>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>编码</th><th>项目</th><th>单位</th><th>工程量</th><th>单价</th><th>税率</th><th class="text-right">合价(元)</th></tr></thead>
          <tbody>${MOCK_DATA.billOfQuantities.map((b)=>`<tr><td>${b.code}</td><td>${b.name}</td><td>${b.unit}</td>
            <td>${b.qty.toLocaleString()}</td><td>${b.price}</td><td>${b.tax}</td><td class="text-right">${b.total.toLocaleString()}</td></tr>`).join('')}
          </tbody></table></div></div>`;
    } else if (currentCostTab === 'bid-boq') {
      content.innerHTML = `
        <div class="info-banner">来源：商务部《中标工程量清单》· 新联01地块土石方工程 · 广州浚凯土石方工程有限公司</div>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>序号</th><th>项目名称</th><th>单位</th><th>暂定数量</th><th>不含税单价</th><th>不含税合价</th><th>税率</th><th>含税合价</th></tr></thead>
          <tbody>${MOCK_DATA.bidBoq.map((b)=>`<tr><td>${b.seq}</td><td>${b.name}</td><td>${b.unit}</td>
            <td>${b.qty.toLocaleString()}</td><td>${b.priceNoTax}</td><td>${b.totalNoTax.toLocaleString()}</td>
            <td>${b.tax}</td><td>${b.totalTax.toLocaleString()}</td></tr>`).join('')}
          <tr style="font-weight:600"><td colspan="5">不含税小计</td><td>7,190,000</td><td></td><td>7,837,140</td></tr>
          </tbody></table></div></div>`;
    } else if (currentCostTab === 'basement') {
      content.innerHTML = `
        <div class="info-banner">来源：商务部《地下室工程》审核对比表 · 送审 vs 审定工程量/合价差异</div>
        <div class="card" style="margin-bottom:16px"><div class="card-header"><div class="card-title">单位工程审核汇总</div></div>
          <div class="table-wrap"><table><thead><tr><th>序号</th><th>项目</th><th>送审(元)</th><th>审定(元)</th><th>增减(元)</th></tr></thead>
          <tbody>${MOCK_DATA.basementReview.map((r)=>`<tr><td>${r.seq}</td><td>${r.name}</td>
            <td>${r.submitAmt.toLocaleString()}</td><td>${r.auditAmt.toLocaleString()}</td>
            <td class="${r.diff<0?'text-success':'text-danger'}">${r.diff.toLocaleString()}</td></tr>`).join('')}
          </tbody></table></div></div>
        <div class="card"><div class="card-header"><div class="card-title">分部分项清单对比明细</div></div>
          <div class="table-wrap"><table><thead><tr><th>编码</th><th>项目</th><th>送审量</th><th>送审价</th><th>送审合价</th><th>审定量</th><th>审定价</th><th>审定合价</th><th>增减</th></tr></thead>
          <tbody>${MOCK_DATA.basementBoqCompare.map((b)=>`<tr><td>${b.code}</td><td>${b.name}</td>
            <td>${b.submitQty}</td><td>${b.submitPrice}</td><td>${b.submitAmt.toLocaleString()}</td>
            <td>${b.auditQty}</td><td>${b.auditPrice}</td><td>${b.auditAmt.toLocaleString()}</td>
            <td class="${b.diff<0?'text-success':'text-danger'}">${b.diff.toLocaleString()}</td></tr>`).join('')}
          </tbody></table></div></div>`;
    } else if (currentCostTab === 'summary') {
      content.innerHTML = `
        <div class="info-banner">来源：镇龙东项目成本测算汇总表 · 内部测算 vs 一体化单位测算 · 利润率对比（万元）</div>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>分部</th><th>招标控制价</th><th>中标合同价</th><th>内部成本</th><th>内部利润率</th><th>一体化成本</th><th>一体化利润率</th><th>差异</th></tr></thead>
          <tbody>${MOCK_DATA.costSummary.map((s)=>{
            const diff = (s.internalRate - s.integrationRate).toFixed(1);
            return `<tr><td>${s.name}</td><td>${s.tender}</td><td>${s.contract}</td>
              <td>${s.internalCost}</td><td class="${s.internalRate<MOCK_DATA.profitRedLine?'text-danger':'text-success'}">${s.internalRate}%</td>
              <td>${s.integrationCost}</td><td class="${s.integrationRate<MOCK_DATA.profitRedLine?'text-danger':'text-success'}">${s.integrationRate}%</td>
              <td class="${diff<0?'text-danger':''}">${diff>0?'+':''}${diff}%</td></tr>`;
          }).join('')}
          </tbody></table></div>
          <div style="margin-top:12px;font-size:12px;color:var(--text-muted)">地下室分部一体化利润率8.2%，低于目标${MOCK_DATA.profitRedLine}%，需加强分包成本控制</div>
        </div>`;
    } else if (currentCostTab === 'index') {
      content.innerHTML = `
        <div class="grid grid-2">
          <div class="card"><div class="card-header"><div class="card-title">指标价库</div></div>
            <div class="table-wrap"><table><thead><tr><th>类别</th><th>项目</th><th>单位</th><th>价格</th><th>有效期</th></tr></thead>
            <tbody>${MOCK_DATA.costIndex.map((c)=>`<tr><td>${c.category}</td><td>${c.item}</td><td>${c.unit}</td><td>${c.price}</td><td>${c.valid}</td></tr>`).join('')}</tbody></table></div></div>
          <div class="card"><div class="card-header"><div class="card-title">对标结果</div></div>
            <div class="table-wrap"><table><thead><tr><th>分项</th><th>差异率</th><th>金额(万)</th></tr></thead>
            <tbody>${detail.benchmarkTop.map((b)=>`<tr><td>${b.item}</td><td class="text-danger">+${b.diff}%</td><td>${b.amount}</td></tr>`).join('')}
            ${detail.benchmarkSave.map((b)=>`<tr><td>${b.item}</td><td class="text-success">${b.diff}%</td><td>${b.amount}</td></tr>`).join('')}
            </tbody></table></div></div>
        </div>`;
    } else if (currentCostTab === 'direct') {
      const odc = detail.otherDirectCosts;
      content.innerHTML = `<div class="card"><div class="card-header"><div class="card-title">其他直接费多版本对比（万元）</div></div>
        <div class="table-wrap"><table><thead><tr><th>费用项</th>${odc.versions.map((v)=>`<th>${v}</th>`).join('')}<th>差异</th></tr></thead>
        <tbody>${odc.items.map((item)=>{const diff=item.v3-item.v1;
          return `<tr><td>${item.name}</td><td>${item.v1}</td><td>${item.v2}</td><td>${item.v3}</td>
            <td class="${diff>0?'text-danger':diff<0?'text-success':''}">${diff>0?'+':''}${diff}</td></tr>`;}).join('')}
        </tbody></table></div></div>`;
    } else if (currentCostTab === 'sub') {
      content.innerHTML = `<div class="card"><div class="card-header"><div class="card-title">专业分包付款台账</div></div>
        <div class="table-wrap"><table><thead><tr><th>分包单位</th><th>合同(万)</th><th>已付(万)</th><th>剩余(万)</th><th>进度</th><th>状态</th></tr></thead>
        <tbody>${detail.subcontracts.map((s)=>{const pct=(s.paid/s.contract*100).toFixed(1);
          return `<tr><td>${s.company}</td><td>${s.contract}</td><td>${s.paid}</td><td>${s.remain}</td>
            <td><div class="progress-bar-wrap"><div class="progress-bar ${s.overpay?'danger':''}" style="width:${pct}%"></div></div> ${pct}%</td>
            <td>${s.overpay?'<span class="text-danger">超付</span>':'正常'}</td></tr>`;}).join('')}
        </tbody></table></div></div>`;
    }
    bindActions();
  }

  // ===== Reports =====
  function renderReports() {
    $('#main-content').innerHTML = `
      <h1 class="page-title">报表中心</h1>
      <p class="page-desc">支持 Excel / PDF 导出 · 数据自动更新</p>
      <div class="tabs" id="report-tabs">
        <button class="tab-btn active" data-cat="all">全部</button>
        <button class="tab-btn" data-cat="沙盘">沙盘</button>
        <button class="tab-btn" data-cat="成本">成本</button>
        <button class="tab-btn" data-cat="财务">财务</button>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>报表名称</th><th>分类</th><th>格式</th><th>操作</th></tr></thead>
        <tbody id="report-table-body">${renderReportRows('all')}</tbody>
      </table></div></div>`;

    $$('#report-tabs .tab-btn').forEach((btn) => {
      btn.onclick = () => {
        $$('#report-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        $('#report-table-body').innerHTML = renderReportRows(btn.dataset.cat);
        bindActions();
      };
    });
    bindActions();
  }

  function renderReportRows(cat) {
    const reports = cat === 'all' ? MOCK_DATA.reports : MOCK_DATA.reports.filter((r) => r.category === cat);
    const catLabel = { '沙盘': '数字沙盘', '成本': '成本测算', '财务': '财务' };
    return reports.map((r) => `<tr><td>${r.name}</td>
      <td><span class="tag tag-pilot">${catLabel[r.category]||r.category}</span></td>
      <td>${r.format.join(' / ')}</td>
      <td><button class="btn-link" data-action="export-report" data-format="Excel" data-name="${r.name}">Excel</button> ·
        <button class="btn-link" data-action="export-report" data-format="PDF" data-name="${r.name}">PDF</button></td></tr>`).join('');
  }

  // ===== Sync Log =====
  function renderSyncLog() {
    $('#main-content').innerHTML = `
      <h1 class="page-title">数据同步日志</h1>
      <p class="page-desc">接口对接 · Excel导入 · 图片识别(OCR) · 禁止重复录入</p>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>来源系统</th><th>同步时间</th><th>方式</th><th>状态</th><th>记录数</th></tr></thead>
        <tbody>${MOCK_DATA.syncLogs.map((l)=>`<tr><td>${l.system}</td><td>${l.time}</td><td>${l.method}</td>
          <td><span class="tag ${l.status==='success'?'tag-normal':'tag-planning'}">${l.status==='success'?'成功':'警告'}</span></td>
          <td>${l.records}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title">三级数据流转</div></div>
        <div style="font-size:13px;line-height:2.2;color:var(--text-muted)">
          <div>📥 <strong style="color:var(--text)">录入层</strong>：数字施工平台 · 供应链平台 · 广联达算量 · 成本测算子系统（唯一录入源）</div>
          <div>🔄 <strong style="color:var(--text)">同步层</strong>：标准接口 · Excel模板导入 · 图片识别(OCR) · 自动覆盖历史数据</div>
          <div>📊 <strong style="color:var(--text)">展示层</strong>：数字沙盘汇总 → 明细下钻 → 原始单据（纯展示，禁止手动录入）</div>
        </div></div>`;
  }

  // ===== Lightbox with AI markers =====
  function openLightbox(src, caption, photoName, month) {
    $('#lightbox-img').src = src;
    $('#lightbox-caption').textContent = caption;
    const markersEl = $('#lightbox-markers');
    markersEl.innerHTML = '';
    const aiEl = $('#lightbox-ai-summary');
    aiEl.textContent = '';
    const group = MOCK_DATA.aerialPhotos.find((g) => g.month === month);
    if (group?.aiCompare && photoName && group.annotations?.[photoName]) {
      group.annotations[photoName].forEach((m) => {
        const el = document.createElement('div');
        el.className = `ai-marker marker-${m.type} lightbox-marker`;
        el.style.left = m.x + '%';
        el.style.top = m.y + '%';
        el.innerHTML = `<span>${m.label}</span>`;
        markersEl.appendChild(el);
      });
      aiEl.innerHTML = `🤖 AI对比分析（${group.compareWith} → ${group.label}）：${group.aiSummary}`;
    }
    $('#lightbox').classList.remove('hidden');
  }

  $('#lightbox-close').onclick = () => $('#lightbox').classList.add('hidden');
  $('#lightbox').onclick = (e) => { if (e.target === $('#lightbox')) $('#lightbox').classList.add('hidden'); };

  // ===== Events =====
  function bindActions() {
    $$('[data-action]').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation?.();
        const action = el.dataset.action;
        if (action === 'goto-project') navigate('project', { projectId: el.dataset.id, tab: el.dataset.tab });
        else if (action === 'goto-view') navigate(el.dataset.view, el.dataset.progressTab ? { progressTab: el.dataset.progressTab } : {});
        else if (action === 'toast') showToast(el.dataset.msg || '操作完成（Demo）');
        else if (action === 'goto-cost') navigate('cost-system');
        else if (action === 'view-photo') openLightbox(el.dataset.src, el.dataset.caption, el.dataset.photo, el.dataset.month);
        else if (action === 'ai-compare') showToast('AI对比完成 · 已标注5月相对4月新增进展区域');
        else if (action === 'refresh') showToast('数据已刷新 · 同步 564 条记录');
        else if (action === 'import-excel') showToast('Excel导入：自动校验必填项/税率/格式，高亮错误行');
        else if (action === 'copy-jarvis') {
          const jv = MOCK_DATA.jarvisBim;
          navigator.clipboard?.writeText(`网址: ${jv.url}\n账号: ${jv.account}\n密码: ${jv.password}`);
          showToast('账号信息已复制');
        } else if (action === 'recalc-audit') showToast('核增核减已重新计算');
        else if (action === 'ocr-import') showToast('OCR识别完成 · 已同步12条报账记录至平台');
        else if (action === 'export-period') DashboardUI.exportPeriodReport(el.dataset.period || 'daily', 'all');
        else if (action === 'export-excel' || action === 'export-report') showToast(`正在导出：${el.dataset.name||'数据'} (${el.dataset.format||'Excel'})`);
        else if (action === 'version-compare') showToast('版本对比：标前版 vs 一体化单位版 · 12处差异');
        else if (action === 'upload-aerial') showToast('Demo：上传本月航拍图（支持历史版本保留）');
        else if (action === 'refresh-kimi') showToast('Kimi 提交页已刷新');
      };
    });
    $$('.project-card').forEach((el) => {
      el.onclick = () => navigate('project', { projectId: el.dataset.id });
    });
  }
})();
