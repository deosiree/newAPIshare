# -*- coding: utf-8 -*-
"""
爬取三个评价源,与 data.js 现有站点做模糊匹配,把评价写入「其他2/3/4」列。

  其他2 = baipiao.org/charity/     (白嫖org 简评+标签+运营状态)
  其他3 = docs/免费公益站统计合集（持续更新中）.docx (飞书合集:档位+注意事项)
  其他4 = link.hcnsec.cn           (幻城导航:简介+社区评分)

匹配策略:域名 -> 名称精确(归一化+别名) -> 包含。
安全规则:候选结果若双方都已知域名且不同,视为同名不同站,拒绝写入,记录进报告。

用法: python tools/crawl_reviews.py
输出: 更新 data.js 的 other2/other3/other4 字段 + docs/采集报告.md
"""
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from excel2data import render  # 复用 data.js 的统一渲染格式

CACHE = ROOT / "tools" / "cache"
DOCS = ROOT / "docs"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# 别名表: 源站叫法 -> 我们 data.js 里的站名(允许近似拼写,匹配时自动对齐真实站名)
ALIASES = {
    "新疆幻城": "幻城",
    "iamhc公益站": "幻城",
    "哈吉米": "哈基米",
    "baaaai": "baaAI",
    "tabitoken": "tabi",
    "chatanywhere": "anyrouter",
    "tokenrhythm": "基元律动",
    "肖恩ai": "肖恩",
    "熊猫api": "熊猫",
    "xiaomuapi": "MiaoMu",
    "helpcoder": "帮帮程序员",
    "辉哥（1）": "辉哥1",
    "辉哥（2）": "辉哥2",
    "辉哥（3）": "辉哥3",
    "辉哥1": "辉哥1",
    "辉哥2": "辉哥2",
    "辉哥3": "辉哥3",
    "supxh": "肖恩",
}

# 包含匹配禁用词(太短/太通用,容易误配)
STOPWORDS = {"free", "api", "ai", "new", "the"}

TIER_SHORT = {
    "夯": "推荐每天签到,给的额度多,额度耐用",
    "NPC": "能签尽量签,蚊子再小也是肉",
    "拉完了": "额度少事儿多,极不推荐,但倍率小适合当付费站",
}


def norm(s):
    """归一化:小写、去空白与常见标点。"""
    s = (s or "").lower().strip()
    return re.sub(r"[\s（）()\[\]【】·.,'\"_\-—|]", "", s)


def fetch(url, cache_name):
    """抓取页面,失败时回退缓存。"""
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE / cache_name
    try:
        req = urllib.request.Request(url, headers=UA)
        html = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "ignore")
        cache_file.write_text(html, encoding="utf-8")
        return html, "live"
    except Exception as e:
        if cache_file.exists():
            return cache_file.read_text(encoding="utf-8"), f"cache(失败:{e})"
        raise


def registered_domain(url):
    m = re.search(r"https?://([^/]+)", url or "")
    if not m:
        return ""
    host = m.group(1).lower().split(":")[0]
    parts = host.split(".")
    if host.endswith(("com.cn", "net.cn", "org.cn", "com.cd")) and len(parts) >= 3:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


# ---------------- 源1: 白嫖org ----------------

def parse_baipiao(html):
    """卡片带 data-name/data-summary/data-tags/data-status 与 .centry 链接。"""
    items = []
    for block in re.findall(r'<div class="ccard"[^>]*data-card.*?(?=<div class="ccard"|$)', html, re.S):
        name = re.search(r'data-name="([^"]*)"', block)
        summary = re.search(r'data-summary="([^"]*)"', block)
        tags = re.search(r'data-tags="([^"]*)"', block)
        status = re.search(r'data-status="([^"]*)"', block)
        link = re.search(r'<a class="centry" href="([^"]*)"', block)
        if not name:
            continue
        items.append({
            "name": name.group(1),
            "summary": (summary.group(1) if summary else "").strip(),
            "tags": (tags.group(1) if tags else "").strip(),
            "status": (status.group(1) if status else "").strip(),
            "url": link.group(1) if link else "",
        })
    return items


# ---------------- 源2: 幻城导航 ----------------

def parse_hcnsec(html):
    items = []
    for block in re.findall(r'<div class="site-card".*?(?=<div class="site-card"|$)', html, re.S):
        title = re.search(r'<div class="card-title">([^<]*)</div>', block)
        desc = re.search(r'<div class="card-desc">([^<]*)</div>', block)
        rating = re.search(r'<div class="card-rating">.*?<span>([\d.]+)</span>', block, re.S)
        link = re.search(r"window\.open\('([^']*)'", block)
        if not title:
            continue
        items.append({
            "name": title.group(1).strip(),
            "desc": (desc.group(1) if desc else "").strip(),
            "rating": (rating.group(1) if rating else "").strip(),
            "url": (link.group(1).replace("\\/", "/") if link else ""),
        })
    return items


# ---------------- 源3: 飞书 docx ----------------

def _cell_hyperlink(cell, doc):
    """从单元格 XML 里取第一个超链接目标地址。"""
    try:
        ids = re.findall(r'r:id="(rId\d+)"', cell._tc.xml)
        for rid in ids:
            rel = doc.part.rels.get(rid)
            if rel is not None and not rel.is_external is False:
                target = getattr(rel, "target_ref", "") or ""
                if target.startswith("http"):
                    return target
    except Exception:
        pass
    return ""


def parse_docx(path):
    """返回 (entries, tier_notes): entries=[{name,url,tier}], tier_notes=[{tier,text}]"""
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    d = docx.Document(path)
    entries, notes = [], []
    tier = None
    skip_words = ("处于这一档位", "邀请链接", "精力有限", "环境比较", "绝对不出现", "绝对不会")
    for child in d.element.body.iterchildren():
        if child.tag.endswith("}p"):
            text = Paragraph(child, d).text.strip()
            if not text:
                continue
            if text in ("夯", "NPC", "拉完了"):
                tier = text
                continue
            if tier and len(text) > 6 and not text.startswith(("=", "注册完成", "这个链接", "这里预计")):
                notes.append({"tier": tier, "text": text})
        elif child.tag.endswith("}tbl"):
            t = Table(child, d)
            for row in t.rows:
                for cell in row.cells:
                    nm = cell.text.strip()
                    if (nm and nm not in ("名称", "注册链接", "注册")
                            and "：" not in nm and len(nm) <= 20
                            and not any(w in nm for w in skip_words)):
                        entries.append({"name": nm, "url": _cell_hyperlink(cell, d), "tier": tier})
    seen, uniq = set(), []
    for e in entries:
        key = norm(e["name"])
        if key and key not in seen:
            seen.add(key)
            uniq.append(e)
    return uniq, notes


# ---------------- 匹配 ----------------

def build_matcher(rows):
    norm_to_actual = {}
    for r in rows:
        norm_to_actual[norm(r["name"])] = r["name"]
    # 名称精确 + 别名(别名目标自动对齐真实站名,对不上的别名忽略,不产生幽灵匹配)
    by_norm_name = dict(norm_to_actual)
    for alias, target in ALIASES.items():
        tnorm = norm(target)
        if tnorm in norm_to_actual:
            by_norm_name[norm(alias)] = norm_to_actual[tnorm]
    # 域名 -> 站名
    by_domain = {}
    for r in rows:
        dom = registered_domain(r.get("url", ""))
        if dom:
            by_domain[dom] = r["name"]
    name_to_row = {r["name"]: r for r in rows}

    def match(item_name, item_url=""):
        """返回 (站名|None, 匹配方式或拒绝原因)"""
        item_dom = registered_domain(item_url)
        # 1. 域名最优先
        if item_dom and item_dom in by_domain:
            return by_domain[item_dom], "域名"
        candidates = []
        n = norm(item_name)
        if n and n in by_norm_name and n not in STOPWORDS:
            # 通用名(如 free/api)同名不同站太常见,一律要求域名佐证,不靠名称直接命中
            candidates.append((by_norm_name[n], "名称"))
        elif n and len(n) >= 3 and n not in STOPWORDS:
            for k, v in by_norm_name.items():
                if len(k) >= 3 and k not in STOPWORDS and (n in k or k in n):
                    candidates.append((v, "包含"))
        # 2. 名称候选:域名冲突否决(同名不同站保护)
        for cand, how in candidates:
            cand_row = name_to_row.get(cand)
            if cand_row is None:
                continue
            our_dom = registered_domain(cand_row.get("url", ""))
            if item_dom and our_dom and item_dom != our_dom:
                continue  # 同名但域名不同,极可能是不同站
            return cand, how
        if candidates:
            return None, f"域名冲突({item_dom or '?'})"
        return None, ""

    return match, name_to_row


def fmt_baipiao(it):
    parts = []
    if it["summary"]:
        parts.append(it["summary"])
    if it["status"] and it["status"] != "active":
        parts.append(f"[白嫖org标记:{it['status']}]")
    if it["tags"]:
        parts.append(f"标签:{it['tags']}")
    return "白嫖org:" + " | ".join(parts) if parts else ""


def fmt_hcnsec(it):
    parts = []
    if it["desc"]:
        parts.append(it["desc"])
    if it["rating"]:
        parts.append(f"社区评分{it['rating']}")
    return "幻城导航:" + " | ".join(parts) if parts else ""


def main():
    # 1. 抓取/解析三源
    html1, s1 = fetch("https://baipiao.org/charity/", "baipiao.html")
    src1 = parse_baipiao(html1)
    html2, s2 = fetch("https://link.hcnsec.cn/", "hcnsec.html")
    src2 = parse_hcnsec(html2)
    docx_path = DOCS / "免费公益站统计合集（持续更新中）.docx"
    src3, docx_notes = parse_docx(docx_path) if docx_path.exists() else ([], [])
    print(f"源1 白嫖org[{s1}]: {len(src1)} 条 | 源2 幻城导航[{s2}]: {len(src2)} 条 | "
          f"源3 飞书docx: {len(src3)} 条 + {len(docx_notes)} 条注意")

    # 2. 读现有数据
    data_file = ROOT / "data.js"
    text = data_file.read_text(encoding="utf-8")
    payload = json.loads(text.split("window.SITE_DATA =", 1)[1].rsplit(";", 1)[0])
    rows = payload["rows"]
    banner = text.split("window.SITE_DATA", 1)[0]

    match, name_to_row = build_matcher(rows)

    # 3. 逐源匹配并写入 other2/3/4(爬虫对这三列拥有全权:先清历史值,全量重建)
    for r in rows:
        for col in ("other2", "other3", "other4"):
            r.pop(col, None)
    used = {"other2": {}, "other3": {}, "other4": {}}
    unmatched = {"other2": [], "other3": [], "other4": []}
    note_by_site = {}
    for n in docx_notes:
        m, _ = match(n["text"][:12])
        if m:
            note_by_site.setdefault(m, []).append(f"[{n['tier']}] {n['text']}")

    def absorb(items, col, fmt):
        for it in items:
            target, how = match(it["name"], it.get("url", ""))
            val = fmt(it)
            if not val:
                continue
            if target and target in name_to_row:
                used[col].setdefault(target, []).append((val, how))
            else:
                reason = how or "未匹配"
                unmatched[col].append(f"{it['name']}({reason})")

    absorb(src1, "other2", fmt_baipiao)
    absorb(src2, "other4", fmt_hcnsec)
    for it in src3:
        target, how = match(it["name"], it.get("url", ""))
        if target and target in name_to_row:
            short = TIER_SHORT.get(it["tier"], "")
            line = f"飞书合集档位:{it['tier']}({short})"
            extras = note_by_site.get(target, [])
            if extras:
                line += " " + " ".join(extras)
            used["other3"].setdefault(target, []).append((line, how))
        else:
            reason = how or "未匹配"
            unmatched["other3"].append(f"{it['name']}[{it['tier']}]({reason})")

    # 合并写入:同一站点的多条评价用 ;; 连接;重名行(如哈基米出现两次)统一补齐
    merged = {}  # norm_name -> {col: text}
    for col in ("other2", "other3", "other4"):
        for site, vals in used[col].items():
            text = " ;; ".join(dict.fromkeys(v for v, _ in vals if v))
            name_to_row[site][col] = text
            merged.setdefault(norm(site), {})[col] = text
    for r in rows:
        extra = merged.get(norm(r["name"]))
        if extra:
            for col, text in extra.items():
                r[col] = text
    counts = {col: sum(1 for r in rows if r.get(col)) for col in ("other2", "other3", "other4")}

    # 4. 写回 data.js(保持统一渲染格式)
    data_file.write_text(banner + render(rows, payload.get("updated", date.today().isoformat())), encoding="utf-8")

    # 5. 采集报告
    rep = ["# 采集报告", "", f"采集日期:{date.today().isoformat()}", ""]
    rep += [
        "## 来源状态",
        f"- 白嫖org(baipiao.org/charity/):{'成功' if s1 == 'live' else s1},解析 {len(src1)} 条,写入 {counts['other2']} 条",
        f"- 幻城导航(link.hcnsec.cn):{'成功' if s2 == 'live' else s2},解析 {len(src2)} 条,写入 {counts['other4']} 条",
        f"- 飞书docx(本地):解析 {len(src3)} 条,写入 {counts['other3']} 条",
        "",
    ]
    for col, title in (("other2", "其他2·白嫖org"), ("other3", "其他3·飞书合集"), ("other4", "其他4·幻城导航")):
        rep.append(f"## {title} 写入明细({counts[col]} 条)")
        for site, vals in sorted(used[col].items()):
            hows = "、".join(dict.fromkeys(h for _, h in vals))
            val = " ;; ".join(dict.fromkeys(v for v, _ in vals if v))
            rep.append(f"- {site} ← [{hows}] {val[:60]}")
        if unmatched[col]:
            rep.append(f"- **未写入的源条目({len(unmatched[col])})**: " + "、".join(unmatched[col][:40]))
        rep.append("")
    our = [r["name"] for r in rows if not any(r.get(c) for c in ("other2", "other3", "other4"))]
    rep.append("## 三个源都没补充到的站点(" + str(len(our)) + " 行)")
    rep.append("、".join(our) if our else "(无)")
    out = DOCS / "采集报告.md"
    out.write_text("\n".join(rep) + "\n", encoding="utf-8")
    print(f"data.js 已更新:其他2={counts['other2']} 其他3={counts['other3']} 其他4={counts['other4']}")
    print(f"报告 -> {out}")


if __name__ == "__main__":
    main()
