import type { Locale } from "./i18n";

export type ContentType = "paper" | "blog" | "code" | "report";

export interface ShowcaseDocument {
  id: string;
  clusterId: string;
  type: ContentType;
  title: Record<Locale, string>;
  summary: Record<Locale, string>;
  analysis: Record<Locale, string>;
  sourceName: string;
  url: string;
  publishedAt: string;
  readingMinutes: number;
  tags: Record<Locale, string[]>;
  domain: string;
}

export interface ShowcaseCluster {
  id: string;
  title: Record<Locale, string>;
  thesis: Record<Locale, string>;
  summary: Record<Locale, string>;
  tags: Record<Locale, string[]>;
  documentIds: string[];
}

export interface LocalizedDocument {
  id: string;
  clusterId: string;
  type: ContentType;
  typeLabel: string;
  title: string;
  summary: string;
  analysis: string;
  sourceName: string;
  url: string;
  publishedAt: string;
  readingMinutes: number;
  tags: string[];
  domain: string;
  faviconUrl: string;
  searchText: string;
}

export interface LocalizedCluster {
  id: string;
  title: string;
  thesis: string;
  summary: string;
  tags: string[];
  documents: LocalizedDocument[];
  lastUpdatedAt: string;
}

export interface ShowcaseData {
  generatedAt: string;
  repoUrl: string;
  hero: {
    eyebrow: string;
    title: string;
    summary: string;
    updateLabel: string;
    searchPlaceholder: string;
  };
  stats: Array<{ label: string; value: string }>;
  filters: Array<{ id: "all" | ContentType; label: string }>;
  clusters: LocalizedCluster[];
  documents: LocalizedDocument[];
}

const generatedAt = "2026-06-06T10:45:00Z";
const repoUrl = "https://github.com/ABromide/daily-report-app";

const typeLabels: Record<Locale, Record<ContentType, string>> = {
  zh: {
    paper: "论文",
    blog: "博客",
    code: "代码",
    report: "AI 报告"
  },
  en: {
    paper: "Paper",
    blog: "Blog",
    code: "Code",
    report: "AI Brief"
  }
};

const clusters: ShowcaseCluster[] = [
  {
    id: "agent-engineering",
    title: {
      zh: "Agent 工程正在进入真实开发流程",
      en: "Agent Engineering Is Moving Into Real Development Workflows"
    },
    thesis: {
      zh: "从写代码到容器隔离，Agent 的产品力正在由“能回答”转向“能持续做事”。",
      en: "Agent products are shifting from answer generation toward sustained work inside real engineering systems."
    },
    summary: {
      zh: "Anthropic 的工程文章、Claude Code 相关发布和开源 agent 平台共同指向一个趋势：用户不只需要聊天助手，更需要能被约束、可复核、能接入工作流的执行体。",
      en: "Anthropic engineering notes, Claude Code releases, and open-source agent platforms all point to execution systems that can be constrained, reviewed, and embedded in workflows."
    },
    tags: {
      zh: ["Claude Code", "工作流", "安全边界"],
      en: ["Claude Code", "workflow", "containment"]
    },
    documentIds: [
      "anthropic-self-building",
      "anthropic-containment",
      "claude-opus-48",
      "dify-agent-platform"
    ]
  },
  {
    id: "ai-safety-security",
    title: {
      zh: "AI 安全从模型问答扩展到操作风险",
      en: "AI Safety Is Expanding Toward Operational Risk"
    },
    thesis: {
      zh: "安全评估开始关注攻击链、能力阈值、部署边界，以及 AI 是否会改变真实世界的风险结构。",
      en: "Safety work is increasingly about attack chains, capability thresholds, deployment boundaries, and real-world risk."
    },
    summary: {
      zh: "近期安全材料不再只讨论越狱和有害回答，而是把 AI 作为攻击者、研发加速器和复杂系统组件来审视。",
      en: "Recent safety materials treat AI not merely as a chatbot risk, but as an attacker aid, R&D accelerator, and complex system component."
    },
    tags: {
      zh: ["攻防", "Frontier Safety", "部署治理"],
      en: ["cyber", "frontier safety", "deployment"]
    },
    documentIds: [
      "anthropic-cyber-threats",
      "deepmind-frontier-safety",
      "anthropic-code-security"
    ]
  },
  {
    id: "models-research",
    title: {
      zh: "模型研究的信号更分散，但更可产品化",
      en: "Model Research Signals Are More Distributed and Productizable"
    },
    thesis: {
      zh: "从记忆、几何证明到代码适配器，研究进展正在变成可解释的产品能力。",
      en: "From memory to geometry proofs and code adapters, research progress is turning into product capabilities."
    },
    summary: {
      zh: "OpenAI 的研究索引和 Hugging Face Daily Papers 展示了一个更用户友好的组织方式：按日期和主题呈现，让研究内容可以被搜索、聚类和继续阅读。",
      en: "OpenAI's research index and Hugging Face Daily Papers show a user-friendly pattern: date-first and topic-aware research browsing."
    },
    tags: {
      zh: ["模型能力", "论文", "记忆"],
      en: ["model capability", "papers", "memory"]
    },
    documentIds: [
      "openai-memory",
      "openai-geometry",
      "hf-code2lora"
    ]
  },
  {
    id: "open-source-infrastructure",
    title: {
      zh: "开源基础设施仍是 AI 产品扩散的主路径",
      en: "Open-Source Infrastructure Remains the Main Distribution Path"
    },
    thesis: {
      zh: "模型运行、工作流编排和本地界面正在成为开发者最常打开的 AI 工具层。",
      en: "Model serving, workflow orchestration, and local interfaces are becoming the AI layers developers repeatedly open."
    },
    summary: {
      zh: "Ollama、Transformers、Open WebUI、AutoGPT 这类项目说明：用户并不只消费模型，他们需要本地运行、二次开发和可组合的产品表面。",
      en: "Projects like Ollama, Transformers, Open WebUI, and AutoGPT show demand for local serving, extensibility, and composable product surfaces."
    },
    tags: {
      zh: ["开源模型", "本地运行", "开发者工具"],
      en: ["open source", "local models", "developer tools"]
    },
    documentIds: [
      "ollama-repo",
      "transformers-repo",
      "open-webui-repo",
      "autogpt-repo"
    ]
  }
];

const documents: ShowcaseDocument[] = [
  {
    id: "anthropic-self-building",
    clusterId: "agent-engineering",
    type: "blog",
    title: {
      zh: "Anthropic：当 AI 开始参与构建自己",
      en: "Anthropic: When AI Builds Itself"
    },
    summary: {
      zh: "Anthropic 公开讨论 Claude 在内部代码合并中的参与度，并把长期任务成功率作为能力变化信号。",
      en: "Anthropic discusses Claude's role in internal code contributions and uses long-horizon task success as a capability signal."
    },
    analysis: {
      zh: "这不是单点模型发布，而是组织流程变化：Agent 开始影响研发产能、评审方式和系统安全边界。",
      en: "This is less a model launch than a workflow shift: agents now affect engineering throughput, review habits, and safety boundaries."
    },
    sourceName: "Anthropic Institute",
    url: "https://www.anthropic.com/institute/recursive-self-improvement",
    publishedAt: "2026-06-05T13:00:00Z",
    readingMinutes: 8,
    tags: {
      zh: ["Agent", "代码生成", "研发流程"],
      en: ["agents", "code generation", "R&D"]
    },
    domain: "anthropic.com"
  },
  {
    id: "anthropic-cyber-threats",
    clusterId: "ai-safety-security",
    type: "blog",
    title: {
      zh: "一年 AI 网络威胁映射：攻击者正在把 AI 用到更深阶段",
      en: "A Year of AI-Enabled Cyber Threats"
    },
    summary: {
      zh: "Anthropic 分析 832 个被封禁的恶意账号，指出 AI 正进入横向移动、账号发现等更复杂攻击环节。",
      en: "Anthropic maps 832 banned malicious accounts and finds AI moving into later, more complex attack stages."
    },
    analysis: {
      zh: "这类材料适合放入安全聚类：它把“AI 安全”从回答过滤推进到攻击链和工具编排层面。",
      en: "This belongs in the safety cluster because it moves AI safety from response filtering toward attack-chain orchestration."
    },
    sourceName: "Anthropic",
    url: "https://www.anthropic.com/news/AI-enabled-cyber-threats-mitre-attack",
    publishedAt: "2026-06-03T16:00:00Z",
    readingMinutes: 7,
    tags: {
      zh: ["AI 安全", "网络攻防", "MITRE ATT&CK"],
      en: ["AI safety", "cyber", "MITRE ATT&CK"]
    },
    domain: "anthropic.com"
  },
  {
    id: "openai-memory",
    clusterId: "models-research",
    type: "blog",
    title: {
      zh: "OpenAI：更好的记忆如何让 ChatGPT 更有帮助",
      en: "OpenAI: Better Memory for a More Helpful ChatGPT"
    },
    summary: {
      zh: "OpenAI Research 索引在 6 月 4 日展示记忆相关研究，说明个性化和长期上下文仍是产品能力主线。",
      en: "OpenAI's research index highlights memory work on June 4, showing personalization and longer context as a product direction."
    },
    analysis: {
      zh: "对内容产品来说，这类研究应和 Agent、Notebook、阅读器体验放在一起看，而不是孤立成模型新闻。",
      en: "For a research reader, memory work connects directly to agents, notebooks, and reading workflows rather than just model news."
    },
    sourceName: "OpenAI Research",
    url: "https://openai.com/news/research/",
    publishedAt: "2026-06-04T18:00:00Z",
    readingMinutes: 5,
    tags: {
      zh: ["记忆", "ChatGPT", "个性化"],
      en: ["memory", "ChatGPT", "personalization"]
    },
    domain: "openai.com"
  },
  {
    id: "hf-code2lora",
    clusterId: "models-research",
    type: "paper",
    title: {
      zh: "Code2LoRA：面向代码模型演化的适配器生成",
      en: "Code2LoRA: Hypernetwork-Generated Adapters for Code Models"
    },
    summary: {
      zh: "Hugging Face Daily Papers 6 月 5 日收录的论文，关注代码语言模型在软件演化下的适配问题。",
      en: "A June 5 Hugging Face Daily Papers item on adapters for code language models under software evolution."
    },
    analysis: {
      zh: "它适合进入“模型研究”聚类，因为代码模型的长期维护能力会影响 Agent 编程工具的真实可用性。",
      en: "It matters for model research because long-term code-model adaptation affects real agent coding tools."
    },
    sourceName: "Hugging Face Daily Papers",
    url: "https://huggingface.co/papers/date/2026-06-05",
    publishedAt: "2026-06-05T12:00:00Z",
    readingMinutes: 6,
    tags: {
      zh: ["代码模型", "LoRA", "论文"],
      en: ["code models", "LoRA", "paper"]
    },
    domain: "huggingface.co"
  },
  {
    id: "anthropic-containment",
    clusterId: "agent-engineering",
    type: "blog",
    title: {
      zh: "如何在产品中约束 Claude 的权限边界",
      en: "How Anthropic Contains Claude Across Products"
    },
    summary: {
      zh: "Anthropic 复盘 Claude Code、Claude.ai 和 Cowork 的权限隔离经验，强调信任提示前的本地配置风险。",
      en: "Anthropic reviews containment lessons across Claude Code, claude.ai, and Cowork, including risks before trust prompts."
    },
    analysis: {
      zh: "这是 Agent 产品设计的关键文章：用户看不到的权限边界，往往决定产品是否能安全进入真实工作区。",
      en: "This is core agent product design: invisible permission boundaries decide whether agents can safely enter real workspaces."
    },
    sourceName: "Anthropic Engineering",
    url: "https://www.anthropic.com/engineering/how-we-contain-claude",
    publishedAt: "2026-05-25T15:00:00Z",
    readingMinutes: 9,
    tags: {
      zh: ["权限隔离", "Claude Code", "工程"],
      en: ["containment", "Claude Code", "engineering"]
    },
    domain: "anthropic.com"
  },
  {
    id: "claude-opus-48",
    clusterId: "agent-engineering",
    type: "blog",
    title: {
      zh: "Claude Opus 4.8：动态工作流与更长任务能力",
      en: "Claude Opus 4.8: Dynamic Workflows and Long-Running Tasks"
    },
    summary: {
      zh: "Anthropic 发布 Opus 4.8，并提到 Claude Code 的 dynamic workflows 用于处理更大规模问题。",
      en: "Anthropic launched Opus 4.8 and noted Claude Code dynamic workflows for larger-scale problems."
    },
    analysis: {
      zh: "这类能力更新应该和工程文章放在同一聚类：它直接影响用户能否把 Agent 当作持续工作伙伴。",
      en: "This belongs with engineering because it affects whether users can treat agents as sustained collaborators."
    },
    sourceName: "Anthropic",
    url: "https://www.anthropic.com/news/claude-opus-4-8",
    publishedAt: "2026-05-28T17:00:00Z",
    readingMinutes: 6,
    tags: {
      zh: ["Claude", "动态工作流", "长任务"],
      en: ["Claude", "dynamic workflows", "long tasks"]
    },
    domain: "anthropic.com"
  },
  {
    id: "deepmind-frontier-safety",
    clusterId: "ai-safety-security",
    type: "blog",
    title: {
      zh: "DeepMind 强化 Frontier Safety Framework",
      en: "DeepMind Strengthens the Frontier Safety Framework"
    },
    summary: {
      zh: "DeepMind 更新前沿安全框架，加入 harmful manipulation、misalignment 和 tracked capability levels 等风险维度。",
      en: "DeepMind updates its frontier safety framework with harmful manipulation, misalignment, and tracked capability levels."
    },
    analysis: {
      zh: "这说明领先实验室正在把安全治理结构化：不是只看单次模型回答，而是持续追踪能力阈值。",
      en: "It shows safety governance becoming structured around capability thresholds rather than isolated model responses."
    },
    sourceName: "Google DeepMind",
    url: "https://deepmind.google/blog/strengthening-our-frontier-safety-framework/",
    publishedAt: "2026-04-17T12:00:00Z",
    readingMinutes: 8,
    tags: {
      zh: ["前沿安全", "能力阈值", "治理"],
      en: ["frontier safety", "capability levels", "governance"]
    },
    domain: "deepmind.google"
  },
  {
    id: "anthropic-code-security",
    clusterId: "ai-safety-security",
    type: "blog",
    title: {
      zh: "把前沿网络安全能力交给防守方",
      en: "Making Frontier Cybersecurity Capabilities Available to Defenders"
    },
    summary: {
      zh: "Anthropic 介绍 Claude Code Security，用于扫描代码库、发现漏洞并生成补丁建议。",
      en: "Anthropic introduces Claude Code Security for scanning codebases, finding vulnerabilities, and suggesting patches."
    },
    analysis: {
      zh: "这篇和攻击威胁报告形成对照：同样的 AI 能力既能扩大攻击面，也能进入防守工具链。",
      en: "It pairs with the threat report: the same AI capability can widen attacks and strengthen defensive workflows."
    },
    sourceName: "Anthropic",
    url: "https://www.anthropic.com/news/claude-code-security",
    publishedAt: "2026-02-20T15:00:00Z",
    readingMinutes: 7,
    tags: {
      zh: ["代码安全", "漏洞扫描", "防守方"],
      en: ["code security", "vulnerability scanning", "defense"]
    },
    domain: "anthropic.com"
  },
  {
    id: "openai-geometry",
    clusterId: "models-research",
    type: "blog",
    title: {
      zh: "OpenAI 模型推翻离散几何中的核心猜想",
      en: "An OpenAI Model Disproved a Central Discrete Geometry Conjecture"
    },
    summary: {
      zh: "OpenAI Research 5 月 20 日记录了模型在离散几何问题上的研究突破。",
      en: "OpenAI Research records a May 20 result where a model disproved a central conjecture in discrete geometry."
    },
    analysis: {
      zh: "这类案例适合用在“模型能力”聚类中，展示 AI 不只是优化产品体验，也正在进入数学研究流程。",
      en: "This belongs in model capability: AI is moving into mathematical research workflows, not just product UX."
    },
    sourceName: "OpenAI Research",
    url: "https://openai.com/news/research/",
    publishedAt: "2026-05-20T18:00:00Z",
    readingMinutes: 5,
    tags: {
      zh: ["数学", "研究突破", "模型能力"],
      en: ["mathematics", "research", "model capability"]
    },
    domain: "openai.com"
  },
  {
    id: "dify-agent-platform",
    clusterId: "agent-engineering",
    type: "code",
    title: {
      zh: "Dify：生产级 Agentic Workflow 平台",
      en: "Dify: A Production-Ready Agentic Workflow Platform"
    },
    summary: {
      zh: "Dify 是面向 agentic workflow 开发的开源平台，体现了 AI 应用从聊天 UI 走向流程编排。",
      en: "Dify is an open-source platform for agentic workflow development, showing AI apps moving beyond chat UI."
    },
    analysis: {
      zh: "它是代码类内容中最适合作为产品参考的 case：从模型调用、工作流到部署管理都指向真实使用。",
      en: "It is a useful code case because it connects model calls, workflows, and deployment management."
    },
    sourceName: "GitHub",
    url: "https://github.com/langgenius/dify",
    publishedAt: "2026-06-06T10:41:44Z",
    readingMinutes: 4,
    tags: {
      zh: ["开源", "工作流", "Agent 平台"],
      en: ["open source", "workflow", "agent platform"]
    },
    domain: "github.com"
  },
  {
    id: "ollama-repo",
    clusterId: "open-source-infrastructure",
    type: "code",
    title: {
      zh: "Ollama：本地模型运行成为默认入口之一",
      en: "Ollama: Local Model Running as a Default Entry Point"
    },
    summary: {
      zh: "Ollama 持续作为本地模型运行工具被开发者采用，连接开源模型、桌面环境和 API 调用。",
      en: "Ollama remains a developer entry point for running open models locally across desktop and API workflows."
    },
    analysis: {
      zh: "在内容聚类中，它代表“模型不是只在云端消费”，本地运行能力会塑造用户对 AI 工具的期待。",
      en: "It represents a key product expectation: users want models that run locally, not only cloud-hosted endpoints."
    },
    sourceName: "GitHub",
    url: "https://github.com/ollama/ollama",
    publishedAt: "2026-06-06T10:37:46Z",
    readingMinutes: 4,
    tags: {
      zh: ["本地模型", "开源", "开发者工具"],
      en: ["local models", "open source", "developer tools"]
    },
    domain: "github.com"
  },
  {
    id: "transformers-repo",
    clusterId: "open-source-infrastructure",
    type: "code",
    title: {
      zh: "Transformers：模型定义框架仍是生态核心",
      en: "Transformers: The Model Definition Framework at the Center"
    },
    summary: {
      zh: "Hugging Face Transformers 继续作为文本、视觉、音频和多模态模型的基础框架。",
      en: "Hugging Face Transformers remains a foundation for text, vision, audio, and multimodal models."
    },
    analysis: {
      zh: "它说明 AI 产品很多时候不是从单个模型开始，而是从可复用的模型接口和生态工具开始。",
      en: "It shows AI products often begin with reusable model interfaces and ecosystem tooling."
    },
    sourceName: "GitHub",
    url: "https://github.com/huggingface/transformers",
    publishedAt: "2026-06-06T10:40:38Z",
    readingMinutes: 4,
    tags: {
      zh: ["Transformers", "模型框架", "多模态"],
      en: ["Transformers", "model framework", "multimodal"]
    },
    domain: "github.com"
  },
  {
    id: "open-webui-repo",
    clusterId: "open-source-infrastructure",
    type: "code",
    title: {
      zh: "Open WebUI：用户友好的 AI 本地界面",
      en: "Open WebUI: A User-Friendly Local AI Interface"
    },
    summary: {
      zh: "Open WebUI 支持 Ollama 和 OpenAI API，代表开源社区对“可用界面”的持续需求。",
      en: "Open WebUI supports Ollama and OpenAI APIs, representing demand for usable AI interfaces."
    },
    analysis: {
      zh: "对本项目也有启发：用户不会先关心管线，他们先需要清楚、可搜索、能打开的内容界面。",
      en: "It is a reminder for this app: users need a clear, searchable content surface before pipeline details."
    },
    sourceName: "GitHub",
    url: "https://github.com/open-webui/open-webui",
    publishedAt: "2026-06-06T10:40:41Z",
    readingMinutes: 4,
    tags: {
      zh: ["本地界面", "Ollama", "Web UI"],
      en: ["local UI", "Ollama", "web UI"]
    },
    domain: "github.com"
  },
  {
    id: "autogpt-repo",
    clusterId: "open-source-infrastructure",
    type: "code",
    title: {
      zh: "AutoGPT：通用 Agent 工具仍有强社区惯性",
      en: "AutoGPT: General Agent Tooling Still Has Strong Community Gravity"
    },
    summary: {
      zh: "AutoGPT 仍是高关注度 agent 项目之一，展示了用户对可构建、可自动化 AI 工具的长期兴趣。",
      en: "AutoGPT remains a highly watched agent project, showing lasting interest in buildable automation tools."
    },
    analysis: {
      zh: "它不是单个最新突破，但适合作为生态背景：Agent 产品的用户心智已经存在多年。",
      en: "It is not a single breakthrough, but useful ecosystem context: the agent product mental model is mature."
    },
    sourceName: "GitHub",
    url: "https://github.com/Significant-Gravitas/AutoGPT",
    publishedAt: "2026-06-06T08:50:49Z",
    readingMinutes: 4,
    tags: {
      zh: ["Agent", "自动化", "开源"],
      en: ["agents", "automation", "open source"]
    },
    domain: "github.com"
  }
];

const heroCopy: Record<Locale, ShowcaseData["hero"]> = {
  zh: {
    eyebrow: "AI 研究日报",
    title: "今天值得打开的 AI 论文、博客与代码",
    summary: "自动化 Agent 已完成一次真实公开调研：按主题聚类，按时间排序，并把每条内容转成中文可读摘要与产品解读。",
    updateLabel: "更新于 2026-06-06 18:45",
    searchPlaceholder: "搜索论文、博客、代码、模型、作者或关键词"
  },
  en: {
    eyebrow: "AI Research Daily",
    title: "AI Papers, Blogs, and Code Worth Opening Today",
    summary: "An automated agent pass grouped public AI research into topic clusters, sorted by time, and added concise reading notes.",
    updateLabel: "Updated Jun 6, 2026 18:45",
    searchPlaceholder: "Search papers, blogs, code, models, authors, or keywords"
  }
};

const statCopy: Record<Locale, Array<{ label: string; value: string }>> = {
  zh: [
    { label: "主题聚类", value: "4" },
    { label: "精选文档", value: "13" },
    { label: "来源类型", value: "论文 / 博客 / 代码" }
  ],
  en: [
    { label: "Topic clusters", value: "4" },
    { label: "Curated documents", value: "13" },
    { label: "Source types", value: "Papers / Blogs / Code" }
  ]
};

const filterCopy: Record<Locale, ShowcaseData["filters"]> = {
  zh: [
    { id: "all", label: "全部" },
    { id: "paper", label: "论文" },
    { id: "blog", label: "博客" },
    { id: "code", label: "代码" },
    { id: "report", label: "AI 报告" }
  ],
  en: [
    { id: "all", label: "All" },
    { id: "paper", label: "Papers" },
    { id: "blog", label: "Blogs" },
    { id: "code", label: "Code" },
    { id: "report", label: "AI Briefs" }
  ]
};

export function getShowcaseData(locale: Locale): ShowcaseData {
  const localizedDocuments = documents
    .map((document) => localizeDocument(document, locale))
    .sort((lhs, rhs) => Date.parse(rhs.publishedAt) - Date.parse(lhs.publishedAt));
  const documentsById = new Map(localizedDocuments.map((document) => [document.id, document]));

  const localizedClusters = clusters
    .map((cluster) => {
      const clusterDocuments = cluster.documentIds
        .map((id) => documentsById.get(id))
        .filter((document): document is LocalizedDocument => Boolean(document))
        .sort((lhs, rhs) => Date.parse(rhs.publishedAt) - Date.parse(lhs.publishedAt));

      return {
        id: cluster.id,
        title: cluster.title[locale],
        thesis: cluster.thesis[locale],
        summary: cluster.summary[locale],
        tags: cluster.tags[locale],
        documents: clusterDocuments,
        lastUpdatedAt: clusterDocuments[0]?.publishedAt ?? generatedAt
      };
    })
    .sort((lhs, rhs) => Date.parse(rhs.lastUpdatedAt) - Date.parse(lhs.lastUpdatedAt));

  return {
    generatedAt,
    repoUrl,
    hero: heroCopy[locale],
    stats: statCopy[locale],
    filters: filterCopy[locale],
    clusters: localizedClusters,
    documents: localizedDocuments
  };
}

function localizeDocument(document: ShowcaseDocument, locale: Locale): LocalizedDocument {
  const tags = document.tags[locale];
  const searchText = [
    document.title.zh,
    document.title.en,
    document.summary.zh,
    document.summary.en,
    document.analysis.zh,
    document.analysis.en,
    document.sourceName,
    document.domain,
    ...document.tags.zh,
    ...document.tags.en
  ]
    .join(" ")
    .toLowerCase();

  return {
    id: document.id,
    clusterId: document.clusterId,
    type: document.type,
    typeLabel: typeLabels[locale][document.type],
    title: document.title[locale],
    summary: document.summary[locale],
    analysis: document.analysis[locale],
    sourceName: document.sourceName,
    url: document.url,
    publishedAt: document.publishedAt,
    readingMinutes: document.readingMinutes,
    tags,
    domain: document.domain,
    faviconUrl: `https://www.google.com/s2/favicons?domain=${document.domain}&sz=64`,
    searchText
  };
}
