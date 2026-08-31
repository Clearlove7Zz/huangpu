// 进度产值 · 文档管理 · 工作管理 · 设计管控 v2.0
window.BusinessModules = (function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  function fmt(n) {
    if (n == null || n === '') return '—';
    return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const CHART_COLORS = { plan: '#5B8FF9', physical: '#5AD8A6', measured: '#9270CA' };

  function destroyChart(id, store) {
    const idx = store.findIndex((x) => x._chartId === id);
    if (idx >= 0) { store[idx].destroy(); store.splice(idx, 1); }
  }

  function pushChart(store, id, chart) {
    chart._chartId = id;
    store.push(chart);
  }

  function renderOutputSummaryCards(ov, compact) {
    return `
      <div class="ov-summary ${compact ? 'ov-summary-compact' : ''}">
        <div class="ov-sum-card ov-sum-primary">
          <div class="ov-sum-label">产值计划 <span class="ov-sum-tag">整体</span></div>
          <div class="ov-sum-value">${fmt(ov.totalPlan)}<span class="unit">万元</span></div>
        </div>
        <div class="ov-sum-card">
          <div class="ov-sum-label">开工累计实物量产值</div>
          <div class="ov-sum-row"><span>累计</span><strong>${fmt(ov.cumPhysical)}万元</strong></div>
          <div class="ov-sum-row"><span>完成率</span><strong class="text-primary">${ov.physicalRate}%</strong></div>
        </div>
        <div class="ov-sum-card">
          <div class="ov-sum-label">开工累计计量产值</div>
          <div class="ov-sum-row"><span>累计</span><strong>${fmt(ov.cumMeasured)}万元</strong></div>
          <div class="ov-sum-row"><span>完成率</span><strong class="text-primary">${ov.measuredRate}%</strong></div>
        </div>
      </div>`;
  }

  function renderOutputTimeline(ov) {
    const maxPlan = Math.max(...ov.timeline.map((t) => t.plan));
    return `
      <div class="ov-section">
        <h3 class="ov-section-title">整体情况</h3>
        <div class="ov-overview-grid">
          <div class="ov-overview-left">
            <div class="ov-mini-stat"><div class="label">总计划产值</div><div class="value">${fmt(ov.totalPlan)}</div></div>
            <div class="ov-mini-stat"><div class="label">建设期</div><div class="value text-sm">${ov.buildPeriod}</div></div>
          </div>
          <div class="ov-timeline">
            ${ov.timeline.map((t, i) => {
              const pct = Math.round((t.plan / maxPlan) * 100);
              const line = i < ov.timeline.filter((x) => x.done).length ? 'ov-tl-line-done' : '';
              return `<div class="ov-tl-node ${line}">
                <div class="ov-tl-dot ${t.done ? 'done' : ''}"></div>
                <div class="ov-tl-year">${t.year}</div>
                <div class="ov-tl-plan">计划 ${fmt(t.plan)}</div>
                ${t.physicalCum != null ? `<div class="ov-tl-sub">开工累计计量 ${fmt(t.physicalCum)}</div>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;
  }

  function renderOutputMonthTable(ov) {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const rows = [
      { label: '计划产值', key: 'plan', cum: ov.monthCumPlan, year: ov.yearPlan },
      { label: '实物量产值', key: 'physical', cum: ov.monthCumPhysical },
      { label: '偏差', key: 'variance', cum: ov.monthCumVariance, isVar: true },
      { label: '完成率', key: 'rate', cum: ov.monthCumRate + '%', year: ov.yearRate + '%', isPct: true },
      { label: '计量产值', key: 'measured', cum: ov.monthCumMeasured }
    ];
    return `
      <div class="table-wrap ov-table-wrap">
        <table class="cost-table readonly-table ov-detail-table">
          <thead><tr>
            <th>项目名称</th><th>合同工作量</th><th>统计内容</th>
            ${months.map((m) => `<th class="text-right">${m}月</th>`).join('')}
            <th class="text-right">截止当月</th><th class="text-right">全年计划产值</th>
            <th class="text-right">开工累计完成计量产值</th>
          </tr></thead>
          <tbody>
            ${rows.map((r, ri) => {
              const vals = r.key === 'variance'
                ? ov.monthly.plan.map((p, i) => {
                    const ph = ov.monthly.physical[i];
                    return ph != null ? (ph - p).toFixed(2) : null;
                  })
                : r.key === 'rate'
                  ? ov.monthly.plan.map((p, i) => {
                      const ph = ov.monthly.physical[i];
                      return ph != null ? Math.round((ph / p) * 100) + '%' : '—';
                    })
                  : ov.monthly[r.key];
              return `<tr class="${ri === 0 ? 'ov-row-project' : ''}">
                ${ri === 0 ? `<td rowspan="5">${ov.projectName}</td><td rowspan="5" class="text-right">${fmt(ov.contractWorkload)}</td>` : ''}
                <td>${r.label}</td>
                ${vals.map((v) => `<td class="text-right ${r.isVar && v < 0 ? 'text-danger' : ''}">${v == null ? '—' : r.isPct ? v : fmt(v)}</td>`).join('')}
                <td class="text-right">${r.cum != null ? (r.isPct ? r.cum : fmt(r.cum)) : '—'}</td>
                <td class="text-right">${r.year != null ? (r.isPct ? r.year : fmt(r.year)) : '—'}</td>
                <td class="text-right">${r.key === 'measured' ? fmt(ov.cumMeasured) : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function initOutputCharts(ov, chartInstances, opts = {}) {
    const prefix = opts.prefix || 'ov';
    const yearlyId = `${prefix}-chart-yearly`;
    const monthlyId = `${prefix}-chart-monthly`;
    const yCtx = document.getElementById(yearlyId);
    if (yCtx) {
      pushChart(chartInstances, yearlyId, new Chart(yCtx, {
          type: 'bar',
          data: {
            labels: ov.yearlyChart.map((y) => String(y.year)),
            datasets: [
              { label: '计划产值', data: ov.yearlyChart.map((y) => y.plan), backgroundColor: CHART_COLORS.plan, borderRadius: 4 },
              { label: '开工累计实物量产值', data: ov.yearlyChart.map((y) => y.physical || null), backgroundColor: CHART_COLORS.physical, borderRadius: 4 },
              { label: '开工累计计量产值', data: ov.yearlyChart.map((y) => y.measured || null), backgroundColor: CHART_COLORS.measured, borderRadius: 4 }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8ba3c7', boxWidth: 12 } } },
            scales: {
              y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } },
              x: { grid: { display: false }, ticks: { color: '#8ba3c7' } }
            }
          }
        }));
    }
    const mCtx = document.getElementById(monthlyId);
    if (mCtx) {
      pushChart(chartInstances, monthlyId, new Chart(mCtx, {
          type: 'bar',
          data: {
            labels: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
            datasets: [
              { label: '计划产值', data: ov.monthly.plan, backgroundColor: CHART_COLORS.plan, borderRadius: 3 },
              { label: '实物量产值', data: ov.monthly.physical, backgroundColor: CHART_COLORS.physical, borderRadius: 3 },
              { label: '计量产值', data: ov.monthly.measured, backgroundColor: CHART_COLORS.measured, borderRadius: 3 }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8ba3c7', boxWidth: 12 } } },
            scales: {
              y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } },
              x: { grid: { display: false }, ticks: { color: '#8ba3c7' } }
            }
          }
        }));
    }
  }

  function bindOutputRangeTabs(container, ov, chartInstances, prefix) {
    $$('.ov-range-tab', container).forEach((btn) => {
      btn.onclick = () => {
        $$('.ov-range-tab', container).forEach((b) => b.classList.toggle('active', b === btn));
        const mode = btn.dataset.range;
        destroyChart(`${prefix}-chart-yearly`, chartInstances);
        const yCtx = document.getElementById(`${prefix}-chart-yearly`);
        if (!yCtx) return;
        const data = mode === 'year'
          ? ov.yearlyChart
          : [{ year: '汇总', plan: ov.totalPlan, physical: ov.cumPhysical, measured: ov.cumMeasured }];
        pushChart(chartInstances, `${prefix}-chart-yearly`, new Chart(yCtx, {
            type: 'bar',
            data: {
              labels: data.map((d) => String(d.year)),
              datasets: [
                { label: '计划产值', data: data.map((d) => d.plan), backgroundColor: CHART_COLORS.plan, borderRadius: 4 },
                { label: '开工累计实物量产值', data: data.map((d) => d.physical), backgroundColor: CHART_COLORS.physical, borderRadius: 4 },
                { label: '开工累计计量产值', data: data.map((d) => d.measured), backgroundColor: CHART_COLORS.measured, borderRadius: 4 }
              ]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { labels: { color: '#8ba3c7' } } },
              scales: { y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7' } } }
            }
          }));
      };
    });
  }

  function renderDashboardOutputModule() {
    const ov = MOCK_DATA.outputValue;
    return `
      <div class="card dash-module-card ov-dash-card" style="margin-bottom:24px" id="dash-output-value-module">
        <div class="card-header">
          <div class="card-title">📈 进度产值</div>
          <span class="text-muted" style="font-size:12px">四项目汇总 · 万元</span>
        </div>
        <div class="ov-range-tabs">
          <button type="button" class="ov-range-tab active" data-range="all">全部</button>
          <button type="button" class="ov-range-tab" data-range="year">年度</button>
        </div>
        ${renderOutputSummaryCards(ov, true)}
        <div class="ov-chart-legend-inline">
          <span><i class="ov-legend-dot" style="background:${CHART_COLORS.plan}"></i>计划产值</span>
          <span><i class="ov-legend-dot" style="background:${CHART_COLORS.physical}"></i>开工累计实物量产值</span>
          <span><i class="ov-legend-dot" style="background:${CHART_COLORS.measured}"></i>开工累计计量产值</span>
        </div>
        <div class="chart-container ov-chart-box"><canvas id="dash-ov-chart-yearly"></canvas></div>
      </div>`;
  }

  function initDashboardOutputCharts(chartInstances) {
    const ov = MOCK_DATA.outputValue;
    const el = $('#dash-output-value-module');
    initOutputCharts(ov, chartInstances, { prefix: 'dash-ov' });
    if (el) bindOutputRangeTabs(el, ov, chartInstances, 'dash-ov');
  }

  function renderOutputValueFull(chartInstances) {
    const ov = MOCK_DATA.outputValue;
    return `
      <div class="ov-full-module">
        ${renderOutputTimeline(ov)}
        <div class="ov-section">
          <h3 class="ov-section-title">进度完成情况</h3>
          <div class="chart-container ov-chart-box"><canvas id="ov-chart-monthly"></canvas></div>
        </div>
        ${renderOutputSummaryCards(ov, false)}
        <div class="ov-range-tabs" style="margin-bottom:12px">
          <button type="button" class="ov-range-tab active" data-range="all">全部</button>
          <button type="button" class="ov-range-tab" data-range="year">年度</button>
        </div>
        <div class="chart-container ov-chart-box"><canvas id="ov-chart-yearly"></canvas></div>
        <div class="ov-section">
          <h3 class="ov-section-title">产值明细表</h3>
          ${renderOutputMonthTable(ov)}
        </div>
      </div>`;
  }

  function mountOutputValueFull(chartInstances, root) {
    initOutputCharts(MOCK_DATA.outputValue, chartInstances, { prefix: 'ov' });
    if (root) bindOutputRangeTabs(root, MOCK_DATA.outputValue, chartInstances, 'ov');
  }

  function renderProgressOutputSection(ps) {
    const ov = MOCK_DATA.outputValue;
    const units = ps.productionUnits || [];
    return `
      <div class="section-block ov-full-module">
        ${renderOutputTimeline(ov)}
        <div class="ov-section">
          <h3 class="ov-section-title">进度完成情况</h3>
          <div class="chart-container ov-chart-box"><canvas id="prog-ov-chart-monthly"></canvas></div>
        </div>
        ${renderOutputSummaryCards(ov, false)}
        <div class="chart-container ov-chart-box"><canvas id="prog-ov-chart-yearly"></canvas></div>
        <div class="ov-section">
          <h3 class="ov-section-title">产值明细表</h3>
          ${renderOutputMonthTable(ov)}
        </div>
      </div>
      <div class="section-block">
        <h3 class="section-heading">生产单元产值报审</h3>
        <div class="card"><div class="readonly-badge" style="margin-bottom:12px">生产单元按月报产值 · 商务部审核后计入动态现金流</div>
        <div class="table-wrap"><table class="cost-table readonly-table"><thead><tr>
          <th>项目</th><th>生产单元</th><th>本月产值(万)</th><th>累计产值(万)</th><th>报审人</th><th>报审日期</th><th>状态</th>
        </tr></thead><tbody>${units.map((u) => `<tr>
          <td>${u.project}</td><td>${u.unit}</td><td class="text-right">${u.monthOutput}</td><td class="text-right">${u.cumOutput}</td>
          <td>${u.reporter}</td><td>${u.date}</td>
          <td>${u.status === '已审核' ? '<span class="tag tag-normal">已审核</span>' : '<span class="tag tag-pilot">待审核</span>'}</td>
        </tr>`).join('')}</tbody></table></div></div>
      </div>`;
  }

  function initProgressOutputCharts(chartInstances) {
    const ov = MOCK_DATA.outputValue;
    const yCtx = document.getElementById('prog-ov-chart-yearly');
    const mCtx = document.getElementById('prog-ov-chart-monthly');
    if (yCtx) {
      pushChart(chartInstances, 'prog-ov-chart-yearly', new Chart(yCtx, {
          type: 'bar',
          data: {
            labels: ov.yearlyChart.map((y) => String(y.year)),
            datasets: [
              { label: '计划产值', data: ov.yearlyChart.map((y) => y.plan), backgroundColor: CHART_COLORS.plan, borderRadius: 4 },
              { label: '实物量产值', data: ov.yearlyChart.map((y) => y.physical), backgroundColor: CHART_COLORS.physical, borderRadius: 4 },
              { label: '计量产值', data: ov.yearlyChart.map((y) => y.measured), backgroundColor: CHART_COLORS.measured, borderRadius: 4 }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8ba3c7' } } },
            scales: { y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7' } } } }
        }));
    }
    if (mCtx) {
      pushChart(chartInstances, 'prog-ov-chart-monthly', new Chart(mCtx, {
          type: 'bar',
          data: {
            labels: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
            datasets: [
              { label: '计划产值', data: ov.monthly.plan, backgroundColor: CHART_COLORS.plan, borderRadius: 3 },
              { label: '实物量产值', data: ov.monthly.physical, backgroundColor: CHART_COLORS.physical, borderRadius: 3 },
              { label: '计量产值', data: ov.monthly.measured, backgroundColor: CHART_COLORS.measured, borderRadius: 3 }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8ba3c7' } } },
            scales: { y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7' } } } }
        }));
    }
  }

  function renderInspectionsTable(inspections, editable) {
    const ins = inspections || MOCK_DATA.projectDetails.xl_fj01.inspections || [];
    const ec = (v, w) => CostUI.ec(v, w);
    const ecW = (v) => CostUI.ecWide(v);
    const ro = (v) => CostUI.ro(v);
    return `<div class="table-wrap"><table class="cost-table ${editable ? 'mixed-table' : 'readonly-table'}"><thead><tr>
      <th${editable ? ' class="col-editable"' : ''}>日期</th>
      <th${editable ? ' class="col-editable"' : ''}>类型</th>
      <th${editable ? ' class="col-editable"' : ''}>结果</th>
      <th${editable ? ' class="col-editable"' : ''}>状态</th>
      <th${editable ? ' class="col-editable"' : ''}>检查人</th>
    </tr></thead><tbody>${ins.map((i) => `<tr>
      <td>${editable ? ec(i.date, '100px') : ro(i.date)}</td>
      <td>${editable ? ecW(i.type) : ro(i.type)}</td>
      <td>${editable ? ecW(i.result) : ro(i.result)}</td>
      <td>${editable ? ecW(i.status) : ro(i.status)}</td>
      <td>${editable ? ecW(i.inspector) : ro(i.inspector)}</td>
    </tr>`).join('')}</tbody></table></div>`;
  }

  function renderSafetyImageSection(imageHtml, inspections, opts = {}) {
    const editable = opts.editable !== false;
    return `
      <div class="section-block">
        <h3 class="section-heading">安全/质量巡检情况</h3>
        <div class="card">${editable ? CostUI.tableLegend() : ''}${renderInspectionsTable(inspections, editable)}</div>
      </div>
      ${imageHtml}`;
  }

  // ===== 文档管理 =====
  let docFolderId = 'root';

  function renderDocumentManagement(bindActions) {
    const dm = MOCK_DATA.documentManagement;
    document.getElementById('main-content').innerHTML = `
      <h1 class="page-title">文档管理</h1>
      <p class="page-desc">当前位置：${dm.breadcrumb.join(' &gt; ')} · 合同/三会/设计管控/建设期资料归档</p>
      <div class="biz-light-panel doc-mgmt-panel">
        <div class="doc-toolbar">
          <button class="btn btn-primary btn-sm" style="width:auto" data-action="doc-new-folder">新建文件夹</button>
          <button class="btn btn-ghost btn-sm" data-action="toast" data-msg="移动到（Demo）">移动到</button>
          <button class="btn btn-ghost btn-sm" data-action="toast" data-msg="已收藏（Demo）">收藏</button>
          <button class="btn btn-ghost btn-sm" data-action="toast" data-msg="下载已开始（Demo）">下载</button>
          <button class="btn btn-ghost btn-sm text-danger" data-action="toast" data-msg="请选择文件（Demo）">删除</button>
          <button class="btn btn-ghost btn-sm" data-action="toast" data-msg="权限设置（Demo）">权限设置</button>
          <div class="doc-toolbar-right">
            <input type="text" class="biz-input" placeholder="搜索文件" style="width:200px">
            <button class="btn btn-primary btn-sm" style="width:auto">高级搜索</button>
          </div>
        </div>
        <div class="doc-layout">
          <aside class="doc-sidebar">
            <input type="text" class="biz-input" placeholder="搜索文件夹" style="width:100%;margin-bottom:12px">
            <div class="doc-tree" id="doc-tree"></div>
          </aside>
          <main class="doc-main">
            <div class="doc-path"><a href="#" data-action="doc-back">返回上一级</a> | 全部文件</div>
            <div class="table-wrap">
              <table class="biz-table doc-file-table">
                <thead><tr>
                  <th style="width:36px"><input type="checkbox"></th>
                  <th>文件名称</th><th>版本</th><th>大小</th><th>修改者</th><th>修改时间</th>
                </tr></thead>
                <tbody id="doc-file-list"></tbody>
              </table>
            </div>
          </main>
        </div>
      </div>`;
    renderDocTree(dm.folders);
    renderDocFiles(dm.files);
    bindDocEvents(bindActions);
  }

  function renderDocTree(folders, level = 0) {
    const tree = $('#doc-tree');
    if (!tree) return;
    const renderNodes = (nodes) => nodes.map((n) => `
      <div class="doc-tree-item ${docFolderId === n.id ? 'active' : ''}" style="padding-left:${12 + level * 14}px" data-folder="${n.id}">
        <span class="doc-folder-icon">📁</span> ${n.name}
      </div>
      ${n.children ? renderNodes(n.children) : ''}`).join('');
    tree.innerHTML = renderNodes(folders);
    $$('.doc-tree-item').forEach((el) => {
      el.onclick = () => {
        docFolderId = el.dataset.folder;
        renderDocTree(folders);
        window.showToast?.(`已切换至：${el.textContent.trim()}`);
      };
    });
  }

  function renderDocFiles(files) {
    const tbody = $('#doc-file-list');
    if (!tbody) return;
    tbody.innerHTML = files.map((f) => `<tr>
      <td><input type="checkbox"></td>
      <td><span class="doc-file-name">${f.type === 'folder' ? '📁' : '📄'} ${f.name}</span></td>
      <td>${f.version}</td><td>${f.size}</td><td>${f.modifier}</td><td>${f.time}</td>
    </tr>`).join('');
  }

  function bindDocEvents(bindActions) {
    bindActions?.();
  }

  // ===== 工作管理 =====
  let workTab = 'reports';
  let reportPeriod = 'daily';

  function renderWorkManagement(bindActions) {
    document.getElementById('main-content').innerHTML = `
      <h1 class="page-title">工作管理</h1>
      <p class="page-desc">项目汇报 · 项目通知单 · 规章制度</p>
      <div class="tabs" id="work-mgmt-tabs">
        <button class="tab-btn ${workTab === 'reports' ? 'active' : ''}" data-wtab="reports">项目汇报</button>
        <button class="tab-btn ${workTab === 'notifications' ? 'active' : ''}" data-wtab="notifications">项目通知单</button>
        <button class="tab-btn ${workTab === 'regulations' ? 'active' : ''}" data-wtab="regulations">规章制度</button>
      </div>
      <div id="work-mgmt-content"></div>`;

    const render = () => {
      const box = $('#work-mgmt-content');
      const wm = MOCK_DATA.workManagement;
      if (workTab === 'reports') {
        const periods = [
          { key: 'daily', label: '日报' }, { key: 'weekly', label: '周报' },
          { key: 'monthly', label: '月报' }, { key: 'quarterly', label: '季度报' }
        ];
        const list = wm.reports[reportPeriod] || [];
        box.innerHTML = `
          <div class="biz-light-panel" style="margin-top:16px">
            <div class="tabs" style="margin-bottom:16px">
              ${periods.map((p) => `<button type="button" class="tab-btn ${reportPeriod === p.key ? 'active' : ''}" data-rperiod="${p.key}">${p.label}</button>`).join('')}
            </div>
            <button class="btn btn-primary btn-sm" style="width:auto;margin-bottom:12px" data-action="toast" data-msg="添加汇报（Demo）">添加</button>
            <div class="table-wrap"><table class="biz-table"><thead><tr>
              <th>序号</th><th>项目</th><th>${reportPeriod === 'daily' ? '日期' : '周期'}</th><th>填报人</th><th>摘要</th><th>状态</th><th>操作</th>
            </tr></thead><tbody>
              ${list.length ? list.map((r, i) => `<tr>
                <td>${i + 1}</td><td>${r.project}</td><td>${r.date || r.period}</td><td>${r.author}</td><td>${r.summary}</td>
                <td><span class="tag tag-normal">${r.status}</span></td>
                <td><button class="btn-link" data-action="toast" data-msg="查看">查看</button></td>
              </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">暂无数据</td></tr>'}
            </tbody></table></div>
          </div>`;
        $$('[data-rperiod]').forEach((btn) => {
          btn.onclick = () => { reportPeriod = btn.dataset.rperiod; render(); bindActions?.(); };
        });
      } else if (workTab === 'notifications') {
        box.innerHTML = `
          <div class="biz-light-panel" style="margin-top:16px">
            <div class="biz-filter-bar">
              <label>项目名称 <select class="biz-input"><option>全部</option><option>新联复建01</option></select></label>
              <label>标题 <input class="biz-input" placeholder="输入通知单标题"></label>
              <button class="btn btn-primary btn-sm" style="width:auto">查询</button>
              <button class="btn btn-ghost btn-sm" style="width:auto">重置</button>
              <div style="flex:1"></div>
              <button class="btn btn-primary btn-sm" style="width:auto" data-action="toast" data-msg="获取数据（Demo）">获取数据</button>
              <button class="btn btn-primary btn-sm" style="width:auto" data-action="toast" data-msg="添加通知单（Demo）">添加</button>
            </div>
            <div class="table-wrap"><table class="biz-table"><thead><tr>
              <th>序号</th><th>子项名称</th><th>通知单标题</th><th>发生日期</th><th>整改截止日期</th><th>实际完成日期</th><th>操作</th>
            </tr></thead><tbody>
              ${wm.notifications.map((n, i) => `<tr>
                <td>${i + 1}</td><td>${n.subProject}</td><td>${n.title}</td><td>${n.occurDate}</td><td>${n.deadline}</td><td>${n.completeDate}</td>
                <td>
                  <button class="btn-link" data-action="toast" data-msg="查看">查看</button>
                  <button class="btn-link" data-action="toast" data-msg="修改">修改</button>
                  <button class="btn-link text-danger" data-action="toast" data-msg="删除">删除</button>
                </td>
              </tr>`).join('')}
            </tbody></table></div>
            <div class="biz-pagination">共 ${wm.notifications.length} 条 · 1 / 1 页</div>
          </div>`;
      } else {
        box.innerHTML = `
          <div class="biz-light-panel" style="margin-top:16px">
            <div class="biz-filter-bar">
              <label>项目名称 <select class="biz-input"><option>全部</option></select></label>
              <label>子项名称 <select class="biz-input"><option>请选择子项名称</option></select></label>
              <label>项目阶段 <select class="biz-input"><option>请选择</option></select></label>
              <button class="btn btn-primary btn-sm" style="width:auto">查询</button>
              <button class="btn btn-ghost btn-sm" style="width:auto">重置</button>
            </div>
            <button class="btn btn-primary btn-sm" style="width:auto;margin-bottom:12px" data-action="toast" data-msg="添加制度（Demo）">添加</button>
            <div class="table-wrap"><table class="biz-table biz-table-wide"><thead><tr>
              <th>序号</th><th>项目名称</th><th>子项名称</th><th>项目阶段</th><th>制度类型</th><th>规章制度</th>
              <th>主要修订内容</th><th>重新修订原因</th><th>生效日期</th><th>申请日期</th><th>审核通过日期</th><th>审核状态</th>
            </tr></thead><tbody>
              ${wm.regulations.map((r, i) => `<tr>
                <td>${i + 1}</td><td>${r.project}</td><td>${r.subItem}</td><td>${r.phase}</td><td>${r.type}</td><td>${r.name}</td>
                <td>${r.revision}</td><td>${r.reason}</td><td>${r.effective}</td><td>${r.apply}</td><td>${r.approve}</td>
                <td><span class="tag ${r.status === '已生效' ? 'tag-normal' : 'tag-pilot'}">${r.status}</span></td>
              </tr>`).join('')}
            </tbody></table></div>
          </div>`;
      }
      bindActions?.();
    };

    $$('#work-mgmt-tabs .tab-btn').forEach((btn) => {
      btn.onclick = () => {
        workTab = btn.dataset.wtab;
        $$('#work-mgmt-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        render();
      };
    });
    render();
  }

  // ===== 设计管控 v2.0 =====
  function findDesignProject(dc, plotId, projectId) {
    const plot = dc.plots.find((p) => p.id === plotId) || dc.plots[0];
    const proj = plot.projects.find((p) => p.id === projectId) || plot.projects[0];
    return { plot, proj };
  }

  function renderDesignPhasePanel(proj, phaseKey, phaseMeta) {
    const phase = proj.phases[phaseKey];
    if (!phase) return '<p class="text-muted">暂无数据</p>';
    const devPct = phase.progress >= 100 ? 0 : Math.max(0, +(100 - phase.progress).toFixed(1));
    return `
      <div class="design-phase-detail">
        <div class="design-phase-meta">
          <span>计划完成 ${phase.plan}</span>
          <span>实际 ${phase.actual || '—'}</span>
          <span class="${devPct > 15 ? 'text-warning' : ''}">阶段进度偏差率 ${devPct}%</span>
        </div>
        <div class="design-phase-progress-bar">
          <div class="design-phase-progress-fill ${phase.status}" style="width:${phase.progress}%"></div>
        </div>
        <div class="table-wrap" style="margin-top:12px"><table class="cost-table readonly-table"><thead><tr>
          <th>专业/成果</th><th>完成率</th><th>状态</th>
        </tr></thead><tbody>
          ${(phase.disciplines || []).map((d) => `<tr>
            <td>${d.name}</td><td>${d.rate}%</td>
            <td>${d.status === 'done' ? '<span class="tag tag-normal">完成</span>' : d.status === 'lag' ? '<span class="alert-tag alert-warning">滞后</span>' : d.status === 'pending' ? '待启动' : '<span class="tag tag-pilot">进行中</span>'}</td>
          </tr>`).join('') || '<tr><td colspan="3">本阶段暂无专业明细</td></tr>'}
        </tbody></table></div>
      </div>`;
  }

  function renderDesignControl(bindActions, chartInstances) {
    const dc = MOCK_DATA.designControl;
    let plotId = dc._selPlot || dc.plots[0].id;
    let projectId = dc._selProject || dc.plots[0].projects[0].id;
    let activePhase = dc._selPhase || dc.phaseKeys[3].key;
    const { plot, proj } = findDesignProject(dc, plotId, projectId);
    const sum = dc.overallSummary;

    document.getElementById('main-content').innerHTML = `
      <h1 class="page-title">设计管控</h1>
      <p class="page-desc">整体设计情况 · 分地块/分项目 · 五阶段设计进度与图纸变更对工期/成本的影响</p>
      <div class="design-toolbar card" style="padding:16px;margin-bottom:16px">
        <label>地块（片区）<select id="dc-plot" class="select-dark">${dc.plots.map((p) =>
          `<option value="${p.id}" ${p.id === plotId ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
        <label>项目<select id="dc-project" class="select-dark">${plot.projects.map((p) =>
          `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
      </div>
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="card stat-card"><div class="label">在管项目</div><div class="value">${sum.totalProjects}</div></div>
        <div class="card stat-card"><div class="label">平均设计进度偏差率</div><div class="value text-warning">${sum.avgDeviationRate}%</div></div>
        <div class="card stat-card"><div class="label">图纸变更累计</div><div class="value">${sum.totalChanges} 次</div></div>
        <div class="card stat-card"><div class="label">变更致工期/成本</div><div class="value text-sm">+${sum.totalScheduleDays}天 / +${sum.totalCostWan}万</div></div>
      </div>
      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card design-panel">
          <h3 class="section-heading">${proj.name} · 设计整体完成度</h3>
          <div class="design-progress-row">
            <div class="design-gauge"><div class="design-gauge-value">${proj.overallProgress}%</div></div>
            <ul class="design-progress-list text-muted" style="font-size:13px;line-height:1.8">
              <li>设计进度偏差率：<strong class="text-warning">${proj.deviationRate}%</strong></li>
              <li>图纸变更：<strong>${proj.changeImpact.count}</strong> 次</li>
              <li>变更致工期偏差：<strong class="text-warning">+${proj.changeImpact.scheduleDays}</strong> 天</li>
              <li>变更致成本偏差：<strong class="text-danger">+${proj.changeImpact.costWan}</strong> 万元</li>
            </ul>
          </div>
        </div>
        <div class="card design-panel">
          <h3 class="section-heading">五阶段总览</h3>
          <div class="design-phase-bar design-phase-bar-5">
            ${dc.phaseKeys.map((pk) => {
              const ph = proj.phases[pk.key];
              return `<button type="button" class="design-phase-item ${ph?.status || 'pending'} ${activePhase === pk.key ? 'active' : ''}" data-dc-phase="${pk.key}">
                <div class="design-phase-name">${pk.name}</div>
                <div class="design-phase-pct">${ph?.progress ?? 0}%</div>
                <div class="design-phase-date">${ph?.plan || '—'}</div>
              </button>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="card design-panel" style="margin-bottom:16px">
        <h3 class="section-heading">${dc.phaseKeys.find((p) => p.key === activePhase)?.name || ''} · 阶段明细</h3>
        <div id="dc-phase-detail">${renderDesignPhasePanel(proj, activePhase)}</div>
      </div>
      <div class="card design-panel">
        <h3 class="section-heading">设计图纸变更 · 工期与成本偏差</h3>
        <div class="table-wrap"><table class="cost-table readonly-table"><thead><tr>
          <th>变更编号</th><th>阶段</th><th>变更原因</th><th>工期偏差(天)</th><th>成本偏差(万)</th><th>日期</th>
        </tr></thead><tbody>
          ${(proj.drawingChanges || []).length ? proj.drawingChanges.map((c) => `<tr>
            <td>${c.no}</td><td>${c.phase}</td><td>${c.reason}</td>
            <td class="text-warning">+${c.scheduleDays}</td><td class="text-danger">+${c.costWan}</td><td>${c.date}</td>
          </tr>`).join('') : '<tr><td colspan="6">暂无图纸变更记录</td></tr>'}
        </tbody></table></div>
      </div>
      <div class="card design-panel" style="margin-top:16px">
        <h3 class="section-heading">各项目设计进度偏差率对比</h3>
        <div class="chart-container" style="height:260px"><canvas id="design-dev-chart"></canvas></div>
      </div>`;

    const allProjects = dc.plots.flatMap((p) => p.projects);
    const ctx = document.getElementById('design-dev-chart');
    if (ctx) {
      pushChart(chartInstances, 'design-dev-chart', new Chart(ctx, {
        type: 'bar',
        data: {
          labels: allProjects.map((p) => p.name.replace('地块', '')),
          datasets: [
            { label: '设计完成度%', data: allProjects.map((p) => p.overallProgress), backgroundColor: '#5B8FF9', borderRadius: 4 },
            { label: '进度偏差率%', data: allProjects.map((p) => p.deviationRate), backgroundColor: '#faad14', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8ba3c7' } } },
          scales: { y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7', maxRotation: 20 } } }
        }
      }));
    }

    const refresh = () => {
      dc._selPlot = $('#dc-plot')?.value || plotId;
      dc._selProject = $('#dc-project')?.value || projectId;
      dc._selPhase = activePhase;
      destroyChart('design-dev-chart', chartInstances);
      renderDesignControl(bindActions, chartInstances);
    };

    $('#dc-plot')?.addEventListener('change', () => {
      const p = dc.plots.find((x) => x.id === $('#dc-plot').value);
      dc._selPlot = p.id;
      dc._selProject = p.projects[0].id;
      refresh();
    });
    $('#dc-project')?.addEventListener('change', () => { dc._selProject = $('#dc-project').value; refresh(); });
    $$('[data-dc-phase]').forEach((btn) => {
      btn.onclick = () => { activePhase = btn.dataset.dcPhase; dc._selPhase = activePhase; refresh(); };
    });
    bindActions?.();
  }

  return {
    renderDashboardOutputModule,
    initDashboardOutputCharts,
    renderOutputSummaryCards,
    renderOutputValueFull,
    mountOutputValueFull,
    renderProgressOutputSection,
    initProgressOutputCharts,
    renderSafetyImageSection,
    renderInspectionsTable,
    renderDocumentManagement,
    renderWorkManagement,
    renderDesignControl
  };
})();
