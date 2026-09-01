# -*- coding: utf-8 -*-
"""
本机同步助手:网页「编辑态工具面板」的后端。

  GET  /ping      → 健康检查
  GET  /snapshot  → 用 Playwright 打开 New API 渠道页,读取渠道数据,
                    与 data.js 匹配后返回 {changes, unmatched, scanned}(不写入)
  POST /apply     → 按网页勾选的变更写入 data.js,并可选自动 git push

登录:优先用 .env 里的账密自动登录;没有 .env 时弹出浏览器手动登录一次
(会话保存在 tools/.profile,之后免登录)。

用法:双击 tools/启动同步工具.bat,或 python tools/sync_server.py
"""
import json
import re
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = uuid.uuid4().hex  # 本实例令牌:防止 Windows 端口双绑时请求打到旧实例

# ---------- Excel 文件监视(WPS/Excel 编辑保存后自动同步) ----------
class ExcelWatcher:
    """轮询 sites.xlsx 修改时间;检测到保存 → 去抖 → 自动 commit+push(单飞锁防重入)。"""

    def __init__(self):
        self.lock = threading.Lock()
        self.stop_evt = threading.Event()
        self.thread = None
        self.state = {"watching": False, "syncing": False, "last_sync": "", "last_error": ""}
        self.last_mtime = 0.0

    def start(self):
        with self.lock:
            if self.state["watching"]:
                return
            self.stop_evt.clear()
            self.last_mtime = siteexcel.SITES_XLSX.stat().st_mtime if siteexcel.SITES_XLSX.exists() else 0.0
            self.state.update(watching=True, syncing=False, last_error="")
            self.thread = threading.Thread(target=self._run, daemon=True)
            self.thread.start()

    def stop(self):
        with self.lock:
            self.stop_evt.set()
            self.state["watching"] = False

    def status(self):
        with self.lock:
            return dict(self.state)

    def _sync_once(self):
        """读取 Excel 最新内容并提交推送，避免监视过程重复写损坏文件。"""
        rows = siteexcel.load_rows()
        meta = siteexcel.load_meta()
        coldefs = [(c["field"], c["header"]) for c in meta.get("columns", []) if c.get("field") and c.get("header")]
        siteexcel.save_rows(rows, coldefs)
        siteexcel.touch_updated(meta)
        pushed, msg = git_commit_push(
            ("public/sites.xlsx", "public/columns.json", "public/buttons.json"),
            "excel: 本机表格编辑 " + meta["updated"],
        )
        self.state["last_sync"] = datetime.now().strftime("%H:%M:%S")
        self.state["last_error"] = "" if pushed or msg == "无变化" else msg

    def _run(self):
        while not self.stop_evt.is_set():
            try:
                if not self.state["syncing"]:
                    m = siteexcel.SITES_XLSX.stat().st_mtime
                    if m != self.last_mtime:
                        with self.lock:  # 单飞锁:同一时间只跑一次同步
                            if not self.state["syncing"]:
                                self.state["syncing"] = True
                            else:
                                continue
                        try:
                            time.sleep(1.5)  # 去抖:等 WPS/Excel 写完盘
                            self.last_mtime = siteexcel.SITES_XLSX.stat().st_mtime
                            self._sync_once()
                        finally:
                            self.last_mtime = siteexcel.SITES_XLSX.stat().st_mtime
                            self.state["syncing"] = False
            except Exception as e:
                self.state["last_error"] = str(e)[:120]
                self.state["syncing"] = False
            self.stop_evt.wait(2)

WATCH = ExcelWatcher()

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import siteexcel  # noqa: E402

PORT = 8788
AUTO_PUSH = True          # 确认写入后自动 git commit + push;改成 False 则只写本地
PAGE_PATHS = ["/channels", "/channel"]   # New API 渠道页路径,依次尝试
LOCK = threading.Lock()

# ---------- .env ----------
def load_env():
    """依次合并读取 .env → .env.development → .env.production(后加载的覆盖先加载的)。"""
    env = {}
    for name in (".env", ".env.development", ".env.production"):
        f = ROOT / name
        if not f.exists():
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    env.setdefault("NEWAPI_BASE_URL", "http://localhost:3000")
    return env

ENV = load_env()

# ---------- data 读写 ----------
def current_branch():
    """读取当前 Git 分支，持续交付时避免把推送目标写死为 main。"""
    result = subprocess.run(("git", "branch", "--show-current"), cwd=ROOT, capture_output=True, text=True, timeout=60)
    branch = result.stdout.strip()
    return branch or "codex/excel-editor-refactor"


def read_data():
    """返回 (rows, meta)"""
    return siteexcel.load_rows(), siteexcel.load_meta()

def norm(s):
    s = (s or "").lower().strip()
    return re.sub(r"[\s（）()\[\]【】·.,'\"_\-—|]", "", s)

ALIASES = {
    "新疆幻城": "幻城", "iamhc": "幻城", "哈吉米": "哈基米", "baaaai": "baaAI",
    "tabitoken": "tabi", "chatanywhere": "anyrouter", "tokenrhythm": "基元律动",
    "肖恩": "肖恩", "supxh": "肖恩", "熊猫": "熊猫", "xiaomu": "MiaoMu",
    "helpcoder": "帮帮程序员", "辉哥1": "辉哥1", "辉哥2": "辉哥2", "辉哥3": "辉哥3",
}

def match_row(name, rows):
    n = norm(name)
    if not n:
        return None
    exact = {norm(r["name"]): r["name"] for r in rows}
    if n in exact:
        return exact[n]
    for alias, target in ALIASES.items():
        if norm(alias) == n:
            t = norm(target)
            if t in exact:
                return exact[t]
    if len(n) >= 3:
        for k, v in exact.items():
            if len(k) >= 3 and (n in k or k in n):
                return v
    return None

# ---------- Playwright 抓取 ----------
FETCH_JS = """
async () => {
  async function tryFetch(url, headers) {
    try {
      const r = await fetch(url, {headers, credentials:'include'});
      if (!r.ok) return null;
      const j = await r.json();
      if (j && j.success) {
        if (Array.isArray(j.data)) return j.data;
        if (j.data && Array.isArray(j.data.items)) return j.data.items;
      }
    } catch(e){}
    return null;
  }
  // 1) 新版:刷新 JWT 后带 Bearer
  try {
    const r0 = await fetch('/api/user/auth/refresh', {credentials:'include'});
    if (r0.ok) {
      const j0 = await r0.json();
      const tk = (j0.data && (j0.data.access_token || j0.data.token)) || '';
      if (tk) {
        const got = await tryFetch('/api/channel/?tag_mode=false&id_sort=false&p=1&page_size=100',
                                   {'Authorization': 'Bearer ' + tk});
        if (got) return got;
      }
    }
  } catch(e){}
  // 2) 旧版:cookie / storage token
  let legacy = sessionStorage.getItem('token') || '';
  try {
    const u = JSON.parse(localStorage.getItem('user') || localStorage.getItem('user_info') || 'null');
    if (u && u.token) legacy = legacy || u.token;
  } catch(e){}
  const h2 = {};
  if (legacy) h2['Authorization'] = legacy.startsWith('Bearer') ? legacy : ('Bearer ' + legacy);
  for (const u of ['/api/channel/?p=1&page_size=100',
                   '/api/channel/?tag_mode=false&id_sort=false&p=1&page_size=100']) {
    const got = await tryFetch(u, h2);
    if (got) return got;
  }
  return null;
}
"""


def snapshot_via_capture(page, base):
    """让前端自己请求渠道列表,监听其 200 响应(适配任何鉴权方式)。"""
    got = {"items": None}

    def on_response(resp):
        try:
            if '/api/channel' not in resp.url:
                return
            # 排除 /api/channel/models(模型清单)等同名端点,只要真正的渠道列表
            if re.search(r'/api/channel/(models|ops|tag)', resp.url):
                return
            j = resp.json()
            if not isinstance(j, dict) or not j.get('success'):
                return
            d = j.get('data')
            items = d if isinstance(d, list) else (d or {}).get('items') if isinstance(d, dict) else None
            if (isinstance(items, list) and items and isinstance(items[0], dict)
                    and 'name' in items[0]
                    and (got["items"] is None or len(items) > len(got["items"]))):
                got["items"] = items
        except Exception:
            pass

    page.on('response', on_response)

    def patch_size(route):
        url = re.sub(r'page_size=\d+', 'page_size=100', route.request.url)
        try:
            route.continue_(url=url)
        except Exception:
            route.abort()

    try:
        page.route(re.compile(r"/api/channel/\?"), patch_size)
        page.goto(base + '/channels', wait_until='domcontentloaded', timeout=25000)
        for _ in range(20):
            if got["items"]:
                break
            page.wait_for_timeout(1000)
    finally:
        try:
            page.remove_listener('response', on_response)
            page.unroute(re.compile(r"/api/channel/\?"))
        except Exception:
            pass
    return got["items"]


def snapshot_from_newapi():
    """打开浏览器读取渠道列表,返回 [{name, models, api_status, latency}]"""
    from playwright.sync_api import sync_playwright

    base = ENV["NEWAPI_BASE_URL"].rstrip("/")
    profile = ROOT / "tools" / ".profile"
    profile.mkdir(parents=True, exist_ok=True)
    has_creds = bool(ENV.get("NEWAPI_USER") and ENV.get("NEWAPI_PASS"))

    with sync_playwright() as p:
        headless = has_creds  # 有账密就无头自动登录;没有则弹窗手动登录
        ctx = p.chromium.launch_persistent_context(str(profile), headless=headless)
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            data = None
            for path in PAGE_PATHS:
                try:
                    page.goto(base + path, wait_until="domcontentloaded", timeout=20000)
                except Exception:
                    pass
                # 登录检测:出现密码框说明在登录页
                try:
                    page.wait_for_selector("input[type=password]", timeout=4000)
                    if has_creds:
                        user_box = (page.locator("input[name=username], input[placeholder*='用户'], #username, input[type=text]").first)
                        pwd_box = page.locator("input[type=password]").first
                        user_box.fill(ENV["NEWAPI_USER"])
                        pwd_box.fill(ENV["NEWAPI_PASS"])
                        btn = page.locator("button:has-text('登录'), button:has-text('登陆')").first
                        btn.click()
                        page.wait_for_selector("input[type=password]", state="detached", timeout=15000)
                    else:
                        # 等人工登录,最多 3 分钟
                        page.wait_for_selector("input[type=password]", state="detached", timeout=180000)
                except Exception:
                    pass  # 没出现登录页,说明会话仍有效
                try:
                    page.wait_for_selector(".semi-table, table, .channel-table", timeout=8000)
                except Exception:
                    pass
                # 策略1:页面内 fetch(API)
                try:
                    data = page.evaluate(FETCH_JS)
                except Exception:
                    data = None
                if data:
                    break
                # 策略2:监听前端自己的请求(适配新版 JWT 鉴权)
                data = snapshot_via_capture(page, base)
                if data:
                    break
            if not data:
                # 兜底:DOM 抓表格
                for path in PAGE_PATHS:
                    page.goto(base + path, wait_until="domcontentloaded", timeout=20000)
                    page.wait_for_selector(".semi-table-row, tbody tr", timeout=10000)
                    data = page.evaluate(DOM_JS)
                    if data:
                        break
            if not data:
                raise RuntimeError("未能读取到渠道数据(页面结构与预期不符)")
            return [clean_channel(c) for c in data]
        finally:
            ctx.close()


DOM_JS = """
() => {
  const headerCells = document.querySelectorAll('.semi-table-header .semi-table-row-cell, thead th');
  const headers = Array.from(headerCells).map(c => c.innerText.trim());
  const idx = (kw) => headers.findIndex(h => h && h.includes(kw));
  const iName = idx('名称'), iModel = idx('模型'), iStatus = idx('状态'), iResp = idx('响应');
  const rowEls = document.querySelectorAll('.semi-table-body .semi-table-row, tbody tr');
  const out = [];
  for (const row of rowEls) {
    const cells = row.querySelectorAll('.semi-table-row-cell, td');
    const get = i => (cells[i] ? cells[i].innerText.trim() : '');
    const name = iName >= 0 ? get(iName) : get(1);
    if (!name) continue;
    out.push({name, models: iModel>=0 ? get(iModel) : '', status: iStatus>=0 ? get(iStatus) : '',
              response_time: iResp>=0 ? get(iResp) : ''});
  }
  return out;
}
"""

def clean_channel(c):
    """统一渠道字段:兼容 API JSON 与 DOM 文本两种来源。"""
    if isinstance(c.get("status"), int) or (isinstance(c.get("status"), str) and c["status"].isdigit()):
        s = int(c["status"])
        status = {1: "正常", 2: "停用(手动)", 3: "异常(自动禁用)"}.get(s, str(c["status"]))
        rt = c.get("response_time") or 0
        try:
            rt = int(rt)
            latency = (f"{rt/1000:.1f}s" if rt else "未测试")
        except Exception:
            latency = str(rt)
        models = c.get("models") or ""
    else:
        raw = str(c.get("status") or "")
        status = "正常" if "启用" in raw or "正常" in raw else ("异常" if "自动" in raw else ("停用" if raw else ""))
        latency = str(c.get("response_time") or "") or "未测试"
        models = str(c.get("models") or "")
    models = models.replace("\n", ",").strip()
    return {
        "name": str(c.get("name") or "").strip(),
        "models": models,
        "api_status": status,
        "latency": latency,
    }


def build_changes(channels):
    """渠道 vs sites.xlsx 求差集,返回 (changes, unmatched, scanned)"""
    rows, _ = read_data()
    by_name = {r["name"]: r for r in rows}
    changes, unmatched = [], []
    for ch in channels:
        target = match_row(ch["name"], rows)
        if not target:
            unmatched.append(ch["name"])
            continue
        row = by_name[target]
        pairs = [
            ("models", "模型", ch["models"]),
            ("latency", "响应", ch["latency"]),
            ("api_status", "渠道状态", ch["api_status"]),
        ]
        for field, label, new in pairs:
            old = row.get(field, "")
            if new and str(old) != str(new):
                changes.append({"name": target, "field": field, "fieldLabel": label,
                                "old": old, "value": new})
    return changes, unmatched, len(channels)


def apply_changes(changes):
    """把 New API 渠道差异写入第一张工作表，并按配置自动提交推送。"""
    rows, meta = read_data()
    by_name = {r["name"]: r for r in rows}
    for change in changes:
        row = by_name.get(change.get("name"))
        if row is not None and change.get("field") and change.get("value"):
            row[change["field"]] = change["value"]
    siteexcel.save_rows(rows)
    siteexcel.touch_updated(meta)
    if not AUTO_PUSH:
        return {"ok": True, "pushed": False, "msg": "已写入本地"}
    pushed, msg = git_commit_push(
        ("public/sites.xlsx", "public/columns.json"),
        "sync: New API 渠道状态 " + meta["updated"],
    )
    return {"ok": True, "pushed": pushed, "msg": msg}


def merge_workbook_extras(current, extras):
    """合并编辑态工作簿元数据；显式空值用于清除旧样式、行高和列宽。

    Args:
        current: 当前 XLSX 解析出的工作簿元数据。
        extras: 前端提交的可选元数据字段。

    Returns:
        包含 styles、row_heights、column_widths 的新字典。
    """
    extras = dict(extras or {})
    return {
        "styles": extras["styles"] if "styles" in extras else current.get("styles") or {},
        "row_heights": extras["rowHeights"] if "rowHeights" in extras else current.get("row_heights") or {},
        "column_widths": extras["columnWidths"] if "columnWidths" in extras else current.get("column_widths") or {},
        "layouts": extras["layouts"] if "layouts" in extras else current.get("layouts") or {},
        "merges": extras["merges"] if "merges" in extras else current.get("merges") or [],
    }


def save_all(rows, columns, updated, buttons=None, extras=None):
    """编辑态全量保存：写回 XLSX、应用元数据和按钮配置，并可选自动推送。"""
    from datetime import date
    if not isinstance(rows, list) or not rows:
        return {"ok": False, "msg": "rows 为空，拒绝写入"}
    if not isinstance(columns, list) or not columns:
        return {"ok": False, "msg": "columns 为空，拒绝写入"}

    current = siteexcel.load_workbook(siteexcel.SITES_XLSX, siteexcel.load_meta().get("columns") or [])
    extras = dict(extras or {})
    document = dict(current)
    document.update({
        "rows": rows,
        "columns": columns,
        **merge_workbook_extras(current, extras),
    })
    siteexcel.save_workbook(siteexcel.SITES_XLSX, document)

    meta = {key: value for key, value in extras.items() if key not in {"styles", "rowHeights", "columnWidths", "layouts", "merges"}}
    meta["updated"] = updated or date.today().isoformat()
    meta["columns"] = columns
    siteexcel.save_meta(meta)
    if isinstance(buttons, dict):
        siteexcel.BUTTONS_JSON.write_text(
            json.dumps(buttons, ensure_ascii=False, indent=2), encoding="utf-8")

    pushed, msg = False, ""
    if AUTO_PUSH:
        try:
            def run(*args):
                return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=60)
            paths = ("public/sites.xlsx", "public/columns.json", "public/buttons.json")
            dirty = run("git", "status", "--porcelain", "--", *paths)
            if dirty.stdout.strip():
                run("git", "add", *paths)
                commit = run("git", "commit", "-m", "edit: 在线编辑 " + meta["updated"])
                if commit.returncode != 0:
                    msg = (commit.stderr or commit.stdout or "git commit 失败").strip()[-200:]
                else:
                    pushed_result = run("git", "push", "origin", current_branch())
                    pushed = pushed_result.returncode == 0
                    msg = (pushed_result.stdout or pushed_result.stderr or "").strip()[-200:]
            else:
                msg = "无变化"
        except Exception as exc:
            msg = f"git 操作异常:{exc}"
    return {"ok": True, "pushed": pushed, "msg": msg}


# ---------- HTTP 服务 ----------
class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/ping":
            self._json({"ok": True, "ver": 3, "token": TOKEN, "env": bool(ENV.get("NEWAPI_USER")), "auto_push": AUTO_PUSH})
        elif self.path == "/watch-status":
            self._json({"ok": True, **WATCH.status()})
        elif self.path == "/snapshot":
            if not LOCK.acquire(blocking=False):
                self._json({"error": "上一次检测还在进行中"}, 429)
                return
            try:
                channels = snapshot_from_newapi()
                (ROOT / "tools" / "cache").mkdir(exist_ok=True)
                (ROOT / "tools" / "cache" / "newapi_snapshot.json").write_text(
                    json.dumps(channels, ensure_ascii=False, indent=2), encoding="utf-8")
                changes, unmatched, scanned = build_changes(channels)
                self._json({"changes": changes, "unmatched": unmatched, "scanned": scanned})
            except Exception as e:
                self._json({"error": str(e)}, 500)
            finally:
                LOCK.release()
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        if self.path == "/apply":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length) or b"{}")
                changes = body.get("changes") or []
                if not changes:
                    self._json({"ok": False, "msg": "没有要写入的变更"})
                    return
                self._json(apply_changes(changes))
            except Exception as e:
                self._json({"ok": False, "msg": str(e)}, 500)
        elif self.path == "/save":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length) or b"{}")
                self._json(save_all(body.get("rows") or [], body.get("columns") or [],
                                    body.get("updated") or "", body.get("buttons"),
                                    body.get("extras")))
            except Exception as e:
                self._json({"ok": False, "msg": str(e)}, 500)
        elif self.path == "/open-excel":
            try:
                import os
                os.startfile(str(siteexcel.SITES_XLSX))  # Windows:用默认表格程序(WPS/Excel)打开
                self._json({"ok": True})
            except Exception as e:
                self._json({"ok": False, "msg": str(e)}, 500)
        elif self.path == "/watch-start":
            WATCH.start()
            self._json({"ok": True, **WATCH.status()})
        elif self.path == "/watch-stop":
            WATCH.stop()
            self._json({"ok": True, **WATCH.status()})
        else:
            self._json({"error": "not found"}, 404)

    def log_message(self, fmt, *args):
        print("[sync]", self.address_string(), fmt % args)


def main():
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as e:
        sys.exit(f"端口 {PORT} 绑定失败:{e}\n可能有别的程序占用,或已有同步助手在运行。")
    import threading as _t
    import urllib.request as _u
    thread = _t.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    # Windows 端口双绑保险:确认 /ping 应答来自本实例,否则请求会全部打到旧进程
    try:
        with _u.urlopen(f"http://127.0.0.1:{PORT}/ping", timeout=4) as r:
            j = json.loads(r.read())
        if j.get("token") != TOKEN:
            server.shutdown()
            sys.exit(
                "⚠️ 检测到另一个同步助手实例正在占用端口 8788(旧实例)。\n"
                "请求会被旧实例接走,导致保存失败/读到旧数据。\n"
                "请先结束旧实例:  netstat -ano | findstr :8788  →  taskkill /F /PID <pid>\n"
                "然后再启动本助手。"
            )
    except SystemExit:
        raise
    except Exception:
        pass  # 自检网络异常不阻断(极少数环境)
    print(f"同步助手已启动: http://127.0.0.1:{PORT}  (Ctrl+C 退出)")
    print(f"  New API: {ENV['NEWAPI_BASE_URL']}  |  .env 账密: {'已配置(自动登录)' if ENV.get('NEWAPI_USER') else '未配置(首次手动登录)'}")
    print(f"  确认写入后自动 push: {'开' if AUTO_PUSH else '关'}")
    print("  ⚠️ 本窗口运行的是启动时的代码;仓库更新后请关闭本窗口重新启动!")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已退出")


if __name__ == "__main__":
    main()
