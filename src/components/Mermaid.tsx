/**
 * Mermaid 图表渲染（对齐 WeKnora mermaidShared.ts 的浅色主题）
 * - 动态 import mermaid（不进主 bundle）
 * - 单例懒初始化（startOnLoad=false，手动 render）
 * - 渲染失败 fallback 显示原始代码
 */
import { useEffect, useRef, useState } from 'react';

type MermaidModule = typeof import('mermaid');

let mermaidMod: MermaidModule | null = null;
let mermaidId = 0;

async function getMermaid(): Promise<MermaidModule> {
  if (mermaidMod) return mermaidMod;
  const mod = await import('mermaid');
  mermaidMod = mod;
  if (!('initialized' in window)) {
    mod.default.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      // WeKnora 浅色主题（slate 色系，与项目色板一致）
      theme: 'base',
      themeVariables: {
        darkMode: false,
        background: '#ffffff',
        primaryColor: '#e2e8f0',
        primaryTextColor: '#334155',
        primaryBorderColor: '#94a3b8',
        secondaryColor: '#f1f5f9',
        secondaryTextColor: '#475569',
        secondaryBorderColor: '#cbd5e1',
        tertiaryColor: '#f8fafc',
        tertiaryTextColor: '#64748b',
        tertiaryBorderColor: '#e2e8f0',
        lineColor: '#94a3b8',
        textColor: '#334155',
        mainBkg: '#ffffff',
        nodeBorder: '#94a3b8',
        clusterBkg: '#f8fafc',
        clusterBorder: '#cbd5e1',
        titleColor: '#1e293b',
        edgeLabelBackground: '#ffffff',
        fontSize: '14px',
      },
      flowchart: { useMaxWidth: true, htmlLabels: true },
      gantt: { useMaxWidth: true },
      sequence: { useMaxWidth: true },
    });
    (window as unknown as Record<string, unknown>).initialized = true;
  }
  return mermaidMod;
}

interface MermaidProps {
  chart: string;
}

export default function Mermaid({ chart }: MermaidProps) {
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-svg-${++mermaidId}`;

    (async () => {
      try {
        const mermaid = (await getMermaid()).default;
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvgHtml(svg);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (failed) {
    // 渲染失败：退回普通代码块样式展示源码
    return (
      <pre className="md-pre">
        <code className="md-code-block language-mermaid">{chart}</code>
      </pre>
    );
  }

  if (!svgHtml) {
    // 渲染中：先展示源码，避免空白
    return (
      <div className="md-mermaid md-mermaid--pending">
        <pre className="md-pre">
          <code className="md-code-block language-mermaid">{chart}</code>
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="md-mermaid"
      style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto', padding: '8px 0' }}
      // svg 由 mermaid 生成且 securityLevel=strict，受信任
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}
