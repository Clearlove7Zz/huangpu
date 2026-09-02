/**
 * marked-katex-extension 的本地类型声明。
 * 该包将 types 指向 src/index.ts（发布 .ts 源码），会被项目 tsconfig 的
 * noUnusedLocals 等严格选项检查而报错；用 ambient declaration 遮蔽，
 * 只声明项目实际用到的 API。
 */
declare module 'marked-katex-extension' {
  import type { MarkedExtension } from 'marked';

  interface MarkedKatexOptions {
    throwOnError?: boolean;
    nonStandard?: boolean;
    output?: 'html' | 'mathml' | 'htmlAndMathml';
  }

  function markedKatex(options?: MarkedKatexOptions): MarkedExtension;

  export default markedKatex;
}
