# -*- coding: utf-8 -*-
"""
从浏览器书签导出(docs/bookmarks_2026_8_30.html,不入库)的 AI 目录下,
按「与注册页同域名前缀」规则提取每个站点的签到地址,写入 data.js 的 checkin 字段。

匹配规则:
  1. 只看 AI 顶层目录(含其全部子目录,如 每日签到公益站/公益站 等)
  2. 书签域名 == 注册链接域名
  3. 同域名多条时优先:含 console/checkin/sign/dashboard/panel/home/token 关键词 > 非注册链接本身 > 第一条

用法: python tools/import_checkin.py
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from excel2data import render

BOOKMARKS = ROOT / "docs" / "bookmarks_2026_8_30.html"
CK_KEYWORDS = ("console", "checkin", "check-in", "sign", "dashboard", "panel", "home", "token", "work")


def registered_domain(url):
    m = re.search(r"https?://([^/]+)", url or "")
    if not m:
        return ""
    host = m.group(1).lower().split(":")[0]
    parts = host.split(".")
    if host.endswith(("com.cn", "net.cn", "org.cn", "com.cd")) and len(parts) >= 3:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


class BookmarkParser(HTMLParser):
    """解析 Netscape 书签格式,记录每个链接的目录路径。"""

    def __init__(self):
        super().__init__()
        self.stack = []          # 当前目录栈
        self.items = []          # [{path, title, url}]
        self._pending_h3 = None  # 刚遇到的文件夹名,等下一个 DL 入栈
        self._in_h3 = False
        self._in_a = False
        self._a_href = ""
        self._a_text = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attrs = dict(attrs)
        if tag == "h3":
            self._pending_h3 = ""
            self._in_h3 = True
        elif tag == "a" and "href" in attrs:
            self._in_a = True
            self._a_href = attrs["href"]
            self._a_text = []
        elif tag == "dl" and self._pending_h3 is not None:
            self.stack.append(self._pending_h3)
            self._pending_h3 = None

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "h3" and self._in_h3:
            self._pending_h3 = (self._pending_h3 or "").strip()
            self._in_h3 = False
        elif tag == "a" and self._in_a:
            self._in_a = False
            title = "".join(self._a_text).strip()
            if self._a_href.startswith("http"):
                self.items.append({"path": "/".join(self.stack), "title": title, "url": self._a_href})
        elif tag == "dl":
            if self.stack:
                self.stack.pop()
            self._pending_h3 = None

    def handle_data(self, data):
        if self._in_h3:
            self._pending_h3 += data
        if self._in_a:
            self._a_text.append(data)


def parse_bookmarks(path):
    p = BookmarkParser()
    p.feed(path.read_text(encoding="utf-8", errors="ignore"))
    return p.items


def pick_checkin(reg_url, candidates):
    """candidates: 同域名书签列表;返回最合适的签到地址或 ''"""
    if not candidates:
        return ""
    reg_exact = reg_url.rstrip("/")
    non_self = [u for u in candidates if u.rstrip("/") != reg_exact]
    pool = non_self or candidates
    scored = sorted(pool, key=lambda u: (0 if any(k in u.lower() for k in CK_KEYWORDS) else 1, len(u)))
    return scored[0]


def url_host(url):
    """完整主机名(去 www.、端口),子域不同视为不同站,如 beizhi.sylu.cc ≠ chuan.sylu.cc"""
    m = re.search(r"https?://([^/]+)", url or "")
    if not m:
        return ""
    host = m.group(1).lower().split(":")[0]
    return host[4:] if host.startswith("www.") else host


def main():
    if not BOOKMARKS.exists():
        sys.exit(f"书签文件不存在: {BOOKMARKS}")
    items = parse_bookmarks(BOOKMARKS)
    # AI 目录可能在书签栏等任意层级下,按路径段精确匹配(不误伤 AI chat/AI编程 等兄弟目录)
    ai_items = [it for it in items if "AI" in it["path"].split("/")]
    print(f"书签共 {len(items)} 条,AI 目录下 {len(ai_items)} 条")

    data_file = ROOT / "data.js"
    text = data_file.read_text(encoding="utf-8")
    payload = json.loads(text.split("window.SITE_DATA =", 1)[1].rsplit(";", 1)[0])
    rows = payload["rows"]
    banner = text.split("window.SITE_DATA", 1)[0]

    by_host = {}
    for it in ai_items:
        h = url_host(it["url"])
        if h:
            by_host.setdefault(h, []).append(it["url"])

    matched, missed = 0, []
    for r in rows:
        reg_host = url_host(r.get("url", ""))
        cands = by_host.get(reg_host, [])
        ck = pick_checkin(r.get("url", ""), cands)
        if ck:
            r["checkin"] = ck
            matched += 1
        else:
            r.pop("checkin", None)
            missed.append(f"{r['name']}({reg_host})")

    data_file.write_text(banner + render(rows, payload.get("updated", "")), encoding="utf-8")
    print(f"签到地址写入 {matched}/{len(rows)} 个站点")
    if missed:
        print("未找到同域名书签的站点:", "、".join(missed))
    print("\n明细:")
    for r in rows:
        if r.get("checkin"):
            same = " (同注册页)" if r["checkin"].rstrip("/") == (r.get("url") or "").rstrip("/") else ""
            print(f"  {r['name']} -> {r['checkin'][:70]}{same}")


if __name__ == "__main__":
    main()
