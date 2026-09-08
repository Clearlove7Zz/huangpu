/**
 * 多知识库上传脚本：按目录→知识库映射灌文档（不自动建库——建库权在用户 WebUI）。
 * 用法：node upload.mjs [--only <库名>]   （只处理指定库）
 * 认证：读 ../huangpu-gateway/.env 的 WEKNORA_URL / WEKNORA_API_KEY
 * 前置：知识库须已在 WebUI 创建，且已加入 scoped API key 的知识库白名单。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

for (const line of fs.readFileSync(path.join(ROOT, 'huangpu-gateway', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && m[1] in process.env === false) process.env[m[1]] = m[2];
}
const BASE = (process.env.WEKNORA_URL || 'http://127.0.0.1:8080') + '/api/v1';
const H = { 'X-API-Key': process.env.WEKNORA_API_KEY || '' };

/** 目录 → 知识库 映射（目录名=docs/ 下子目录，库名=WebUI 里建的库名） */
const TARGETS = [
  { dir: '合同资料', kb: '合同资料' },
  { dir: '成本月报', kb: '成本月报' },
  { dir: '综合月报', kb: '综合月报' },
  { dir: '制度文件', kb: '制度文件' },
  { dir: '现金流库', kb: '现金流库' },
];
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
// --src docs-real：灌真实标前测算文档（gen-real.py 生成物）；默认 docs/（demo）
const srcIdx = process.argv.indexOf('--src');
const SRC = srcIdx > -1 ? process.argv[srcIdx + 1] : 'docs';
const targets = only ? TARGETS.filter((t) => t.kb === only || t.dir === only) : TARGETS;

const j = async (r) => {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t };
  }
};

async function uploadTo(kbId, kbName, dirAbs) {
  const files = fs.readdirSync(dirAbs).filter((f) => f.endsWith('.md'));
  if (!files.length) return { done: 0, total: 0 };
  const list = await j(await fetch(`${BASE}/knowledge-bases/${kbId}/knowledge?page=1&page_size=100`, { headers: H }));
  const byTitle = new Map((list.data ?? []).map((d) => [d.title ?? d.file_name, d]));

  // 「明细只检索」规则：全量明细类文档不参与图谱抽取（孤点唯一来源），上传时即带覆盖
  const DETAIL_PATTERNS = ['全量明细', '主要材料与分包价格'];
  const detailCfg = (title) =>
    DETAIL_PATTERNS.some((p) => title.includes(p)) ? JSON.stringify({ graph_enabled: false }) : null;

  let done = 0;
  for (const f of files) {
    const title = f.replace(/\.md$/, '');
    const old = byTitle.get(title) ?? byTitle.get(f);
    if (old) {
      const del = await fetch(`${BASE}/knowledge/${old.id}`, { method: 'DELETE', headers: H });
      console.log(`[upload] [${kbName}] 删除旧版:`, title, del.status);
    }
    // 追加修订注释：确保每次上传哈希必变，绕开 WeKnora 对"同哈希软删除残影"的 409 去重
    const rev = `<!-- rev:${new Date().toISOString()} -->\n`;
    const content = Buffer.concat([fs.readFileSync(path.join(dirAbs, f)), Buffer.from(rev, 'utf8')]);
    const boundary = '----srckb' + Date.now() + Math.random().toString(36).slice(2);
    const parts = [];
    const pc = detailCfg(title);
    if (pc) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="process_config"\r\n\r\n${pc}\r\n`, 'utf8'));
    }
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f}"\r\nContent-Type: text/markdown\r\n\r\n`, 'utf8'));
    parts.push(content);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
    const body = Buffer.concat(parts);
    const up = await j(await fetch(`${BASE}/knowledge-bases/${kbId}/knowledge/file`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      body,
    }));
    const docId = up.data?.id;
    if (!docId) {
      console.error(`[upload] [${kbName}] 上传失败:`, title, JSON.stringify(up.error ?? up).slice(0, 200));
      continue;
    }
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const d = await j(await fetch(`${BASE}/knowledge/${docId}`, { headers: H }));
      if (d.data?.parse_status === 'completed') {
        console.log(`[upload] [${kbName}] 完成:`, title);
        done++;
        break;
      }
      if (d.data?.parse_status === 'failed') {
        console.error(`[upload] [${kbName}] 解析失败:`, title);
        break;
      }
    }
  }
  return { done, total: files.length };
}

async function main() {
  const kbList = await j(await fetch(`${BASE}/knowledge-bases?page=1&page_size=100`, { headers: H }));
  const items = kbList.data?.items ?? kbList.data ?? [];
  const grand = { done: 0, total: 0 };

  for (const t of targets) {
    const dirAbs = path.join(__dirname, SRC, t.dir);
    if (!fs.existsSync(dirAbs)) {
      console.error(`[upload] [${t.kb}] 目录不存在: ${dirAbs}`);
      continue;
    }
    const kb = items.find((k) => k.name === t.kb);
    if (!kb) {
      console.error(`[upload] [${t.kb}] 知识库不存在——请先在 WebUI 创建，并确认 scoped key 白名单已勾选该库`);
      continue;
    }
    console.log(`[upload] === ${t.kb} (${kb.id.slice(0, 8)}) ===`);
    const r = await uploadTo(kb.id, t.kb, dirAbs);
    grand.done += r.done;
    grand.total += r.total;
  }
  console.log(`[upload] 结束：${grand.done}/${grand.total} 份完成解析`);
  if (grand.done < grand.total) process.exit(1);
}

main().catch((e) => {
  console.error('[upload] 异常:', e.message);
  process.exit(1);
});
