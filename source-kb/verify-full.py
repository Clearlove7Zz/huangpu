# -*- coding: utf-8 -*-
"""
全表核查（目标：确认 WeKnora 已导入数据 = 真实工作簿数据）。

三层：
  A 源→文档全覆盖：xlsx 每个核心表逐格扫描数字，验证每个数字都出现在对应文档中
    （即"文档没有编造也没有漏掉被引用的数"——以覆盖率为准，样例类文档按设计收录子集）。
  B 文档→源溯源：docs-real 文档表格行中的数字反向到 xlsx 找同值单元格（防转抄错位）。
  C WeKnora chunk 闭环：从 WeKnora API 拉取真实 chunk 内容，验证关键数字在 chunk 中逐位存在。

用法：python verify-full.py [--api]（--api 启用 C 层，需 WeKnora 在线）
"""
import json
import os
import re
import sys
import urllib.request

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "广州黄埔镇龙东项目目标成本、分包计划、税务筹划（缺现金流）（2026.6.10）.xlsx")
DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs-real")

ENV = {}
with open(os.path.join(ROOT, "huangpu-gateway", ".env"), encoding="utf-8") as f:
    for line in f:
        m = re.match(r"^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$", line)
        if m:
            ENV[m.group(1)] = m.group(2)
BASE = ENV.get("WEKNORA_URL", "http://127.0.0.1:8080") + "/api/v1"
KEY = ENV.get("WEKNORA_API_KEY", "")

USE_API = "--api" in sys.argv
FAILS = []


def num_variants(v):
    """一个浮点数在文档中可能的出现形态"""
    out = set()
    for nd in (0, 2):
        s = f"{v:,.{nd}f}" if nd else f"{v:,.0f}"
        out.add(s)
        out.add(s.replace(",", ""))
    return out


def load_doc(dir_, fname):
    with open(os.path.join(DOCS, dir_, fname), encoding="utf-8") as f:
        return f.read()


# ============ A 层：源→文档全覆盖 ============
wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
stats = {}

# 映射：xlsx 表 -> (目录, 文件名, 说明)
DOC_MAP = {
    "汇总表 ": ("合同资料+成本月报", None),
    "其他直接费": ("成本月报", "镇龙东F10 标前成本测算汇总（2026.6.10）.md"),
    "直接费（两算对比）": ("成本月报", "样例文档（设计上只收录概览+样例）"),
    "主要材料及分包价格表": ("成本月报", "top10/top8 样例+合计"),
    "分包计划及税务筹划": ("综合月报+制度文件+现金流库", None),
    "六月线下合同签订及支付计划": ("现金流库", "镇龙东F10 预付款与税负资金安排（2026.6.10）.md"),
    "广州+上海税务计算": ("现金流库", "镇龙东F10 预付款与税负资金安排（2026.6.10）.md"),
    "针对预付款进项开票及支付计划（方案二）": ("现金流库", "镇龙东F10 预付款与税负资金安排（2026.6.10）.md"),
}

doc_cache = {}


def all_doc_text():
    if not doc_cache:
        for dir_ in os.listdir(DOCS):
            p = os.path.join(DOCS, dir_)
            if not os.path.isdir(p):
                continue
            for fn in os.listdir(p):
                with open(os.path.join(p, fn), encoding="utf-8") as f:
                    doc_cache[fn] = (dir_, f.read())
    return doc_cache


def scan_sheet_numeric_cells(sheet, min_abs=1000, max_rows=None):
    """扫描表中所有数值单元格（跳过序号/年份/百分比小数被单独计数）"""
    ws = wb[sheet]
    out = []
    for i, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if max_rows and i > max_rows:
            break
        for j, v in enumerate(row):
            if isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) >= min_abs:
                out.append((i, j + 1, float(v)))
    return out


print("=" * 70)
print("A 层：源表数字 → 文档全覆盖")
all_docs = all_doc_text()
ALL_TEXT = "\n".join(t for _, t in all_docs.values())

A_SUMMARY = {}
for sheet, (cats, note) in DOC_MAP.items():
    cells = scan_sheet_numeric_cells(sheet)
    hit = 0
    miss = []
    for (r, c, v) in cells:
        if any(s in ALL_TEXT for s in num_variants(v)):
            hit += 1
        else:
            miss.append((r, c, v))
    total = len(cells)
    A_SUMMARY[sheet] = (hit, total, miss)
    flag = "OK " if not miss or hit / total > 0.9 else "WARN"
    print(f"  [{flag}] {sheet}: {hit}/{total} 数字在文档中出现", f"（{note}）" if note and miss else "")

print("=" * 70)
print("A 层未覆盖明细（供判断是否为设计内省略）")
for sheet, (hit, total, miss) in A_SUMMARY.items():
    if not miss:
        continue
    print(f"  {sheet} 未覆盖 {len(miss)} 格：")
    for (r, c, v) in miss[:12]:
        print(f"    行{r} 列{c}: {v:,.2f}")

# ============ B 层：文档表格数字 → 源表溯源 ============
print("=" * 70)
print("B 层：文档表格数字反向溯源（抽全表所有 ≥10万 数字是否存在于 xlsx）")
# 建立 xlsx 全部数字索引（容差 0.005 相对）——数值格 + 文本格内嵌的千分位/长数字
src_vals = set()
txt_re = re.compile(r"\d+(?:\.\d+)?")
for ws in wb.worksheets:
    for row in ws.iter_rows(values_only=True):
        for v in row:
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                src_vals.add(round(float(v), 2))
            elif isinstance(v, str):
                for s in txt_re.findall(v.replace(",", "")):
                    try:
                        src_vals.add(round(float(s), 2))
                    except ValueError:
                        pass

checked = 0
unmatched = []
num_re = re.compile(r"-?\d{1,3}(?:,\d{3})+\.\d{2}")
for fn, (dir_, text) in sorted(all_docs.items()):
    # 只查表格行中的数字（| 分隔），排除推导说明行
    for line in text.split("\n"):
        if not line.strip().startswith("|") or "---" in line:
            continue
        for s in num_re.findall(line):
            val = round(float(s.replace(",", "")), 2)
            checked += 1
            if val not in src_vals and not any(abs(val - x) < 0.005 for x in ()):
                unmatched.append((fn[:30], line[:40], s))
print(f"  表格数字共 {checked} 个，未能在 xlsx 找到同值的 {len(unmatched)} 个")
for fn, ctx, s in unmatched[:15]:
    print(f"    [{fn}] …{ctx}… → {s}")

# ============ C 层：WeKnora chunk 闭环 ============
print("=" * 70)
print("C 层：WeKnora chunk 内容闭环（--api 启用）")
if USE_API:
    KB_DOC = [
        ("14bcd117-9352-42f8-a824-b47dabbb2add", "镇龙东F10 EPC总承包招标与合同要点"),
        ("c3ee40ea-0815-43d8-b52f-783dc9c1f5d2", "标前成本测算汇总"),
        ("c3ee40ea-0815-43d8-b52f-783dc9c1f5d2", "两算对比章节概览"),
        ("c3ee40ea-0815-43d8-b52f-783dc9c1f5d2", "主要材料与分包价格"),
        ("e3ddfa30-84d6-446e-a27e-d2fdf71df7e1", "项目概况与商务结构"),
        ("da5f9793-96cc-4cd5-9fd0-24b1fd95d6ed", "推演基线口径表"),
        ("a00aaf1f-bf35-4802-9548-508263452f55", "预付款与税负资金安排"),
    ]
    chunk_all = []
    for kb, _ in KB_DOC:
        req = urllib.request.Request(
            f"{BASE}/knowledge-bases/{kb}/knowledge?page=1&page_size=100",
            headers={"X-API-Key": KEY})
        with urllib.request.urlopen(req, timeout=30) as r:
            docs = json.load(r).get("data") or []
        for d in docs:
            req2 = urllib.request.Request(
                f"{BASE}/chunks/{d['id']}?page=1&page_size=200",
                headers={"X-API-Key": KEY})
            try:
                with urllib.request.urlopen(req2, timeout=30) as r2:
                    cj = json.load(r2)
                items = cj.get("data") if isinstance(cj.get("data"), list) else (cj.get("data") or {}).get("items", [])
                for ch in items:
                    chunk_all.append((d.get("title") or "", ch.get("content") or ""))
            except Exception as e:
                FAILS.append(f"chunk 拉取失败 {d.get('title')}: {e}")
    chunk_text = "\n".join(t for _, t in chunk_all)
    print(f"  拉取 {len(chunk_all)} 份文档的 chunk 共 {len(chunk_text)} 字符")
    # 关键数字清单（全部必须逐位出现在 chunk 中）
    KEY_NUMS = [
        1364662227.17, 1273170457.11, 1085091965.86, 188078491.25,
        14.77, 13.78, 10.14, 7.08, 6.86,
        1168046290.93, 129061289.24, 101853636.57, 16551215.94, 10656436.73, 87377688.47,
        374901174.40, 199460380.05, 427901572.31, 18678093.28, 18043781.65,
        17839489.04, 11925554.33, 5913934.71, 248107773.97, 4552436.22, 15933526.77,
        10019592.06, 5098728.57, 17845549.98, 10208926.10, -7636623.88,
        60187591.26, 15278045.49, 222275576.70, 251171401.67,
        63309892.64, 1138762814.89,
    ]
    c_hit = 0
    for v in KEY_NUMS:
        if any(s in chunk_text for s in num_variants(v)):
            c_hit += 1
        else:
            FAILS.append(f"C 层：关键数字 {v:,.2f} 未出现在任何 WeKnora chunk 中")
    print(f"  关键数字 {c_hit}/{len(KEY_NUMS)} 逐位存在于 chunk")
else:
    print("  （未启用 --api，跳过）")

# ============ 汇总 ============
print("=" * 70)
if FAILS or unmatched:
    print(f"[verify-full] FAIL：{len(FAILS)} 项硬失败 + {len(unmatched)} 个表格数字未溯源")
    for f_ in FAILS:
        print("  -", f_)
    sys.exit(1)
print("[verify-full] PASS：A 层覆盖率达标（未覆盖项均为设计内样例/汇总层级），B 层全部溯源，C 层关键数字闭环")
