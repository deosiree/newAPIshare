# -*- coding: utf-8 -*-
"""
把 docs/ 里的 Excel 导入为网站数据源 public/sites.xlsx（XLSX 是唯一业务数据源，CSV 仅为备份导出）。

日常更新推荐:直接用 Excel 打开 public/sites.xlsx 编辑,或通过编辑页修改后由同步助手写回 XLSX；CSV 仅用于备份导出;
本脚本用于把 Excel 里的批量改动一次性导入。

用法:
    python excel2data.py              # 读取默认 Excel
    python excel2data.py 某个.xlsx    # 读取指定 Excel
"""
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "tools"))
import siteexcel
from siteexcel import FIELDS

DEFAULT_XLSX = ROOT / "docs" / "免费公益站统计合集（持续更新中.xlsx"
SHEET_NAME = "工作表1(副本)"

# Excel 固定列顺序(1-based): A公益站 B注册链接 C有效 D注册 E每日签到 F邀请制
#                          G模型质量 H体验感 I其他 J评分 K验证日期
XLSX_FIELDS = ["name", "url", "status", "register", "daily", "invite",
               "model", "exp", "other", "rating", "verified"]

# 导出时需要剔除的字段(绝不写入公开的 sites.xlsx),例如密钥类内容。
PRIVATE_FIELDS = []


def clean(v):
    if v is None:
        return ""
    return str(v).strip()


def load_rows(xlsx_path):
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb[SHEET_NAME]
    existing = {r["name"]: r for r in siteexcel.load_rows()}
    rows = []
    for row in ws.iter_rows(min_row=2, max_col=len(XLSX_FIELDS), values_only=True):
        item = {k: clean(v) for k, v in zip(XLSX_FIELDS, row)}
        if not item["name"] and not item["url"]:
            continue
        if not item["name"]:
            item["name"] = "未命名站点"
        for f in PRIVATE_FIELDS:
            item.pop(f, None)
        # 保留 CSV 里已有、而 Excel 没有的字段(签到地址/三源评价/渠道数据等)
        for k, v in existing.get(item["name"], {}).items():
            item.setdefault(k, v)
        rows.append(item)
    return rows


def main():
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.exists():
        sys.exit(f"找不到 Excel 文件: {xlsx}")
    rows = load_rows(xlsx)
    siteexcel.save_rows(rows)
    siteexcel.touch_updated()
    print(f"完成: {len(rows)} 个站点 -> {siteexcel.SITES_XLSX}")


if __name__ == "__main__":
    main()
