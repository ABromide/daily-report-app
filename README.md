# Daily Report App

Daily Report App 是一个面向用户阅读的 AI 研究内容 Hub。它不是运行监控台，也不是链接墙，而是把 Codex 自动化每天发现的论文、博客、代码仓库和研究报告，整理成可搜索、可聚类、可点击进入详情页的中文内容产品。

当前 Web 展示固定为三类频道：

- 大模型 Agent 相关
- 大模型后训练相关：覆盖 SFT、强化学习、OPD、LoRA/Adapter、蒸馏等后训练工作
- AI 安全相关

每条内容都会被自动化 Agent 深度阅读后转成两层产物：首页只展示可扫读的摘要卡片；二级页面加载 public Markdown 文件并渲染完整文章分析，包括文章架构、流程拆解、逐部分细读、证据边界和自动化审查记录。

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

Codex 自动化每小时运行一次，但策略是“深度优先”而不是“数量优先”。如果某个小时只有 1 篇内容真正值得研究，并且能被完整读透，自动化可以只提交 1 篇；禁止为了凑满分类写浅层摘要。

执行顺序如下：

1. 读取中文自动化契约：`config/automation/codex-hourly.zh.json`。
2. 只搜索今天或本周内发布、更新、合并或被官方页面标记为当前日期范围内的内容；无法确认日期的候选直接丢弃。
3. 按三类频道检索候选：
   - `llm-agent`
   - `llm-post-training`
   - `ai-safety`
4. 读取 `public/index/known-links.json` 和最新 `items.jsonl` 做去重。
5. 如果候选的 `canonical_url`、`external_id`、`title_hash` 或 `content_hash` 已存在，丢弃该候选，并继续寻找同类替代内容。
6. 启动或模拟多个子 Agent：
   - `scout`：找候选、确认日期窗口和去重键。
   - `deep_reader`：完整阅读原文、论文、README、docs、release notes 或报告正文。
   - `method_or_code_analyst`：论文看方法和实验；代码看模块、依赖、执行流、状态管理和部署入口。
   - `skeptic`：专门找证据不足、过度解释、重复内容和日期不合规。
   - `markdown_editor`：把深读笔记改写成完整中文 Markdown。
7. 深度阅读完整原文，分析作者的问题入口、方法组织、每个部分承担的作用、证据是否支撑结论、代码或项目结构如何支持主张、边界和后续追踪问题。
8. 为每条新内容生成卡片摘要、分类字段和独立 Markdown 深度分析文件。
9. 写入 JSONL、Markdown 分析稿、小时报告、自动化 audit record、manifest 和 known-links。
10. 运行校验和 secret scan，通过后提交到 `data` 分支，并触发 `repository_dispatch: data-updated`。

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
  "analysis_markdown_path": "articles/2026/06/06/paper-20260606-trust-region-opd/index.md",
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
public/articles/YYYY/MM/DD/ITEM_ID/index.md
public/audits/YYYY/MM/DD/RUN_ID.json
public/items/YYYY/MM/DD/items.jsonl
public/reports/hourly/YYYY/MM/DD/HH.json
public/reports/daily/YYYY/MM/DD.json
public/manifests/YYYY/MM/DD/HH.manifest.json
raw-public/YYYY/MM/DD/HH/
```

### 深度分析 Markdown

每篇文章必须生成一个独立 Markdown 文件，路径写入 `analysis_markdown_path`。这个文件不写完整 HTML，不内联 CSS，不做复杂结构校验；前端负责把 Markdown 渲染到 Daily Report 的 parchment / ink-blue 阅读框里。Markdown 可以直接包含普通链接、图片链接、行内公式 `$...$` 和块级公式 `$$...$$`。

Markdown 分析稿建议包含：

- TL;DR：先给核心判断，但不能替代正文。
- 文章总览：这篇文章真正讨论什么。
- 来源与材料地图：说明读了哪些原文、论文页、README、docs、release notes、PDF、图片或表格。
- 文章架构拆解：问题入口、方法主体、证据指标、边界问题。
- 逐部分细读：每个主要部分承担什么作用。
- 方法或系统流程：把文章里的关键流程拆成连续步骤。
- 代码或项目结构深挖：如果是代码仓库，要解释模块边界、执行流程、状态管理、可观测性和部署入口。
- 关键论证链：还原作者从问题到结论的推理路径。
- 对照与反例：说明哪些结论不能从单个信号直接推出。
- 证据与边界：哪些证据支持结论，哪些地方仍需验证。
- 后续追踪问题：下一轮自动化应该继续搜什么。
- 可复用到日报的判断：为什么值得进入当前分类和后续追踪。
- 审稿式结论：像 reviewer 一样说明它能不能进入日报、为什么、带什么边界。

写入原则：

- 正文必须能独立阅读，不要只写几句摘要。
- 链接、图片和公式直接保留在 Markdown 中。
- item JSON 只负责索引；长文正文不能写回 `analysis_zh` 或 `visual` 字段。
- `validate-public` 只检查 schema、路径存在、sha256 和 manifest，不再检查 Markdown 章节数量或 HTML 结构。

如果原文有关键图片、表格、系统图或结果图，Markdown 中可以直接使用原始图片链接；也可以由自动化下载后重新上传到 `public/assets/`，再引用镜像链接。所有图片都需要中文说明。

### 自动化审计记录

每次自动化运行都要写入 `public/audits/YYYY/MM/DD/RUN_ID.json`。审计记录用于证明脚本确实执行了日期过滤、去重、分类、Markdown 分析稿生成、manifest 更新和远端触发。

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
  "article_paths": ["articles/2026/06/06/paper-20260606-trust-region-opd/index.md"],
  "sub_agent_reviews": [
    {
      "agent_id": "deep_reader",
      "status": "passed",
      "summary": "完整阅读原文并输出结构化深读笔记。"
    }
  ],
  "quality_gate": {
    "minimum_chinese_chars": 3500,
    "evidence_points": 5,
    "skeptical_review": 3,
    "passed": true
  }
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
- 输出必须包含 `category_id` 和 `analysis_markdown_path`
- item JSON 不能承载长文正文；每篇内容必须生成独立、完整的 Markdown 深度分析文件
- 结构化提示词按读取状态、候选侦察、去重替换、深度阅读、方法/代码分析、审稿质疑、写入 Markdown、写入索引、审计 manifest、验证提交十步执行
- 自动化可以一次只研究 1 篇文章或项目，但必须研究透
- 审计记录必须包含 `sub_agent_reviews` 和 `quality_gate`
- 每次运行必须生成自动化 audit record，并随 public data 一起提交
- 提交前必须运行 `validate-public` 与 `secret-scan`

本仓库还提供一个真实调研样例生成脚本，用来在本地复现“深度优先”的 public data：

```bash
uv run python scripts/automation/generate_curated_public_data.py \
  --output fixtures/public-data \
  --run-id codex-hourly-20260606t123234z \
  --generated-at 2026-06-06T12:32:34Z
```

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
