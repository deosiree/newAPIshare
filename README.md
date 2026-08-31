# 免费公益站统计合集 · 分享网站

AI 公益站导航站:**React 前端 + XLSX 数据源 + 双态分离**(公开浏览态 / Excel 式编辑态)。
纯静态、Cloudflare Pages 零成本托管。

## 架构

```
数据源(唯一)                编辑态(只有你)                    浏览态(公开)
──────────              ──────────────────              ──────────────
public/sites.xlsx       /edit 页(AG Grid Excel 式编辑)    / 页(筛选表格)
public/columns.json  ←  保存→本机助手写回→自动push    →   Cloudflare Pages 自动构建
Excel/书签/New API       ↑ Excel/WPS或`/edit`编辑         访客只渲染公开列
```

- **数据源** = `public/sites.xlsx`（唯一业务数据与表格格式来源，第一张工作表渲染；其他工作表保留）+ `public/columns.json`（字段元数据）+ `public/buttons.json`（按钮配置）
- **编辑态** = `/edit` 路由,密钥解锁。工具栏:保存、撤销/重做、导入/导出 Excel、超链接、加/删行列、居中/靠左、快速过滤、右键隐藏行列、同步 New API
- **浏览态** = `/`,访客只渲染公开列;私列(体验感/其他/模型/响应/渠道状态)完全不输出到页面
- **防搬运边界(诚实说明)**:密钥是构建期注入的"显示门控";XLSX 本身公开可下载。绝密内容不要放进来

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
| 改数据(日常) | `/edit` 在线编辑，或 Excel/WPS 打开 `public/sites.xlsx` 直接编辑保存 |
| 同步 New API | `tools\启动同步工具.bat` → `/edit` 点「同步 New API」→ 预览确认 |
| 导入旧 Excel | `python excel2data.py [文件.xlsx]` |
| 重爬三源评价 | `python tools/crawl_reviews.py` → docs/采集报告.md |
| 重提签到地址 | `python tools/import_checkin.py`(书签文件需在 docs/) |
| 链接体检 | `python tools/check_links.py` → docs/链接体检.md |
| 测试 | `python tools/test_data.py` + `python tools/test_sync.py`(先起 mock) |

XLSX 规范：第一张工作表的表头映射 `src/fields.ts`；`uid` 是稳定行 ID；单元格样式、行高、列宽随 XLSX 保存；`columns.json` / `buttons.json` 只保存应用元数据。CSV 仅用于备份导出和首次迁移，不参与正常编辑链路。

## 部署

Cloudflare Pages:构建命令 `npm run build`、输出目录 `dist`、环境变量 `NODE_VERSION=20` 与 `VITE_EDIT_KEY`。
完整步骤见 **[docs/部署向导.md](docs/部署向导.md)**(含 0 元域名方案与排障)。

> ⚠️ 公益站随时可能失效或跑路,请勿充值。「有效」以最近人工验证为准。

## 产品心智模型

- **XLSX 是唯一业务数据源**：`public/sites.xlsx` 的第一张工作表参与网页渲染，其他工作表保留但暂不渲染。
- **格式跟着 Excel 走**：字体颜色、背景色、粗体、斜体、对齐、自动换行、行高和列宽写回 XLSX；浏览态只显示公开列的公开样式。
- **元数据分层**：`columns.json` 保存字段顺序/显示/私列等应用元数据，`buttons.json` 保存按钮配置；UI 临时状态不写入 Excel。
- **编辑是事务**：单元格、样式、行列变更先进入快照事务，再由撤销/重做栈管理，点击保存后经同步助手原子写回并按分支持续推送。
- **行拖拽有边界**：仅在未排序、未筛选的原始顺序下允许行头拖拽；排序或筛选状态下必须先清除状态。
- **当前不支持低代码自由排版**：文本与按钮继续作为表格单元格内容稳定编辑，不实现单元格内部自由拖放布局。
- **右键行为**：仅 `/edit` 页面禁用浏览器原生右键；自定义菜单通过 Portal 挂载并在视口边界内自动定位、超高滚动。
