import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { memo, useEffect, useRef, useMemo, useState } from 'react';
import { renderMermaidToSvg } from './Mermaid';
import { fetchChunkContent } from '../services/rag';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

/**
 * WeKnora 风格 Markdown 渲染器 —— 技术栈照搬 WeKnora chatMarkdownRenderer：
 * marked 同步解析（毫秒级字符串处理）+ DOMPurify 消毒 + dangerouslySetInnerHTML 注入，
 * 替代 react-markdown 的 unified 管线（每个 delta 全文重跑 parse→AST→插件→React diff，
 * 成本随内容增长，是流式卡顿根因）。marked 方案与 WeKnora 流式观感对齐。
 *
 * - GFM + breaks:true（单换行转 <br>，WeKnora 同款）
 * - 数学公式：marked-katex-extension（throwOnError:false + nonStandard，$$ 行内也按 display 渲染）
 * - 代码高亮：highlight.js（github 主题，仅显式语言标注才高亮）
 * - Mermaid：```mermaid 代码块输出占位槽，渲染后异步替换为 SVG
 * - 引用徽章：rag.ts 注入的 <span class="citation-badge" data-*> 经事件委托点击
 * - 输出 class 与旧 react-markdown 版完全一致（.md-*），CSS/视觉零变化
 */

export interface CitationInfo {
  doc: string;
  chunkId?: string;
  kbId?: string;
}

/** WeKnora preprocessMathDelimiters：LLM 常输出的原生 LaTeX 定界符 → $ / $$ */
function preprocessMathDelimiters(src: string): string {
  return src
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
}

/** 预处理：数学定界符 + $$ 独立成块 + 流式残尾保护（** 未闭合截断 / $$ 未闭合补全） */
function preprocess(src: string): string {
  let s = preprocessMathDelimiters(src);
  // WeKnora marked-katex nonStandard 行为对齐：与文字混排的 $$...$$ 摘成独立显示块，
  // 否则按行内公式渲染压缩分式，在 1.85 行高下穿过分线
  s = blockifyDisplayMath(s);
  // 流式场景：若末尾 `**` 是奇数个，截掉，避免最后整段加粗
  const boldCount = (s.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 === 1) {
    const last = s.lastIndexOf('**');
    if (last >= 0) s = s.slice(0, last);
  }
  // 流式场景：若 $$ 定界符是奇数个，补全闭合，避免公式在输出过程中闪原始文本
  const mathCount = (s.match(/\$\$/g) ?? []).length;
  if (mathCount % 2 === 1) {
    s += ' $$';
  }
  return s;
}

/** 把与文字混排的 $$...$$ 摘成独立显示块（跳过代码块内容） */
function blockifyDisplayMath(src: string): string {
  const parts = src.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g);
  for (let i = 0; i < parts.length; i += 2) {
    const lines = parts[i].split('\n');
    const out: string[] = [];
    for (const line of lines) {
      const m = line.match(/^(.*?)\$\$([^$]+)\$\$(.*)$/);
      if (m && (m[1].trim() || m[3].trim())) {
        const [, before, inner, after] = m;
        if (before.trim()) out.push(before);
        out.push('', `$$${inner}$$`, '');
        if (after.trim()) out.push(after);
      } else {
        out.push(line);
      }
    }
    parts[i] = out.join('\n');
  }
  return parts.join('');
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let markedConfigured = false;

function configureMarked(): void {
  if (markedConfigured) return;
  marked.use({
    gfm: true,
    breaks: true,
    renderer: {
      // 代码块：hljs 高亮（仅显式语言）；mermaid 输出占位槽由渲染后 effect 替换为 SVG
      code(token) {
        const text = String(token.text ?? '');
        const lang = (token.lang ?? '').trim().split(/\s+/)[0].toLowerCase();
        if (lang === 'mermaid') {
          return `<div class="md-mermaid-slot" data-mermaid="${encodeURIComponent(text)}"><pre class="md-pre"><code class="md-code-block">${escapeHtml(text)}</code></pre></div>`;
        }
        let body: string;
        try {
          body = lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }).value : escapeHtml(text);
        } catch {
          body = escapeHtml(text);
        }
        return `<pre class="md-pre"><code class="md-code-block language-${escapeHtml(lang || 'text')} hljs">${body}</code></pre>`;
      },
      // 行内代码
      codespan(token) {
        return `<code class="md-code-inline">${escapeHtml(String(token.text ?? ''))}</code>`;
      },
    },
  });
  // WeKnora 同款：throwOnError false（错误公式显示原文）+ nonStandard（单 $ 行内公式 / $$ 行内也按 display）
  marked.use(markedKatex({ throwOnError: false, nonStandard: true }));
  markedConfigured = true;
}

/** marked 默认输出 → 加上与旧版一致 .md-* class（字符串替换，KaTeX/hljs/徽章输出不含这些裸标签） */
function decorateClasses(html: string): string {
  return html
    .replaceAll('<h1>', '<h1 class="md-h1">')
    .replaceAll('<h2>', '<h2 class="md-h2">')
    .replaceAll('<h3>', '<h3 class="md-h3">')
    .replaceAll('<h4>', '<h4 class="md-h4">')
    .replaceAll('<p>', '<p class="md-p">')
    .replaceAll('<ul>', '<ul class="md-ul">')
    .replaceAll('<ol>', '<ol class="md-ol">')
    .replaceAll('<li>', '<li class="md-li">')
    .replaceAll('<blockquote>', '<blockquote class="md-quote">')
    .replaceAll('<hr>', '<div class="md-hr" aria-hidden="true"></div>')
    .replaceAll('<table>', '<div class="md-table-wrap"><table class="md-table">')
    .replaceAll('</table>', '</table></div>')
    .replaceAll('<thead>', '<thead class="md-thead">')
    .replaceAll('<tbody>', '<tbody class="md-tbody">')
    .replaceAll('<tr>', '<tr class="md-tr">')
    .replaceAll('<th>', '<th class="md-th">')
    .replaceAll('<td>', '<td class="md-td">')
    .replaceAll('<strong>', '<strong class="md-strong">')
    .replaceAll('<em>', '<em class="md-em">')
    .replaceAll('<del>', '<del class="md-del">')
    .replaceAll('<a href=', '<a class="md-link" target="_blank" rel="noreferrer" href=');
}

/** marked 解析 → class 装饰 → DOMPurify 消毒（放行 data-* / target / task-list input） */
function renderMarkdown(src: string): string {
  configureMarked();
  const raw = marked.parse(src, { async: false }) as string;
  const decorated = decorateClasses(raw);
  return DOMPurify.sanitize(decorated, {
    ADD_ATTR: ['target', 'data-doc', 'data-chunk-id', 'data-kb-id', 'data-mermaid', 'data-done', 'rel'],
    ADD_TAGS: ['input'],
  });
}

/** 渲染后异步替换 mermaid 占位槽为 SVG（失败保留源码，流式未完整语法不标 done 强求） */
async function renderMermaidSlots(container: HTMLElement | null): Promise<void> {
  if (!container) return;
  const slots = container.querySelectorAll<HTMLElement>('.md-mermaid-slot:not([data-done])');
  for (const slot of Array.from(slots)) {
    slot.setAttribute('data-done', '1');
    let chart = '';
    try {
      chart = decodeURIComponent(slot.dataset.mermaid ?? '');
      const svg = await renderMermaidToSvg(chart);
      slot.classList.add('md-mermaid');
      slot.innerHTML = svg;
    } catch {
      // 语法错误/未完整：保留 <pre> 源码展示
    }
  }
}

function MarkdownViewInner({
  source,
  onCitationClick,
}: {
  source: string;
  streaming?: boolean;
  onCitationClick?: (info: CitationInfo) => void;
}) {
  const html = useMemo(() => renderMarkdown(preprocess(source)), [source]);
  const containerRef = useRef<HTMLDivElement>(null);
  // latest-ref：memo 跳过重渲染后点击委托依然拿到最新回调
  const onCitationRef = useRef(onCitationClick);
  onCitationRef.current = onCitationClick;

  // —— 引用徽章 hover 浮层（对齐 WeKnora useChatCitationPopover：80ms 延迟 + chunk 原文预览）——
  const [float, setFloat] = useState<{ doc: string; content: string | null; loading: boolean; x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (hoverTimerRef.current !== null) { window.clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    if (closeTimerRef.current !== null) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
  };

  useEffect(() => clearTimers, []);

  const handleBadgeEnter = (badge: HTMLElement) => {
    clearTimers();
    const chunkId = badge.getAttribute('data-chunk-id') ?? '';
    const doc = badge.getAttribute('data-doc') ?? '';
    if (!chunkId) return; // 无 chunk 定位的徽章只支持点击开抽屉
    hoverTimerRef.current = window.setTimeout(() => {
      const rect = badge.getBoundingClientRect();
      // 默认下方 8px；视口下方放不下改上方
      const below = rect.bottom + 8;
      const floatH = 220;
      const y = below + floatH > window.innerHeight ? Math.max(8, rect.top - floatH - 8) : below;
      const x = Math.min(rect.left, window.innerWidth - 400);
      setFloat({ doc, content: null, loading: true, x, y });
      void fetchChunkContent(chunkId).then((content) => {
        setFloat((cur) => (cur && cur.doc === doc ? { ...cur, content, loading: false } : cur));
      });
    }, 80);
  };

  const handleBadgeLeave = () => {
    if (hoverTimerRef.current !== null) { window.clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    closeTimerRef.current = window.setTimeout(() => setFloat(null), 120);
  };

  useEffect(() => {
    void renderMermaidSlots(containerRef.current);
  }, [html]);

  return (
    <>
      <div
        ref={containerRef}
        className="md-body"
        onMouseOver={(e) => {
          const badge = (e.target as HTMLElement).closest?.('.citation-badge');
          if (badge) handleBadgeEnter(badge as HTMLElement);
        }}
        onMouseOut={(e) => {
          if ((e.target as HTMLElement).closest?.('.citation-badge')) handleBadgeLeave();
        }}
        onClick={(e) => {
          const badge = (e.target as HTMLElement).closest?.('.citation-badge');
          if (badge) {
            clearTimers();
            setFloat(null);
            onCitationRef.current?.({
              doc: badge.getAttribute('data-doc') ?? '',
              chunkId: badge.getAttribute('data-chunk-id') ?? undefined,
              kbId: badge.getAttribute('data-kb-id') ?? undefined,
            });
          }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {float && (
        <div
          className="citation-float"
          style={{ left: float.x, top: float.y }}
          onMouseEnter={clearTimers}
          onMouseLeave={handleBadgeLeave}
        >
          <div className="citation-float__title">📄 {float.doc}</div>
          <div className="citation-float__body">
            {float.loading ? '加载原文…' : float.content ?? '无法加载该片段原文'}
          </div>
        </div>
      )}
    </>
  );
}

/** source 不变即跳过整棵子树（流式时历史消息零开销） */
const MarkdownView = memo(MarkdownViewInner, (prev, next) => prev.source === next.source);

export default MarkdownView;
