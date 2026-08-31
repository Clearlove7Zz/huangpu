// 安全日志 AI巡检 — 真实 YOLO PPE 推理（依赖 ai-service）
window.SafetyAI = (function () {
  const API = () => (window.SAFETY_AI_API || 'http://127.0.0.1:8765').replace(/\/$/, '');

  let lastResult = null;
  let healthCache = null;

  async function api(path, opts = {}) {
    const url = API() + path;
    const res = await fetch(url, opts);
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const j = await res.json();
        detail = j.detail || JSON.stringify(j);
      } catch (_) { /* ignore */ }
      throw new Error(detail);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res;
  }

  async function checkHealth() {
    try {
      healthCache = await api('/api/health');
      return healthCache;
    } catch (e) {
      healthCache = { ok: false, model_loaded: false, error: e.message };
      return healthCache;
    }
  }

  function levelClass(level) {
    if (level === '重大关注') return 'sai-level-critical';
    if (level === '一般隐患') return 'sai-level-warn';
    return 'sai-level-ok';
  }

  function today() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function imgUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return API() + path;
  }

  function renderStatusBanner(h) {
    if (!h || !h.ok || !h.model_loaded) {
      const onRemote = !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(location.href)
        && location.protocol !== 'file:';
      const tip = onRemote
        ? '线上需本机开启公网隧道。请在本机运行：<code>./ai-service/start-online.sh --deploy</code>（保持终端不关）'
        : '请在终端启动：<code>cd ai-service && source .venv/bin/activate && uvicorn app:app --host 127.0.0.1 --port 8765</code>';
      return `<div class="sai-banner sai-banner-error">
        <strong>AI 服务未就绪</strong>
        <span>${tip}</span>
        ${h?.error ? `<span class="sai-err-detail">${h.error}</span>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-sai="recheck-health" style="width:auto">重新检测</button>
      </div>`;
    }
    return `<div class="sai-banner sai-banner-ok">
      <span class="sai-dot"></span>
      YOLO PPE 模型已加载 · 可识别未戴安全帽 / 未穿反光背心 / 防护缺失 / 疑似坠落等隐患
    </div>`;
  }

  function renderResultPanel(result) {
    if (!result) {
      return `<div class="sai-empty">上传巡检照片后，AI 将自动标注隐患并生成一般隐患记录。</div>`;
    }
    const s = result.summary || {};
    const hazards = result.hazards || [];
    return `
      <div class="sai-result-grid">
        <div class="sai-result-image">
          <img src="${imgUrl(result.annotated_url)}?t=${Date.now()}" alt="AI标注结果" id="sai-annotated-img">
          <a class="btn btn-ghost btn-sm" href="${imgUrl(result.original_url)}" target="_blank" rel="noopener" style="width:auto;margin-top:8px">查看原图</a>
        </div>
        <div class="sai-result-meta">
          <div class="sai-stats">
            <div class="sai-stat"><div class="label">识别人员</div><div class="value">${s.person_count ?? 0}</div></div>
            <div class="sai-stat"><div class="label">隐患数</div><div class="value ${s.hazard_count ? 'text-danger' : ''}">${s.hazard_count ?? 0}</div></div>
            <div class="sai-stat"><div class="label">最高级别</div><div class="value ${levelClass(s.highest_level)}">${s.highest_level || '合规'}</div></div>
          </div>
          <h4 class="sai-subhead">六、一般隐患排查治理（AI生成）</h4>
          <dl class="sai-log-fields">
            <dt>隐患情况</dt><dd id="sai-situation">${s.hazard_situation || '无'}</dd>
            <dt>所属部位</dt><dd>${result.area || '—'}</dd>
            <dt>整改措施</dt><dd id="sai-suggestion">${s.suggestion || '—'}</dd>
            <dt>记录编号</dt><dd><code>${result.record_id}</code></dd>
          </dl>
          ${hazards.length ? `
            <ul class="sai-hazard-list">
              ${hazards.map((h) => `
                <li class="${levelClass(h.level)}">
                  <strong>${h.label_zh}</strong>
                  <span class="sai-conf">${(h.confidence * 100).toFixed(0)}%</span>
                  <span class="tag">${h.level}</span>
                  <div class="sai-hazard-sug">${h.suggestion}</div>
                </li>`).join('')}
            </ul>` : '<p class="text-muted">未检出 PPE 违规类隐患。</p>'}
          <div class="sai-actions">
            <button type="button" class="btn btn-primary" data-sai="write-log" style="width:auto" ${hazards.length ? '' : 'disabled'}>写入一般隐患</button>
            <button type="button" class="btn btn-ghost btn-sm" data-sai="set-rectify" style="width:auto">登记整改人</button>
          </div>
        </div>
      </div>`;
  }

  function renderHistoryRows(items) {
    if (!items?.length) {
      return `<tr><td colspan="8" class="text-muted" style="text-align:center;padding:24px">暂无 AI 巡检记录</td></tr>`;
    }
    return items.map((r) => `
      <tr data-record-id="${r.id}">
        <td>${r.check_date || '—'}</td>
        <td>${r.project || '—'}</td>
        <td>${r.area || '—'}</td>
        <td>${r.inspector || '—'}</td>
        <td class="${r.hazard_count ? 'text-danger' : ''}">${r.hazard_count}</td>
        <td><span class="${levelClass(r.highest_level)}">${r.highest_level || '—'}</span></td>
        <td>${r.written_to_log ? '<span class="tag tag-normal">已写入</span>' : '<span class="tag">未写入</span>'}</td>
        <td>
          <button type="button" class="btn-link" data-sai="view-record" data-id="${r.id}">查看</button>
        </td>
      </tr>`).join('');
  }

  function renderPage() {
    const projects = (window.MOCK_DATA?.projects || []).map((p) =>
      `<option value="${p.name}">${p.shortName || p.name}</option>`
    ).join('');
    return `
      <h1 class="page-title">安全日志 AI巡检</h1>
      <p class="page-desc">对照《房屋市政工程施工安全日志》岗前巡查 / 一般隐患排查 · 开源 YOLOv8 PPE 实时识别 · 非 Demo 模拟</p>
      <div id="sai-health">${renderStatusBanner(healthCache)}</div>

      <div class="sai-layout">
        <section class="card sai-upload-card">
          <h3 class="section-heading">安全员上传巡检图片</h3>
          <div class="sai-form-grid">
            <label>项目名称
              <select id="sai-project" class="biz-input">${projects || '<option>新联复建01地块</option>'}</select>
            </label>
            <label>检查区域
              <input type="text" id="sai-area" class="biz-input" value="施工现场" placeholder="如：东门 / 基坑南侧">
            </label>
            <label>检查人
              <input type="text" id="sai-inspector" class="biz-input" value="安全员" placeholder="项目专职安全生产管理人员">
            </label>
            <label>检查日期
              <input type="date" id="sai-date" class="biz-input" value="${today()}">
            </label>
          </div>
          <div class="sai-dropzone" id="sai-dropzone">
            <input type="file" id="sai-file" accept="image/*" multiple hidden>
            <div class="sai-drop-inner">
              <div class="sai-drop-icon">📷</div>
              <p>拖拽或点击上传巡检照片</p>
              <p class="text-muted" style="font-size:12px">支持 JPG / PNG · 可多选依次识别</p>
            </div>
          </div>
          <div id="sai-progress" class="sai-progress hidden"></div>
        </section>

        <section class="card sai-result-card">
          <h3 class="section-heading">AI 识别结果</h3>
          <div id="sai-result">${renderResultPanel(lastResult)}</div>
        </section>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="sai-history-head">
          <h3 class="section-heading" style="margin:0">AI 巡检历史（写入安全日志）</h3>
          <button type="button" class="btn btn-ghost btn-sm" data-sai="refresh-history" style="width:auto">刷新</button>
        </div>
        <div class="table-wrap">
          <table class="cost-table readonly-table">
            <thead><tr>
              <th>日期</th><th>项目</th><th>区域</th><th>检查人</th><th>隐患数</th><th>级别</th><th>日志</th><th>操作</th>
            </tr></thead>
            <tbody id="sai-history-body"><tr><td colspan="8" class="text-muted" style="text-align:center">加载中…</td></tr></tbody>
          </table>
        </div>
      </section>`;
  }

  async function refreshHistory() {
    const body = document.getElementById('sai-history-body');
    if (!body) return;
    try {
      const data = await api('/api/records?limit=50');
      body.innerHTML = renderHistoryRows(data.items || []);
    } catch (e) {
      body.innerHTML = `<tr><td colspan="8" class="text-muted" style="text-align:center;padding:24px">无法加载历史：${e.message}</td></tr>`;
    }
  }

  async function runInspect(file) {
    const progress = document.getElementById('sai-progress');
    const resultEl = document.getElementById('sai-result');
    if (progress) {
      progress.classList.remove('hidden');
      progress.textContent = `正在识别：${file.name} …`;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('project', document.getElementById('sai-project')?.value || '');
    fd.append('area', document.getElementById('sai-area')?.value || '');
    fd.append('inspector', document.getElementById('sai-inspector')?.value || '');
    fd.append('check_date', document.getElementById('sai-date')?.value || today());

    try {
      const result = await api('/api/inspect', { method: 'POST', body: fd });
      lastResult = result;
      if (resultEl) resultEl.innerHTML = renderResultPanel(result);
      if (window.showToast) {
        const n = result.summary?.hazard_count || 0;
        window.showToast(n ? `识别完成：发现 ${n} 项隐患` : '识别完成：未发现 PPE 违规隐患');
      }
      await refreshHistory();
    } catch (e) {
      if (window.showToast) window.showToast('识别失败：' + e.message);
      if (progress) progress.textContent = '失败：' + e.message;
    } finally {
      if (progress) setTimeout(() => progress.classList.add('hidden'), 2000);
    }
  }

  async function handleFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (!files.length) {
      if (window.showToast) window.showToast('请选择图片文件');
      return;
    }
    const h = await checkHealth();
    const banner = document.getElementById('sai-health');
    if (banner) banner.innerHTML = renderStatusBanner(h);
    if (!h.model_loaded) {
      if (window.showToast) window.showToast('请先启动 AI 服务并加载模型');
      return;
    }
    for (const f of files) {
      await runInspect(f);
    }
  }

  async function writeToLog() {
    if (!lastResult?.record_id) return;
    try {
      await api(`/api/records/${lastResult.record_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          written_to_log: true,
          recheck_status: lastResult.summary?.hazard_count ? '整改中' : '无隐患',
          recheck_plan: lastResult.check_date || today(),
        }),
      });
      if (window.showToast) window.showToast('已写入一般隐患排查治理记录');
      await refreshHistory();
    } catch (e) {
      if (window.showToast) window.showToast('写入失败：' + e.message);
    }
  }

  async function setRectify() {
    if (!lastResult?.record_id) return;
    const name = window.prompt('整改人姓名', '熊国建');
    if (name == null) return;
    const time = window.prompt('整改时间（YYYY-MM-DD）', today());
    if (time == null) return;
    try {
      await api(`/api/records/${lastResult.record_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rectify_person: name,
          rectify_time: time,
          recheck_status: '已整改',
        }),
      });
      if (window.showToast) window.showToast('整改信息已登记');
      await refreshHistory();
    } catch (e) {
      if (window.showToast) window.showToast('登记失败：' + e.message);
    }
  }

  async function viewRecord(id) {
    try {
      const r = await api(`/api/records/${id}`);
      lastResult = {
        record_id: r.id,
        project: r.project,
        area: r.area,
        inspector: r.inspector,
        check_date: r.check_date,
        hazards: r.hazards,
        summary: {
          person_count: r.person_count,
          hazard_count: r.hazard_count,
          highest_level: r.highest_level,
          hazard_situation: r.hazard_situation,
          suggestion: r.suggestion,
        },
        annotated_url: r.annotated_url,
        original_url: r.original_url,
      };
      const resultEl = document.getElementById('sai-result');
      if (resultEl) {
        resultEl.innerHTML = renderResultPanel(lastResult);
        resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) {
      if (window.showToast) window.showToast('加载失败：' + e.message);
    }
  }

  function bind(root) {
    const drop = root.querySelector('#sai-dropzone');
    const input = root.querySelector('#sai-file');
    if (drop && input) {
      drop.addEventListener('click', () => input.click());
      drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        drop.classList.add('sai-dragover');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('sai-dragover'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('sai-dragover');
        handleFiles(e.dataTransfer.files);
      });
      input.addEventListener('change', () => {
        if (input.files?.length) handleFiles(input.files);
        input.value = '';
      });
    }

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sai]');
      if (!btn) return;
      const act = btn.dataset.sai;
      if (act === 'recheck-health') {
        checkHealth().then((h) => {
          const banner = document.getElementById('sai-health');
          if (banner) banner.innerHTML = renderStatusBanner(h);
        });
      } else if (act === 'refresh-history') refreshHistory();
      else if (act === 'write-log') writeToLog();
      else if (act === 'set-rectify') setRectify();
      else if (act === 'view-record') viewRecord(btn.dataset.id);
    });
  }

  async function render(bindActions) {
    const main = document.getElementById('main-content');
    healthCache = await checkHealth();
    main.innerHTML = renderPage();
    bind(main);
    if (typeof bindActions === 'function') bindActions();
    await refreshHistory();
  }

  return { render, checkHealth, API };
})();
