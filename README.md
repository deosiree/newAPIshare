# 免费公益站统计合集 · 分享网站

以 Excel/飞书文档为源整理的 AI 公益站导航站:**带筛选的表格、注册/签到一键直达（零拦截）、多源评价聚合、浏览态与编辑态分离**。纯静态、零成本托管。

## 架构（浏览态 / 编辑态分离）

```
数据源                      编辑态（只有你）                 浏览态（公开）
─────────                ────────────────────          ──────────────────
Excel + 飞书docx   →   data.js（唯一数据源,私有仓库）  →  Cloudflare Pages 自动发布
书签AI目录          →   ↑ GitHub网页可直接编辑(手机也行)    xxx.pages.dev 免费域名
本机 New API       →   ↑ 网页工具面板一键同步(Playwright)   访客只见公开列
```

- **编辑态** = 私有仓库 + 本机工具：别人拿不到干净数据源和修改历史
- **浏览态** = 公开静态页：访客只看到渲染结果，改不了任何东西
- 防搬运的诚实边界：公开页的渲染内容技术上可被抄走，但拿不到数据源；你的壁垒是**每天更新的活数据**

## 私人视图（只有你能看的列）

- 访问 `网址?k=huiyan829` 解锁（本机记住状态），`?k=off` 退出
- 私列：体验感、其他、模型、响应、渠道状态（访客完全不渲染）
- **改密钥**：编辑 `index.html` 顶部 `CONFIG.privateKey`
- 边界：密钥控制的是"显示与否"，data.js 文件本身公网可下载；某列若绝对不能上公网，在 `excel2data.py` 的 `PRIVATE_FIELDS` 里配置导出剔除

## 日常更新（三条路，任选）

| 方式 | 操作 | 适合 |
|---|---|---|
| 在线改 | GitHub 网页打开 `data.js` → 铅笔编辑 → Commit，约1分钟自动发布 | 手机/外网,改几个字 |
| 本机同步面板 | 双击 `tools/启动同步工具.bat` → 网页解锁私人视图 → 点「检测 New API 渠道」→ 预览 → 确认写入(自动push) | 每日同步渠道模型/响应/状态 |
| Excel 导入 | 改好 Excel → `python excel2data.py` | 批量调整 |

## 数据规范（data.js）

每行一个站点对象；**新增字段会自动变成新列**（在 `index.html` 的 `COLUMNS` 里加一行配置可自定义表头/隐私）：

| 字段 | 含义 | 来源 |
|---|---|---|
| name / url | 站名 / 注册链接 | Excel |
| status / rating | 有效状态 / 评分 | Excel |
| register / daily / invite | 注册奖励 / 签到 / 邀请 | Excel |
| model / exp / other | 模型质量 / 体验感(私) / 其他(私) | Excel |
| verified | 验证日期 | Excel |
| other2 / other3 / other4 | 白嫖org / 飞书合集 / 幻城导航 的第三方评价 | 爬虫 |
| checkin | 签到地址（书签AI目录按同主机前缀提取） | 书签导入 |
| models / latency / api_status | New API 渠道模型 / 响应 / 状态(私) | 同步面板 |

## 工具脚本

| 命令 | 作用 |
|---|---|
| `python excel2data.py` | Excel → data.js |
| `python tools/crawl_reviews.py` | 爬三源评价 → 其他2/3/4 + 采集报告 |
| `python tools/import_checkin.py` | 书签 → checkin 字段 |
| `python tools/preview_real.py` | 真实只读检测 New API → 同步预览.md |
| `python tools/check_links.py` | 全部注册/签到链接体检 |
| `python tools/test_data.py` | 数据断言测试 |
| `python tools/test_sync.py` | 同步工具全链路自测(需先起 mock) |

## 发布（0 元）

见 **[docs/部署向导.md](docs/部署向导.md)**：Cloudflare Pages 免费获得 `xxx.pages.dev` + HTTPS；可选 eu.org / us.kg / pp.ua 免费自定义域名。

> ⚠️ 公益站随时可能失效或跑路，请勿充值。「有效」以最近人工验证为准。
