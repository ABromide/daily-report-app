# Daily Report App

Daily Report App 是一个面向用户阅读的 AI 研究内容 Hub。它不是运行监控台，也不是链接墙，而是把 Codex 自动化每天发现的论文、博客、代码仓库和研究报告，整理成可搜索、可聚类、可点击进入详情页的中文内容产品。

当前 Web 展示固定为三类频道：

- 大模型 Agent 相关
- 大模型后训练相关：覆盖 SFT、强化学习、OPD、LoRA/Adapter、蒸馏等后训练工作
- AI 安全相关

每条内容都会被自动化 Agent 转成结构化中文摘要，并在界面里展示为“可视化卡片”：核心问题、方法路径、关键信号、AI 解读。首页用于快速扫读和搜索；点击卡片后进入二级页面，阅读更完整的文章解析、分类理由、来源信息和同类推荐。

## 产品界面

Web 端使用 Astro 构建，默认中文，同时提供英文版 `/en`。

核心体验：

- 首页直接展示今日/本周发现的 AI 内容，不展示运行日志、数据源详情或工程检查器。
- 页面顶部提供关键词搜索，可以搜索 Agent、SFT、RL、OPD、AI 安全、论文、代码仓库和来源名称。
- 页面左侧提供可拖拽分类跳转栏，快速跳到三类频道。
- 每张卡片都有两个入口：`查看解析` 进入站内二级详情页，`打开原文` 跳转到来源页面。
- 右上角 GitHub 图标指向公开仓库。

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
6. 为每条新内容生成中文摘要、AI 解读、可视化摘要和分类字段。
7. 写入 JSONL、小时报告、manifest 和 known-links。
8. 运行校验和 secret scan，通过后提交到 `data` 分支，并触发 `repository_dispatch: data-updated`。

### Item 输出格式

自动化写入的每条内容至少包含这些字段：

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
  "summary_zh": "一句话中文摘要。",
  "analysis_zh": "为什么这篇内容值得读。",
  "visual": {
    "question": "这篇内容解决什么问题？",
    "approach": ["方法步骤一", "方法步骤二", "方法步骤三"],
    "takeaway": "AI 解读结论。",
    "metrics": [
      { "label": "方法新颖度", "value": "High", "score": 84 },
      { "label": "工程风险", "value": "Medium", "score": 63 }
    ]
  },
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
public/items/YYYY/MM/DD/items.jsonl
public/reports/hourly/YYYY/MM/DD/HH.json
public/reports/daily/YYYY/MM/DD.json
public/manifests/YYYY/MM/DD/HH.manifest.json
raw-public/YYYY/MM/DD/HH/
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
- 输出必须包含 `category_id` 和 `visual`
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
