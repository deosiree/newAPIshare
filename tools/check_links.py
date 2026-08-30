# -*- coding: utf-8 -*-
"""注册/签到链接批量体检:只探测可达性出报告,不修改任何数据。用法: python tools/check_links.py"""
import json
import ssl
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import sitecsv  # noqa: E402
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9"}
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE  # 公益站证书千奇百怪,只测可达性


def probe(url):
    """返回 (状态码或错误类型, 是否算可达)"""
    try:
        req = urllib.request.Request(url, headers=UA)
        resp = urllib.request.urlopen(req, timeout=15, context=CTX)
        code = resp.getcode()
        try:
            resp.read(2048)
        except Exception:
            pass
        return str(code), 200 <= code < 400
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}", 400 <= e.code < 500 * 0  # 4xx/5xx 都算异常
    except Exception as e:
        return type(e).__name__ + ":" + str(e)[:60], False


def main():
    rows = sitecsv.load_rows()
    targets = []
    for r in rows:
        if r.get("url"):
            targets.append((r["name"], "注册", r["url"]))
        if r.get("checkin"):
            targets.append((r["name"], "签到", r["checkin"]))

    print(f"待测链接 {len(targets)} 条,并发探测中…")
    with ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(lambda t: (t[0], t[1], t[2], *probe(t[2])), targets))

    ok = [x for x in results if x[4]]
    bad = [x for x in results if not x[4]]

    lines = ["# 链接体检报告", "", f"检测时间:{datetime.now().strftime('%Y-%m-%d %H:%M')}",
             f"共检测 {len(results)} 条(注册 {sum(1 for x in results if x[1]=='注册')} / 签到 {sum(1 for x in results if x[1]=='签到')}),"
             f"可达 **{len(ok)}**,异常 **{len(bad)}**。", "",
             "> 体检只代表「服务器有响应」。部分站点有反爬/防火墙,对脚本返回 403/超时但浏览器可正常访问,",
             "> 此类结果标注为「疑似反爬」,以人工浏览器访问为准。", "",
             "## 异常链接", ""]
    if bad:
        lines += ["| 站点 | 类型 | 链接 | 结果 |", "|---|---|---|---|"]
        for name, kind, url, info, _ in bad:
            guess = "疑似反爬" if ("403" in info or "HTTP 5" in info or "Timeout" in info or "timed out" in info) else ""
            lines.append(f"| {name} | {kind} | {url[:60]} | {info} {guess} |")
    else:
        lines.append("(全部可达)")
    lines += ["", "## 可达清单", ""]
    for name, kind, url, info, _ in ok:
        lines.append(f"- ✓ {name}({kind}){'' if kind == '注册' else ' 签到页'}")
    out = ROOT / "docs" / "链接体检.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"完成:可达 {len(ok)} / 异常 {len(bad)} -> {out}")


if __name__ == "__main__":
    main()
