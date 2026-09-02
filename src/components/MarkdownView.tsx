import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import { useMemo } from 'react';
import Mermaid from './Mermaid';

/** 引用徽章点击信息（WeKnora <kb doc chunk_id kb_id/> 转化的内联徽章） */
export interface CitationInfo {
  doc: string;
  chunkId?: string;
  kbId?: string;
}

/** WeKnora 风格 Markdown 渲染器（渲染能力对齐 WeKnora chatMarkdownRenderer）
 *  - 支持 GFM：表格 / 任务列表 / 删除线
 *  - 支持数学公式：$...$ / $$...$$ / \(...\) / \[...\]（KaTeX 渲染）
 *  - 支持代码高亮：highlight.js（github 主题，与 WeKnora 一致）
 *  - 支持 Mermaid 图表：```mermaid 代码块渲染为 SVG
 *  - 支持内联引用徽章：<span class="citation-badge" data-doc data-chunk-id>（rag.ts 生成，
 *    rehype-raw 解析 → sanitize 放行 data 属性 → components 拦截为可点击组件）
 *  - 安全：rehype-raw 解析后经 sanitize 过滤危险 HTML；KaTeX / highlight 在 sanitize 之后执行，
 *    输入已被净化为纯文本，其输出可信
 *  - 视觉：复用全站青绿 token（index.css .md-*）
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...((defaultSchema.attributes && defaultSchema.attributes.code) ?? []), ['className']],
    span: [
      ...((defaultSchema.attributes && defaultSchema.attributes.span) ?? []),
      ['className'],
      ['data-doc'],
      ['data-chunk-id'],
      ['data-kb-id'],
    ],
    // remark-math 的 display 公式容器是 <div class="math math-display">
    div: [...((defaultSchema.attributes && defaultSchema.attributes.div) ?? []), ['className']],
  },
};

export default function MarkdownView({
  source,
  onCitationClick,
}: {
  source: string;
  streaming?: boolean;
  onCitationClick?: (info: CitationInfo) => void;
}) {
  const cleaned = useMemo(() => preprocess(source), [source]);
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          // rehype-raw 在 sanitize 前：解析 rag.ts 注入的引用徽章 HTML，sanitize 兜底过滤危险标记
          ...(source.includes('citation-badge') ? [rehypeRaw] : []),
          [rehypeSanitize, sanitizeSchema],
          rehypeKatex,
          [rehypeHighlight, { detect: false, ignoreMissing: true }],
        ]}
        components={componentsFor(onCitationClick)}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}

/** 预处理：对齐 WeKnora chatMarkdownRenderer 的流式与定界符修复 */
function preprocess(src: string): string {
  let s = src;
  // WeKnora preprocessMathDelimiters：LLM 常输出的原生 LaTeX 定界符 → $ / $$
  // \[...\] → $$...$$   \(...\) → $...$
  s = s
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
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
  // WeKnora marked-katex nonStandard 行为对齐：行内混排的 $$...$$ 摘成独立
  // 显示块（displayMode），否则 remark-math 会按行内公式渲染压缩分式，
  // 在 1.85 行高下分式会穿过分线
  s = blockifyDisplayMath(s);
  return s;
}

/** 把与文字混排的 $$...$$ 摘成独立显示块（跳过代码块内容） */
function blockifyDisplayMath(src: string): string {
  // 按代码块切分（捕获组：偶数索引为普通文本），流式未闭合代码块也算
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

const componentsFor = (onCitationClick?: (info: CitationInfo) => void) => ({
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="md-h1" {...props} />,
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="md-h2" {...props} />,
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="md-h3" {...props} />,
  h4: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h4 className="md-h4" {...props} />,
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p className="md-p" {...props} />,
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => <ul className="md-ul" {...props} />,
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => <ol className="md-ol" {...props} />,
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => <li className="md-li" {...props} />,
  blockquote: (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => <blockquote className="md-quote" {...props} />,
  hr: () => <div className="md-hr" aria-hidden />,
  span: (props: React.HTMLAttributes<HTMLSpanElement> & { node?: unknown }) => {
    const { node, className, ...rest } = props;
    // rag.ts 注入的引用徽章 → 可点击组件（打开右侧来源抽屉）
    if (className?.includes('citation-badge')) {
      const el = node as { properties?: Record<string, string> } | undefined;
      const doc = el?.properties?.['data-doc'] ?? '';
      const chunkId = el?.properties?.['data-chunk-id'];
      const kbId = el?.properties?.['data-kb-id'];
      return (
        <span
          className="citation-badge"
          role="button"
          tabIndex={0}
          onClick={() => onCitationClick?.({ doc, chunkId, kbId })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onCitationClick?.({ doc, chunkId, kbId });
          }}
        >
          {rest.children}
        </span>
      );
    }
    return <span className={className} {...rest} />;
  },
  code: (props: React.HTMLAttributes<HTMLElement> & { inline?: boolean; node?: unknown }) => {
    const { className, children, inline, node, ...rest } = props;
    // ```mermaid 代码块 → 渲染为 SVG 图表（对齐 WeKnora）
    const match = /language-(\w+)/.exec(className ?? '');
    if (!inline && match?.[1] === 'mermaid') {
      return <Mermaid chart={String(children).replace(/\n$/, '')} />;
    }
    if (inline) return <code className="md-code-inline">{children}</code>;
    return (
      <code className={className ?? 'md-code-block'} {...rest}>
        {children}
      </code>
    );
  },
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => <pre className="md-pre" {...props} />,
  table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="md-table-wrap">
      <table className="md-table" {...props} />
    </div>
  ),
  thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="md-thead" {...props} />,
  tbody: (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className="md-tbody" {...props} />,
  tr: (props: React.HTMLAttributes<HTMLTableRowElement>) => <tr className="md-tr" {...props} />,
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className="md-th" {...props} />,
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className="md-td" {...props} />,
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a className="md-link" target="_blank" rel="noreferrer" {...props} />,
  strong: (props: React.HTMLAttributes<HTMLElement>) => <strong className="md-strong" {...props} />,
  em: (props: React.HTMLAttributes<HTMLElement>) => <em className="md-em" {...props} />,
  del: (props: React.HTMLAttributes<HTMLElement>) => <del className="md-del" {...props} />,
});
