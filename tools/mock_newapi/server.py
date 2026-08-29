# -*- coding: utf-8 -*-
"""仿造 New API 页面,用于同步工具的全链路自测(无需真实 New API)。"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# 渠道数据:覆盖 正常/停用/异常、有响应时间/未测试、需别名匹配(supxh→肖恩)、未匹配站(神秘新站)
CHANNELS = [
    {"name": "基元律动", "models": "glm-5.3,gpt-5.5,claude-opus", "status": 1, "response_time": 850},
    {"name": "NOFX", "models": "claude-opus-4-8", "status": 1, "response_time": 1200},
    {"name": "supxh", "models": "claude-3.7-sonnet", "status": 1, "response_time": 500},
    {"name": "幻城", "models": "deepseek-v4,glm-5", "status": 3, "response_time": 0},
    {"name": "神秘新站", "models": "model-x", "status": 2, "response_time": 0},
]

LOGIN_HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>登录 - Mock New API</title></head>
<body>
<form id="f" action="/login" method="get">
  <input name="username" type="text" placeholder="用户名">
  <input name="password" type="password" placeholder="密码">
  <button type="submit">登录</button>
</form>
</body></html>"""

CHANNELS_TMPL = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>渠道 - Mock New API</title></head>
<body>
<div class="semi-table">
  <div class="semi-table-header"><div class="semi-table-row">
    <div class="semi-table-row-cell">ID</div>
    <div class="semi-table-row-cell">名称</div>
    <div class="semi-table-row-cell">模型</div>
    <div class="semi-table-row-cell">状态</div>
    <div class="semi-table-row-cell">响应时间</div>
  </div></div>
  <div class="semi-table-body">__ROWS__</div>
</div>
<script>
sessionStorage.setItem('token', 'mocktoken');
localStorage.setItem('user', JSON.stringify({id: 1, token: 'mocktoken'}));
</script>
</body></html>"""

ROW_TMPL = """<div class="semi-table-row">
  <div class="semi-table-row-cell">__ID__</div>
  <div class="semi-table-row-cell">__NAME__</div>
  <div class="semi-table-row-cell">__MODELS__</div>
  <div class="semi-table-row-cell">__STATUS__</div>
  <div class="semi-table-row-cell">__RT__</div>
</div>"""

STATUS_TEXT = {1: "启用", 2: "手动禁用", 3: "自动禁用"}


class MockHandler(BaseHTTPRequestHandler):
    def _send(self, body, code=200, ctype="text/html; charset=utf-8", cookie=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def _logged_in(self):
        return "mocksession=1" in (self.headers.get("Cookie") or "")

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/channels", "/channel"):
            if not self._logged_in():
                self.send_response(302)
                self.send_header("Location", "/login")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            rows = "".join(
                ROW_TMPL.replace("__ID__", str(i + 1))
                        .replace("__NAME__", c["name"])
                        .replace("__MODELS__", c["models"])
                        .replace("__STATUS__", STATUS_TEXT[c["status"]])
                        .replace("__RT__", (f"{c['response_time']/1000:.1f}s" if c["response_time"] else "未测试"))
                for i, c in enumerate(CHANNELS))
            self._send(CHANNELS_TMPL.replace("__ROWS__", rows))
        elif path == "/login":
            if "username=" in self.path:
                # 表单提交:种下会话 Cookie 并跳回渠道页
                self._send('<script>location.href="/channels"</script>', cookie="mocksession=1")
            else:
                self._send(LOGIN_HTML, cookie="")
        elif path.startswith("/api/channel/"):
            if not self._logged_in():
                self._send(json.dumps({"success": False, "message": "无权进行此操作,未登录"}), 401,
                           "application/json; charset=utf-8")
                return
            if "api=0" in self.path:
                # 测试 DOM 兜底路径
                self._send(json.dumps({"success": False, "message": "mock: API disabled"}), 500,
                           "application/json; charset=utf-8")
                return
            self._send(json.dumps({"success": True, "data": CHANNELS}),
                       200, "application/json; charset=utf-8")
        else:
            self._send("not found", 404)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print("mock new api on http://127.0.0.1:13000")
    ThreadingHTTPServer(("127.0.0.1", 13000), MockHandler).serve_forever()
