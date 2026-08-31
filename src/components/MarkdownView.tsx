import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import { useMemo } from 'react';
import Mermaid from './Mermaid';

/** WeKnora 风格 Markdown 渲染器（渲染能力对齐 WeKnora chatMarkdownRenderer）
 *  - 支持 GFM：表格 / 任务列表 / 删除线
 *  - 支持数学公式：$...$ / $$...$$ / \(...\) / \[...\]（KaTeX 渲染）
 *  - 支持代码高亮：highlight.js（github 主题，与 WeKnora 一致）
 *  - 支持 Mermaid 图表：```mermaid 代码块渲染为 SVG
 *  - 安全：默认 schema 过滤危险 HTML；KaTeX / highlight 在 sanitize 之后执行，
 *    输入已被净化为纯文本，其输出可信
 *  - 视觉：复用全站青绿 token（index.css .md-*）
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...((defaultSchema.attributes && defaultSchema.attributes.code) ?? []), ['className']],
    span: [...((defaultSchema.attributes && defaultSchema.attributes.span) ?? []), ['className']],
    // remark-math 的 display 公式容器是 <div class="math math-display">
    div: [...((defaultSchema.attributes && defaultSchema.attributes.div) ?? []), ['className']],
  },
};

export default function MarkdownView({ source }: { source: string; streaming?: boolean }) {
  const cleaned = useMemo(() => preprocess(source), [source]);
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeKatex, [rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={components}
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
  return s;
}

const components = {
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
};
