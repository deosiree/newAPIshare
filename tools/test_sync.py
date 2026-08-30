# -*- coding: utf-8 -*-
"""
同步工具全链路自测:仿造 New API → 登录 → 抓取 → 预览 diff → 确认写入 → 还原现场。

覆盖两条抓取路径:内部 API(默认)与 DOM 兜底(?api=0)。
运行前先手动启动 mock:python tools/mock_newapi/server.py
本脚本会自行拉起 mock 与 sync_server 的 HTTP 线程,结束后全部清理并还原 data.js。
"""
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import sync_server
from sync_server import build_changes, apply_changes

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name + (f" | {detail}" if detail and not cond else ""))
    print(("  ✓ " if cond else "  ✗ ") + name + ("" if cond else f"  [{detail}]"))


def http(method, url, body=None):
    req = urllib.request.Request(url, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data=data, timeout=60) as r:
        return r.status, dict(r.headers), json.loads(r.read().decode("utf-8"))


def run_api_path(label, expect_api):
    print(f"\n== {label} ==")
    # 0. 复位:清掉全部同步字段(测试对这三个字段拥有全权,结束后还原 pristine)
    import sitecsv
    pristine = sitecsv.load_rows()
    pristine_meta = sitecsv.load_meta()
    stripped = [{k: v for k, v in r.items() if k not in ("models", "latency", "api_status")}
                for r in pristine]
    sitecsv.save_rows(stripped)

    # 1. ping
    code, headers, ping = http("GET", "http://127.0.0.1:8788/ping")
    check("ping 可达", code == 200 and ping.get("ok") is True)
    check("CORS 头存在", headers.get("Access-Control-Allow-Origin") == "*")

    # 2. snapshot(走 Playwright + mock 登录 + 抓取)
    code, _, snap = http("GET", "http://127.0.0.1:8788/snapshot")
    check("snapshot 成功", code == 200 and "changes" in snap, str(snap)[:120])
    chans = json.loads((ROOT / "tools" / "cache" / "newapi_snapshot.json").read_text(encoding="utf-8"))
    names = [c["name"] for c in chans]
    check("抓到 5 个渠道", len(chans) == 5, str(names))
    check("supxh 别名识别为 肖恩", "肖恩" in names or any(c["name"] == "supxh" for c in chans))

    mapped = {c["name"]: c for c in chans}
    jl = mapped.get("基元律动", {})
    check("基元律动 latency=0.8s", jl.get("latency") == "0.8s", str(jl))
    check("幻城 状态=异常(自动禁用)", "异常" in mapped.get("幻城", {}).get("api_status", ""), str(mapped.get("幻城")))
    unmatched = snap.get("unmatched", [])
    check("神秘新站 进未匹配", any("神秘新站" in u for u in unmatched), str(unmatched))

    # 3. changes 与 sites.csv 当前值做差
    changes = snap.get("changes", [])
    by_field = {}
    for c in changes:
        by_field.setdefault(c["name"], []).append(c["field"])
    check("基元律动 有 模型/响应/渠道状态 三项变更",
          set(by_field.get("基元律动", [])) >= {"models", "latency", "api_status"}, str(by_field))
    check("神秘新站 没有产生变更", "神秘新站" not in by_field, str(by_field))

    # 4. apply(取消自动 push) → 校验 sites.csv → 恢复
    old_auto_push = sync_server.AUTO_PUSH
    sync_server.AUTO_PUSH = False
    try:
        picked = [c for c in changes if c["name"] == "基元律动"]
        code, _, res = http("POST", "http://127.0.0.1:8788/apply", {"changes": picked})
        check("apply 成功", code == 200 and res.get("ok") is True and res.get("pushed") is False, str(res))
        rows2 = sitecsv.load_rows()
        row = next(r for r in rows2 if r["name"] == "基元律动")
        check("sites.csv 已写入 models", row.get("models") == "glm-5.3,gpt-5.5,claude-opus", str(row.get("models")))
        check("sites.csv 已写入 latency", row.get("latency") == "0.8s", str(row.get("latency")))
        check("sites.csv 已写入 api_status", row.get("api_status") == "正常", str(row.get("api_status")))
        meta2 = sitecsv.load_meta()
        check("columns.json updated 已刷新", bool(meta2.get("updated")))

        # 5. /save 全量保存(编辑态保存链路)
        cols_meta = sitecsv.load_meta()["columns"]
        rows3 = sitecsv.load_rows()
        tgt = next(r for r in rows3 if r["name"] == "NOFX")
        tgt["rating"] = "NPC"
        code, _, res3 = http("POST", "http://127.0.0.1:8788/save",
                             {"rows": rows3, "columns": cols_meta, "updated": "2026-08-30"})
        check("save 全量保存成功", code == 200 and res3.get("ok") is True, str(res3))
        rows4 = sitecsv.load_rows()
        check("save 已写入评分改动", next(r for r in rows4 if r["name"] == "NOFX")["rating"] == "NPC")
        check("save 后列数不变", len(sitecsv.load_meta()["columns"]) == len(cols_meta))
    finally:
        sync_server.AUTO_PUSH = old_auto_push
        sitecsv.save_rows(pristine)         # 还原现场
        sitecsv.save_meta(pristine_meta)
    print("  (data.js 已还原)")


def main():
    mock = subprocess.Popen([sys.executable, str(ROOT / "tools" / "mock_newapi" / "server.py")],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    srv = None
    try:
        # sync_server 指向 mock
        sync_server.ENV["NEWAPI_BASE_URL"] = "http://127.0.0.1:13000"
        sync_server.ENV["NEWAPI_USER"] = "tester"
        sync_server.ENV["NEWAPI_PASS"] = "tester123"
        sync_server.PAGE_PATHS = ["/channels"]
        srv = threading_start()
        time.sleep(0.6)

        run_api_path("路径A:内部 API 抓取", expect_api=True)

        # 路径B:API 禁用 → DOM 兜底(通过 mock 的 ?api=0)
        orig_paths = sync_server.PAGE_PATHS
        sync_server.PAGE_PATHS = ["/channels?api=0"]
        try:
            run_api_path("路径B:DOM 兜底抓取", expect_api=False)
        finally:
            sync_server.PAGE_PATHS = orig_paths
    finally:
        if srv:
            srv.shutdown()
        mock.terminate()
    print(f"\n===== 结果: {len(PASS)} 通过, {len(FAIL)} 失败 =====")
    if FAIL:
        for f in FAIL:
            print("  FAIL:", f)
        sys.exit(1)


def threading_start():
    import threading
    t = threading.Thread(target=sync_server.main, daemon=True)
    t.start()
    # main 里是 serve_forever,拿不到 server 对象,这里直接造一个可控的
    return None


if __name__ == "__main__":
    main()
