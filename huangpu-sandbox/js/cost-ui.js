// 成本测算 / 供应商 / 现金流 / 进度 渲染模块 v1.5
window.CostUI = (function () {
  let auditUnitId = 'basement';
  let threeDetailId = 'basement';
  let supplierTab = 'labor';
  let supplierPage = 1;
  const PAGE_SIZE = 15;

  function ec(val, w) {
    const wStyle = w ? ` style="max-width:${w}"` : '';
    return `<input class="cell-input cell-editable cell-sm"${wStyle} value="${val ?? ''}" title="可编辑">`;
  }
  function ecWide(val) {
    return `<input class="cell-input cell-editable cell-wide" value="${val ?? ''}" title="可编辑">`;
  }
  function ro(val, opts = {}) {
    const text = val == null || val === '' ? '—' : val;
    return `<span class="cell-readonly ${opts.class || ''}" title="自动计算，不可编辑">${text}${opts.suffix || ''}</span>`;
  }
  function tableLegend() {
    return `<div class="table-legend"><span class="legend-edit">可编辑</span><span class="legend-calc">自动计算</span></div>`;
  }

  function fmt(n) {
    if (n == null || n === '') return '—';
    return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  function fmtWan(n) {
    return fmt(n) + ' 万';
  }

  function diffClass(d) {
    if (d > 0) return 'text-danger';
    if (d < 0) return 'text-success';
    return '';
  }

  function renderAuditSummaryTable(rows) {
    return `<div class="table-wrap">${tableLegend()}<table class="cost-table mixed-table">
      <thead><tr>
        <th>序号</th><th>项目名称</th>
        <th class="text-right col-editable">送审金额(元)</th><th class="text-right col-editable">审定金额(元)</th>
        <th class="text-right col-calc">核增(元)</th><th class="text-right col-calc">核减(元)</th>
        <th class="text-right col-calc">增减金额(元)</th>
      </tr></thead><tbody>${rows.map((r) => `
        <tr class="${Math.abs(r.diff || 0) > 1000000 ? 'row-warn' : ''}">
          <td>${ro(r.seq)}</td><td>${ecWide(r.name)}</td>
          <td class="text-right">${ec(r.submit, '100px')}</td>
          <td class="text-right">${ec(r.audit, '100px')}</td>
          <td class="text-right text-danger">${ro(fmt(r.increase))}</td>
          <td class="text-right text-success">${ro(fmt(r.decrease))}</td>
          <td class="text-right ${diffClass(r.diff)}">${ro(fmt(r.diff))}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function renderBoqTable(rows) {
    return `<div class="table-wrap">${tableLegend()}<table class="cost-table mixed-table">
      <thead><tr>
        <th>编码</th><th>项目名称</th><th>单位</th>
        <th class="text-right col-editable">送审工程量</th><th class="text-right col-editable">送审单价</th><th class="text-right col-calc">送审合价</th>
        <th class="text-right col-editable">审定工程量</th><th class="text-right col-editable">审定单价</th><th class="text-right col-calc">审定合价</th>
        <th class="text-right col-calc">核增</th><th class="text-right col-calc">核减</th><th class="text-right col-calc">增减</th><th>说明</th>
      </tr></thead><tbody id="audit-boq-body">${rows.map((r, i) => `
        <tr data-row="${i}">
          <td>${ro(r.code)}</td><td style="min-width:120px">${ecWide(r.name)}</td><td>${ec(r.unit, '48px')}</td>
          <td class="text-right">${ec(r.submitQty, '72px')}</td>
          <td class="text-right">${ec(r.submitPrice, '64px')}</td>
          <td class="text-right">${ro(fmt(r.submitAmt))}</td>
          <td class="text-right"><input class="cell-input cell-editable cell-sm" data-row="${i}" data-field="auditQty" value="${r.auditQty}"></td>
          <td class="text-right"><input class="cell-input cell-editable cell-sm" data-row="${i}" data-field="auditPrice" value="${r.auditPrice}"></td>
          <td class="text-right audit-amt" data-row="${i}">${ro(fmt(r.auditAmt))}</td>
          <td class="text-right text-danger audit-inc" data-row="${i}">${ro(fmt(r.increase))}</td>
          <td class="text-right text-success audit-dec" data-row="${i}">${ro(fmt(r.decrease))}</td>
          <td class="text-right audit-diff ${diffClass(r.diff)}" data-row="${i}">${ro(fmt(r.diff))}</td>
          <td>${ecWide(r.note || '')}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function renderCostSystem(currentCostTab, bindActions, destroyCharts, chartInstances, onTabChange) {
    const ac = MOCK_DATA.auditCompare;
    const tv = MOCK_DATA.threeValueCompare;
    const acl = MOCK_DATA.actualCostList;

    document.getElementById('main-content').innerHTML = `
      <h1 class="page-title">成本测算子系统</h1>
      <p class="page-desc">工程审核对比表 · 三算对比表 · 实际成本清单 · 支持Excel导入与在线编辑核增核减</p>
      <div class="tabs" id="cost-tabs">
        <button class="tab-btn ${currentCostTab === 'audit' ? 'active' : ''}" data-tab="audit">① 工程审核对比表</button>
        <button class="tab-btn ${currentCostTab === 'three' ? 'active' : ''}" data-tab="three">② 三算对比表</button>
        <button class="tab-btn ${currentCostTab === 'actual' ? 'active' : ''}" data-tab="actual">③ 实际成本清单</button>
      </div>
      <div id="cost-tab-content"></div>`;

    document.querySelectorAll('#cost-tabs .tab-btn').forEach((btn) => {
      btn.onclick = () => {
        onTabChange?.(btn.dataset.tab);
        document.querySelectorAll('#cost-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderCostTabContent(btn.dataset.tab, bindActions, destroyCharts, chartInstances);
      };
    });
    renderCostTabContent(currentCostTab, bindActions, destroyCharts, chartInstances);
  }

  function renderJarvisEmbed() {
    const jv = MOCK_DATA.jarvisBim;
    return `
      <div class="jarvis-login-hint">
        <span>体验账号：<code>${jv.account}</code></span>
        <span>密码：<code>${jv.password}</code></span>
        <button class="btn btn-ghost btn-sm" data-action="copy-jarvis">复制账号信息</button>
      </div>
      <div class="iframe-wrap iframe-wrap-tall">
        <iframe src="${jv.url}" title="内部形象进度 Jarvis BIM" allow="fullscreen" referrerpolicy="no-referrer-when-downgrade"></iframe>
        <div class="iframe-fallback">若页面空白，可能因跨域限制；请使用上方账号在新窗口登录：<a href="${jv.url}" target="_blank" rel="noopener">${jv.url}</a></div>
      </div>`;
  }

  function renderCashflowReadonlyPanel(prefix, opts = {}) {
    const cf = MOCK_DATA.cashflowDetail;
    const may = cf.monthly.find((m) => m.month === '2026-05') || cf.monthly[4];
    const projectName = opts.projectName;
    const byProject = projectName
      ? cf.byProject.filter((p) => p.project.includes(projectName) || projectName.includes(p.project.replace('复建', '').slice(0, 2)))
      : cf.byProject;
    const title = opts.title || (projectName ? `${projectName} · 动态现金流（只读）` : '动态现金流测算（只读）');
    return `
      <div class="readonly-panel">
        <div class="readonly-badge">只读看板 · 数据来自商务部测算</div>
        <div class="grid grid-4" style="margin-bottom:16px">
          <div class="card stat-card"><div class="label">5月实际结余</div><div class="value">${may.actualBalance} <span class="unit">万</span></div></div>
          <div class="card stat-card"><div class="label">5月预测结余</div><div class="value">${may.forecastBalance} <span class="unit">万</span></div></div>
          <div class="card stat-card"><div class="label">预测偏差</div><div class="value ${may.actualBalance < may.forecastBalance ? 'text-danger' : 'text-success'}">${may.actualBalance - may.forecastBalance} <span class="unit">万</span></div></div>
          <div class="card stat-card"><div class="label">6月预测结余</div><div class="value text-danger">420 <span class="unit">万</span></div></div>
        </div>
        <div class="grid grid-2" style="margin-bottom:16px">
          <div class="card"><div class="card-header"><div class="card-title">${title} · 预测 vs 实际</div></div>
            <div class="chart-container"><canvas id="${prefix}-cf-compare"></canvas></div></div>
          <div class="card"><div class="card-header"><div class="card-title">收入 vs 支出（含预测收入·产值）</div></div>
            <div class="chart-container"><canvas id="${prefix}-cf-detail"></canvas></div></div>
        </div>
        <div class="card"><div class="card-header"><div class="card-title">月度现金流明细（万元）</div></div>
          <div class="table-wrap"><table class="cost-table readonly-table"><thead><tr>
            <th>月份</th><th>业主回款</th><th>分包支出</th><th>材料支出</th><th>人工支出</th><th>实际结余</th><th>预测结余</th><th>偏差</th><th>状态</th>
          </tr></thead><tbody>${cf.monthly.map((m) => {
            const dev = m.actualBalance != null ? m.actualBalance - m.forecastBalance : null;
            return `<tr class="${m.warn ? 'row-warn' : ''}"><td>${m.month}</td>
              <td class="text-right">${m.ownerPayment || '—'}</td><td class="text-right">${m.subcontract || '—'}</td>
              <td class="text-right">${m.material || '—'}</td><td class="text-right">${m.labor || '—'}</td>
              <td class="text-right">${m.actualBalance ?? '—'}</td><td class="text-right">${m.forecastBalance}</td>
              <td class="text-right ${dev != null && dev < 0 ? 'text-danger' : ''}">${dev != null ? (dev > 0 ? '+' : '') + dev : '—'}</td>
              <td>${m.warn ? '<span class="alert-tag alert-danger">预警</span>' : '正常'}</td></tr>`;
          }).join('')}</tbody></table></div>
        </div>
        ${byProject.length ? `<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title">各项目5月现金流（万元）</div></div>
          <div class="table-wrap"><table class="cost-table readonly-table"><thead><tr>
            <th>项目</th><th>业主回款</th><th>分包</th><th>材料</th><th>人工</th><th>结余</th><th>预测</th><th>回款率</th><th>状态</th>
          </tr></thead><tbody>${byProject.map((p) => `
            <tr class="${p.warn ? 'row-warn' : ''}"><td>${p.project}</td>
              <td class="text-right">${p.ownerPayment}</td><td class="text-right">${p.subcontract}</td>
              <td class="text-right">${p.material}</td><td class="text-right">${p.labor}</td>
              <td class="text-right">${p.balance}</td><td class="text-right">${p.forecast}</td>
              <td>${p.collectionRate}%</td>
              <td>${p.warn ? '<span class="alert-tag alert-danger">预警</span>' : '正常'}</td></tr>`).join('')}
          </tbody></table></div></div>` : ''}
      </div>`;
  }

  function initCashflowReadonlyCharts(prefix, chartInstances) {
    const cf = MOCK_DATA.cashflowDetail;
    const cmp = document.getElementById(`${prefix}-cf-compare`);
    if (cmp) {
      chartInstances.push(new Chart(cmp, {
        type: 'line',
        data: {
          labels: cf.monthly.map((m) => m.month),
          datasets: [
            { label: '实际结余', data: cf.monthly.map((m) => m.actualBalance), borderColor: '#52c41a', tension: 0.35, spanGaps: true },
            { label: '预测结余', data: cf.monthly.map((m) => m.forecastBalance), borderColor: '#1890ff', borderDash: [6, 4], tension: 0.35 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8ba3c7' } } },
          scales: { y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7' } } } }
      }));
    }
    const det = document.getElementById(`${prefix}-cf-detail`);
    if (det) {
      chartInstances.push(new Chart(det, {
        type: 'line',
        data: {
          labels: cf.monthly.map((m) => m.month),
          datasets: [
            { label: '实际收入', data: cf.monthly.map((m) => (m.ownerPayment || 0) + (m.otherIncome || 0)), borderColor: '#52c41a', tension: 0.3 },
            { label: '预测收入', data: cf.monthly.map((m) => m.forecastIncome || null), borderColor: '#73d13d', borderDash: [4, 4], tension: 0.3, spanGaps: true },
            { label: '确认产值', data: cf.monthly.map((m) => m.outputValue || null), borderColor: '#36cfc9', tension: 0.3, spanGaps: true },
            { label: '预测支出', data: cf.monthly.map((m) => m.forecastExpense), borderColor: '#ffc53d', borderDash: [5, 5], tension: 0.3 },
            { label: '实际支出', data: cf.monthly.map((m) => m.actualExpense), borderColor: '#ff7875', tension: 0.3, spanGaps: true }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8ba3c7' } } },
          scales: { y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7' } } } }
      }));
    }
  }

  function renderAerialGallery() {
    return MOCK_DATA.aerialPhotos.map((g) => `
      <div class="aerial-month">
        <div class="aerial-month-header">
          <h4>${g.label} · ${g.month}</h4>
          <span class="text-muted">${g.desc}</span>
          ${g.aiCompare ? `<div class="ai-tag">🤖 AI对比 ${g.compareWith} → ${g.label}：${g.aiSummary}</div>` : ''}
        </div>
        <div class="photo-grid">${g.photos.map((p) => {
          const markers = g.annotations?.[p] || [];
          return `<div class="photo-item photo-ai" data-action="view-photo"
            data-src="assets/aerial/${p}" data-caption="${g.label} - ${g.desc}"
            data-photo="${p}" data-month="${g.month}">
            <img src="assets/aerial/${p}" alt="${g.label}" loading="lazy">
            ${markers.map((m) => `<div class="ai-marker marker-${m.type}" style="left:${m.x}%;top:${m.y}%" title="${m.label}"><span>${m.label}</span></div>`).join('')}
            <div class="photo-overlay">${g.label}${g.aiCompare ? ' · AI已标注' : ''}</div>
          </div>`;
        }).join('')}
        </div>
      </div>`).join('');
  }

  function renderCostTabContent(tab, bindActions, destroyCharts, chartInstances) {
    const content = document.getElementById('cost-tab-content');
    if (!content) return;
    const ac = MOCK_DATA.auditCompare;
    const tv = MOCK_DATA.threeValueCompare;
    const acl = MOCK_DATA.actualCostList;
    destroyCharts();

    if (tab === 'audit') {
      if (!ac || !ac.units) {
        content.innerHTML = '<div class="info-banner">工程审核对比数据加载失败，请刷新页面重试。</div>';
        bindActions();
        return;
      }
      const unit = ac.units[auditUnitId] || ac.units.basement || Object.values(ac.units)[0];
      if (!unit) {
        content.innerHTML = '<div class="info-banner">暂无该单位工程审核数据，请选择其他单位工程。</div>';
        bindActions();
        return;
      }
      content.innerHTML = `
        <div class="info-banner">依据<strong>广联达造价表 + 施工深化图纸</strong>进行审核对比，自动计算核增/核减。地下室仅为单位工程之一。</div>
        <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" style="width:auto" data-action="import-excel">📥 导入Excel（地下室工程模板）</button>
          <button class="btn btn-ghost btn-sm" data-action="recalc-audit">🔄 重新计算核增核减</button>
          <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="工程审核对比表" data-format="Excel">📤 导出</button>
          <select id="audit-unit-select" class="select-dark">${ac.projectList.map((p) =>
            `<option value="${p.id}" ${p.id === auditUnitId ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
        </div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><div class="card-title">总表 · 各单项工程审核汇总</div></div>
          ${renderAuditSummaryTable(ac.masterSummary)}
        </div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><div class="card-title">单位工程审核对比表 · ${unit.name}</div>
            <div class="card-subtitle">金额单位：元 · 可直接编辑</div></div>
          ${renderAuditSummaryTable(unit.summary)}
        </div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><div class="card-title">分部分项清单对比明细（可编辑审定工程量/单价）</div></div>
          ${renderBoqTable(unit.boq)}
          <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">修改审定工程量或单价后点击「重新计算」自动更新合价与核增核减</div>
        </div>
        ${(unit.ownerVsAudit && unit.ownerVsAudit.length) ? `<div class="card">
          <div class="card-header"><div class="card-title">业主广联达算量 vs 我方审核量对比</div></div>
          <div class="table-wrap"><table class="cost-table"><thead><tr>
            <th>清单项</th><th>单位</th><th>业主工程量</th><th>业主合价</th>
            <th>审核工程量</th><th>审核合价</th><th>量差</th><th>增减</th><th>说明</th>
          </tr></thead><tbody>${unit.ownerVsAudit.map((o) => `
            <tr><td>${ecWide(o.item)}</td><td>${ec(o.unit, '48px')}</td>
              <td class="text-right">${ec(o.ownerQty, '72px')}</td><td class="text-right">${ec(o.ownerAmt, '80px')}</td>
              <td class="text-right">${ec(o.auditQty, '72px')}</td><td class="text-right">${ec(o.auditAmt, '80px')}</td>
              <td class="${o.qtyDiff ? 'text-warning' : ''}">${ro(o.qtyDiff || '—')}</td>
              <td class="${diffClass(o.diff)}">${ro(fmt(o.diff))}</td><td>${ecWide(o.note)}</td></tr>`).join('')}
          </tbody></table></div></div>` : ''}`;

      document.getElementById('audit-unit-select').onchange = (e) => {
        auditUnitId = e.target.value;
        renderCostTabContent('audit', bindActions, destroyCharts, chartInstances);
      };
      bindAuditCalc(unit);
    } else if (tab === 'three') {
      content.innerHTML = `
        <div class="info-banner">三算对比：<strong>招标控制价 → 中标合同价 → 内部测算成本</strong>，并对比<strong>实际成本/实际利润</strong>，差异项自动标注分析。金额单位：万元。</div>
        <div style="display:flex;gap:12px;margin-bottom:16px">
          <button class="btn btn-primary btn-sm" style="width:auto" data-action="import-excel">📥 导入三算对比Excel</button>
          <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="三算对比表" data-format="Excel">📤 导出</button>
        </div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><div class="card-title">三算对比总表</div></div>
          <div class="table-wrap">${tableLegend()}<table class="cost-table mixed-table"><thead><tr>
            <th>费用项目</th>
            <th class="col-editable">招标控制价</th><th class="col-editable">中标合同价</th><th class="col-editable">内部成本</th>
            <th class="col-calc">测算利润</th><th class="col-calc">测算利润率</th>
            <th class="col-editable">实际成本</th><th class="col-calc">实际利润</th><th class="col-calc">实际利润率</th>
            <th class="col-calc">差异</th><th class="col-editable">分析</th>
          </tr></thead><tbody>${tv.summary.map((r) => `
            <tr class="${r.warn ? 'row-warn' : ''}">
              <td>${ecWide(r.name)}</td>
              <td class="text-right">${ec(r.tender, '80px')}</td><td class="text-right">${ec(r.contract, '80px')}</td>
              <td class="text-right">${ec(r.internalCost, '80px')}</td>
              <td class="text-right">${ro(fmtWan(r.profit))}</td>
              <td class="text-right ${r.profitRate < MOCK_DATA.profitRedLine ? 'text-danger' : 'text-success'}">${ro(r.profitRate, { suffix: '%' })}</td>
              <td class="text-right">${ec(r.actualCost, '80px')}</td>
              <td class="text-right ${r.actualProfit < 0 ? 'text-danger' : ''}">${ro(fmtWan(r.actualProfit))}</td>
              <td class="text-right ${r.actualRate < MOCK_DATA.profitRedLine ? 'text-danger' : 'text-success'}">${ro(r.actualRate, { suffix: '%' })}</td>
              <td class="text-right ${r.variance < 0 ? 'text-danger' : r.variance > 0 ? 'text-success' : ''}">${ro((r.variance > 0 ? '+' : '') + r.variance, { suffix: '%' })}</td>
              <td style="font-size:12px;max-width:200px">${ecWide(r.analysis || '')}</td>
            </tr>`).join('')}
          </tbody></table></div>
          <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">目标利润率红线 ${MOCK_DATA.profitRedLine}% · 业主给予总包利润 ${MOCK_DATA.ownerProfitRate}%</div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">分部明细 · 
            <select id="three-detail-select" class="select-dark" style="display:inline-block;width:auto">${Object.keys(tv.details).map((k) => {
              const label = tv.summary.find((s) => s.id === k)?.name?.trim() || k;
              return `<option value="${k}" ${k === threeDetailId ? 'selected' : ''}>${label}</option>`;
            }).join('')}</select>
          </div></div>
          <div class="table-wrap">${tableLegend()}<table class="cost-table mixed-table"><thead><tr>
            <th>分部/分项</th><th class="col-editable">招标控制价</th><th class="col-editable">中标合同价</th><th class="col-editable">内部成本</th><th class="col-editable">实际成本</th><th class="col-calc">差异(万)</th><th class="col-editable">具体分析</th>
          </tr></thead><tbody>${(tv.details[threeDetailId] || []).map((d) => `
            <tr class="${d.variance > 50 ? 'row-warn' : ''}">
              <td>${ecWide(d.name)}</td><td class="text-right">${ec(d.tender, '80px')}</td><td class="text-right">${ec(d.contract, '80px')}</td>
              <td class="text-right">${ec(d.internalCost, '80px')}</td><td class="text-right">${ec(d.actualCost, '80px')}</td>
              <td class="text-right ${d.variance > 0 ? 'text-danger' : ''}">${ro(fmt(d.variance))}</td>
              <td style="font-size:12px">${ecWide(d.analysis)}</td>
            </tr>`).join('')}
          </tbody></table></div>
        </div>`;
      document.getElementById('three-detail-select').onchange = (e) => {
        threeDetailId = e.target.value;
        renderCostTabContent('three', bindActions, destroyCharts, chartInstances);
      };
    } else if (tab === 'actual') {
      content.innerHTML = `
        <div class="info-banner">实际成本清单：分包子项预算 vs 实际中标价，材料采购明细。参考《中标工程量清单》。</div>
        <div class="tabs" style="margin-bottom:16px">
          <button class="tab-btn active" data-atab="sub">专业分包</button>
          <button class="tab-btn" data-atab="mat">材料采购</button>
          <button class="tab-btn" data-atab="bid">中标工程量清单</button>
        </div>
        <div id="actual-tab-body">
          <div class="card"><div class="card-header"><div class="card-title">专业分包实际成本</div></div>
          <div class="table-wrap">${tableLegend()}<table class="cost-table mixed-table"><thead><tr>
            <th>编号</th><th>分包项目</th><th>供应商</th><th>分包范围</th><th>分包内容</th>
            <th class="col-editable">预算价(万)</th><th class="col-editable">实际中标价(万)</th><th class="col-calc">价差</th><th class="col-editable">已付(万)</th><th>状态</th>
          </tr></thead><tbody>${acl.subcontracts.map((s) => {
            const diff = s.actualBidPrice - s.budgetPrice;
            return `<tr class="${diff > 0 ? 'row-warn' : ''}"><td>${ro(s.id)}</td><td>${ecWide(s.name)}</td>
              <td>${ecWide(s.supplier)}</td><td style="font-size:12px">${ecWide(s.scope)}</td><td style="font-size:12px">${ecWide(s.content)}</td>
              <td class="text-right">${ec(s.budgetPrice, '72px')}</td><td class="text-right">${ec(s.actualBidPrice, '72px')}</td>
              <td class="text-right ${diff > 0 ? 'text-danger' : 'text-success'}">${ro((diff > 0 ? '+' : '') + diff)}</td>
              <td class="text-right">${ec(s.paid, '64px')}</td><td>${ecWide(s.status)}</td></tr>`;
          }).join('')}</tbody></table></div></div>
        </div>`;

      document.querySelectorAll('[data-atab]').forEach((btn) => {
        btn.onclick = () => {
          document.querySelectorAll('[data-atab]').forEach((b) => b.classList.toggle('active', b === btn));
          const t = btn.dataset.atab;
          const body = document.getElementById('actual-tab-body');
          if (t === 'sub') {
            body.innerHTML = document.querySelector('#actual-tab-body').innerHTML; // keep - re-render below
          }
          if (t === 'mat') {
            body.innerHTML = `<div class="card"><div class="card-header"><div class="card-title">材料采购实际成本</div></div>
              <div class="table-wrap">${tableLegend()}<table class="cost-table mixed-table"><thead><tr>
                <th>编号</th><th>材料</th><th>供应商</th><th>采购内容</th><th>单位</th>
                <th class="col-editable">预算量</th><th class="col-editable">预算价</th><th class="col-editable">实际量</th><th class="col-editable">实际价</th><th class="col-calc">已采购</th><th>状态</th>
              </tr></thead><tbody>${acl.materials.map((m) => `
                <tr class="${m.warn ? 'row-warn' : ''}"><td>${ro(m.id)}</td><td>${ecWide(m.name)}</td><td>${ecWide(m.supplier)}</td>
                  <td style="font-size:12px">${ecWide(m.content)}</td><td>${ec(m.unit, '48px')}</td>
                  <td class="text-right">${ec(m.budgetQty, '72px')}</td><td class="text-right">${ec(m.budgetPrice, '64px')}</td>
                  <td class="text-right ${m.warn ? 'text-danger' : ''}">${ec(m.actualQty, '72px')}</td>
                  <td class="text-right">${ec(m.actualPrice, '64px')}</td>
                  <td class="text-right">${ro(fmt(m.purchased))}</td>
                  <td>${m.warn ? '<span class="alert-tag alert-danger">超量</span>' : ro('正常')}</td></tr>`).join('')}
              </tbody></table></div></div>`;
          } else if (t === 'bid') {
            body.innerHTML = `<div class="card"><div class="card-header"><div class="card-title">中标工程量清单 · 广州浚凯土石方工程</div></div>
              <div class="table-wrap">${tableLegend()}<table class="cost-table mixed-table"><thead><tr>
                <th>序号</th><th>项目名称</th><th>单位</th><th class="col-editable">数量</th><th class="col-editable">不含税单价</th><th class="col-calc">不含税合价</th><th>税率</th><th>类型</th><th>供应商</th>
              </tr></thead><tbody>${acl.bidBoq.map((b) => `
                <tr><td>${ro(b.seq)}</td><td>${ecWide(b.name)}</td><td>${ec(b.unit, '48px')}</td><td class="text-right">${ec(b.qty, '80px')}</td>
                  <td class="text-right">${ec(b.priceNoTax, '72px')}</td><td class="text-right">${ro(fmt(b.totalNoTax))}</td>
                  <td>${ec(b.tax, '48px')}</td><td><span class="tag tag-pilot">${b.type}</span></td><td>${ecWide(b.supplier)}</td></tr>`).join('')}
              <tr style="font-weight:600"><td colspan="5">不含税小计</td><td class="text-right">${ro('7,190,000')}</td><td colspan="3"></td></tr>
              </tbody></table></div></div>`;
          }
          bindActions();
        };
      });
    }
    bindActions();
  }

  function bindAuditCalc(unit) {
    const recalc = () => {
      unit.boq.forEach((r, i) => {
        const qtyEl = document.querySelector(`input[data-row="${i}"][data-field="auditQty"]`);
        const priceEl = document.querySelector(`input[data-row="${i}"][data-field="auditPrice"]`);
        if (!qtyEl || !priceEl) return;
        const auditQty = parseFloat(qtyEl.value) || 0;
        const auditPrice = parseFloat(priceEl.value) || 0;
        r.auditQty = auditQty;
        r.auditPrice = auditPrice;
        r.auditAmt = auditQty * auditPrice;
        const diff = r.auditAmt - r.submitAmt;
        r.diff = diff;
        r.increase = diff > 0 ? diff : 0;
        r.decrease = diff < 0 ? Math.abs(diff) : 0;
        const amtEl = document.querySelector(`.audit-amt[data-row="${i}"]`);
        const diffEl = document.querySelector(`.audit-diff[data-row="${i}"]`);
        const incEl = document.querySelector(`.audit-inc[data-row="${i}"]`);
        const decEl = document.querySelector(`.audit-dec[data-row="${i}"]`);
        if (amtEl) amtEl.textContent = fmt(r.auditAmt);
        if (diffEl) { diffEl.textContent = fmt(r.diff); diffEl.className = `text-center audit-diff ${diffClass(r.diff)}`; }
        if (incEl) incEl.textContent = fmt(r.increase);
        if (decEl) decEl.textContent = fmt(r.decrease);
      });
    };
    document.querySelectorAll('#audit-boq-body input').forEach((inp) => {
      inp.onchange = recalc;
    });
    document.querySelector('[data-action="recalc-audit"]')?.addEventListener('click', () => {
      recalc();
      if (window.showToast) window.showToast('核增核减已重新计算');
    });
  }

  function renderSupplierSystem(bindActions) {
    const data = typeof SUPPLIER_DATA !== 'undefined' ? SUPPLIER_DATA : { labor: [], material: [] };
    const list = data[supplierTab] || [];
    const totalPages = Math.ceil(list.length / PAGE_SIZE);
    const page = Math.min(supplierPage, totalPages || 1);
    const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    document.getElementById('main-content').innerHTML = `
      <h1 class="page-title">黄埔项目群分供商名录</h1>
      <p class="page-desc">来源：附件6《黄埔项目群分供商名录》· 专业劳务 ${data.labor.length} 家 · 材料设备 ${data.material.length} 家</p>
      <div class="tabs" id="supplier-tabs">
        <button class="tab-btn ${supplierTab === 'labor' ? 'active' : ''}" data-stab="labor">专业劳务分供商 (${data.labor.length})</button>
        <button class="tab-btn ${supplierTab === 'material' ? 'active' : ''}" data-stab="material">材料设备供应商 (${data.material.length})</button>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" style="width:auto" data-action="import-excel">📥 Excel导入</button>
        <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="供应商库台账" data-format="Excel">📤 导出</button>
        <input type="text" id="supplier-search" placeholder="搜索单位名称/产品/联系人..." style="flex:1;min-width:200px;padding:8px 12px;background:var(--bg-dark);border:1px solid var(--border);border-radius:8px;color:var(--text)">
      </div>
      <div class="card">${tableLegend()}<div class="table-wrap"><table class="cost-table mixed-table">
        <thead><tr>
          ${supplierTab === 'labor'
            ? '<th>序号</th><th class="col-editable">单位名称</th><th class="col-editable">法人</th><th class="col-editable">实控老板</th><th class="col-editable">联系人</th><th class="col-editable">电话</th><th class="col-editable">资质类型</th><th class="col-editable">资质等级</th><th class="col-editable">推荐部门</th><th class="col-editable">入库</th><th class="col-editable">备注</th><th class="col-editable">使用部位</th>'
            : '<th>序号</th><th class="col-editable">单位名称</th><th class="col-editable">法人</th><th class="col-editable">实控老板</th><th class="col-editable">联系人</th><th class="col-editable">电话</th><th class="col-editable">供应类型</th><th class="col-editable">资质等级</th><th class="col-editable">推荐部门</th><th class="col-editable">入库</th><th class="col-editable">备注</th>'}
        </tr></thead>
        <tbody id="supplier-tbody">${slice.map((s) => supplierTab === 'labor' ? `
          <tr><td>${ro(s.seq)}</td><td>${ecWide(s.name)}</td><td>${ecWide(s.legalPerson)}</td><td>${ecWide(s.controller)}</td>
            <td>${ecWide(s.contact)}</td><td>${ec(s.phone, '100px')}</td><td style="font-size:12px">${ecWide(s.qualType)}</td><td>${ecWide(s.qualLevel)}</td>
            <td>${ecWide(s.recommendDept)}</td><td>${ecWide(s.storage)}</td>
            <td>${ecWide(s.remark)}</td><td>${ecWide(s.usage)}</td></tr>` : `
          <tr><td>${ro(s.seq)}</td><td>${ecWide(s.name)}</td><td>${ecWide(s.legalPerson)}</td><td>${ecWide(s.controller)}</td>
            <td>${ecWide(s.contact)}</td><td>${ec(s.phone, '100px')}</td><td style="font-size:12px;max-width:180px">${ecWide(s.supplyType)}</td><td>${ecWide(s.qualLevel)}</td>
            <td>${ecWide(s.recommendDept)}</td><td>${ecWide(s.storage)}</td><td>${ecWide(s.remark)}</td></tr>`).join('')}
        </tbody></table></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:13px;color:var(--text-muted)">
          <span>共 ${list.length} 条 · 第 ${page}/${totalPages} 页</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" id="sup-prev" ${page <= 1 ? 'disabled' : ''}>上一页</button>
            <button class="btn btn-ghost btn-sm" id="sup-next" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
          </div>
        </div>
      </div>`;

    document.querySelectorAll('#supplier-tabs .tab-btn').forEach((btn) => {
      btn.onclick = () => { supplierTab = btn.dataset.stab; supplierPage = 1; renderSupplierSystem(bindActions); };
    });
    document.getElementById('sup-prev')?.addEventListener('click', () => { if (supplierPage > 1) { supplierPage--; renderSupplierSystem(bindActions); } });
    document.getElementById('sup-next')?.addEventListener('click', () => { if (supplierPage < totalPages) { supplierPage++; renderSupplierSystem(bindActions); } });
    bindActions();
  }

  function renderCashflowDetail(bindActions, destroyCharts, chartInstances) {
    const cf = MOCK_DATA.cashflowDetail;
    const may = cf.monthly.find((m) => m.month === '2026-05') || cf.monthly[4];
    document.getElementById('main-content').innerHTML = `
      <h1 class="page-title">动态现金流测算</h1>
      <p class="page-desc">商务部核心关注 · 预测 vs 实际对比 · 分项支出明细 · 敏感性分析 · 临界值 ${cf.criticalBalance} 万预警</p>
      <div class="grid grid-4" style="margin-bottom:24px">
        <div class="card stat-card"><div class="label">5月实际结余</div><div class="value">${may.actualBalance} <span class="unit">万</span></div></div>
        <div class="card stat-card"><div class="label">5月预测结余</div><div class="value">${may.forecastBalance} <span class="unit">万</span></div></div>
        <div class="card stat-card"><div class="label">预测偏差</div><div class="value ${may.actualBalance < may.forecastBalance ? 'text-danger' : 'text-success'}">${may.actualBalance - may.forecastBalance} <span class="unit">万</span></div></div>
        <div class="card stat-card"><div class="label">6月预测结余</div><div class="value text-danger">420 <span class="unit">万</span></div>
          <div class="trend trend-warn">关注回款节点</div></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">预测 vs 实际结余曲线（万元）</div></div>
        <div class="chart-container chart-tall"><canvas id="chart-cashflow-compare"></canvas></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">收入 vs 支出对比（含预测收入·产值）（万元）</div></div>
        <div class="chart-container"><canvas id="chart-cashflow-detail"></canvas></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">测算假设</div></div>
        <ul style="font-size:13px;color:var(--text-muted);padding-left:20px;line-height:2">${cf.assumptions.map((a) => `<li>${a}</li>`).join('')}</ul>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">月度现金流明细（万元 · 可编辑）</div>
          <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="动态现金流预测表" data-format="Excel">导出</button></div>
        <div class="table-wrap">${tableLegend()}<table class="cost-table mixed-table"><thead><tr>
          <th>月份</th>
          <th class="col-editable">业主回款</th><th class="col-editable">其他收入</th><th class="col-editable">分包支出</th><th class="col-editable">材料支出</th>
          <th class="col-editable">人工支出</th><th class="col-editable">管理费</th><th class="col-editable">税金</th>
          <th class="col-calc">实际结余</th><th class="col-editable">预测结余</th><th class="col-calc">偏差</th><th>状态</th>
        </tr></thead><tbody>${cf.monthly.map((m) => {
          const dev = m.actualBalance != null ? m.actualBalance - m.forecastBalance : null;
          return `<tr class="${m.warn ? 'row-warn' : ''}"><td>${ro(m.month)}</td>
            <td class="text-right">${ec(m.ownerPayment || '', '72px')}</td><td class="text-right">${ec(m.otherIncome || '', '64px')}</td>
            <td class="text-right">${ec(m.subcontract || '', '72px')}</td><td class="text-right">${ec(m.material || '', '72px')}</td>
            <td class="text-right">${ec(m.labor || '', '64px')}</td><td class="text-right">${ec(m.manage || '', '64px')}</td>
            <td class="text-right">${ec(m.tax || '', '56px')}</td>
            <td class="text-right">${m.actualBalance != null ? ro(m.actualBalance) : ro('—')}</td>
            <td class="text-right">${ec(m.forecastBalance, '72px')}</td>
            <td class="text-right ${dev != null && dev < 0 ? 'text-danger' : dev > 0 ? 'text-success' : ''}">${dev != null ? ro((dev > 0 ? '+' : '') + dev) : ro('—')}</td>
            <td>${m.warn ? '<span class="alert-tag alert-danger">预警</span>' : ro('正常')}</td></tr>`;
        }).join('')}
        </tbody></table></div>
      </div>
      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card"><div class="card-header"><div class="card-title">各项目5月现金流（万元）</div></div>
          <div class="table-wrap"><table class="cost-table"><thead><tr>
            <th>项目</th><th>业主回款</th><th>分包</th><th>材料</th><th>人工</th><th>结余</th><th>回款率</th><th>状态</th>
          </tr></thead>          <tbody>${cf.byProject.map((p) => `
            <tr class="${p.warn ? 'row-warn' : ''}"><td>${ecWide(p.project)}</td>
              <td class="text-right">${ec(p.ownerPayment, '72px')}</td><td class="text-right">${ec(p.subcontract, '72px')}</td>
              <td class="text-right">${ec(p.material, '72px')}</td><td class="text-right">${ec(p.labor, '64px')}</td>
              <td class="text-right">${ec(p.balance, '72px')}</td><td>${ec(p.collectionRate, '56px')}%</td>
              <td>${p.warn ? '<span class="alert-tag alert-danger">预警</span>' : '正常'}</td></tr>`).join('')}
          </tbody></table></div></div>
        <div class="card"><div class="card-header"><div class="card-title">敏感性分析 · 6月预测结余</div></div>
          <div class="table-wrap"><table class="cost-table"><thead><tr><th>情景</th><th>预测结余(万)</th><th>说明</th></tr></thead>
          <tbody>${cf.sensitivity.map((s) => `
            <tr class="${s.junForecast < cf.criticalBalance ? 'row-warn' : ''}">
              <td>${ecWide(s.scenario)}</td><td class="text-right ${s.junForecast < cf.criticalBalance ? 'text-danger' : ''}">${ec(s.junForecast, '72px')}</td>
              <td style="font-size:12px">${ecWide(s.desc)}</td></tr>`).join('')}
          </tbody></table></div></div>
      </div>`;

    const cmpCtx = document.getElementById('chart-cashflow-compare');
    if (cmpCtx) {
      chartInstances.push(new Chart(cmpCtx, {
        type: 'line',
        data: {
          labels: cf.monthly.map((m) => m.month),
          datasets: [
            { label: '实际结余', data: cf.monthly.map((m) => m.actualBalance), borderColor: '#52c41a', backgroundColor: 'rgba(82,196,26,0.1)', fill: true, tension: 0.35, spanGaps: true },
            { label: '预测结余', data: cf.monthly.map((m) => m.forecastBalance), borderColor: '#1890ff', borderDash: [6, 4], tension: 0.35, fill: false },
            { label: '临界预警线', data: cf.monthly.map(() => cf.criticalBalance), borderColor: '#ff4d4f', borderDash: [2, 2], pointRadius: 0, tension: 0 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8ba3c7' } } },
          scales: { y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7' } } } }
      }));
    }
    const ctx = document.getElementById('chart-cashflow-detail');
    if (ctx) {
      chartInstances.push(new Chart(ctx, {
        type: 'line',
        data: {
          labels: cf.monthly.map((m) => m.month),
          datasets: [
            { label: '实际收入', data: cf.monthly.map((m) => (m.ownerPayment || 0) + (m.otherIncome || 0)), borderColor: '#52c41a', tension: 0.3 },
            { label: '预测收入', data: cf.monthly.map((m) => m.forecastIncome || null), borderColor: '#73d13d', borderDash: [4, 4], tension: 0.3, spanGaps: true },
            { label: '确认产值', data: cf.monthly.map((m) => m.outputValue || null), borderColor: '#36cfc9', tension: 0.3, spanGaps: true },
            { label: '预测支出', data: cf.monthly.map((m) => m.forecastExpense), borderColor: '#ffc53d', borderDash: [5, 5], tension: 0.3 },
            { label: '实际支出', data: cf.monthly.map((m) => m.actualExpense), borderColor: '#ff7875', tension: 0.3, spanGaps: true }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8ba3c7' } } },
          scales: { y: { grid: { color: '#1e3a5f' }, ticks: { color: '#8ba3c7' } }, x: { ticks: { color: '#8ba3c7' } } } }
      }));
    }
    bindActions();
  }

  let progressModuleTab = 'license';

  function getAllLicenses() {
    return MOCK_DATA.projects.flatMap((p) => {
      const detail = MOCK_DATA.projectDetails[p.id] || MOCK_DATA.projectDetails.xl_fj01;
      return detail.licenses.map((l) => ({ project: p.name, ...l }));
    });
  }

  function renderJarvisPortal() {
    return renderJarvisEmbed();
  }

  function renderProgressLicenseTable(opts = {}) {
    const readonly = opts.readonly;
    return `<div class="card">${readonly ? '<div class="readonly-badge" style="margin-bottom:12px">只读看板 · 数据自动同步</div>' : tableLegend()}
      <div class="table-wrap"><table class="cost-table ${readonly ? 'readonly-table' : 'mixed-table'}"><thead><tr>
        <th>项目</th><th${readonly ? '' : ' class="col-editable"'}>证照</th><th${readonly ? '' : ' class="col-editable"'}>状态</th><th${readonly ? '' : ' class="col-editable"'}>完成时间</th><th${readonly ? '' : ' class="col-editable"'}>时限</th>
      </tr></thead><tbody>${getAllLicenses().map((l) => `<tr class="${l.warn ? 'row-warn' : ''}">
        <td>${ro(l.project)}</td><td>${readonly ? ro(l.name) : ecWide(l.name)}</td>
        <td>${readonly ? ro(l.status === 'done' ? '已完成' : '办理中') : ec(l.status === 'done' ? '已完成' : '办理中', '80px')}</td>
        <td>${readonly ? ro(l.date) : ec(l.date, '100px')}</td><td class="${l.warn ? 'text-warning' : ''}">${readonly ? ro(l.deadline) : ec(l.deadline, '100px')}</td>
      </tr>`).join('')}</tbody></table></div></div>`;
  }

  let progressConstructionProjectId = MOCK_DATA.progressSystem?.defaultProjectId || 'xl_fj01';

  function renderProgressConstructionTables(ps) {
    const pid = progressConstructionProjectId;
    const milestones = ps.milestonesByProject?.[pid] || [];
    const wbs = ps.wbsByProject?.[pid] || [];
    const project = MOCK_DATA.projects.find((p) => p.id === pid);

    return `
      <div class="progress-proj-toolbar card" style="padding:12px 16px;margin-bottom:16px">
        <label>施工项目
          <select id="prog-construct-project" class="select-dark">${MOCK_DATA.projects.map((p) =>
            `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
        </label>
        <span class="text-muted" style="font-size:12px;margin-left:12px">整体进度 ${project?.progress ?? '—'}% · 滞后节点 ${project?.lagNodes ?? 0} 个</span>
      </div>
      <div class="section-block">
        <h3 class="section-heading">里程碑计划</h3>
        <div class="card">${ProgressGantt.renderMilestones(milestones)}</div>
      </div>
      <div class="section-block">
        <h3 class="section-heading">WBS 活动计划 · 自动甘特图</h3>
        <div class="card gantt-card">${ProgressGantt.render(wbs)}</div>
        <div class="card" style="margin-top:12px">${tableLegend()}
          <div class="table-wrap"><table class="cost-table mixed-table"><thead><tr>
            <th>WBS</th><th class="col-editable">活动名称</th><th class="col-editable">开始</th><th class="col-editable">结束</th><th class="col-calc">完成%</th><th>关键路径</th>
          </tr></thead><tbody>${wbs.map((a) => `<tr>
            <td>${ro(a.wbs)}</td><td>${ecWide(a.name)}</td><td>${ec(a.start, '100px')}</td><td>${ec(a.end, '100px')}</td>
            <td>${ro(a.progress + '%')}</td>
            <td>${a.isCritical ? '<span class="gantt-cp-tag">是</span>' : '—'}</td>
          </tr>`).join('')}</tbody></table></div>
        </div>
      </div>
      <div class="section-block"><h3 class="section-heading">全项目施工里程碑汇总</h3>
        <div class="card">${tableLegend()}<div class="table-wrap"><table class="cost-table mixed-table"><thead><tr>
          <th>项目</th><th class="col-editable">节点</th><th class="col-editable">计划</th><th class="col-editable">实际</th><th class="col-calc">完成率</th><th>状态</th>
        </tr></thead><tbody>${ps.constructionNodes.map((n) => `<tr>
          <td>${ro(n.project)}</td><td>${ecWide(n.node)}</td><td>${ec(n.plan, '100px')}</td>
          <td class="${n.status === 'lag' ? 'text-warning' : ''}">${ec(n.actual, '100px')}</td>
          <td>${ro(n.rate + '%')}</td>
          <td>${n.status === 'lag' ? '<span class="alert-tag alert-warning">滞后' + n.lagDays + '天</span>' : n.status === 'done' ? '<span class="tag tag-normal">完成</span>' : n.status === 'doing' ? '<span class="tag tag-pilot">进行中</span>' : '待开始'}</td>
        </tr>`).join('')}</tbody></table></div></div>
      </div>
      <div class="section-block"><h3 class="section-heading">设计出图进度（关联）</h3>
        <div class="card"><div class="table-wrap"><table class="cost-table mixed-table"><thead><tr>
          <th>项目</th><th>专业</th><th>计划</th><th>实际</th><th>完成率</th><th>状态</th>
        </tr></thead><tbody>${ps.drawingPlan.filter((d) => d.project === project?.name).map((d) => `<tr>
          <td>${ro(d.project)}</td><td>${d.major}</td><td>${d.planDate}</td>
          <td class="${d.status === 'lag' ? 'text-warning' : ''}">${d.actualDate}</td>
          <td>${d.rate}%</td>
          <td>${d.status === 'lag' ? '<span class="alert-tag alert-warning">滞后</span>' : d.status === 'done' ? '<span class="tag tag-normal">完成</span>' : '<span class="tag tag-pilot">进行中</span>'}</td>
        </tr>`).join('')}</tbody></table></div></div>
      </div>`;
  }

  function renderProgressImageSection() {
    const imageBlocks = `
      <div class="section-block">
        <h3 class="section-heading">内部形象进度</h3>
        <div class="card">${renderJarvisEmbed()}</div>
      </div>
      <div class="section-block">
        <h3 class="section-heading">外部形象进度</h3>
        <div class="card">
          <div class="card-header">
            <div class="card-subtitle">航拍 AI 对比 · 标注新增/变化区域 · 每月更新保留历史</div>
            <button class="btn btn-ghost btn-sm" data-action="ai-compare">🤖 运行AI对比分析</button>
            <button class="btn btn-ghost btn-sm" data-action="upload-aerial">上传本月航拍</button>
          </div>
          ${renderAerialGallery()}
        </div>
      </div>`;
    return BusinessModules.renderSafetyImageSection(imageBlocks, MOCK_DATA.projectDetails.xl_fj01.inspections, { editable: true });
  }

  function renderProgressWithJarvis(bindActions, destroyCharts, chartInstances) {
    const ps = MOCK_DATA.progressSystem;
    document.getElementById('main-content').innerHTML = `
      <h1 class="page-title">施工进度管控</h1>
      <p class="page-desc">工程技术部核心关注 · ${ps.syncStatus} · 同步方式：${ps.fallbackMethod}</p>
      <div class="info-banner">最后导入：${ps.lastImport} · 接口打通前支持 Excel 表格导入识别</div>
      <div class="tabs" id="progress-module-tabs">
        <button class="tab-btn ${progressModuleTab === 'license' ? 'active' : ''}" data-ptab="license">证照办理计划与进度</button>
        <button class="tab-btn ${progressModuleTab === 'construction' ? 'active' : ''}" data-ptab="construction">施工计划与进度</button>
        <button class="tab-btn ${progressModuleTab === 'output' ? 'active' : ''}" data-ptab="output">产值计划与进度</button>
        <button class="tab-btn ${progressModuleTab === 'image' ? 'active' : ''}" data-ptab="image">安全巡检与形象进度</button>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" style="width:auto" data-action="import-excel">📥 导入进度Excel</button>
        <button class="btn btn-ghost btn-sm" data-action="export-report" data-name="施工进度报表" data-format="Excel">📤 导出</button>
      </div>
      <div id="progress-module-content"></div>`;

    const renderProgressTab = () => {
      destroyCharts();
      const box = document.getElementById('progress-module-content');
      if (progressModuleTab === 'license') box.innerHTML = renderProgressLicenseTable();
      else if (progressModuleTab === 'construction') {
        box.innerHTML = renderProgressConstructionTables(ps);
        const sel = document.getElementById('prog-construct-project');
        if (sel) {
          sel.onchange = () => {
            progressConstructionProjectId = sel.value;
            renderProgressTab();
          };
        }
      } else if (progressModuleTab === 'output') {
        box.innerHTML = BusinessModules.renderProgressOutputSection(ps);
        BusinessModules.initProgressOutputCharts(chartInstances);
      } else box.innerHTML = renderProgressImageSection();
      bindActions();
    };

    document.querySelectorAll('#progress-module-tabs .tab-btn').forEach((btn) => {
      btn.onclick = () => {
        progressModuleTab = btn.dataset.ptab;
        document.querySelectorAll('#progress-module-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderProgressTab();
      };
    });
    renderProgressTab();
  }

  return {
    renderCostSystem,
    renderSupplierSystem,
    renderCashflowDetail,
    renderCashflowReadonlyPanel,
    initCashflowReadonlyCharts,
    renderProgressWithJarvis,
    renderJarvisPortal,
    renderJarvisEmbed,
    renderAerialGallery,
    renderProgressImageSection,
    renderProgressLicenseTable,
    ec,
    ecWide,
    ro,
    tableLegend,
    setCostTab: (t) => { window.currentCostTab = t; },
    setProgressTab: (t) => { progressModuleTab = t; }
  };
})();
