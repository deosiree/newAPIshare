# -*- coding: utf-8 -*-
"""
真实只读校准:用 .env 账密登录本机 New API,抓取渠道数据并生成《同步预览》报告。
**不写入 data.js** —— 真正的写入只能在网页私人视图里点「确认写入」。

用法: python tools/preview_real.py
"""
import json
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT))

import sync_server
from sync_server import snapshot_from_newapi, build_changes


def main():
    out = ROOT / "docs" / "同步预览.md"
    lines = ["# 同步预览(真实 New API 只读检测)", "",
             f"检测时间:{datetime.now().strftime('%Y-%m-%d %H:%M')}",
             f"目标:{sync_server.ENV['NEWAPI_BASE_URL']}", "",
             "> 本报告只读生成,**未写入** data.js。",
             "> 要真正写入:双击 `tools/启动同步工具.bat` → 打开网页(`?k=` 解锁私人视图)→ 点「检测 New API 渠道」→ 预览确认。", ""]

    # 先探活
    import urllib.request
    base = sync_server.ENV["NEWAPI_BASE_URL"]
    try:
        urllib.request.urlopen(base, timeout=5)
    except Exception as e:
        lines += [f"**New API 未运行或不可达({base}):{e}**", "",
                  "已跳过真实校准。启动 New API 后重新运行 `python tools/preview_real.py` 即可。"]
        out.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"New API 不可达,报告已写 -> {out}")
        return 1

    channels = None
    last_err = None
    for attempt in range(3):
        try:
            channels = snapshot_from_newapi()
            break
        except Exception as e:
            last_err = e
            print(f"第 {attempt + 1} 次尝试失败:{e}", file=sys.stderr)
            time.sleep(3)
    if channels is None:
        lines += [f"**抓取失败(重试 3 次):{last_err}**", "",
                  "可能原因:New API 忙碌/账密不对(.env)/页面结构变化(需更新 tools/sync_server.py)。"]
        out.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"抓取失败 -> {out}")
        return 1

    changes, unmatched, scanned = build_changes(channels)
    lines.append(f"扫描到 **{scanned}** 个渠道,与 data.js 匹配出 **{len(changes)}** 项可更新字段,"
                 f"{len(unmatched)} 个渠道未匹配到站点。")
    if scanned >= 100:
        lines.append("")
        lines.append("> 注意:本次扫描到 100 个渠道(单页上限),如有更多渠道可能未覆盖。")
    lines.append("")

    if changes:
        lines += ["## 可更新字段预览", "", "| 站点 | 字段 | 当前值 | 检测值 |", "|---|---|---|---|"]
        for c in changes:
            old = (c["old"] or "(空)")
            lines.append(f"| {c['name']} | {c['fieldLabel']} | {old} | **{c['value']}** |")
        lines.append("")
    else:
        lines += ["所有匹配渠道的字段与 data.js 一致,无需更新。", ""]

    if unmatched:
        lines += ["## 未匹配的渠道(不会写入)", ""]
        lines += [f"- {u}" for u in unmatched]
        lines += ["", "如需让这些渠道对应到某个站点,在 `tools/sync_server.py` 的 ALIASES 里加一行别名。", ""]

    (ROOT / "tools" / "cache").mkdir(exist_ok=True)
    (ROOT / "tools" / "cache" / "newapi_snapshot.json").write_text(
        json.dumps(channels, ensure_ascii=False, indent=2), encoding="utf-8")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"完成:{scanned} 渠道,{len(changes)} 项预览变更,未写入任何数据 -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
