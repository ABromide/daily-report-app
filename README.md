# Daily Report App

Daily Report App 是一个面向 AI 研究阅读的日报产品。它把公开论文、技术博客、代码仓库和研究报告整理成固定频道，让读者先在首页快速判断“今天有什么值得看”，再进入详情页阅读完整的中文深度解析。

它不是运行监控台，也不是资料链接墙。产品重点是把自动化 Agent 找到的材料转成可搜索、可聚类、可追溯的内容阅读体验。

## 产品介绍

Daily Report App 当前固定追踪三类 AI 前沿内容：

- 大模型 Agent 相关：Agent 平台、工具调用、长期任务、代码工作流和本地 AI 界面。
- 大模型后训练相关：SFT、强化学习、OPD、LoRA/Adapter、蒸馏等后训练工作。
- AI 安全相关：前沿模型治理、攻防风险、能力阈值、权限边界和安全部署。

首页按发布时间倒序展示内容卡片。每张卡片提供中文摘要、来源、标签、分类和两个入口：站内“查看解析”和外部“打开原文”。顶部搜索可以按关键词、方法名、来源、内容类型或频道筛选。

详情页渲染独立 Markdown 深度分析稿。每篇分析不只保留摘要，而是把原文的问题入口、方法结构、实验或证据、关键图表、局限和后续追踪问题整理成一篇可独立阅读的中文文章。

Web 端默认中文，同时提供英文入口：

- `/`
- `/en`

整体架构图和数据流说明见 [docs/architecture.md](docs/architecture.md)。

## 本地部署

需要准备：

- Python 3.12+
- `uv`
- Node.js 20+
- npm
- Swift 6+，仅在需要构建 macOS 本地端时使用

安装依赖：

```bash
uv sync
npm --prefix web install
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

本地构建：

```bash
npm --prefix web run build
```

GitHub Pages 构建时需要带上仓库路径：

```bash
PUBLIC_SITE_BASE=/daily-report-app/ npm --prefix web run build
```

<details>
<summary>产品具体细节</summary>

## 内容形态

Daily Report App 的内容分成两层：

- 首页卡片：用于快速扫读，包含标题、分类、来源、发布时间、标签和自包含摘要。
- Markdown 深度稿：用于完整阅读，包含材料地图、TL;DR、结构拆解、证据边界、图表解读、同类参考和后续追踪问题。

item JSON 只承担索引和卡片展示职责，长文正文保存在独立 Markdown 文件中。

## 首页体验

首页围绕“快速判断是否值得读”设计：

- 固定频道筛选：全部、大模型 Agent、大模型后训练、AI 安全。
- 内容类型筛选：论文、博客、代码、AI 报告。
- 关键词搜索：可搜标题、摘要、标签、来源和常见方法名。
- 卡片排序：默认按发布时间从新到旧。
- 双入口：站内读解析，站外看原文。

## 详情页体验

详情页围绕“读完就能理解原文主张”设计：

- 顶部展示标题、来源、发布时间、分类位置和原文入口。
- 正文渲染 Markdown 深度分析稿，支持表格、公式、代码块和 Mermaid 图。
- 侧边栏保留目录、分类说明、来源信息、自动化审查记录和相关推荐。
- Markdown 可以单独打开，便于复用、归档或二次编辑。

## 数据来源与更新

生产数据写入 `data` 分支，应用代码和文档保留在 `main` 分支。Web 构建时读取公开数据目录；如果生产数据不存在，则使用 `fixtures/public-data/public` 作为本地回退数据。

自动化写入时遵循“深度优先”：

- 只采集今天或本周内发布、更新、合并或被官方页面标记为当前日期范围内的内容。
- 写入前按 `canonical_url`、`external_id`、`title_hash` 和 `content_hash` 去重。
- 每条内容必须归入三类固定频道之一。
- 每条内容必须生成独立 Markdown 深度分析稿。
- 写入后重建 `latest`、`days`、`sources`、`known-links`、reports、audit 和 manifest。
- 发布前执行 public data 校验和 secret scan。

## 公开数据目录

生产数据推荐结构：

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
public/assets/YYYY/MM/DD/ITEM_ID/
```

</details>
