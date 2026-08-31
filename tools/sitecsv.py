# -*- coding: utf-8 -*-
"""
sites.csv 兼容读写模块：仅用于备份和旧数据迁移，正常编辑链路使用 sites.xlsx。
前端(src/fields.ts)与本文件必须使用同一套 字段名↔中文表头 映射。
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITES_CSV = ROOT / "public" / "sites.csv"
COLUMNS_JSON = ROOT / "public" / "columns.json"

# 列顺序(字段名, 中文表头) —— 与 src/fields.ts BASE_COLUMNS 保持一致
FIELDS = [
    ("name", "公益站"), ("status", "状态"), ("rating", "评分"), ("register", "注册"),
    ("daily", "每日签到"), ("invite", "邀请制"), ("model", "模型质量"),
    ("exp", "体验感"), ("other", "其他"),
    ("other2", "其他2·白嫖org"), ("other3", "其他3·飞书合集"), ("other4", "其他4·幻城导航"),
    ("verified", "验证"), ("models", "模型"), ("latency", "响应"), ("api_status", "渠道状态"),
    ("url", "注册链接"), ("checkin", "签到地址"),
]
HIDDEN_FIELD, HIDDEN_HEADER = "hidden", "隐藏"
_FIELD_BY_HEADER = {h: f for f, h in FIELDS} | {HIDDEN_HEADER: HIDDEN_FIELD}


def load_rows():
    """读入全部站点,返回 [{字段名: 值}]。"""
    with open(SITES_CSV, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    out = []
    for r in rows:
        item = {}
        for k, v in r.items():
            if k is None:
                continue
            item[_FIELD_BY_HEADER.get(k.strip(), k.strip())] = (v or "").strip()
        out.append(item)
    return out


def save_rows(rows, coldefs=None):
    """按列序写回 sites.csv(UTF-8 BOM)，仅作为兼容备份输出。
    coldefs: [(字段名, 表头)];默认 FIELDS + 行里出现的额外键(如 uid 自动保留)。"""
    if coldefs is None:
        extra, seen = [], {f for f, _ in FIELDS} | {HIDDEN_FIELD}
        for r in rows:
            for k in r:
                if k and k not in seen:
                    seen.add(k)
                    extra.append((k, k))
        coldefs = list(FIELDS) + extra
    else:
        coldefs = list(coldefs)
    with open(SITES_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow([HIDDEN_HEADER] + [h for _, h in coldefs])
        for r in rows:
            w.writerow([r.get(HIDDEN_FIELD, "")] + [r.get(f, "") for f, _ in coldefs])


def load_meta():
    return json.loads(COLUMNS_JSON.read_text(encoding="utf-8"))


def save_meta(meta):
    COLUMNS_JSON.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def touch_updated(meta=None, day=None):
    """把 meta.updated 刷成今天;meta 不传则读改写。"""
    from datetime import date
    meta = meta or load_meta()
    meta["updated"] = (day or date.today().isoformat())
    save_meta(meta)
    return meta
