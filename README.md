# Daily Report App

Daily Report App 是一个面向用户阅读的 AI 研究内容 Hub。它不是运行监控台，也不是链接墙，而是把 Codex 自动化每天发现的论文、博客、代码仓库和研究报告，整理成可搜索、可聚类、可点击进入详情页的中文内容产品。

当前 Web 展示固定为三类频道：

- 大模型 Agent 相关
- 大模型后训练相关：覆盖 SFT、强化学习、OPD、LoRA/Adapter、蒸馏等后训练工作
- AI 安全相关

每条内容都会被自动化 Agent 深度阅读后转成两层产物：首页只展示可扫读的可视化卡片；二级页面和 public HTML 文件负责完整文章分析，包括文章架构、流程拆解、逐部分细读、证据边界和自动化审查记录。

## 产品界面

Web 端使用 Astro 构建，默认中文，同时提供英文版 `/en`。

核心体验：

- 首页直接展示今日/本周发现的 AI 内容，不展示运行日志、数据源详情或工程检查器。
- 页面顶部提供关键词搜索，可以搜索 Agent、SFT、RL、OPD、AI 安全、论文、代码仓库和来源名称。
- 每张卡片都有两个入口：`查看解析` 进入站内二级详情页，`打开原文` 跳转到来源页面。
- 右上角 GitHub 图标指向公开仓库。
- 二级详情页不是标签集合，而是完整分析稿：文章架构拆解、流程化理解、逐部分细读、自动化审查记录和同类推荐。

## 数据写入逻辑

生产数据写入 `data` 分支，应用代码和文档留在 `main` 分支。

Codex 自动化每小时运行一次，执行顺序如下：

1. 读取中文自动化契约：`config/automation/codex-hourly.zh.json`。
2. 只搜索今天或本周内发布、更新、合并或被官方页面标记为当前日期范围内的内容；无法确认日期的候选直接丢弃。
3. 按三类频道检索候选：
   - `llm-agent`
   - `llm-post-training`
   - `ai-safety`
4. 读取 `public/index/known-links.json` 和最新 `items.jsonl` 做去重。
5. 如果候选的 `canonical_url`、`external_id`、`title_hash` 或 `content_hash` 已存在，丢弃该候选，并继续寻找同类替代内容。
6. 深度阅读完整原文，分析作者的问题入口、方法组织、每个部分承担的作用、证据是否支撑结论、边界和后续追踪问题。
7. 为每条新内容生成卡片摘要、分类字段和独立 HTML 深度分析文件。
8. 写入 JSONL、HTML 分析稿、小时报告、自动化 audit record、manifest 和 known-links。
9. 运行校验和 secret scan，通过后提交到 `data` 分支，并触发 `repository_dispatch: data-updated`。

### Item 输出格式

自动化写入的 item JSON 只作为索引和首页卡片入口，不承载长文正文。每条内容至少包含这些字段：

```json
{
  "item_id": "paper-20260606-trust-region-opd",
  "category_id": "llm-post-training",
  "type": "paper",
  "source_id": "huggingface-daily-papers",
  "external_id": "2606.01249",
  "url": "https://huggingface.co/papers/2606.01249",
  "canonical_url": "https://huggingface.co/papers/2606.01249",
  "title": "Trust Region On-Policy Distillation",
  "published_at": "2026-06-06T00:00:00Z",
  "fetched_at": "2026-06-06T11:00:00Z",
  "summary_zh": "中文摘要，说明文章主问题和结论。",
  "analysis_html_path": "articles/2026/06/06/paper-20260606-trust-region-opd/index.html",
  "tags": ["OPD", "SFT", "强化学习"],
  "content_hash": "sha256..."
}
```

生产分支推荐目录：

```text
public/index/latest.json
public/index/days.json
public/index/sources.json
public/index/known-links.json
public/articles/YYYY/MM/DD/ITEM_ID/index.html
public/audits/YYYY/MM/DD/RUN_ID.json
public/items/YYYY/MM/DD/items.jsonl
public/reports/hourly/YYYY/MM/DD/HH.json
public/reports/daily/YYYY/MM/DD.json
public/manifests/YYYY/MM/DD/HH.manifest.json
raw-public/YYYY/MM/DD/HH/
```

### 深度分析 HTML

每篇文章必须生成一个独立 HTML 文件，路径写入 `analysis_html_path`。这个文件使用和 Web 站点一致的 parchment / ink-blue 样式，不依赖用户再打开原文才能理解内容。子页面正文渲染这个 HTML 文件，而不是从 `analysis_zh`、`visual` 等 JSON 字段拼接。

HTML 分析稿至少包含：

- 文章总览：这篇文章真正讨论什么。
- 文章架构拆解：问题入口、方法主体、证据指标、边界问题。
- 逐部分细读：每个主要部分承担什么作用。
- 方法或系统流程：把文章里的关键流程拆成连续步骤。
- 证据与边界：哪些证据支持结论，哪些地方仍需验证。
- 可复用到日报的判断：为什么值得进入当前分类和后续追踪。

如果原文有关键图片、表格、系统图或结果图，HTML 中可以直接使用原始图片链接；也可以由自动化下载后重新上传到 `public/assets/`，再引用镜像链接。所有图片都需要中文说明。

### 自动化审计记录

每次自动化运行都要写入 `public/audits/YYYY/MM/DD/RUN_ID.json`。审计记录用于证明脚本确实执行了日期过滤、去重、分类、HTML 分析稿生成、manifest 更新和远端触发。

审计记录至少包含：

```json
{
  "run_id": "codex-hourly-20260606t110000z",
  "status": "complete",
  "date_window": {
    "mode": "today_or_current_week",
    "max_age_days": 7,
    "timezone": "Asia/Shanghai"
  },
  "category_counts": {
    "llm-agent": 2,
    "llm-post-training": 2,
    "ai-safety": 2
  },
  "dedupe": {
    "ledger_path": "public/index/known-links.json",
    "checked_keys": ["canonical_url", "external_id", "title_hash", "content_hash"],
    "duplicate_candidates": 1,
    "replacement_candidates": 1
  },
  "written_item_ids": ["paper-20260606-trust-region-opd"],
  "article_paths": ["articles/2026/06/06/paper-20260606-trust-region-opd/index.html"]
}
```

### known-links 去重表

`public/index/known-links.json` 用来保证内容不会重复写入。自动化每次运行前必须读取它。

```json
{
  "version": 1,
  "updated_at": "2026-06-06T11:00:00Z",
  "links": [
    {
      "canonical_url": "https://huggingface.co/papers/2606.01249",
      "external_id": "2606.01249",
      "item_id": "paper-20260606-trust-region-opd",
      "category_id": "llm-post-training",
      "title_hash": "sha256...",
      "content_hash": "sha256...",
      "first_seen_at": "2026-06-06T11:00:00Z"
    }
  ]
}
```

## 本地运行

需要安装：

- Python 3.12+ 与 `uv`
- Node.js 20+
- pnpm 或 npm
- Swift 6+，用于 macOS 本地端

安装和验证：

```bash
uv run pytest
uv run pyright
npm --prefix web install
npm --prefix web run check
npm --prefix web run build
npm --prefix web run test:e2e
swift build --package-path mac
swift run --package-path mac DailyReportSmoke
```

启动 Web 本地预览：

```bash
npm --prefix web run dev -- --host 127.0.0.1 --port 4321
```

打开：

```text
http://127.0.0.1:4321/
http://127.0.0.1:4321/en
```

生成和校验公开数据 fixtures：

```bash
uv run daily-report generate-sample --output fixtures/public-data
uv run daily-report automation-dry-run --output tmp/automation-dry-run
uv run daily-report validate-fixtures
uv run daily-report validate-public fixtures/public-data/public
uv run daily-report secret-scan fixtures/public-data/public
```

## GitHub Pages 部署

Web 端由 GitHub Actions 构建并部署到 GitHub Pages。

本地先用 Pages base path 构建：

```bash
PUBLIC_SITE_BASE=/daily-report-app/ npm --prefix web run build
```

推送到 `main` 后，`pages.yml` 会构建 `web/dist` 并部署。`data` 分支产生新 manifest 后，可以通过 `repository_dispatch` 触发页面刷新。

本地 dry run dispatch：

```bash
scripts/automation/dispatch-data-updated.sh \
  --repo ABromide/daily-report-app \
  --data-sha DRY_RUN_SHA \
  --run-id local-dry-run
```

真正发送需要 `GITHUB_TOKEN` 或已登录的 `gh`：

```bash
scripts/automation/dispatch-data-updated.sh \
  --repo ABromide/daily-report-app \
  --data-sha DATA_BRANCH_COMMIT_SHA \
  --run-id codex-hourly-YYYYMMDDHH \
  --send
```

## 中文 Codex 自动化

自动化契约文件：

```text
config/automation/codex-hourly.zh.json
```

该文件规定：

- 自动化语言是中文：`zh-CN`
- 调度频率是小时级
- 只采集今天或本周内内容
- 三类分类必须固定
- 写入前必须做链接和内容去重
- 重复候选必须换同类替代内容
- 输出必须包含 `category_id` 和 `analysis_html_path`
- item JSON 不能承载长文正文；每篇内容必须生成独立、完整的 HTML 深度分析文件
- 结构化提示词按读取状态、搜索候选、去重替换、深度阅读、写入 HTML、写入索引、审计 manifest、验证提交八步执行
- 每次运行必须生成自动化 audit record，并随 public data 一起提交
- 提交前必须运行 `validate-public` 与 `secret-scan`

测试自动化契约：

```bash
uv run pytest tests/test_automation_contract.py
```

实际创建定时 Codex 自动化前，建议先完成三步：

1. 本地 dry run，确认新数据能写入临时目录。
2. 将临时数据校验通过：`validate-public`、`secret-scan`。
3. 用 dry run dispatch 检查 GitHub 事件 payload。

## 验证标准

每次改动至少通过：

```bash
uv run pytest
uv run pyright
npm --prefix web run check
npm --prefix web run build
npm --prefix web run test:e2e
swift build --package-path mac
swift run --package-path mac DailyReportSmoke
```

前端改动还需要 Playwright 截图确认：

- 中文首页
- 英文首页
- 中文二级详情页
- 移动端首页

截图里不应该出现文字重叠、卡片挤压、不可读指标或缺失状态标签。
