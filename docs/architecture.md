# Daily Report App 架构

这份文档只描述整体架构和数据流。README 保持产品介绍和本地部署入口。

## 总览

Daily Report App 由三层组成：

1. **内容生产层**：Codex 自动化发现公开 AI 研究材料，做日期过滤、去重、深读、审稿式检查和 Markdown 写作。
2. **公开数据层**：`data` 分支保存可公开发布的 JSON、Markdown、图片附件、审计记录和 manifest。
3. **阅读消费层**：Astro Web 站点和 SwiftUI macOS 端读取同一套公开数据，展示搜索、分类、卡片和详情页。

```mermaid
flowchart LR
  subgraph Sources["公开来源"]
    Papers["论文与 Daily Papers"]
    Blogs["技术博客与研究报告"]
    Repos["GitHub 仓库与 Release"]
  end

  subgraph Producer["内容生产层"]
    Scout["候选发现与日期过滤"]
    Dedupe["链接与内容去重"]
    Reader["深度阅读与证据整理"]
    Review["审稿式质疑"]
    Writer["Markdown 深度稿写作"]
  end

  subgraph Data["公开数据层 data branch"]
    Items["items.jsonl"]
    Articles["articles/**/*.md"]
    Assets["assets/**"]
    Indexes["latest / days / sources / known-links"]
    Audit["audits / reports / manifests"]
  end

  subgraph Consumers["阅读消费层"]
    Web["Astro Web"]
    Mac["SwiftUI macOS"]
  end

  Sources --> Scout --> Dedupe --> Reader --> Review --> Writer
  Writer --> Items
  Writer --> Articles
  Writer --> Assets
  Items --> Indexes
  Articles --> Audit
  Assets --> Audit
  Indexes --> Web
  Articles --> Web
  Assets --> Web
  Indexes --> Mac
  Articles --> Mac
```

## 数据流

自动化每次运行只写新增内容和一个小 payload，随后调用发布工具机械重建 public data 索引。这样可以避免模型手工维护大型 JSON 文件。

```mermaid
sequenceDiagram
  participant Agent as Codex 自动化
  participant Payload as 本轮 payload
  participant Finalize as finalize-public-run
  participant Public as public data
  participant Git as data 分支
  participant Pages as GitHub Pages

  Agent->>Agent: 搜索候选、确认日期窗口、去重
  Agent->>Agent: 深读原文、论文、README、docs 或报告
  Agent->>Public: 写入 articles/**/*.md 与 assets/**
  Agent->>Payload: 写入新增 items、sources、quality gate
  Payload->>Finalize: 传入 run_id 与 generated_at
  Finalize->>Public: 合并 items.jsonl
  Finalize->>Public: 重建 known-links、sources、days、latest
  Finalize->>Public: 写入 hourly/daily reports、audit、manifest
  Finalize->>Finalize: validate-public 与 secret-scan
  Public->>Git: commit / push data 分支
  Git->>Pages: repository_dispatch data-updated
  Pages->>Pages: checkout main + data, build Astro, deploy
```

## Web 读取路径

Astro 站点优先读取生产 public data。如果本地或部署环境没有 data 分支数据，则回退到 fixtures，保证页面仍然可以构建和预览。

```mermaid
flowchart TD
  Request["用户访问首页或详情页"] --> Astro["Astro 页面"]
  Astro --> Resolve["resolvePublicDataDir"]
  Resolve --> DataExists{"存在 public data?"}
  DataExists -- 是 --> DataBranch["读取 data 分支 public/"]
  DataExists -- 否 --> Fixtures["读取 fixtures/public-data/public"]
  DataBranch --> Normalize["归一化 item、source、cluster、Markdown 路径"]
  Fixtures --> Normalize
  Normalize --> Home["首页卡片、搜索、频道筛选"]
  Normalize --> Detail["详情页 Markdown 渲染"]
  Detail --> Markdown["单独打开 Markdown"]
```

## 分支职责

```mermaid
flowchart LR
  Main["main<br/>应用代码、schema、文档、工作流"] --> PagesBuild["Pages 构建"]
  Data["data<br/>公开生成数据"] --> PagesBuild
  PagesBuild --> Site["GitHub Pages 站点"]

  AgentSchema["agent/schema-data<br/>schema 与 collector 迭代"] -.-> Main
  AgentWeb["agent/web-ui<br/>Astro 前端迭代"] -.-> Main
  AgentMac["agent/mac-swift<br/>SwiftUI 本地端迭代"] -.-> Main
  AgentCi["agent/ci-deploy<br/>CI 与部署迭代"] -.-> Main
```

- `main`：应用代码、schema、fixtures、工作流和文档。
- `data`：公开生成数据，不放应用代码。
- `agent/schema-data`：schema、collector、fixtures 和校验逻辑开发分支。
- `agent/web-ui`：Astro Web 产品体验开发分支。
- `agent/mac-swift`：SwiftUI macOS 端开发分支。
- `agent/ci-deploy`：GitHub Actions 和部署链路开发分支。

## 核心约束

- public data 不能包含 secrets、cookies、私有 API 原始响应或个人笔记。
- `item` JSON 只做索引和卡片展示，长文正文必须放在 Markdown 文件里。
- 关键图表可以先落到 `public/assets/`，但 Markdown 只在图片承担证据功能时引用，不单独生成本地附件清单。
- `known-links.json` 是去重账本，自动化写入前必须读取。
- `latest.json` 指向 manifest；manifest 中每个文件都需要 sha256。
- 历史数据尽量追加写入；纠错应优先使用可追踪记录，避免静默覆盖。

## CI 与部署

```mermaid
flowchart TD
  Push["push main / workflow_dispatch / data-updated"] --> CI["GitHub Actions"]
  CI --> Python["Python tests + schema validation + pyright"]
  CI --> Web["npm install + Astro build + e2e"]
  CI --> Swift["Swift build + DailyReportSmoke"]
  Web --> Pages["Pages artifact"]
  Pages --> Deploy["GitHub Pages deploy"]
```

Pages workflow 会 checkout `main`，尝试 checkout `data` 到 `_data_branch`，并在 data 不存在时使用 fixtures 回退数据。`repository_dispatch: data-updated` 用于在 data 分支产生新 manifest 后触发页面刷新。
