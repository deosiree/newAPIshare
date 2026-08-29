# 免费公益站统计合集 · 分享网站

以 `docs/免费公益站统计合集（持续更新中.xlsx` 为数据源，自动生成的静态分享网页。
纯单文件 HTML，无任何外部依赖，点注册链接**直接跳转、无任何拦截页**，手机、电脑都能用。

## 文件说明

| 文件 | 作用 |
|---|---|
| `docs/免费公益站统计合集（持续更新中.xlsx` | 数据源（唯一需要维护的东西） |
| `build.py` | 构建脚本：读 Excel → 生成 `index.html` |
| `index.html` | 生成的分享网页（可单独发给别人） |

## 日常更新（三步）

1. 用 Excel / WPS 打开 `docs/免费公益站统计合集（持续更新中.xlsx`，增删改站点
   （列顺序固定：公益站、注册链接、有效、注册、每日签到、邀请制、模型质量、体验感、其他、评分、验证日期）
2. 运行构建：
   ```bash
   python build.py
   ```
3. 把新的 `index.html` 发出去，或推送到托管平台（见下文），网站即自动更新。

## 怎么分享

- **直接发文件**：把 `index.html` 通过微信发到文件传输助手，手机点开 → 右上角"…" → 用浏览器打开 → 收藏。之后点开即用，任何条目一点就跳。
- **固定网址（推荐）**：部署到免费托管后，任何设备输入网址即可访问，更新只需重新构建推送。

## 部署到固定网址

### 方案 A：GitHub Pages

```bash
git init
git add .
git commit -m "init: 公益站统计合集分享站"
# 在 GitHub 新建仓库 newAPIshare 后：
git remote add origin https://github.com/<你的用户名>/newAPIshare.git
git push -u origin main
```

然后仓库 **Settings → Pages → Source 选 `main` 分支 `/ (root)`**，保存。
一两分钟后即可通过 `https://<你的用户名>.github.io/newAPIshare/` 访问。

以后更新：改 Excel → `python build.py` → `git add . && git commit -m "update" && git push`。

### 方案 B：Cloudflare Pages

1. 同上把仓库推到 GitHub
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
3. 选该仓库，构建命令留空，**输出目录填 `/`**，部署即可

## 网页功能

- 🔍 关键词搜索（站名 / 奖励 / 备注全文匹配）
- 🏷️ 按状态筛选（有效 / 失效·无效 / 未标注）、按评分筛选（顶级 / 夯 / NPC / 拉）
- 📱 手机优先自适应布局，深色模式自动适配
- 🔗 注册链接一键直达（无拦截），附带「复制链接」按钮
- 📊 顶部自动统计站点总数、有效数与最近验证日期

## 依赖

- Python 3 + `openpyxl`（`pip install openpyxl`）

> ⚠️ 公益站随时可能失效或跑路，请勿充值。「有效」状态以 Excel 中最近人工验证为准。
