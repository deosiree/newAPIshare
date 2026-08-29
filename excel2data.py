# -*- coding: utf-8 -*-
"""
把 docs/ 里的 Excel 导入为网站数据文件 data.js。

日常更新推荐直接在 GitHub 网页上在线编辑 data.js(见 README);
本脚本用于把 Excel 里的批量改动一次性导入网站。

用法:
    python excel2data.py              # 读取默认 Excel
    python excel2data.py 某个.xlsx    # 读取指定 Excel
"""
import json
import sys
from datetime import date
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent
DEFAULT_XLSX = ROOT / "docs" / "免费公益站统计合集（持续更新中.xlsx"
SHEET_NAME = "工作表1(副本)"

# 列顺序(1-based): A公益站 B注册链接 C有效 D注册 E每日签到 F邀请制
#                  G模型质量 H体验感 I其他 J评分 K验证日期
FIELDS = ["name", "url", "status", "register", "daily", "invite",
          "model", "exp", "other", "rating", "verified"]

# 导出时需要剔除的字段(绝不写入公开的 data.js),例如密钥类内容。
# 示例: PRIVATE_FIELDS = ["secret_note"]
PRIVATE_FIELDS = []


def clean(v):
    if v is None:
        return ""
    return str(v).strip()


def load_rows(xlsx_path):
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb[SHEET_NAME]
    rows = []
    for row in ws.iter_rows(min_row=2, max_col=len(FIELDS), values_only=True):
        item = {k: clean(v) for k, v in zip(FIELDS, row)}
        if not item["name"] and not item["url"]:
            continue
        if not item["name"]:
            item["name"] = "未命名站点"
        for f in PRIVATE_FIELDS:
            item.pop(f, None)
        rows.append(item)
    return rows


def render(rows, updated):
    rows_json = ",\n".join("    " + json.dumps(r, ensure_ascii=False) for r in rows)
    banner = (
        "/* 免费公益站统计合集 · 数据文件\n"
        " * © 2026 版权所有 · 数据整理成果,禁止整站搬运后去除署名\n"
        " *\n"
        " * 在线更新:直接编辑下面的 rows 数组,每个 { } 是一行站点;\n"
        " * 新增字段直接在 { } 里加 \"键\": \"值\",网页会自动多出一列。\n"
        " * 批量导入:本地改好 Excel 后运行 python excel2data.py 重新生成。\n"
        " * 改完提交推送后,网站会在约 1 分钟内自动更新。\n"
        " */\n"
    )
    return (
        banner
        + "window.SITE_DATA = {\n"
        + f"  \"updated\": \"{updated}\",\n"
        + "  \"rows\": [\n" + rows_json + "\n  ]\n};\n"
    )


def main():
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.exists():
        sys.exit(f"找不到 Excel 文件: {xlsx}")
    rows = load_rows(xlsx)
    dst = ROOT / "data.js"
    dst.write_text(render(rows, date.today().isoformat()), encoding="utf-8")
    print(f"完成: {len(rows)} 个站点 -> {dst}")


if __name__ == "__main__":
    main()
