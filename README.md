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
  "summary_zh": "中文自包含摘要，说明文章主问题、核心做法、实验或证据、关键数字和主要局限。",
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

每篇文章生成一个独立 Markdown 文件，路径写入 `analysis_markdown_path`。这个文件不写完整 HTML，不内联 CSS，不做复杂结构校验；前端只负责把 Markdown 渲染到 Daily Report 的 parchment / ink-blue 阅读框里。Markdown 可以直接包含普通链接、图片链接、行内公式 `$...$`、块级公式 `$$...$$`、Markdown 表格和 fenced Mermaid 图。正文目标是尽量达到 5000 中文字以上，标题、URL、JSON 字段和代码块不计入主要分析字数。

Markdown 分析稿可以参考 [MLPod 论文解读长文写法](https://www.mlpod.com/1548.html)：开头给论文或项目元信息、原始链接和核心图；`TL;DR` 必须是自包含长摘要，读者只看摘要就应能大概知道文章整体在做什么、怎么做、用了什么证据、关键结果是什么、局限在哪里。正文用编号章节推进。论文类必须按常规论文阅读顺序组织：背景与研究问题、方法与模型机制、训练或实验设置、主结果、消融与失败案例、Figure/Table 解读、相关工作、最终结论与局限。博客/报告和代码项目仍按各自内容类型组织，不能互相套模板。

所有类型都可以优先考虑这些模块，但不要求逐字逐项填满：

- 论文或项目元信息：标题、来源、发布时间、原始链接、论文 PDF、代码仓库、作者页。
- TL;DR：自包含长摘要，必须交代问题、具体方法模块、训练/实验设置、关键图表或数字、结论、实际意义和局限；不要写成“值得关注，详见正文”的导读。
- 来源与材料地图：说明读了哪些原文、论文页、README、docs、release notes、PDF、图片、表格、第三方解读或相关论文。
- 排版与结构：需要分点的地方必须分点；对比 benchmark、baseline、指标、数据集、模型规模和消融项时优先用表格；解释训练流程、系统架构、数据流、Agent 决策链或多阶段 pipeline 时可以画 Mermaid 图。
- 方法公式与算法步骤：尽可能保留原文公式、目标函数、奖励函数、指标定义、算法伪代码和变量解释；如果原文公式较少，可以补充解释性公式，但必须说明它是为了辅助理解。
- 外部图片、Figure 与 Table 解读：尽可能引用原始博客图片、论文 figure/table、项目页图片、系统图、轨迹图、结果图或 GitHub README 架构图。
- 实验设置、主结果与消融：按数据集、基座模型、训练设置、指标、主结果、消融和失败案例逐项展开。
- 细节清单：尽可能写出模块名、数据规模、训练阶段、benchmark、baseline、指标数字、消融项、失败类型、figure/table 编号和图片 URL。
- 讨论、相关工作与第三方解读：搜索并引用第三方解读、作者补充材料、相关论文或可信研究博客。
- 关键论证链：还原作者从问题到结论的推理路径。
- 证据与边界：哪些证据支持结论，哪些地方仍需验证。
- 后续追踪问题：下一轮自动化应该继续搜什么。
- 可复用到日报的判断：为什么值得进入当前分类和后续追踪。
- 审稿式结论：像 reviewer 一样说明它能不能进入日报、为什么、带什么边界。

论文类结构：

- 1. 背景与研究问题：研究空白、问题定义、为什么现有方法不足。
- 2. 方法与模型机制：模型结构、训练目标、数据流、公式变量、算法步骤和伪代码。
- 3. 训练与实验设置：数据集、基座模型、训练设置、动作空间或任务定义、指标和评测协议。
- 4. 主结果与指标解读：按表格、benchmark、模型规模和指标逐项解释最终结果。
- 5. 消融、失败案例和误差分析：每个模块是否必要，失败样本说明什么，哪些结论不能推出。
- 6. Figure/Table 逐图逐表解读：尽可能引用外部原图链接或镜像图，解释每张图和每张表的证据功能。
- 7. 讨论与相关工作：同类论文、作者补充、第三方解读、复现或反例。
- 8. 最终结论、局限性与后续追踪：计算成本、数据偏差、泛化边界、可复现性。

博客/报告类结构：

- 1. 博客背景与作者要回答的问题：作者为什么写这篇，读者读完应该理解什么。
- 2. 原文结构总览：按博客原有段落顺序说明每一部分在讲什么。
- 3. 逐段深度解读：尽可能详细地总结博客内容，解释关键概念、例子和作者转折。
- 4. 原文短摘录与分析：选取少量关键原话，每条摘录不超过 25 个中文词或 25 个英文词，并紧跟中文分析。
- 5. 图片、案例与上下文：解释博客中的图片、截图、图表、案例或产品细节。
- 6. 延伸参考与读后判断：相关论文、官方文档、作者补充或第三方解读如何帮助理解这篇博客。

博客和报告不能硬套论文结构：不要给博客编造“实验设计、消融实验、benchmark”，除非原文确实包含这些内容。博客重点是尽可能详细地把原文真正讲了什么讲清楚，按作者原文结构逐段解释，并用少量短摘录帮助读者抓住关键句。短摘录要克制，避免整段搬运原文。

代码项目结构：

- 1. 项目定位与使用入口：README、示例、安装和目标用户。
- 2. 工程结构：核心目录、依赖入口、模块边界、配置和数据流。
- 3. 运行流程：命令入口、状态管理、错误处理、可观测性、权限边界。
- 4. 近期变化：release notes、commit、issue/discussion 和维护信号。
- 5. 可复用性与风险：可部署程度、测试覆盖、性能/安全边界、替代项目。
- 6. 后续追踪：需要试跑、读源码或等待验证的部分。

写入原则：

- 正文应能独立阅读，不要只写几句摘要；不要让读者为了理解主要做法再回到原文找细节。
- 链接、图片、公式、表格和 Mermaid 图直接保留在 Markdown 中。
- item JSON 只负责索引；长文正文不能写回 `analysis_zh` 或 `visual` 字段。
- `validate-public` 只检查 schema、路径存在、sha256 和 manifest，不再检查 Markdown 章节数量或 HTML 结构。

如果原文有关键图片、表格、系统图或结果图，Markdown 中建议尽可能使用原始图片链接；也可以由自动化下载后重新上传到 `public/assets/`，再引用镜像链接。图片最好配中文说明：这张图对应哪一节、展示什么证据、能支持什么结论、不能证明什么。除非原文确实没有图片或 PDF 图片不可提取，否则每篇尽量包含 1 张关键图。

自动化还建议搜索外部参考：原始标题、标题 + 解读、标题 + analysis、标题 + review、arxiv id + blog、作者名 + paper。优先引用论文、官方页面、作者补充和可信研究博客；低质量转载只能作为发现线索。如果没有找到可用解读，Markdown 可以写明搜索过哪些方向。

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
    "minimum_chinese_chars": 5000,
    "evidence_points": 5,
    "image_notes": 1,
    "third_party_references": 1,
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
uv run daily-report finalize-public-run --public-root fixtures/public-data/public --generated-at 2026-06-06T00:00:00Z --run-id local-reconcile --validate --secret-scan
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
- Markdown 正文目标不少于 5000 中文字，并参考 MLPod 式长文解读节奏
- 论文、博客/报告、代码项目应使用不同正文结构；论文类按背景、方法、实验、结果、消融、图表、相关工作、局限的固定顺序推进，博客不能硬套论文实验模板
- 自动化建议尽量抓取外部原始图片、论文 figure/table、项目页图、轨迹图和截图，并搜索第三方解读、相关论文和作者补充材料
- 论文类应尽可能保留原文公式、算法伪代码、指标定义和变量解释；原文公式不足时可以补充解释性公式，但必须标明其用途
- `summary_zh` 和 Markdown `TL;DR` 都必须自包含，直接压缩写出文章具体做什么、怎么做、实验/证据、关键数字和局限
- 自动化写作要尽可能挖掘方法模块、数据规模、训练设置、benchmark、baseline、消融项、失败案例、图表编号、图片 URL 和公式变量
- 结构化提示词按读取状态、候选侦察、去重替换、深度阅读、方法/代码分析、审稿质疑、第三方参考搜索、写入 Markdown、准备 finalize payload、调用工具重建索引/审计/manifest、验证提交执行
- 自动化不要手工 `sed` 或展开读取 `latest/days/sources/known-links/audit/manifest` 这类大 JSON；写完 Markdown 后调用 `finalize-public-run` 机械重建
- 自动化可以一次只研究 1 篇文章或项目，但要研究透
- 审计记录必须包含 `sub_agent_reviews` 和 `quality_gate`
- 每次运行必须生成自动化 audit record，并随 public data 一起提交
- 提交前必须运行 `validate-public` 与 `secret-scan`

### 机械重建 public data 索引

后期 public data 文件会越来越大，自动化不应该靠 `sed`、`cat` 或逐字段阅读来更新索引。推荐流程是：

1. 自动化只写长篇 Markdown：`public/articles/YYYY/MM/DD/ITEM_ID/index.md`
2. 自动化写一个很小的 payload JSON，描述本轮新增 items、sources、dedupe、sub_agent_reviews 和 quality_gate
3. 调用 `finalize-public-run` 统一合并 items，并重建 `known-links`、`sources`、hourly/daily reports、`days`、`latest`、audit 和 manifest

示例 payload：

```json
{
  "run_id": "codex-hourly-20260606t150000z",
  "generated_at": "2026-06-06T15:00:00Z",
  "items": [
    {
      "item_id": "itm_0123456789abcdef",
      "category_id": "llm-agent",
      "type": "paper",
      "source_id": "example-source",
      "source_name": "Example Source",
      "source_type": "manual",
      "external_id": "example:paper",
      "title": "Example Paper",
      "url": "https://example.com/paper",
      "canonical_url": "https://example.com/paper",
      "published_at": "2026-06-06T00:00:00Z",
      "fetched_at": "2026-06-06T15:00:00Z",
      "summary_zh": "首页卡片使用的自包含中文摘要。",
      "analysis_markdown_path": "articles/2026/06/06/itm_0123456789abcdef/index.md",
      "tags": ["Agent", "RL"],
      "content_hash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  ],
  "sources": [
    {
      "id": "example-source",
      "name": "Example Source",
      "kind": "manual",
      "homepage_url": "https://example.com/paper",
      "enabled": true,
      "description": "本轮自动化新增来源。"
    }
  ],
  "dedupe": {
    "duplicate_candidates": 0,
    "replacement_candidates": 0
  },
  "quality_gate": {
    "minimum_chinese_chars": 5000,
    "evidence_points": 5,
    "image_notes": 2,
    "third_party_references": 2,
    "skeptical_review": 3,
    "passed": true
  }
}
```

调用：

```bash
uv run daily-report finalize-public-run \
  --public-root /Users/lizewei/Documents/projects/personal/daily-report-app-worktrees/data/public \
  --payload tmp/codex-hourly-20260606t150000z.payload.json \
  --validate \
  --secret-scan
```

如果本轮已经写好了 `items.jsonl`，也可以不传 payload：

```bash
uv run daily-report finalize-public-run \
  --public-root /Users/lizewei/Documents/projects/personal/daily-report-app-worktrees/data/public \
  --run-id codex-hourly-20260606t150000z \
  --generated-at 2026-06-06T15:00:00Z \
  --written-item-id itm_0123456789abcdef \
  --validate \
  --secret-scan
```

`finalize-public-run` 会跨所有历史 items 检查 `canonical_url`、`external_id`、`title_hash` 和 `content_hash`。如果命中重复，它会直接失败；自动化应该换同类替代候选，而不是手工编辑 `known-links.json`。

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

自动化发布到 `data` 分支时应使用 data worktree 的绝对路径，避免当前工作目录漂移：

```bash
git -C /Users/lizewei/Documents/projects/personal/daily-report-app-worktrees/data add -A public
git -C /Users/lizewei/Documents/projects/personal/daily-report-app-worktrees/data commit -m "data: add report"
git -C /Users/lizewei/Documents/projects/personal/daily-report-app-worktrees/data push origin data
```

不要用临时 `GIT_INDEX_FILE` 作为常规发布路径。Codex 的 `workspace-write` 即使包含 data worktree，也仍会保护 `.git` 和 worktree 指向的真实 gitdir；如果 `git add` 或 `git commit` 被拦截，应补充本机 Codex rules，而不是让自动化手工维护 index。

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
