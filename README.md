# 免费公益站统计合集 · 分享网站

AI 公益站导航站:**React 前端 + CSV 数据源 + 双态分离**(公开浏览态 / Excel 式编辑态)。
纯静态、Cloudflare Pages 零成本托管。

## 架构

```
数据源(唯一)                编辑态(只有你)                    浏览态(公开)
──────────              ──────────────────              ──────────────
public/sites.csv        /edit 页(AG Grid Excel 式编辑)    / 页(筛选表格)
public/columns.json  ←  保存→本机助手写回→自动push    →   Cloudflare Pages 自动构建
Excel/书签/New API       ↑ GitHub网页改CSV(手机也行)        访客只渲染公开列
```

- **数据源** = `public/sites.csv`(UTF-8 BOM,**Excel 双击即开即存**,GitHub 网页可编辑)+ `public/columns.json`(列布局:顺序/宽度/隐藏/私列标记)
- **编辑态** = `/edit` 路由,密钥解锁。工具栏:保存、撤销/重做、导入/导出 Excel、超链接、加/删行列、居中/靠左、快速过滤、右键隐藏行列、同步 New API
- **浏览态** = `/`,访客只渲染公开列;私列(体验感/其他/模型/响应/渠道状态)完全不输出到页面
- **防搬运边界(诚实说明)**:密钥是构建期注入的"显示门控";CSV 本身公开可下载。绝密内容不要放进来

## 密钥(.env)

```
VITE_EDIT_KEY=<uuid>   # 访问 https://域名/?k=<uuid> 解锁;?k=off 退出;/edit 进编辑态
```

`.env.production` 不入库 → **Cloudflare Pages 的 Environment variables 里必须配置同名变量**(否则线上构建无密钥)。

## 本地开发

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 产物 → dist/
npm run preview    # 本地预览构建产物
```

## 数据操作

| 想做什么 | 怎么做 |
|---|---|
| 改数据(日常) | Excel 打开 `public/sites.csv` 直接编辑保存;或 GitHub 网页改;或 `/edit` 在线改 |
| 同步 New API | `tools\启动同步工具.bat` → `/edit` 点「同步 New API」→ 预览确认 |
| 导入旧 Excel | `python excel2data.py [文件.xlsx]` |
| 重爬三源评价 | `python tools/crawl_reviews.py` → docs/采集报告.md |
| 重提签到地址 | `python tools/import_checkin.py`(书签文件需在 docs/) |
| 链接体检 | `python tools/check_links.py` → docs/链接体检.md |
| 测试 | `python tools/test_data.py` + `python tools/test_sync.py`(先起 mock) |

CSV 规范:表头即中文列名(公益站/状态/评分/注册/…),与 `src/fields.ts` 和 `tools/sitecsv.py` 三方一致;「隐藏」列=1 的行浏览态不显示;编辑态加列会自动出现在 CSV 新列。

## 部署

Cloudflare Pages:构建命令 `npm run build`、输出目录 `dist`、环境变量 `NODE_VERSION=20` 与 `VITE_EDIT_KEY`。
完整步骤见 **[docs/部署向导.md](docs/部署向导.md)**(含 0 元域名方案与排障)。

> ⚠️ 公益站随时可能失效或跑路,请勿充值。「有效」以最近人工验证为准。
