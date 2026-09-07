# -*- coding: utf-8 -*-
"""
二轮独立核对：重读 xlsx 原始单元格，与 docs-real/ 生成的 md 文档交叉比对关键数字。
与 gen-real.py 的断言相互独立（本脚本从 md 文本反向解析数字，而非复用生成内存值）。
用法：python verify-real.py   （全部通过输出 PASS，任何失配非零退出）
"""
import os
import re
import sys

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "广州黄埔镇龙东项目目标成本、分包计划、税务筹划（缺现金流）（2026.6.10）.xlsx")
DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs-real")

wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
failures = []
checks = 0


def load(dir_, kw):
    p = os.path.join(DOCS, dir_, kw)
    if not os.path.exists(p):
        sys.exit(f"[FAIL] 文档缺失: {p}")
    with open(p, encoding="utf-8") as f:
        return f.read()


def has_num(md, value, label, nd=2):
    """md 文本中应出现以千分位/普通格式表示的数值"""
    global checks
    checks += 1
    s = f"{value:,.{nd}f}" if nd else f"{value:,.0f}"
    plain = f"{value:.{nd}f}" if nd else f"{value:.0f}"
    if s in md or plain in md:
        return
    failures.append(f"{label}: 期望 {s}（或 {plain}）未见于文档")


def has_any(md, *variants):
    global checks
    checks += 1
    if not any(v in md for v in variants):
        failures.append(f"文档缺少任一变体: {variants}")


# ---- 1. 汇总表 ----
hz = list(wb["汇总表 "].iter_rows(values_only=True))
md_contract = load("合同资料", "镇龙东F10 EPC总承包招标与合同要点（标前测算2026.6.10）.md")
md_cost = load("成本月报", "镇龙东F10 标前成本测算汇总（2026.6.10）.md")
md_two = load("成本月报", "镇龙东F10 两算对比章节概览与代表性单价（2026.6.10）.md")
md_mat = load("成本月报", "镇龙东F10 主要材料与分包价格及下浮率（2026.6.10）.md")
md_ov = load("综合月报", "镇龙东F10 项目概况与商务结构（标前2026.6.10）.md")
md_pol = load("制度文件", "镇龙东F10 推演基线口径表与商务常量推导（2026.6.10）.md")
md_cf = load("现金流库", "镇龙东F10 预付款与税负资金安排（2026.6.10）.md")

ctrl, bid, cost, profit = hz[19][2], hz[19][3], hz[19][4], hz[19][5]
for md, tag in ((md_contract, "合同资料"), (md_cost, "成本汇总"), (md_pol, "口径表")):
    has_num(md, ctrl, f"{tag}:控制价")
    has_num(md, bid, f"{tag}:合同价")
    has_num(md, cost, f"{tag}:成本")
    has_num(md, profit, f"{tag}:利润")
# 利润率
g20, g21 = hz[19][6], hz[20][6]
for md, tag in ((md_cost, "成本汇总"), (md_pol, "口径表")):
    has_any(md, f"{g21*100:.2f}%", f"{round(g21*100,2)}")   # 相对合同价
# 11 科目逐行（名称+控制价）
for r in range(3, 14):
    name, c = hz[r][1], hz[r][2]
    if isinstance(name, str) and isinstance(c, (int, float)):
        has_num(md_cost, c, f"科目[{name}]控制价")
        has_num(md_cost, hz[r][4], f"科目[{name}]成本")

# ---- 2. 其他直接费 ----
qj = list(wb["其他直接费"].iter_rows(values_only=True))
total_qd = qj[18][5]
has_num(md_cost, total_qd, "其他直接费合计")
for r in range(4, 18):
    nm, fee = qj[r][1], qj[r][5]
    if isinstance(nm, str) and isinstance(fee, (int, float)):
        has_num(md_cost, fee, f"其他直接费[{nm}]")

# ---- 3. 分包计划 ----
fb = list(wb["分包计划及税务筹划"].iter_rows(values_only=True))
pairs = [
    ("业主收入不含税", fb[2][2], md_ov), ("代缴代扣", fb[3][2], md_ov),
    ("上缴利润8%", fb[4][2], md_ov), ("项目管理费1.3%", fb[5][2], md_ov),
    ("上缴部分税金", fb[6][2], md_ov), ("股东方剩余利润", fb[6][8], md_ov),
    ("对下合同总额", fb[7][2], md_ov), ("劳务", fb[8][2], md_ov),
    ("专业", fb[42][2], md_ov), ("材料", fb[70][2], md_ov),
    ("其他合同", fb[119][2], md_ov), ("待签合同额", fb[131][2], md_ov),
    ("整体税负", fb[132][4], md_ov), ("整体预缴", fb[133][4], md_ov),
    ("上缴公司税金", fb[134][4], md_ov), ("预付款含税", fb[135][5], md_cf),
    ("预交2%", fb[136][4], md_cf), ("其余7%", fb[137][4], md_cf),
    ("需增加进项", fb[141][4], md_cf), ("钢材", fb[77][2], md_pol),
]
for label, v, md in pairs:
    if isinstance(v, (int, float)):
        has_num(md, v, label)
# 红线/钢筋份额/利润率推导值
red = round(fb[3][2] / bid * 100, 2)      # 10.14
share = round(fb[77][2] / cost * 100, 2)  # 7.08
prate = round(profit / bid * 100, 2)      # 14.77
for md, tag in ((md_pol, "口径表"),):
    has_any(md, f"{red}", f"{red:.2f}")
    has_any(md, f"{share}", f"{share:.2f}")
    has_any(md, f"{prate}", f"{prate:.2f}")
# 独立公式验算
assert abs(red - 10.14) < 0.005, f"红线推导异常 {red}"
assert abs(share - 7.08) < 0.005, f"钢筋份额异常 {share}"
assert abs(prate - 14.77) < 0.005, f"利润率异常 {prate}"
checks += 3

# ---- 4. 材料表 top10 + 合计 ----
mt = list(wb["主要材料及分包价格表"].iter_rows(values_only=True))
has_num(md_mat, mt[50][6], "材料不含税合计")
mats = [(mt[r][1], mt[r][6]) for r in range(2, 50) if isinstance(mt[r][1], str) and isinstance(mt[r][6], (int, float))]
mats.sort(key=lambda x: -x[1])
for nm, amt in mats[:10]:
    has_num(md_mat, amt, f"材料[{nm}]")

# ---- 5. 六月计划 + 税务 ----
lj = list(wb["六月线下合同签订及支付计划"].iter_rows(values_only=True))
has_num(md_cf, lj[13][6], "六月签约合计")
has_num(md_cf, lj[15][10], "六月预付款金额")
has_num(md_cf, lj[18][10], "实缴增值税")
has_num(md_cf, lj[22][10], "倒挂税负")
sw = list(wb["广州+上海税务计算"].iter_rows(values_only=True))
has_num(md_cf, sw[22][9], "广州预缴小计")
has_num(md_cf, sw[35][11], "上海小计")
has_num(md_cf, sw[37][11], "预缴总税")

# ---- 结果 ----
print(f"[verify] 共 {checks} 项核对")
if failures:
    print(f"[verify] FAIL {len(failures)} 项:")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("[verify] PASS：docs-real 全部关键数字与 xlsx 原始单元格一致（二轮独立核对）")
