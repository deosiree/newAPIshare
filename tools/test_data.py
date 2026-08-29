# -*- coding: utf-8 -*-
"""数据断言测试:校验 data.js 的完整性与关键业务规则。用法: python tools/test_data.py"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  ✓ " if cond else "  ✗ ") + name + ("" if cond else f"  [{detail}]"))


def main():
    text = (ROOT / "data.js").read_text(encoding="utf-8")
    check("banner 版权注释保留", text.startswith("/* 免费公益站统计合集"))
    payload = json.loads(text.split("window.SITE_DATA =", 1)[1].rsplit(";", 1)[0])
    rows = payload["rows"]
    check("32 行站点", len(rows) == 32, str(len(rows)))
    check("updated 字段存在", bool(payload.get("updated")))

    bad_url = [r["name"] for r in rows if not str(r.get("url", "")).startswith("http")]
    check("所有行都有合法注册链接", not bad_url, str(bad_url))

    n2 = sum(1 for r in rows if r.get("other2"))
    n3 = sum(1 for r in rows if r.get("other3"))
    n4 = sum(1 for r in rows if r.get("other4"))
    check("其他2(白嫖org) 有 19 行", n2 == 19, str(n2))
    check("其他3(飞书) 有 18 行", n3 == 18, str(n3))
    check("其他4(幻城导航) 有 7 行", n4 == 7, str(n4))

    free = [r for r in rows if r["name"] == "free"]
    check("free 不含误配的 free.v36.cm 评价",
          all("v36" not in (r.get("other2") or "") for r in free))
    ar = next(r for r in rows if "chatanywhere" in (r.get("url") or ""))
    check("anyriver 的其他2 是 chatanywhere 评价", "chatanywhere" in (ar.get("other2") or ""))

    hm = [r for r in rows if r["name"] == "哈基米"]
    check("哈基米重复行评价一致", len(hm) == 2 and hm[0].get("other2") == hm[1].get("other2"))

    ck = [r for r in rows if r.get("checkin")]
    check("签到地址 30 行", len(ck) == 30, str(len(ck)))
    miss = [r["name"] for r in rows if not r.get("checkin")]
    check("缺签到的是 zcode 和 TX API", sorted(miss) == ["TX API", "zcode"], str(miss))
    # 签到地址与注册链接必须同主机
    def host(u):
        h = urlparse(u).netloc.lower()
        return h[4:] if h.startswith("www.") else h
    cross = [r["name"] for r in ck if host(r["checkin"]) != host(r["url"])]
    check("签到地址与注册页同主机", not cross, str(cross))
    # 状态/评分值域
    ok_status = {"有效", "失效", "无效", "复活了", ""}
    bad = sorted({r.get("status", "") for r in rows} - ok_status)
    check("状态值域正常", not bad, str(bad))

    print(f"\n===== 结果: {len(PASS)} 通过, {len(FAIL)} 失败 =====")
    if FAIL:
        for f in FAIL:
            print("  FAIL:", f)
        sys.exit(1)


if __name__ == "__main__":
    main()
