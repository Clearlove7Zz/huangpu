/**
 * Mermaid 图表渲染（对齐 WeKnora mermaidShared.ts 的浅色主题）
 * - 动态 import mermaid（不进主 bundle）
 * - 单例懒初始化（startOnLoad=false，手动 render）
 * - renderMermaidToSvg 供 MarkdownView 的占位槽异步替换使用
 */

type MermaidModule = typeof import('mermaid');

let mermaidMod: MermaidModule | null = null;
let initPromise: Promise<MermaidModule> | null = null;
let renderSeq = 0;

async function getMermaid(): Promise<MermaidModule> {
  if (mermaidMod) return mermaidMod;
  if (!initPromise) {
    initPromise = (async () => {
      const mod = await import('mermaid');
      mod.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        // WeKnora 浅色主题（slate 色系）
        theme: 'base',
        // 中文字体必须显式给：mermaid 靠临时 DOM 量文字宽度定节点大小，
        // 默认 trebuchet ms 无中文字形 => 量窄 => foreignObject 截字（对齐 WeKnora MERMAID_CONFIG）
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
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
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis', padding: 16 },
        gantt: { useMaxWidth: true },
        sequence: {
          useMaxWidth: true,
          diagramMarginX: 12,
          diagramMarginY: 12,
          actorMargin: 56,
          width: 156,
          height: 68,
          boxMargin: 10,
        },
        // mermaid 11 对语法错误默认"成功"返回错误文案 SVG（不抛异常）——
        // 配合 MarkdownView 的成功即缓存会把错误图钉死在屏上，必须关闭
        suppressErrorRendering: true,
      });
      mermaidMod = mod;
      return mod;
    })();
  }
  return initPromise;
}

/** 渲染 mermaid 源码为 SVG 字符串；语法错误/未完整时抛出（调用方 fallback 显示源码） */
export async function renderMermaidToSvg(chart: string): Promise<string> {
  const mermaid = (await getMermaid()).default;
  // 语法闸：parse 不过直接抛，绝不把错误 SVG 交给上游缓存（对齐 WeKnora mermaidShared）
  await mermaid.parse(chart);
  const { svg } = await mermaid.render(`mermaid-svg-${++renderSeq}`, chart);
  return svg;
}
