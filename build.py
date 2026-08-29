# -*- coding: utf-8 -*-
"""
把 docs/免费公益站统计合集（持续更新中.xlsx 构建为自包含的分享网页 index.html。

数据更新流程:编辑 Excel -> python build.py -> index.html 自动重新生成。
用法:
    python build.py              # 使用默认 Excel 路径
    python build.py 其他.xlsx    # 指定其他 Excel 文件
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent
DEFAULT_XLSX = ROOT / "docs" / "免费公益站统计合集（持续更新中.xlsx"
SHEET_NAME = "工作表1(副本)"

# 列顺序(1-based): A公益站 B注册链接 C有效 D注册 E每日签到 F邀请制
#                  G模型质量 H体验感 I其他 J评分 K验证日期
FIELDS = ["name", "url", "status", "register", "daily", "invite",
          "model", "exp", "other", "rating", "verified"]


def clean(v):
    if v is None:
        return ""
    s = str(v).strip()
    return s


def load_rows(xlsx_path):
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb[SHEET_NAME]
    rows = []
    for row in ws.iter_rows(min_row=2, max_col=len(FIELDS), values_only=True):
        item = {k: clean(v) for k, v in zip(FIELDS, row)}
        if not item["name"] and not item["url"]:
            continue  # 跳过空行
        if not item["name"]:
            item["name"] = "未命名站点"
        rows.append(item)
    return rows


def build_stats(rows):
    def is_ok(s):
        return s in ("有效", "复活了")

    def is_dead(s):
        return s in ("失效", "无效")

    ok = sum(1 for r in rows if is_ok(r["status"]))
    dead = sum(1 for r in rows if is_dead(r["status"]))
    unknown = len(rows) - ok - dead
    verified = sorted({r["verified"] for r in rows if r["verified"]})
    return {
        "total": len(rows),
        "ok": ok,
        "dead": dead,
        "unknown": unknown,
        "verified": "、".join(verified) if verified else "",
    }


TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="免费公益站统计合集(持续更新中):AI 中转公益站导航、状态、奖励与体验评分。">
<meta name="theme-color" content="#4f7cff">
<title>免费公益站统计合集 · 持续更新中</title>
<style>
:root{
  --bg:#f4f6f9; --card:#ffffff; --text:#1b1f24; --muted:#69707a;
  --line:#e4e8ee; --accent:#3b6ef5; --accent-weak:#eaf0ff;
  --ok-bg:#e5f6ec; --ok-tx:#177a3d; --dead-bg:#fdeaea; --dead-tx:#b3372f;
  --unk-bg:#eef0f3; --unk-tx:#5c636e;
  --b-top-bg:#f6edff; --b-top-tx:#7a3fd1; --b-hong-bg:#e7f0ff; --b-hong-tx:#2563eb;
  --b-npc-bg:#eef0f3; --b-npc-tx:#5c636e; --b-la-bg:#fdeaea; --b-la-tx:#b3372f;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#101317; --card:#191d23; --text:#e9ecf1; --muted:#9aa3ae;
    --line:#2a3038; --accent:#6d95ff; --accent-weak:#20304d;
    --ok-bg:#12301e; --ok-tx:#5ad188; --dead-bg:#38191a; --dead-tx:#f08d84;
    --unk-bg:#252a31; --unk-tx:#9aa3ae;
    --b-top-bg:#2c2140; --b-top-tx:#c39bf5; --b-hong-bg:#1c2a45; --b-hong-tx:#8fb2ff;
    --b-npc-bg:#252a31; --b-npc-tx:#9aa3ae; --b-la-bg:#38191a; --b-la-tx:#f08d84;
  }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--bg); color:var(--text);
  font:15px/1.6 system-ui,-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
}
.wrap{max-width:980px; margin:0 auto; padding:0 14px 40px}
header.top{padding:26px 2px 14px}
header.top h1{
  margin:0 0 6px; font-size:24px; line-height:1.3; letter-spacing:.5px;
}
header.top .sub{margin:0; color:var(--muted); font-size:13px}
header.top .sub b{color:var(--accent); font-weight:600}
.toolbar{
  position:sticky; top:0; z-index:10; margin:0 -14px 14px; padding:10px 14px 8px;
  background:color-mix(in srgb, var(--bg) 86%, transparent);
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
  border-bottom:1px solid var(--line);
}
#q{
  width:100%; padding:10px 14px; border-radius:12px; border:1px solid var(--line);
  background:var(--card); color:var(--text); font-size:15px; outline:none;
}
#q:focus{border-color:var(--accent)}
.chips{display:flex; gap:8px; overflow-x:auto; padding:8px 2px 2px; scrollbar-width:none}
.chips::-webkit-scrollbar{display:none}
.chip{
  flex:0 0 auto; padding:5px 13px; border-radius:999px; border:1px solid var(--line);
  background:var(--card); color:var(--muted); font-size:13px; cursor:pointer;
  user-select:none; -webkit-tap-highlight-color:transparent;
}
.chip .n{opacity:.65; font-size:12px; margin-left:3px}
.chip.on{background:var(--accent-weak); border-color:var(--accent); color:var(--accent); font-weight:600}
.grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:14px}
@media (max-width:400px){.grid{grid-template-columns:1fr}}
.card{
  background:var(--card); border:1px solid var(--line); border-radius:16px;
  padding:14px 14px 12px; display:flex; flex-direction:column; gap:10px;
}
.card-head{display:flex; align-items:center; flex-wrap:wrap; gap:6px}
.card-head h2{margin:0; font-size:17px; line-height:1.35; margin-right:2px; word-break:break-all}
.card-head .date{margin-left:auto; color:var(--muted); font-size:12px; white-space:nowrap}
.badge{
  display:inline-block; padding:1.5px 9px; border-radius:999px;
  font-size:12px; font-weight:600; white-space:nowrap;
}
.b-ok{background:var(--ok-bg); color:var(--ok-tx)}
.b-dead{background:var(--dead-bg); color:var(--dead-tx)}
.b-unk{background:var(--unk-bg); color:var(--unk-tx)}
.r-顶级{background:var(--b-top-bg); color:var(--b-top-tx)}
.r-夯{background:var(--b-hong-bg); color:var(--b-hong-tx)}
.r-NPC{background:var(--b-npc-bg); color:var(--b-npc-tx)}
.r-拉{background:var(--b-la-bg); color:var(--b-la-tx)}
.fields{margin:0; display:flex; flex-direction:column; gap:5px; flex:1}
.f{display:flex; gap:10px; font-size:13.5px}
.f .k{
  flex:0 0 58px; color:var(--muted); font-size:12.5px; line-height:1.7;
}
.f .v{flex:1; min-width:0; white-space:pre-line; word-break:break-word}
.actions{display:flex; gap:8px; margin-top:2px}
.btn{
  display:flex; align-items:center; justify-content:center; gap:4px;
  padding:9px 14px; border-radius:11px; border:1px solid var(--line);
  background:transparent; color:var(--text); font-size:14px; font-weight:600;
  text-decoration:none; cursor:pointer; -webkit-tap-highlight-color:transparent;
}
.btn:active{transform:scale(.97)}
.btn.primary{flex:1.6; background:var(--accent); border-color:var(--accent); color:#fff}
.btn.copy{flex:1; color:var(--muted)}
.btn.copy.done{color:var(--ok-tx); border-color:var(--ok-tx)}
.empty{
  text-align:center; color:var(--muted); padding:60px 0; font-size:14px;
}
footer{margin-top:30px; color:var(--muted); font-size:12.5px; line-height:1.8}
footer code{background:var(--accent-weak); color:var(--accent); padding:1px 6px; border-radius:6px}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <h1>免费公益站统计合集 <span style="font-size:13px;color:var(--muted);font-weight:400">持续更新中</span></h1>
    <p class="sub">共 <b>__TOTAL__</b> 站 · 有效 <b>__OK__</b> 站 · 失效/无效 <b>__DEAD__</b> 站__VERIFIED_HTML__</p>
  </header>

  <div class="toolbar">
    <input id="q" type="search" placeholder="🔍 搜索站名 / 奖励 / 备注…" autocomplete="off">
    <div class="chips" id="statusChips"></div>
    <div class="chips" id="ratingChips"></div>
  </div>

  <main class="grid" id="list"></main>
  <div class="empty" id="empty" hidden>没有匹配的站点,换个关键词或筛选条件试试</div>

  <footer>
    数据来源:免费公益站统计合集(Excel)· 生成于 __GEN_TIME__<br>
    「有效」以最近人工验证为准;公益站随时可能跑路,请勿充值,注意账号安全。<br>
    更新数据:编辑 Excel 后运行 <code>python build.py</code> 重新生成本页。
  </footer>
</div>

<script>
var DATA = __DATA__;
var STATS = __STATS__;

function bucketOf(s){
  if (s === '有效' || s === '复活了') return 'ok';
  if (s === '失效' || s === '无效') return 'dead';
  return 'unknown';
}
var STATUS_CHIPS = [
  {key:'all',   label:'全部',      test:function(){return true;}},
  {key:'ok',    label:'有效',      test:function(s){return bucketOf(s)==='ok';}},
  {key:'dead',  label:'失效/无效', test:function(s){return bucketOf(s)==='dead';}},
  {key:'unknown',label:'未标注',   test:function(s){return bucketOf(s)==='unknown';}}
];
var RATING_ORDER = ['顶级','夯','NPC','拉'];
var ratings = [];
DATA.forEach(function(d){
  if (d.rating && ratings.indexOf(d.rating) < 0) ratings.push(d.rating);
});
ratings.sort(function(a,b){
  var ia = RATING_ORDER.indexOf(a), ib = RATING_ORDER.indexOf(b);
  if (ia < 0) ia = 99; if (ib < 0) ib = 99;
  return ia - ib || a.localeCompare(b);
});

var state = { q:'', status:'all', rating:'all' };
var $list = document.getElementById('list');
var $empty = document.getElementById('empty');

function esc(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function buildChips(el, chips, key){
  el.innerHTML = '';
  chips.forEach(function(c){
    var n = DATA.filter(function(d){ return c.test(d.status, d.rating); }).length;
    var b = document.createElement('button');
    b.className = 'chip' + (state[key] === c.key ? ' on' : '');
    b.innerHTML = esc(c.label) + '<span class="n">' + n + '</span>';
    b.onclick = function(){
      state[key] = c.key;
      buildChips(document.getElementById('statusChips'), STATUS_CHIPS, 'status');
      buildChips(document.getElementById('ratingChips'), RATING_CHIPS, 'rating');
      render();
    };
    el.appendChild(b);
  });
}
var RATING_CHIPS = [{key:'all', label:'全部评分', test:function(s,r){return true;}}]
  .concat(ratings.map(function(r){
    return {key:r, label:r, test:function(s, rr){return rr === r;}};
  }));

function matches(d){
  if (state.status !== 'all'){
    var c = STATUS_CHIPS.filter(function(x){return x.key===state.status;})[0];
    if (c && !c.test(d.status, d.rating)) return false;
  }
  if (state.rating !== 'all'){
    var rc = RATING_CHIPS.filter(function(x){return x.key===state.rating;})[0];
    if (rc && !rc.test(d.status, d.rating)) return false;
  }
  if (state.q){
    var q = state.q.toLowerCase();
    var hay = (d.name+' '+d.url+' '+d.status+' '+d.register+' '+d.daily+' '+d.invite+' '
      +d.model+' '+d.exp+' '+d.other+' '+d.rating+' '+d.verified).toLowerCase();
    if (hay.indexOf(q) < 0) return false;
  }
  return true;
}

function fieldRow(k, v){
  if (!v) return '';
  return '<div class="f"><span class="k">'+k+'</span><span class="v">'+esc(v)+'</span></div>';
}

function cardHTML(d, i){
  var st = bucketOf(d.status);
  var stLabel = d.status || '未标注';
  var badges = '<span class="badge b-'+st+'">'+esc(stLabel)+'</span>';
  if (d.rating){
    var rc = 'r-'+esc(d.rating);
    badges += '<span class="badge '+rc+'">'+esc(d.rating)+'</span>';
  }
  var date = d.verified ? '<span class="date">验证 '+esc(d.verified)+'</span>' : '';
  var actions = '';
  if (d.url){
    actions = '<div class="actions">'
      + '<a class="btn primary" href="'+esc(d.url)+'" target="_blank" rel="noopener noreferrer">立即注册 ↗</a>'
      + '<button class="btn copy" data-url="'+esc(d.url)+'">复制链接</button>'
      + '</div>';
  }
  return '<article class="card">'
    + '<div class="card-head"><h2>'+esc(i+'. '+d.name)+'</h2>'+badges+date+'</div>'
    + '<div class="fields">'
    + fieldRow('注册', d.register)
    + fieldRow('每日签到', d.daily)
    + fieldRow('邀请制', d.invite)
    + fieldRow('模型质量', d.model)
    + fieldRow('体验感', d.exp)
    + fieldRow('其他', d.other)
    + '</div>'
    + actions
    + '</article>';
}

function render(){
  var html = '';
  var n = 0;
  DATA.forEach(function(d, idx){
    if (matches(d)){ n++; html += cardHTML(d, idx+1); }
  });
  $list.innerHTML = html;
  $empty.hidden = n > 0;
}

document.getElementById('q').addEventListener('input', function(e){
  state.q = e.target.value.trim();
  render();
});

$list.addEventListener('click', function(e){
  var btn = e.target.closest('.copy');
  if (!btn) return;
  var url = btn.getAttribute('data-url');
  function done(){
    btn.classList.add('done');
    btn.textContent = '已复制 ✓';
    setTimeout(function(){
      btn.classList.remove('done');
      btn.textContent = '复制链接';
    }, 1600);
  }
  function fallback(){
    var ta = document.createElement('textarea');
    ta.value = url;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch(err){ window.prompt('长按复制链接:', url); }
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(done, fallback);
  } else { fallback(); }
});

buildChips(document.getElementById('statusChips'), STATUS_CHIPS, 'status');
buildChips(document.getElementById('ratingChips'), RATING_CHIPS, 'rating');
render();
</script>
</body>
</html>
"""


def main():
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.exists():
        sys.exit(f"找不到 Excel 文件: {xlsx}")
    rows = load_rows(xlsx)
    stats = build_stats(rows)

    data_json = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    # 防止数据里出现 </script> 提前闭合标签
    data_json = data_json.replace("</", "<\\/")

    verified_html = f' · 最近验证 <b>{stats["verified"]}</b>' if stats["verified"] else ""
    html = (
        TEMPLATE
        .replace("__DATA__", data_json)
        .replace("__STATS__", json.dumps(stats, ensure_ascii=False))
        .replace("__TOTAL__", str(stats["total"]))
        .replace("__OK__", str(stats["ok"]))
        .replace("__DEAD__", str(stats["dead"]))
        .replace("__VERIFIED_HTML__", verified_html)
        .replace("__GEN_TIME__", datetime.now().strftime("%Y-%m-%d %H:%M"))
    )

    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"完成: {len(rows)} 个站点 -> {out}")
    print(f"有效 {stats['ok']} | 失效/无效 {stats['dead']} | 未标注 {stats['unknown']}"
          + (f" | 验证日期 {stats['verified']}" if stats["verified"] else ""))


if __name__ == "__main__":
    main()
