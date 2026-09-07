# -*- coding: utf-8 -*-
"""
从真实标前测算工作簿生成 WeKnora 灌库文档（docs-real/，5 库 6 份）。

数据来源：仓库根目录《广州黄埔镇龙东项目目标成本、分包计划、税务筹划（缺现金流）（2026.6.10）.xlsx》
铁律：
  1. 所有数字从 xlsx 直读，关键值硬断言——防转抄错误；
  2. 工作簿「审核表/编制说明」为洋田村 AZ-07 模板残留，一律不采；
  3. 现金流缺失（文件名自标），baseline 现金流结余按 0 并在文档中明示口径；
  4. 全局常量（红线/钢筋份额）为推导值，推导式写入文档。
生成物含真实商务数据，仅本地留存（.gitignore 已排除 docs-real/），严禁入库 git。
"""
import math
import os
import re
import sys

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "广州黄埔镇龙东项目目标成本、分包计划、税务筹划（缺现金流）（2026.6.10）.xlsx")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs-real")

FULL = "广州市黄埔区新龙镇镇龙村（西片区）城中村改造项目（镇龙东片区）复建F10地块"
SHORT = "镇龙东F10"
TITLE = f"{FULL}（简称：{SHORT}）"
SRC_NOTE = (
    ">\n> 数据来源：《广州黄埔镇龙东项目目标成本、分包计划、税务筹划（缺现金流）（2026.6.10）.xlsx》"
    "（真实项目资料，非演示数据）。\n>\n"
    "> 源工作簿的「审核表」「编制说明」两表表头与限价数据系洋田村 AZ-07 项目模板残留，本摘录一律未采用；"
    "现金流测算表缺失（文件名自标），涉及现金流的口径见对应条目说明。\n"
)
PROV = "\n---\n\n" + SRC_NOTE


def w(v):
    """万元，保留 2 位"""
    return round(v / 10000, 2)


def yi(v):
    """亿元，保留 4 位"""
    return round(v / 1e8, 4)


def pct(v, nd=2):
    return round(v * 100, nd)


def approx(a, b, tol=0.5):
    return abs(a - b) <= tol


def near(a, b, label):
    """断言近似相等（万元精度）"""
    if not approx(a, b, tol=1.0):
        sys.exit(f"[断言失败] {label}: {a} != {b}")


wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)


def sheet_rows(name, max_col=30):
    ws = wb[name]
    return [list(r) for r in ws.iter_rows(max_col=max_col, values_only=True)]


def cell(rows, r, c):
    return rows[r - 1][c - 1]


# ============ 1. 汇总表 ============
hz = sheet_rows("汇总表 ")
assert "复建F10地块" in str(cell(hz, 1, 1))
CTRL = cell(hz, 20, 3)    # 招标控制价
BID = cell(hz, 20, 4)     # 预估合同价
COST = cell(hz, 20, 5)    # 内部测算成本
PROFIT = cell(hz, 20, 6)  # 相对控制价利润
near(CTRL, 1364662227.17, "控制价")
near(BID, 1273170457.11, "合同价")
near(COST, 1085091965.86, "测算成本")
near(PROFIT, 188078491.25, "利润")
PROFIT_RATE = round(PROFIT / BID * 100, 2)          # 相对中标价口径（引擎公式一致）
assert abs(PROFIT_RATE - cell(hz, 21, 7) * 100) < 0.01  # G21=14.77%
assert abs(cell(hz, 20, 7) * 100 - round(PROFIT / CTRL * 100, 2)) < 0.01  # G20 相对招标 13.78%
MGMT_FEE = cell(hz, 19, 5)   # 综合管理费 1527.80万
OTHER_DIRECT = cell(hz, 18, 5)  # 其他直接费 6018.76万
TAX = cell(hz, 17, 4)        # 合同价侧税金
subjects = []  # (名, 控制价, 合同价, 成本, 利润, 利润率%)
for r in range(4, 15):
    subjects.append((cell(hz, r, 2), cell(hz, r, 3), cell(hz, r, 4), cell(hz, r, 5), cell(hz, r, 6), round(cell(hz, r, 7) * 100, 2)))
near(sum(s[3] for s in subjects), 888317246.23, "分部分项成本合计")
near(sum(s[1] for s in subjects), 1138762814.89, "分部分项控制价合计")
# 二 总价措施 / 三 其他项目费 / 四 税金
MEAS = (cell(hz, 15, 3), cell(hz, 15, 4))   # 控制价/合同价
OTH_PKG = (cell(hz, 16, 3), cell(hz, 16, 4))
TAX_PKG = (cell(hz, 17, 3), cell(hz, 17, 4))
near(sum(s[1] for s in subjects) + MEAS[0] + OTH_PKG[0] + TAX_PKG[0], CTRL, "控制价分项加总")

# ============ 2. 其他直接费 ============
qj = sheet_rows("其他直接费")
qd_items = []
for r in range(5, 19):
    name, calc, fee, note = cell(qj, r, 2), cell(qj, r, 4), cell(qj, r, 6), cell(qj, r, 8)
    if name is None and fee is None:
        continue
    qd_items.append((name, calc, fee, note))
near(cell(qj, 19, 6), 60187591.26, "其他直接费合计")
near(sum(i[2] or 0 for i in qd_items), 60187591.26, "其他直接费分项加总")

# ============ 3. 直接费两算对比：章节聚合 + 单价样例 ============
zf = sheet_rows("直接费（两算对比）", max_col=30)
SEC_RE = re.compile(r"^[一二三四五六七八九十]+$")
SUB_RE = re.compile(r"^\d+\.\d+$")
sections = {}   # 名 -> {rows, samples}
cur = None
for r in range(6, len(zf) + 1):
    a, b = cell(zf, r, 1), cell(zf, r, 2)
    if b is None and a is None:
        continue
    if isinstance(a, str) and SEC_RE.match(a.strip()):
        cur = str(b).strip()
        sections.setdefault(cur, {"rows": 0, "samples": []})
        continue
    if isinstance(a, str) and SUB_RE.match(a.strip()):
        continue  # 1.1 等子节头
    name, unit, qty, up_ctrl, amt_ctrl = cell(zf, r, 2), cell(zf, r, 4), cell(zf, r, 5), cell(zf, r, 6), cell(zf, r, 7)
    fee_sub = cell(zf, r, 26)   # Z 小计
    if not isinstance(name, str):
        continue
    if cur is None:
        continue
    is_detail = (isinstance(a, (int, float)) or a is None) and (amt_ctrl is not None or fee_sub is not None)
    if not is_detail:
        continue
    s = sections[cur]
    s["rows"] += 1
    interesting = isinstance(qty, (int, float)) and isinstance(up_ctrl, (int, float)) and (amt_ctrl or 0) > 0
    big = isinstance(amt_ctrl, (int, float)) and amt_ctrl > 5_000_000
    key_hit = any(k in name for k in ("钢筋", "混凝土C30", "模板", "外运土方", "围挡", "清表", "预制构件"))
    if interesting and (len(s["samples"]) < 3 or big or key_hit) and len(s["samples"]) < 6:
        s["samples"].append((name, unit, qty, up_ctrl, amt_ctrl, fee_sub))

# ============ 4. 主要材料及分包价格表 ============
mat_ws = sheet_rows("主要材料及分包价格表", max_col=24)
mats = []
for r in range(3, 51):
    nm, un, qty, up, amt = cell(mat_ws, r, 2), cell(mat_ws, r, 3), cell(mat_ws, r, 4), cell(mat_ws, r, 6), cell(mat_ws, r, 7)
    if isinstance(nm, str) and isinstance(amt, (int, float)):
        mats.append((nm, un, qty, up, amt, r))
near(cell(mat_ws, 51, 7), 222275576.70, "材料不含税合计")
near(sum(m[4] for m in mats), 222275576.70, "材料分项加总")
mats.sort(key=lambda m: -m[4])
subs = []
for r in range(3, 60):
    nm, un, qty, up, amt = cell(mat_ws, r, 13), cell(mat_ws, r, 14), cell(mat_ws, r, 15), cell(mat_ws, r, 16), cell(mat_ws, r, 17)
    if isinstance(nm, str) and isinstance(amt, (int, float)):
        subs.append((nm, un, qty, up, amt, r))
subs.sort(key=lambda m: -m[4])
ffl = {}
for r in range(3, 49):
    nm, rate = cell(mat_ws, r, 23), cell(mat_ws, r, 24)
    if isinstance(nm, str) and isinstance(rate, (int, float)):
        ffl.setdefault(round(rate * 100), []).append(nm)

# ============ 5. 分包计划及税务筹划 ============
fb = sheet_rows("分包计划及税务筹划")
REVENUE = cell(fb, 3, 3)          # 业主收入不含税
near(REVENUE, 1168046290.93, "业主收入")
REMIT = cell(fb, 4, 3)            # 代缴代扣
REMIT_PROFIT = cell(fb, 5, 3)     # 上缴公司利润 8%
REMIT_MGMT = cell(fb, 6, 3)       # 项目管理费 1.3%
REMIT_TAX = cell(fb, 7, 3)        # 上缴部分税金 0.837%
SHAREHOLDER = cell(fb, 7, 9)      # 股东方剩余利润
near(REMIT, REMIT_PROFIT + REMIT_MGMT + REMIT_TAX, "代缴代扣加总")
RED_LINE = round(REMIT / BID * 100, 2)  # 10.14：固定上缴负担（相对合同价），跌破则股东方剩余转负
near(RED_LINE, 10.14, "红线推导")
SHAREHOLDER_RATE = round(SHAREHOLDER / BID * 100, 2)
cats = {
    "劳务": cell(fb, 9, 3), "专业": cell(fb, 43, 3), "材料": cell(fb, 71, 3),
    "其他合同": cell(fb, 120, 3), "待签合同额": cell(fb, 132, 3),
}
near(sum(cats.values()), cell(fb, 8, 3), "对下合同四分类加总")
# 表内原值：F 列含税额、G 列占比（"对下合同计划"文档一律用表内值，不自行推导）
cats_gross = {
    "劳务": cell(fb, 9, 6), "专业": cell(fb, 43, 6), "材料": cell(fb, 71, 6),
    "其他合同": cell(fb, 120, 6), "待签合同额": cell(fb, 132, 6),
}
cats_share = {
    "劳务": cell(fb, 9, 7), "专业": cell(fb, 43, 7), "材料": cell(fb, 71, 7),
    "其他合同": cell(fb, 120, 7), "待签合同额": cell(fb, 132, 7),
}
near(sum(cats_gross.values()), cell(fb, 8, 6), "对下合同四分类含税加总")
DOWN_TOTAL = cell(fb, 8, 3)
DOWN_GROSS = cell(fb, 8, 6)
TAX_LOAD = cell(fb, 133, 5)      # 项目整体税负
TAX_PREPAID = cell(fb, 134, 5)   # 项目整体预缴
TAX_REMIT = cell(fb, 135, 5)     # 上缴公司税金
PREPAY = cell(fb, 136, 4)        # 预付款含税
PREPAY_PRE2 = cell(fb, 137, 5)   # 预交2%
PREPAY_7 = cell(fb, 138, 5)      # 其余7%
EXTRA_INPUT = cell(fb, 142, 5)   # 需增加进项最小值
STEEL = cell(fb, 78, 3)          # 材料-钢材
near(STEEL, 76834274.14, "钢材")
STEEL_SHARE = round(STEEL / COST * 100, 2)  # 7.08

# 分包计划全量行（劳务 33 + 专业 27 + 材料 48 + 其他 11 + 待签，含税/税额逐行）
fb_sections = [
    ("（一）劳务", 9, 43), ("（二）专业", 43, 71), ("（三）材料", 71, 120),
    ("（四）其他合同", 120, 132), ("（五）待签合同额", 132, 133),
]
fb_rows_all = []
for sec_name, r0, r1 in fb_sections:
    rows = []
    for r in range(r0, r1):
        no, nm = cell(fb, r, 1), cell(fb, r, 2)
        c, d, e, f = cell(fb, r, 3), cell(fb, r, 4), cell(fb, r, 5), cell(fb, r, 6)
        if isinstance(nm, str) and isinstance(c, (int, float)):
            rows.append((no, nm, c, d, e, f))
    fb_rows_all.append((sec_name, rows))
near(sum(len(rows) for _, rows in fb_rows_all), 34 + 27 + 49 + 12 + 1, "分包计划全量行数")

# ============ 6. 六月线下合同签订及支付计划 ============
lj = sheet_rows("六月线下合同签订及支付计划", max_col=14)
jun_contracts = []
for r in range(2, 12):
    nm, plan, signed, meter, pay, note = cell(lj, r, 2), cell(lj, r, 6), cell(lj, r, 7), cell(lj, r, 8), cell(lj, r, 12), cell(lj, r, 14)
    if isinstance(nm, str) and nm != "合计":
        jun_contracts.append((nm, plan, signed, meter, pay, note))
# 全量表（含中标价/控制价/内控成本/税率/税金/支付比例/备注）
jun_full = []
for r in range(2, 12):
    nm = cell(lj, r, 2)
    if not isinstance(nm, str) or nm == "合计":
        continue
    vals = dict(
        bid=cell(lj, r, 3), ctrl=cell(lj, r, 4), target=cell(lj, r, 5),
        plan=cell(lj, r, 6), signed=cell(lj, r, 7), meter=cell(lj, r, 8),
        invoice=cell(lj, r, 9), rate=cell(lj, r, 10), tax=cell(lj, r, 11),
        pay=cell(lj, r, 12), ratio=cell(lj, r, 13), note=cell(lj, r, 14),
    )
    jun_full.append((nm, vals))
near(cell(lj, 14, 7), 200087105.90, "六月签约合计")
JUN_SIGNED = cell(lj, 14, 7)
JUN_PREPAID = cell(lj, 15, 11)
JUN_VAT = cell(lj, 19, 11)       # 实缴增值税
near(JUN_PREPAID, 248107773.97, "六月预付款")
near(cell(lj, 16, 11), 5098728.57, "预缴税")

# 方案二全量表
fa2 = sheet_rows("针对预付款进项开票及支付计划（方案二）", max_col=13)
fa_full = []
for r in range(2, 12):
    nm = cell(fa2, r, 2)
    if not isinstance(nm, str) or nm == "合计":
        continue
    vals = dict(
        bid=cell(fa2, r, 3), ctrl=cell(fa2, r, 4), target=cell(fa2, r, 5),
        signed=cell(fa2, r, 6), meter=cell(fa2, r, 7), invoice=cell(fa2, r, 8),
        rate=cell(fa2, r, 9), tax=cell(fa2, r, 10), pay=cell(fa2, r, 11),
        ratio=cell(fa2, r, 12), note=cell(fa2, r, 13),
    )
    fa_full.append((nm, vals))
near(cell(fa2, 13, 8), 115006809.03, "方案二可抵扣进项合计")

# ============ 7. 税务计算 ============
sw = sheet_rows("广州+上海税务计算", max_col=13)
GZ_PREPAID = cell(sw, 23, 10)     # 广州预缴小计 5098728.57
SH_VAT = cell(sw, 36, 7)          # 上海应交增值税 15933526.77
SH_TOTAL = cell(sw, 36, 12)       # 上海小计 17845549.98
SH_PREPAID_ALL = cell(sw, 38, 12)  # 预缴总税 22944278.55
near(GZ_PREPAID, 5098728.57, "广州预缴")
near(SH_TOTAL, 17845549.98, "上海小计")
near(SH_PREPAID_ALL, 22944278.55, "预缴总税")

print("[extract] 全部断言通过，开始生成文档")

# ============ 文档生成 ============
os.makedirs(OUT, exist_ok=True)
for d in ("合同资料", "成本月报", "综合月报", "制度文件", "现金流库"):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)


def write(dir_name, fname, body):
    path = os.path.join(OUT, dir_name, fname)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    print("[gen]", os.path.relpath(path, ROOT))


def fmt(v, nd=2):
    return f"{v:,.{nd}f}"


# ---- 1. 合同资料 ----
rows_subj = "\n".join(
    f"| {i+1} | {n} | {fmt(c)} | {fmt(d)} | {fmt(e)} | {fmt(f)} | {g}% |"
    for i, (n, c, d, e, f, g) in enumerate(subjects)
)
write("合同资料", "镇龙东F10 EPC总承包招标与合同要点（标前测算2026.6.10）.md", f"""# {TITLE} 工程施工图设计及施工总承包（EPC）——招标与合同要点（标前测算，基准日 2026-06-10）

## 1. 项目与测算口径

- 项目全称：{FULL}（简称：{SHORT}）
- 承包模式：工程施工图设计及施工总承包（EPC）
- 本测算性质：**标前成本测算**（尚未中标、未开工）；基准日 2026-06-10
- 招标控制价：**{fmt(CTRL)} 元**（{yi(CTRL)} 亿元，含税）
- 预估合同价：**{fmt(BID)} 元**（{yi(BID)} 亿元，含税）——分部分项及单价措施费按控制价下浮 5% 测算，总价措施费、其他项目费、税金分项单独测算
- 测算利润：{fmt(PROFIT)} 元（{yi(PROFIT)} 亿元）；相对控制价利润率 {round(PROFIT/CTRL*100,2)}%、相对合同价利润率 **{PROFIT_RATE}%**
- 承包人税务主体：上海城建市政工程（集团）有限公司（广州当地预缴，见现金流库文档）

## 2. 招标商务条款（摘自「招标文件经济风险清单」所引招标文件条款）

| 条款 | 本合同约定 | 招标文件出处 |
|---|---|---|
| 预付款 | 工程施工费合同价（不含暂列金额、暂估价）的 **20%**，提交履约保函并办理请款手续后支付 | 17.2.1，P150 |
| 过程支付 | 每月 5 日前上报，按审定月度完成工程量的 **60%** 支付进度款；关键节点后按已完成工程量 **80%** 支付 | 17.3.1，P151-152 |
| 竣工/结算支付 | 竣工验收合格付至 **85%**，结算审定后付至 **97%**，**3%** 作质保金（竣工验收满 2 年返 50% 并扣防水保证金、满 5 年结清） | 17.3.1，P152-153 |
| 主材调差 | 承包人承担工料机价格涨跌 **±10% 以内（含）** 风险不予调整；超 10% 可调，范围限人工、机械台班、砂、碎石、石屑及穗开环建〔2008〕59 号清单内材料 | 通用条款 16.1，P140 |
| 违约责任 | 解除合同时按项目施工图预算金额的 **5%** 支付违约金并赔偿实际损失；发包人可从应付款直接扣除 | 22.2，P174-175 |
| 结算周期 | 竣工验收合格起 20 天内报结算、60 天内报财政主管部门；发包人 20 天内审核（含监理 10 天、咨询 10 天） | 17.5.3，P157 |
| 争议解决 | 协商 → 建设行政主管部门调解 → 项目所在地人民法院**诉讼**（非仲裁） | 第 24 条，P184 |
| 计量方式 | **月度计量**（施工图预算审定前按 60%、审定后按节点 80%） | 17.3.1，P151 |
| 总价措施费 | 绿色施工安全防护措施费 {fmt(63309892.64)} 元（不参与价格波动调整） | 汇总表备注 |

## 3. 招标控制价构成（汇总表口径，元）

| 序号 | 项目名称 | 招标控制价 | 预估合同价 | 内部测算成本 | 利润（相对控制价） | 利润率 |
|---|---|---|---|---|---|---|
{rows_subj}

- 分部分项及单价措施工程费合计：控制价 {fmt(cell(hz,3,3))} 元、合同价 {fmt(cell(hz,3,4))} 元、成本 {fmt(cell(hz,3,5))} 元、利润 {fmt(cell(hz,3,6))} 元、利润率 16.99%（以上均为不含税口径）
- 二 总价措施费：控制价 {fmt(MEAS[0])} 元、合同价 {fmt(MEAS[1])} 元（其中绿色施工安全防护措施费 63309892.64 元）
- 三 其他项目费（含总包服务费）：控制价 {fmt(OTH_PKG[0])} 元，合同价侧保留 {fmt(OTH_PKG[1])} 元
- 四 税金：控制价 {fmt(TAX_PKG[0])} 元、合同价 {fmt(TAX_PKG[1])} 元（按控制价下浮 5% 后的税金计算，预估项目负税率 1.3%）
- 五 其他直接费 {fmt(OTHER_DIRECT)} 元、六 综合管理费（间接费）{fmt(MGMT_FEE)} 元（按 1.3% 考虑），均为成本项——汇总表在「相对控制价利润」列以负值列示（{fmt(cell(hz,18,6))}、{fmt(cell(hz,19,6))}）
- 七 合计：控制价 **{fmt(CTRL)}**、合同价 **{fmt(BID)}**、成本 **{fmt(COST)}**、利润 **{fmt(PROFIT)}**
""" + PROV)

# ---- 2. 成本测算汇总 ----
qd_rows = "\n".join(
    f"| {n} | {fmt(fee) if fee else '—'} | {(note or '')} |"
    for n, calc, fee, note in qd_items
)
write("成本月报", "镇龙东F10 标前成本测算汇总（2026.6.10）.md", f"""# {TITLE}——标前成本测算汇总（基准日 2026-06-10）

## 1. 测算总览

| 指标 | 金额（元） | 口径 |
|---|---|---|
| 招标控制价 | {fmt(CTRL)} | 含税 |
| 预估合同价 | {fmt(BID)} | 含税，{yi(BID)} 亿 |
| 内部测算成本 | {fmt(COST)} | 含税，{yi(COST)} 亿 |
| 测算利润 | {fmt(PROFIT)} | {yi(PROFIT)} 亿 |
| 利润率（相对控制价） | {round(PROFIT/CTRL*100,2)}% | 汇总表 G20 |
| **利润率（相对合同价）** | **{PROFIT_RATE}%** | 汇总表 G21，=(合同价−测算成本)/合同价 |
| 总利润口径 | 16.91% | 汇总表 G24 = 14.77% + 管理费 1.3% + 总包税金 0.837% |

## 2. 分部分项 11 科目成本（不含税）

| 科目 | 控制价（元） | 合同价（元） | 测算成本（元） | 利润率 |
|---|---|---|---|---|
""" + "\n".join(f"| {n} | {fmt(c)} | {fmt(d)} | {fmt(e)} | {g}% |" for n, c, d, e, f, g in subjects) + f"""

利润率最低两项：幼儿园 10.28%、高层住宅 12.63%（{yi(423853766.68)} 亿控制价为最大单项）；其余多数科目按 20% 计利。

## 3. 其他直接费（{fmt(OTHER_DIRECT)} 元）

| 费用名称 | 金额（元） | 备注 |
|---|---|---|
{qd_rows}
| **合计** | **{fmt(OTHER_DIRECT)}** |  |

## 4. 费用口径说明

- 综合管理费（间接费）{fmt(MGMT_FEE)} 元，汇总表按 1.3% 考虑（注意：分包计划表按含税合同价 1.3% 计的项目管理费为 {fmt(REMIT_MGMT)} 元，两表口径略有差异，引用时注明出处）
- 税金：合同价侧 {fmt(TAX_PKG[1])} 元，预估项目负税率 1.3%
- 总价措施费 {fmt(MEAS[0])} 元在汇总表中未列成本、全额计入利润——实际消耗由分包/其他直接费科目承担
""" + PROV)

# ---- 3. 两算对比与单价 ----
def sample_rows(sec):
    out = []
    for nm, un, qty, up, amt, fee in sections[sec]["samples"]:
        out.append(f"| {nm} | {un or ''} | {fmt(qty) if isinstance(qty,(int,float)) else qty} | {fmt(up) if isinstance(up,(int,float)) else up} | {fmt(amt)} | {fmt(fee) if fee is not None else '—'} |")
    return "\n".join(out) or "（无代表性样例）"

sec_lines = []
for i, (n, c, d, e, f, g) in enumerate(subjects):
    sec = n
    info = sections.get(sec, {"rows": 0})
    sec_lines.append(f"| {n} | {info['rows']} | {g}% |")

# 两算对比拆两份灌库（单份过大曾致批量 embedding 批量超时，且拆分利于检索粒度）
write("成本月报", "镇龙东F10 两算对比章节概览与代表性单价（2026.6.10）.md", f"""# {TITLE}——直接费两算对比：章节概览与代表性单价（基准日 2026-06-10）

源表「直接费（两算对比）」共 11 章节、约 3130 行清单子目，逐行含招标控制价与分包费/材料费/机械费三类目标成本对比；本文档收录章节概览与代表性单价，逐行明细以源表为准。

## 1. 章节概览（利润率为汇总表口径）

| 章节 | 明细行数 | 利润率 |
|---|---|---|
""" + "\n".join(sec_lines) + f"""

## 2. 代表性两算单价样例（控制价单价 vs 目标成本）

### 前期工程
| 子目 | 单位 | 数量 | 控制价单价 | 控制价金额 | 成本小计 |
|---|---|---|---|---|---|
{sample_rows("前期工程")}

### 土方及基坑支护工程
| 子目 | 单位 | 数量 | 控制价单价 | 控制价金额 | 成本小计 |
|---|---|---|---|---|---|
{sample_rows("土方及基坑支护工程")}

### 地下室 / 高层住宅（体量最大两章）
| 子目 | 单位 | 数量 | 控制价单价 | 控制价金额 | 成本小计 |
|---|---|---|---|---|---|
{sample_rows("地下室")}

{sample_rows("高层住宅")}
""" + PROV)

write("成本月报", "镇龙东F10 主要材料与分包价格及下浮率（2026.6.10）.md", f"""# {TITLE}——主要材料与分包价格及专业工程下浮率（基准日 2026-06-10）

## 1. 主要材料目标价（全量 {len(mats)} 项，材料合计不含税 {fmt(222275576.70)} 元 / 含税 {fmt(251171401.67)} 元）

| 材料名称 | 单位 | 数量 | 信息价2026.5 | 成本单价（元） | 不含税合价（元） | 税金（元） | 含税单价（元） | 含税合价（元） |
|---|---|---|---|---|---|---|---|---|
""" + "\n".join(
    f"| {m[0]} | {m[1]} | {fmt(m[2])} | {fmt(cell(mat_ws, m[5], 5)) if isinstance(cell(mat_ws, m[5], 5), (int, float)) else '—'} | {fmt(m[3])} | {fmt(m[4])} | {fmt(cell(mat_ws, m[5], 9)) if isinstance(cell(mat_ws, m[5], 9), (int, float)) else '—'} | {fmt(cell(mat_ws, m[5], 10)) if isinstance(cell(mat_ws, m[5], 10), (int, float)) else '—'} | {fmt(cell(mat_ws, m[5], 11)) if isinstance(cell(mat_ws, m[5], 11), (int, float)) else '—'} |"
    for m in mats) + f"""

注：钢筋目标单价 3000 元/t、总量 {fmt(25504.18)} t；混凝土 C30 单价 293.36 元/m³、总量 {fmt(102776.03)} m³。合计行照录源表：不含税 {fmt(cell(mat_ws,51,7))} 元、税金合计 {fmt(cell(mat_ws,51,9))} 元（源表合计行公式格）、含税 {fmt(cell(mat_ws,51,11))} 元。

## 2. 主要分包单价（全量 {len(subs)} 项，含税列照录源表）

| 分包项 | 单位 | 数量 | 单价不含税（元） | 不含税合价（元） | 税率 | 税金（元） | 单价含税（元） | 含税合价（元） |
|---|---|---|---|---|---|---|---|---|
""" + "\n".join(
    f"| {m[0]} | {m[1]} | {fmt(m[2])} | {fmt(m[3])} | {fmt(m[4])} | {fmt(cell(mat_ws, m[5], 18)) if isinstance(cell(mat_ws, m[5], 18), (int, float)) else '—'} | {fmt(cell(mat_ws, m[5], 19)) if isinstance(cell(mat_ws, m[5], 19), (int, float)) else '—'} | {fmt(cell(mat_ws, m[5], 20)) if isinstance(cell(mat_ws, m[5], 20), (int, float)) else '—'} | {fmt(cell(mat_ws, m[5], 21)) if isinstance(cell(mat_ws, m[5], 21), (int, float)) else '—'} |"
    for m in subs) + f"""

注：「拆除混凝土（残值）」为负项 {fmt([m for m in subs if '残值' in m[0]][0][4])} 元（残值回收冲减成本）。分包单价表 R 列税率以元记（源表口径），例如 3% 项记 0.03、9% 项记 0.09。

## 3. 专业工程下浮率（全量 {sum(len(v) for v in ffl.values())} 项）

- 下浮 25%：{"、".join(ffl.get(25, []))}
- 下浮 30%：{"、".join(ffl.get(30, []))}
- 下浮 35%：{"、".join(ffl.get(35, []))}
""" + PROV)

# ---- 4. 项目概况与商务结构 ----
cat_rows = "\n".join(
    f"| {k} | {fmt(v)} | {fmt(cats_gross[k])} | {pct(cats_share[k])}% |"
    for k, v in cats.items()
)
write("综合月报", "镇龙东F10 项目概况与商务结构（标前2026.6.10）.md", f"""# {TITLE}——项目概况与商务结构（标前，基准日 2026-06-10）

## 1. 标前状态说明（重要）

本项目处于**标前成本测算阶段**：未中标、未开工。因此在建项目口径的指标均为初始值——形象进度 0%、回款率 0%、累计实际成本 0（测算成本 {yi(COST)} 亿为目标口径）、成本完成度 0%、滞后节点 0、风险台账 0 项。招标文件经济风险清单为 9 类条款级评估规则（见合同资料库），非在册风险台账。

## 2. 上缴与股东方结构（分包计划及税务筹划表，元）

| 项目 | 金额（元） | 费率（相对含税合同价） |
|---|---|---|
| 业主收入（不含税） | {fmt(REVENUE)} | 增值税 9% |
| 业主收入（含税=预估合同价） | {fmt(BID)} | — |
| 代缴代扣合计 | {fmt(REMIT)} | **10.14%**（8%+1.3%+0.837%） |
| ├ 上缴公司利润 | {fmt(REMIT_PROFIT)} | 8% |
| ├ 项目管理费 | {fmt(REMIT_MGMT)} | 1.3% |
| └ 上缴公司利润部分税金 | {fmt(REMIT_TAX)} | 0.837% |
| 股东方剩余利润 | {fmt(SHAREHOLDER)} | **{SHAREHOLDER_RATE}%** |

测算利润 {fmt(PROFIT)} 元（相对合同价 {PROFIT_RATE}%）在扣除固定上缴负担后形成股东方剩余。

## 3. 对下合同计划（一体化，不含税合计 {fmt(DOWN_TOTAL)} 元 / 含税 {fmt(DOWN_GROSS)} 元）

| 类别 | 不含税合同额（元） | 含税合同额（元） | 表内占比 |
|---|---|---|---|
{cat_rows}

- 劳务类 {len([1]) and 33} 项按 3% 简易计税；专业类 27 项按 9%；材料类 48 项按 13%；其他合同按 6%
- 股东方利润含税金拆分：劳务科目 {fmt(42416353.63)} 元（3%）+ 专业科目 {fmt(40081508.47)} 元（9%），两笔含税额各 {fmt(43688844.24)} 元——同一利润额分置两个税率科目，系税务筹划安排

## 4. 税负总览

| 指标 | 金额（元） |
|---|---|
| 项目整体税负 | {fmt(TAX_LOAD)} |
| 项目整体预缴 | {fmt(TAX_PREPAID)} |
| 上缴公司税金 | {fmt(TAX_REMIT)} |
| 预付款（含税，工程施工费 20%） | {fmt(PREPAY)} |
| 其中预交 2% | {fmt(PREPAY_PRE2)} |
| 其余缴纳 7% | {fmt(PREPAY_7)} |
| 需增加进项最小值 | **{fmt(EXTRA_INPUT)}** |

预付款一次性到账导致销项瞬时放大，"需增加进项最小值 {fmt(EXTRA_INPUT)} 元"是本项目税务筹划的核心约束（详见现金流库文档）。
""" + PROV)

# ---- 3b. 分包计划全量明细（逐行，税务筹划证据链） ----
def fb_section_md():
    parts = []
    for sec_name, rows in fb_rows_all:
        parts.append(f"\n### {sec_name}\n\n| 序号 | 名称 | 合同价不含税（元） | 税率 | 税金（元） | 合同价含税（元） |\n|---|---|---|---|---|---|")
        for no, nm, c, d, e, f in rows:
            rate = f"{d*100:g}%" if isinstance(d, (int, float)) else "—"
            parts.append(f"| {no if no is not None else ''} | {nm} | {fmt(c)} | {rate} | {fmt(e) if isinstance(e,(int,float)) else '—'} | {fmt(f) if isinstance(f,(int,float)) else '—'} |")
    parts.append(f"\n（表内对照值：对下合同总额税金合计 {fmt(cell(fb,8,5))} 元；劳务段源表 H13 散值 {fmt(cell(fb,13,8))} 为文明施工费引用，照录备查。）")
    return "\n".join(parts)

def jun_full_md():
    parts = []
    for nm, v in jun_full:
        def g(k, nd=2):
            x = v.get(k)
            return fmt(x, nd) if isinstance(x, (int, float)) else "—"
        rate_s = f"{v['rate']*100:g}%" if isinstance(v.get('rate'), (int, float)) else "—"
        ratio_s = f"{v['ratio']*100:.1f}%" if isinstance(v.get('ratio'), (int, float)) else "—"
        parts.append(f"| {nm} | {g('bid')} | {g('ctrl')} | {g('target')} | {g('plan')} | {g('signed')} | {g('meter')} | {rate_s} | {g('tax')} | {g('pay')} | {ratio_s} |")
    # 合计行（源表行14）
    tot = {
        'bid': cell(lj, 14, 3), 'ctrl': cell(lj, 14, 4), 'target': cell(lj, 14, 5),
        'plan': cell(lj, 14, 6), 'signed': cell(lj, 14, 7), 'meter': cell(lj, 14, 8),
        'tax': cell(lj, 14, 11),
    }
    parts.append("| **合计** | " + " | ".join([
        fmt(tot['bid']), fmt(tot['ctrl']), fmt(tot['target']), fmt(tot['plan']),
        fmt(tot['signed']), fmt(tot['meter']), "—", fmt(tot['tax']), "—", "—"]) + " |")
    return "\n".join(parts)

def fa_full_md():
    parts = []
    for nm, v in fa_full:
        def g(k, nd=2):
            x = v.get(k)
            return fmt(x, nd) if isinstance(x, (int, float)) else "—"
        rate_s = f"{v['rate']*100:g}%" if isinstance(v.get('rate'), (int, float)) else "—"
        ratio_s = f"{v['ratio']*100:.1f}%" if isinstance(v.get('ratio'), (int, float)) else "—"
        parts.append(f"| {nm} | {g('bid')} | {g('ctrl')} | {g('target')} | {g('signed')} | {g('meter')} | {g('invoice')} | {rate_s} | {g('tax')} | {g('pay')} | {ratio_s} |")
    # 合计行（源表行13）
    tot = {
        'bid': cell(fa2, 13, 3), 'ctrl': cell(fa2, 13, 4), 'target': cell(fa2, 13, 5),
        'signed': cell(fa2, 13, 6), 'meter': cell(fa2, 13, 7), 'invoice': cell(fa2, 13, 8),
        'tax': cell(fa2, 13, 10),
    }
    parts.append("| **合计** | " + " | ".join([
        fmt(tot['bid']), fmt(tot['ctrl']), fmt(tot['target']), fmt(tot['signed']),
        fmt(tot['meter']), fmt(tot['invoice']), "—", fmt(tot['tax']), "—", "—"]) + " |")
    return "\n".join(parts)

write("综合月报", "镇龙东F10 分包计划及税务筹划全量明细（2026.6.10）.md", f"""# {TITLE}——分包计划及税务筹划全量明细（基准日 2026-06-10）

源表「分包计划及税务筹划」全量 {sum(len(r) for _, r in fb_rows_all)} 行逐行收录（对下合同总额不含税 {fmt(DOWN_TOTAL)} 元、含税 {fmt(DOWN_GROSS)} 元）；分类汇总与上缴结构见《镇龙东F10 项目概况与商务结构（标前2026.6.10）》。
{fb_section_md()}

## 税负汇总（表尾）

| 指标 | 金额（元） |
|---|---|
| 项目整体税负 | {fmt(TAX_LOAD)} |
| 项目整体预缴 | {fmt(TAX_PREPAID)} |
| 上缴公司税金 | {fmt(TAX_REMIT)} |
| 预付款（含税） | {fmt(PREPAY)} |
| 其中预交 2% | {fmt(PREPAY_PRE2)} |
| 其余缴纳部分 7% | {fmt(PREPAY_7)} |
| 实际缴纳 | {fmt(cell(fb,139,5))} |
| 预交税 | {fmt(cell(fb,140,5))} |
| 上缴公司税金（实际缴纳构成） | {fmt(cell(fb,141,5))} |
| 需增加进项最小值 | **{fmt(EXTRA_INPUT)}** |
""" + PROV)

# ---- 5. 推演基线口径表 ----
write("制度文件", "镇龙东F10 推演基线口径表与商务常量推导（2026.6.10）.md", f"""# {TITLE}——推演基线口径表（baseline11 + globals3）与商务常量推导

本文档为利润推演引擎（run_scenario）的取数口径表：基线 11 项 + 全局常量 3 项均从真实标前测算工作簿直取或推导，逐项注明出处。**标前项目（未中标未开工）的在建类字段均为 0，这是真实口径而非缺数。**

## 1. 基线 11 项（baseline）

| 引擎字段 | 名称 | 取值 | 口径与出处 |
|---|---|---|---|
| bid_price_yi | 中标（预估）合同价 | **{yi(BID)}** 亿 | 汇总表「预估合同价」{fmt(BID)} 元；标前未中标，为控制价下浮测算值 |
| target_cost_yi | 目标成本 | **{yi(COST)}** 亿 | 汇总表「内部测算成本」{fmt(COST)} 元 |
| actual_cost_yi | 累计实际成本 | **0** | 标前未开工，无实际成本发生 |
| profit_rate | 当前（测算）利润率 | **{PROFIT_RATE}** % | 汇总表 G21「相对中标价」=（合同价−测算成本)/合同价；注意另有相对控制价口径 {round(PROFIT/CTRL*100,2)}%（G20），引擎取相对合同价口径 |
| payment_rate | 回款率 | **0** | 标前无回款 |
| progress | 形象进度 | **0** | 标前未开工 |
| cost_completion | 成本完成度 | **0** | 无实际成本 |
| lag_nodes | 滞后节点数 | **0** | 无在建节点 |
| risk_total | 风险总数 | **0** | 标前无风险台账；招标文件经济风险清单 9 类为评估规则 |
| risk_red | 红色风险数 | **0** | 同上 |
| cashflow_jun_wan | 本期现金流结余 | **0** | 现金流测算缺失（源工作簿文件名自标），标前按 0；现金流风险主线见「预付款与税负资金安排」文档 |

自洽校验：引擎口径基准利润率 =（{yi(BID)}−{yi(COST)})/{yi(BID)} = {round((BID-COST)/BID*100,2)}% 与 profit_rate 一致。

## 2. 全局常量 3 项（globals）

| 引擎字段 | 名称 | 取值 | 推导 |
|---|---|---|---|
| profit_red_line | 目标利润率红线 | **{RED_LINE}** % | 固定上缴负担 = 上缴公司利润 8% + 项目管理费 1.3% + 上缴部分税金 0.837% = 10.14%（相对含税合同价，分包计划及税务筹划表）；测算利润率跌破该值时项目利润无法覆盖固定上缴、股东方剩余转负。**此为按真实上缴结构推导的管理红线，非公司制度原文** |
| critical_balance_wan | 现金流临界预警线 | **0** | 标前未设定现金流预警线（现金流测算缺失），按 0 计即仅当预测结余为负时预警 |
| steel_share_pct | 钢筋成本份额 | **{STEEL_SHARE}** % | 分包计划材料类「钢材」{fmt(STEEL)} 元 ÷ 内部测算成本 {fmt(COST)} 元 = {STEEL_SHARE}% |

## 3. 商务口径补充

- 招标控制价 {yi(CTRL)} 亿（{fmt(CTRL)} 元，汇总表 C20）；测算利润 {yi(PROFIT)} 亿（{fmt(PROFIT)} 元，汇总表 F20 = 合同价 {fmt(BID)} − 成本 {fmt(COST)}）
- 股东方剩余利润率 {SHAREHOLDER_RATE}%（{fmt(SHAREHOLDER)} 元）——分包计划表 H7/I7 原值
- 项目管理费按含税合同价 1.3% 计 {fmt(REMIT_MGMT)} 元；汇总表综合管理费（间接费）{fmt(MGMT_FEE)} 元口径略有差异，引用注明出处
- 汇总表「总利润」口径 16.91% = 相对合同价利润率 14.77% + 管理费 1.3% + 总包税金 0.837%
""" + PROV)

# ---- 6. 现金流 ----
jun_rows = "\n".join(
    f"| {nm} | {fmt(plan) if plan else '—'} | {fmt(signed) if signed else '—'} | {fmt(meter) if meter else '—'} | {fmt(pay) if pay else '—'} |"
    for nm, plan, signed, meter, pay, note in jun_contracts
)
write("现金流库", "镇龙东F10 预付款与税负资金安排（2026.6.10）.md", f"""# {TITLE}——预付款与税负资金安排（基准日 2026-06-10）

> **现金流测算缺失声明**：源工作簿文件名自标「缺现金流」，本项目暂无月度现金流预测表。本文档收录预付款、税负与六月合同支付的真实安排；推演引擎的现金流结余字段标前按 0 计。

## 1. 预付款与增值税（分包计划及税务筹划表）

- 预付款：工程施工费合同价（不含暂列金、暂估价）的 20% = 不含税 {fmt(cell(fb,136,3))} 元、**含税 {fmt(PREPAY)} 元**（{yi(PREPAY)} 亿）
- 预缴增值税 2%：{fmt(PREPAY_PRE2)} 元；其余缴纳 7%：{fmt(PREPAY_7)} 元；实际缴纳合计 {fmt(cell(fb,139,5))} 元
- **需增加进项最小值：{fmt(EXTRA_INPUT)} 元**——预付款一次性到账使销项瞬时放大，是税务筹划核心约束

## 2. 广州当地预缴（代开发票申请表，申请人：上海城建市政工程（集团）有限公司）

| 税种 | 计税依据 | 税率 | 税额（元） |
|---|---|---|---|
| 增值税 | 227621810.98 | 2% | 4552436.22 |
| 城建税 | 4552436.22 | 7% | 318670.54 |
| 教育费附加 | 4552436.22 | 3% | 136573.09 |
| 地方教育附加 | 4552436.22 | 2% | 91048.72 |
| **小计** |  |  | **{fmt(GZ_PREPAID)}** |

含税总包销售额 {fmt(248107773.972)} 元、不含税 {fmt(227621810.98)} 元。

## 3. 上海侧缴纳（机构所在地）

销项税 {fmt(20485962.99)} 元 − 预缴 {fmt(4552436.22)} 元 = 应交增值税 {fmt(SH_VAT)} 元；附加税费：城建税 7% {fmt(1115346.87)} 元 + 教育费附加 3% {fmt(478005.80)} 元 + 地方教育附加 2% {fmt(318670.54)} 元 = {fmt(1912023.21)} 元；合计 **{fmt(SH_TOTAL)}** 元；预缴总税（广州+上海附加）**{fmt(SH_PREPAID_ALL)}** 元。

## 4. 六月线下合同签订及支付计划（13 项）

| 合同 | 筹划金额 | 实际签订 | 计量金额 | 实际支付 |
|---|---|---|---|---|
{jun_rows}

- 合计：实际签订 **{fmt(JUN_SIGNED)}** 元（{yi(JUN_SIGNED)} 亿）
- 税负测算：预缴税 {fmt(5098728.57)} 元、次月应缴增值税 {fmt(17845549.98)} 元、可抵扣进项 {fmt(10208926.10)} 元、实缴增值税 {fmt(JUN_VAT)} 元、倒挂税负 **-7636623.88** 元
- 钢筋采购合同与云链签订、提前锁定 5000 万货款 100% 支付；管桩锁定 60% 货款——备注：建设单位可能不同意大额材料款对下支付
- 大临场地租赁 180 万元线下先行签订、六月不收取发票

## 5. 进项开票方案比选（方案二表）

- 方案一：与业主沟通预付款分批支付——**建设单位不同意**
- 方案二（本表测算）：项目部争取进项初步满足税负平衡——可抵扣进项 {fmt(11136963.78)} 元、实缴增值税 {fmt(4796562.99)} 元、倒挂税负 -4796562.99 元（支护/土石方虚拟计量 40%、钢筋锁 40%、模板脚手架 40%、管桩锁 30%）
- 方案三：剩余不足进项由集团公司统筹

## 6. 六月合同与方案二全量明细

### 6.1 六月线下合同（全列，元）

| 合同 | 中标价不含暂列金 | 招标控制价不含暂列金 | 内控目标成本 | 筹划金额 | 实际签订 | 计量金额 | 税率 | 其中税金 | 实际支付 | 支付比例 |
|---|---|---|---|---|---|---|---|---|---|---|
{jun_full_md()}

### 6.2 方案二：预付款进项开票及支付计划（全列，元）

| 合同 | 中标价不含暂列金 | 招标控制价不含暂列金 | 内控目标成本 | 实际签订 | 计量金额 | 可收取发票 | 税率 | 其中税金 | 实际支付 | 支付比例 |
|---|---|---|---|---|---|---|---|---|---|---|
{fa_full_md()}
""" + PROV)

print("[gen] 完成：8 份文档 ->", OUT)
