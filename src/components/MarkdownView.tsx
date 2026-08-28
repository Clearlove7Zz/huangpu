import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useMemo } from 'react';

/** WeKnora 风格 Markdown 渲染器
 *  - 支持 GFM：表格 / 任务列表 / 删除线
 *  - 安全：默认 schema 过滤危险 HTML
 *  - 视觉：复用全站青绿 token（index.css .md-*）
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...((defaultSchema.attributes && defaultSchema.attributes.code) ?? []), ['className']],
    span: [...((defaultSchema.attributes && defaultSchema.attributes.span) ?? []), ['className']],
  },
};

export default function MarkdownView({ source }: { source: string; streaming?: boolean }) {
  const cleaned = useMemo(() => preprocess(source), [source]);
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}

/** 预处理：去掉 RAG 流式末尾未闭合的 `**` / `` ` `` / `| --- |` 不完整行 */
function preprocess(src: string): string {
  let s = src;
  // 流式场景：若末尾 `**` 是奇数个，截掉，避免最后整段加粗
  const boldCount = (s.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 === 1) {
    const last = s.lastIndexOf('**');
    if (last >= 0) s = s.slice(0, last);
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
  code: (props: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
    const { className, children, inline } = props;
    if (inline) return <code className="md-code-inline">{children}</code>;
    return <code className={className ?? 'md-code-block'}>{children}</code>;
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
