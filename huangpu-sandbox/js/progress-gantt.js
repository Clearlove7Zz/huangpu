// WBS 甘特图渲染 v2.0
window.ProgressGantt = (function () {
  const DAY_MS = 86400000;

  function parseDate(s) {
    if (!s || s === '—') return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function daysBetween(a, b) {
    return Math.max(1, Math.round((b - a) / DAY_MS));
  }

  function getRange(activities) {
    let min = null;
    let max = null;
    activities.forEach((a) => {
      const s = parseDate(a.start);
      const e = parseDate(a.end);
      if (s && (!min || s < min)) min = s;
      if (e && (!max || e > max)) max = e;
    });
    if (!min || !max) {
      min = new Date('2025-01-01');
      max = new Date('2028-01-01');
    }
    return { min, max, totalDays: daysBetween(min, max) };
  }

  function fmtMonth(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function buildMonthLabels(min, max) {
    const labels = [];
    const cur = new Date(min.getFullYear(), min.getMonth(), 1);
    while (cur <= max) {
      labels.push(fmtMonth(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return labels.length ? labels : [fmtMonth(min)];
  }

  function barStyle(activity, range) {
    const s = parseDate(activity.start);
    const e = parseDate(activity.end);
    if (!s || !e) return { left: '0%', width: '0%' };
    const left = ((s - range.min) / DAY_MS / range.totalDays) * 100;
    const width = (daysBetween(s, e) / range.totalDays) * 100;
    return { left: `${Math.max(0, left).toFixed(2)}%`, width: `${Math.min(100 - left, width).toFixed(2)}%` };
  }

  function statusClass(a) {
    if (a.progress >= 100) return 'gantt-bar-done';
    if (a.isCritical && a.progress < 100) return 'gantt-bar-critical';
    if (a.progress > 0) return 'gantt-bar-doing';
    return 'gantt-bar-pending';
  }

  function render(activities, opts = {}) {
    const title = opts.title || 'WBS 活动计划甘特图';
    const range = getRange(activities);
    const months = buildMonthLabels(range.min, range.max);
    const today = new Date();
    const todayPct = today >= range.min && today <= range.max
      ? (((today - range.min) / DAY_MS / range.totalDays) * 100).toFixed(2)
      : null;

    const rows = activities.map((a) => {
      const style = barStyle(a, range);
      const indent = (a.wbs.match(/\./g) || []).length * 16;
      return `<div class="gantt-row">
        <div class="gantt-label" style="padding-left:${12 + indent}px" title="${a.name}">
          <span class="gantt-wbs">${a.wbs}</span> ${a.name}
          ${a.isCritical ? '<span class="gantt-cp-tag">关键</span>' : ''}
        </div>
        <div class="gantt-track">
          <div class="gantt-bar ${statusClass(a)}" style="left:${style.left};width:${style.width}">
            <span class="gantt-bar-pct">${a.progress}%</span>
          </div>
        </div>
        <div class="gantt-dates">${a.start} ~ ${a.end}</div>
      </div>`;
    }).join('');

    const headerCells = months.map((m) => `<span class="gantt-month">${m}</span>`).join('');

    return `
      <div class="gantt-wrap">
        <div class="gantt-header-row">
          <div class="gantt-label gantt-label-head">活动 / WBS</div>
          <div class="gantt-timeline-head">${headerCells}</div>
          <div class="gantt-dates gantt-dates-head">计划工期</div>
        </div>
        <div class="gantt-body">
          ${todayPct != null ? `<div class="gantt-today-line" style="left:calc(220px + (100% - 320px) * ${todayPct} / 100)"></div>` : ''}
          ${rows}
        </div>
        <div class="gantt-legend">
          <span><i class="gantt-legend-dot gantt-bar-done"></i>已完成</span>
          <span><i class="gantt-legend-dot gantt-bar-doing"></i>进行中</span>
          <span><i class="gantt-legend-dot gantt-bar-critical"></i>关键路径</span>
          <span><i class="gantt-legend-dot gantt-bar-pending"></i>未开始</span>
          ${todayPct != null ? '<span class="text-muted">｜ 竖线 = 今日</span>' : ''}
        </div>
      </div>`;
  }

  function renderMilestones(milestones) {
    if (!milestones?.length) return '';
    return `
      <div class="milestone-timeline">
        ${milestones.map((m, i) => {
          const cls = m.status === 'lag' ? 'lag' : m.status === 'done' ? 'done' : m.status === 'doing' ? 'doing' : 'pending';
          const lag = m.lagDays > 0 ? `<span class="text-warning">滞后${m.lagDays}天</span>` : '';
          return `<div class="ms-node ${cls}">
            <div class="ms-dot"></div>
            <div class="ms-body">
              <div class="ms-name">${m.name}</div>
              <div class="ms-dates">计划 ${m.plan} · 实际 ${m.actual || '—'} ${lag}</div>
              <div class="ms-weight">权重 ${m.weight || '—'}%</div>
            </div>
            ${i < milestones.length - 1 ? '<div class="ms-connector"></div>' : ''}
          </div>`;
        }).join('')}
      </div>`;
  }

  return { render, renderMilestones, getRange };
})();
