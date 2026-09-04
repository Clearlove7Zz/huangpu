/**
 * Mermaid 图表全屏查看器（移植自 WeKnora mermaidViewer.ts，i18n 换为硬编码中文）
 * 支持：点击放大、滚轮缩放（朝光标点）、鼠标拖拽、ESC/点击遮罩关闭、导出 PNG
 */

/** 下载 SVG 为 PNG 图片（使用实际渲染尺寸） */
const downloadSvgAsImage = async (svgElement: SVGElement): Promise<void> => {
  const bbox = svgElement.getBoundingClientRect();
  const w = Math.round(bbox.width);
  const h = Math.round(bbox.height);

  const svgClone = svgElement.cloneNode(true) as SVGElement;
  svgClone.setAttribute('width', String(w));
  svgClone.setAttribute('height', String(h));

  const svgData = new XMLSerializer().serializeToString(svgClone);
  const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const link = document.createElement('a');
        link.download = 'mermaid-diagram.png';
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        resolve();
      }, 'image/png');
    };
    img.src = svgDataUri;
  });
};

const ICON_ZOOM_IN =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>';
const ICON_ZOOM_OUT =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>';
const ICON_RESET =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
const ICON_DOWNLOAD =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
const ICON_CLOSE =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

/** 打开 Mermaid 全屏查看器：自动适配大小 + 滚轮朝光标缩放 + 拖拽平移 */
export const openMermaidFullscreen = (svgHtml: string): void => {
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartTX = 0;
  let dragStartTY = 0;
  const STEP = 0.2;

  // 遮罩层（flex 居中：卡片任何尺寸都严格居中，不依赖 translate(-50%) 与缩放锚点的组合）
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.65);overflow:hidden;cursor:grab;display:flex;align-items:center;justify-content:center;';

  // 工具栏
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'position:fixed;top:20px;right:20px;display:flex;gap:6px;z-index:10001;';

  const createBtn = (title: string, icon: string): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.title = title;
    btn.style.cssText =
      'display:flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid #e5e7eb;border-radius:6px;background:rgba(255,255,255,0.95);color:#6b7280;cursor:pointer;padding:0;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
    btn.innerHTML = icon;
    btn.onmouseenter = () => {
      btn.style.background = '#f3f4f6';
      btn.style.color = '#374151';
    };
    btn.onmouseleave = () => {
      btn.style.background = 'rgba(255,255,255,0.95)';
      btn.style.color = '#6b7280';
    };
    return btn;
  };

  const zoomInBtn = createBtn('放大', ICON_ZOOM_IN);
  const zoomOutBtn = createBtn('缩小', ICON_ZOOM_OUT);
  const resetBtn = createBtn('重置', ICON_RESET);
  const downloadBtn = createBtn('下载 PNG', ICON_DOWNLOAD);
  const closeBtn = createBtn('关闭', ICON_CLOSE);
  toolbar.append(zoomInBtn, zoomOutBtn, resetBtn, downloadBtn, closeBtn);

  // 内容区域（flex 子项居中；缩放锚点取自身中心，配合滚轮公式光标点钉死不动）
  const content = document.createElement('div');
  content.style.cssText =
    'position:relative;background:#fff;border-radius:12px;padding:32px;box-shadow:0 8px 32px rgba(0,0,0,0.2);transform-origin:center center;';
  content.innerHTML = svgHtml;
  const svgEl = content.querySelector('svg');
  if (svgEl) {
    svgEl.style.display = 'block';
    svgEl.style.maxWidth = 'none';
    svgEl.setAttribute('draggable', 'false');
  }

  overlay.appendChild(toolbar);
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  // 自动适配大小（下限放宽到 0.1：超宽流程图也要真正 fit 进视口）
  const margin = 60;
  const viewW = window.innerWidth - margin * 2;
  const viewH = window.innerHeight - margin * 2;
  if (content.offsetWidth > 0 && content.offsetHeight > 0) {
    const fitScale = Math.min(viewW / content.offsetWidth, viewH / content.offsetHeight);
    scale = Math.max(0.1, Math.min(fitScale, 10));
  }

  const applyTransform = () => {
    content.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  };
  applyTransform();

  zoomInBtn.onclick = (e) => {
    e.stopPropagation();
    scale = Math.min(10, scale + STEP);
    applyTransform();
  };
  zoomOutBtn.onclick = (e) => {
    e.stopPropagation();
    scale = Math.max(0.1, scale - STEP);
    applyTransform();
  };
  resetBtn.onclick = (e) => {
    e.stopPropagation();
    scale = 1;
    translateX = 0;
    translateY = 0;
    applyTransform();
  };

  downloadBtn.onclick = (e) => {
    e.stopPropagation();
    if (!svgEl) return;
    void downloadSvgAsImage(svgEl);
    downloadBtn.title = '正在下载…';
    setTimeout(() => {
      downloadBtn.title = '下载 PNG';
    }, 1500);
  };

  let isClosed = false;
  const close = () => {
    if (isClosed) return;
    isClosed = true;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onEsc);
    overlay.remove();
  };

  closeBtn.onclick = (e) => {
    e.stopPropagation();
    close();
  };

  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onEsc);

  // 滚轮缩放（中心锚点精确公式：缩放前后光标所指图上点保持钉死）
  overlay.onwheel = (e) => {
    e.preventDefault();
    const oldScale = scale;
    scale = e.deltaY < 0 ? Math.min(10, scale + STEP) : Math.max(0.1, scale - STEP);
    const ratio = scale / oldScale;
    const mx = e.clientX - window.innerWidth / 2;
    const my = e.clientY - window.innerHeight / 2;
    // 视觉中心 = 视口中心 + T；图上点 u=(m-T)/s 钉死 => T' = m(1-r) + T·r
    translateX = mx * (1 - ratio) + translateX * ratio;
    translateY = my * (1 - ratio) + translateY * ratio;
    applyTransform();
  };

  // 拖拽平移
  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    translateX = dragStartTX + (e.clientX - dragStartX);
    translateY = dragStartTY + (e.clientY - dragStartY);
    applyTransform();
  };

  const onMouseUp = () => {
    isDragging = false;
    overlay.style.cursor = 'grab';
  };

  overlay.onmousedown = (e) => {
    const target = e.target as Element;
    if (target.closest('button')) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartTX = translateX;
    dragStartTY = translateY;
    overlay.style.cursor = 'grabbing';
    e.preventDefault();
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
};
