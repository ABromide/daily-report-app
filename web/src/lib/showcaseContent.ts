import type { Locale } from "./i18n";

export type ContentType = "paper" | "blog" | "code" | "report";

interface LocalizedMetric {
  label: string;
  value: string;
  score: number;
}

interface DocumentMetric {
  label: Record<Locale, string>;
  value: string;
  score: number;
}

interface DocumentVisual {
  question: Record<Locale, string>;
  approach: Record<Locale, string[]>;
  takeaway: Record<Locale, string>;
  metrics: DocumentMetric[];
}

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
  visual: DocumentVisual;
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
  analysisHtmlPath: string;
  searchText: string;
  visual: {
    question: string;
    approach: string[];
    takeaway: string;
    metrics: LocalizedMetric[];
  };
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

const generatedAt = "2026-06-06T11:35:00Z";
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
    id: "llm-agent",
    title: {
      zh: "大模型 Agent 相关",
      en: "LLM Agents"
    },
    thesis: {
      zh: "关注大模型从回答问题走向调用工具、执行任务、进入真实开发流的能力变化。",
      en: "Tracks the shift from answering questions toward tool use, task execution, and real development workflows."
    },
    summary: {
      zh: "这一组聚焦 Agent 平台、长期任务、代码工作流和本地 AI 界面。用户打开它时，应该能快速判断哪些内容能变成可用产品或工程能力。",
      en: "This group focuses on agent platforms, long-running tasks, coding workflows, and local AI interfaces."
    },
    tags: {
      zh: ["Agent 平台", "工具调用", "代码工作流"],
      en: ["agent platforms", "tool use", "coding workflows"]
    },
    documentIds: [
      "dify-agent-platform",
      "anthropic-self-building",
      "adaplanbench-agent",
      "open-webui-repo",
      "autogpt-repo"
    ]
  },
  {
    id: "llm-post-training",
    title: {
      zh: "大模型后训练相关",
      en: "LLM Post-Training"
    },
    thesis: {
      zh: "覆盖 SFT、强化学习、OPD、适配器和蒸馏等前沿工作，重点看训练状态、奖励信号和推理能力如何被重塑。",
      en: "Covers SFT, reinforcement learning, OPD, adapters, and distillation work that reshapes reasoning behavior."
    },
    summary: {
      zh: "这一组把后训练当作独立频道，而不是泛泛的“模型研究”。每张卡都说明它在 SFT/RL/OPD 这条链路中的位置。",
      en: "This group treats post-training as a first-class channel instead of a generic model research bucket."
    },
    tags: {
      zh: ["SFT", "强化学习", "OPD"],
      en: ["SFT", "RL", "OPD"]
    },
    documentIds: [
      "fire-opd",
      "trust-region-opd",
      "oprd-representation-distillation",
      "rl-contextual-translation",
      "hf-code2lora"
    ]
  },
  {
    id: "ai-safety",
    title: {
      zh: "AI 安全相关",
      en: "AI Safety"
    },
    thesis: {
      zh: "关注前沿模型治理、攻防风险、能力阈值、权限边界和安全部署。",
      en: "Tracks frontier governance, cyber risk, capability thresholds, containment, and deployment safety."
    },
    summary: {
      zh: "这一组不只看模型是否会说错话，而是看 AI 进入真实系统后如何改变攻击面、研发流程和治理结构。",
      en: "This group looks beyond harmful answers toward operational risk, attack surfaces, and governance structures."
    },
    tags: {
      zh: ["Frontier Safety", "网络攻防", "权限边界"],
      en: ["frontier safety", "cyber", "containment"]
    },
    documentIds: [
      "openai-frontier-blueprint",
      "anthropic-cyber-threats",
      "openai-biodefense",
      "llm-memorization-propensity"
    ]
  }
];

const documents: ShowcaseDocument[] = [
  {
    id: "dify-agent-platform",
    clusterId: "llm-agent",
    type: "code",
    title: {
      zh: "Dify：生产级 Agentic Workflow 平台",
      en: "Dify: A Production-Ready Agentic Workflow Platform"
    },
    summary: {
      zh: "Dify 把模型调用、工作流编排、工具接入和部署管理放进同一个开源平台。",
      en: "Dify brings model calls, workflow orchestration, tool use, and deployment into one open-source platform."
    },
    analysis: {
      zh: "这是 Agent 类产品最该看的工程样本：它把“会聊天”推进到“能被配置、上线和复用”。",
      en: "A strong engineering sample for agent products because it turns chat into configurable, deployable workflows."
    },
    sourceName: "GitHub",
    url: "https://github.com/langgenius/dify",
    publishedAt: "2026-06-06T10:41:44Z",
    readingMinutes: 4,
    tags: {
      zh: ["Agent 平台", "Workflow", "开源"],
      en: ["agent platform", "workflow", "open source"]
    },
    domain: "github.com",
    visual: visual(
      ["用户如何把 Agent 做成可上线应用？", "How do users turn agents into deployable apps?"],
      [["模型接入", "流程编排", "部署复用"], ["model access", "workflow design", "deployment reuse"]],
      ["适合当作 Agent 产品的信息架构参考，而不是单纯代码仓库。", "Use it as an agent-product IA reference, not just a code repository."],
      [["产品可用性", "High"], ["工程完整度", "Strong"], [88, 82]]
    )
  },
  {
    id: "anthropic-self-building",
    clusterId: "llm-agent",
    type: "blog",
    title: {
      zh: "Anthropic：当 AI 开始参与构建自己",
      en: "Anthropic: When AI Builds Itself"
    },
    summary: {
      zh: "Anthropic 讨论 Claude 在内部代码、实验和研究流程中的参与度，说明 Agent 正在影响研发组织。",
      en: "Anthropic discusses Claude's role in internal coding, experiments, and research workflows."
    },
    analysis: {
      zh: "它的关键不是某个新模型，而是 Agent 把研发工作拆成可委派、可评审、可长期运行的任务。",
      en: "The key signal is not one model launch, but work becoming delegable, reviewable, and long-running."
    },
    sourceName: "Anthropic Institute",
    url: "https://www.anthropic.com/institute/recursive-self-improvement",
    publishedAt: "2026-06-05T13:00:00Z",
    readingMinutes: 8,
    tags: {
      zh: ["Agent", "研发流程", "长期任务"],
      en: ["agents", "R&D workflows", "long tasks"]
    },
    domain: "anthropic.com",
    visual: visual(
      ["Agent 对研发流程的改变在哪里？", "Where are agents changing R&D workflows?"],
      [["代码生成", "实验执行", "自动评审"], ["code generation", "experiment execution", "automated review"]],
      ["把这篇放进 Agent 类，是因为它展示了工作流层面的结构变化。", "This belongs in Agents because it shows workflow-level structural change."],
      [["组织影响", "High"], ["可产品化", "Medium"], [92, 71]]
    )
  },
  {
    id: "adaplanbench-agent",
    clusterId: "llm-agent",
    type: "paper",
    title: {
      zh: "AdaPlanBench：双重约束下的 Agent 自适应规划",
      en: "AdaPlanBench: Adaptive Planning Under Dual Constraints"
    },
    summary: {
      zh: "论文提出 307 个家务规划任务，让 Agent 在逐步显露的世界约束和用户约束下反复修正规划。",
      en: "The paper introduces 307 household planning tasks where agents revise plans under progressively revealed world and user constraints."
    },
    analysis: {
      zh: "它适合放进 Agent 类，因为它把“能规划”拆成了交互、反馈、约束记忆和重新规划能力。",
      en: "It belongs in Agents because it turns planning into interaction, feedback, constraint memory, and replanning."
    },
    sourceName: "arXiv",
    url: "https://arxiv.org/abs/2606.05622",
    publishedAt: "2026-06-04T02:47:29Z",
    readingMinutes: 9,
    tags: {
      zh: ["Agent 评测", "自适应规划", "约束推理"],
      en: ["agent evals", "adaptive planning", "constraint reasoning"]
    },
    domain: "arxiv.org",
    visual: visual(
      ["Agent 如何在约束变化时继续规划？", "How do agents keep planning as constraints change?"],
      [["隐藏约束", "交互反馈", "重新规划"], ["hidden constraints", "interactive feedback", "replanning"]],
      ["这张卡用来判断 Agent 是否真的能在真实约束中工作。", "Use this card to judge whether agents can work under real constraints."],
      [["评测价值", "High"], ["产品相关", "High"], [88, 82]]
    )
  },
  {
    id: "open-webui-repo",
    clusterId: "llm-agent",
    type: "code",
    title: {
      zh: "Open WebUI：本地 Agent 入口的用户界面",
      en: "Open WebUI: A User Interface for Local Agents"
    },
    summary: {
      zh: "Open WebUI 支持 Ollama 和 OpenAI API，展示了本地模型、工具和界面如何被普通用户打开。",
      en: "Open WebUI supports Ollama and OpenAI APIs, showing how local models and tools reach users."
    },
    analysis: {
      zh: "它适合放在 Agent 相关类里，因为用户最终需要的是可操作界面，而不只是运行时。",
      en: "It fits Agents because users need an operable interface, not just a runtime."
    },
    sourceName: "GitHub",
    url: "https://github.com/open-webui/open-webui",
    publishedAt: "2026-06-06T10:40:41Z",
    readingMinutes: 4,
    tags: {
      zh: ["本地界面", "Ollama", "Agent 入口"],
      en: ["local UI", "Ollama", "agent entry"]
    },
    domain: "github.com",
    visual: visual(
      ["Agent 为什么需要界面层？", "Why do agents need an interface layer?"],
      [["模型连接", "对话入口", "本地体验"], ["model links", "chat entry", "local UX"]],
      ["这张卡展示用户入口，而不是后端能力。", "This card shows the user entry, not backend capability."],
      [["用户入口", "Strong"], ["工程复用", "Medium"], [80, 68]]
    )
  },
  {
    id: "autogpt-repo",
    clusterId: "llm-agent",
    type: "code",
    title: {
      zh: "AutoGPT：通用 Agent 工具的社区惯性",
      en: "AutoGPT: Community Gravity Around General Agents"
    },
    summary: {
      zh: "AutoGPT 仍是高关注度 Agent 项目，代表用户对可构建、可自动化 AI 工具的长期兴趣。",
      en: "AutoGPT remains a visible agent project and represents durable interest in buildable automation."
    },
    analysis: {
      zh: "它不是最新突破，但适合作为 Agent 生态背景，帮助判断用户心智是否成熟。",
      en: "It is ecosystem context: the user mental model for general agents is already mature."
    },
    sourceName: "GitHub",
    url: "https://github.com/Significant-Gravitas/AutoGPT",
    publishedAt: "2026-06-06T08:50:49Z",
    readingMinutes: 4,
    tags: {
      zh: ["Agent", "自动化", "开源"],
      en: ["agents", "automation", "open source"]
    },
    domain: "github.com",
    visual: visual(
      ["通用 Agent 的用户心智是否还在？", "Is the general-agent mental model still alive?"],
      [["任务目标", "自动执行", "社区扩散"], ["task goals", "automation", "community spread"]],
      ["保留它是为了看生态惯性，不是为了证明技术领先。", "Keep it for ecosystem gravity, not technical leadership."],
      [["社区信号", "High"], ["前沿程度", "Low"], [76, 42]]
    )
  },
  {
    id: "fire-opd",
    clusterId: "llm-post-training",
    type: "paper",
    title: {
      zh: "FiRe-OPD：先过滤再重加权的 On-Policy Distillation",
      en: "FiRe-OPD: Filter, Then Reweight On-Policy Distillation"
    },
    summary: {
      zh: "FiRe-OPD 把 OPD 从全轨迹 KL 监督推向“轨迹过滤 + token 软重加权”，强调更细粒度的后训练稳定性。",
      en: "FiRe-OPD moves OPD from full-trace KL supervision toward trajectory filtering plus token-level soft reweighting."
    },
    analysis: {
      zh: "它是本周后训练里最像工程方法的一张卡：不只问学不学，还问哪些 rollout、哪些 token 值得学。",
      en: "A practical post-training method card: it asks which rollouts and which tokens are worth learning from."
    },
    sourceName: "Hugging Face Papers",
    url: "https://huggingface.co/papers/2606.02684",
    publishedAt: "2026-06-01T17:58:22Z",
    readingMinutes: 9,
    tags: {
      zh: ["OPD", "轨迹过滤", "重加权"],
      en: ["OPD", "trajectory filtering", "reweighting"]
    },
    domain: "huggingface.co",
    visual: visual(
      ["OPD 应该学习哪些 rollout 和 token？", "Which rollouts and tokens should OPD learn from?"],
      [["过滤轨迹", "软重加权", "稳定优化"], ["filter rollouts", "soft reweighting", "stable optimization"]],
      ["它把 OPD 的关键问题落到了训练样本选择粒度。", "It brings OPD down to the granularity of training sample selection."],
      [["方法新颖度", "High"], ["工程风险", "Medium"], [86, 62]]
    )
  },
  {
    id: "trust-region-opd",
    clusterId: "llm-post-training",
    type: "paper",
    title: {
      zh: "Trust Region OPD：用可信区域稳定 On-Policy Distillation",
      en: "Trust Region OPD: Stabilizing On-Policy Distillation"
    },
    summary: {
      zh: "TrOPD 用 trust region、outlier estimation 和 off-policy guidance 缓解教师/学生分布不匹配造成的不稳定。",
      en: "TrOPD uses trust regions, outlier estimation, and off-policy guidance to stabilize teacher-student mismatch."
    },
    analysis: {
      zh: "这是 OPD 进入工程化前必须解决的问题：学生生成的 token 不可靠时，教师监督不能无差别灌入。",
      en: "This is an engineering issue for OPD: unreliable student tokens should not receive uniform teacher gradients."
    },
    sourceName: "Hugging Face Papers",
    url: "https://huggingface.co/papers/2606.01249",
    publishedAt: "2026-06-03T12:00:00Z",
    readingMinutes: 9,
    tags: {
      zh: ["OPD", "Trust Region", "稳定性"],
      en: ["OPD", "trust region", "stability"]
    },
    domain: "huggingface.co",
    visual: visual(
      ["OPD 为什么会不稳定？", "Why does OPD become unstable?"],
      [["分布错位", "可信区域", "离群处理"], ["distribution mismatch", "trust region", "outlier handling"]],
      ["适合做 OPD 方法卡，重点是稳定训练，而不是单纯提分。", "A method card for stable OPD, not just score gains."],
      [["方法新颖度", "High"], ["工程风险", "Medium"], [84, 63]]
    )
  },
  {
    id: "oprd-representation-distillation",
    clusterId: "llm-post-training",
    type: "paper",
    title: {
      zh: "OPRD：把 On-Policy Distillation 提升到表示空间",
      en: "OPRD: On-Policy Representation Distillation"
    },
    summary: {
      zh: "OPRD 不只匹配输出 token 概率，而是对齐教师和学生在相同 rollouts 上的中间隐藏表示。",
      en: "OPRD aligns teacher and student hidden states on the same rollouts instead of only matching output probabilities."
    },
    analysis: {
      zh: "它是 OPD 的结构升级：把黑盒教师输出变成可学习的中间表示监督，降低采样方差。",
      en: "It upgrades OPD structurally by turning black-box teacher outputs into intermediate representation supervision."
    },
    sourceName: "arXiv",
    url: "https://arxiv.org/abs/2606.06021",
    publishedAt: "2026-06-04T11:13:01Z",
    readingMinutes: 8,
    tags: {
      zh: ["OPD", "表示蒸馏", "效率"],
      en: ["OPD", "representation distillation", "efficiency"]
    },
    domain: "arxiv.org",
    visual: visual(
      ["OPD 能否利用教师的中间表征？", "Can OPD use teacher intermediate representations?"],
      [["同轨 rollout", "层间对齐", "降低方差"], ["same rollouts", "layer alignment", "variance reduction"]],
      ["它让 OPD 从输出监督走向表示监督。", "It moves OPD from output supervision toward representation supervision."],
      [["效率信号", "High"], ["方法复杂度", "Medium"], [82, 67]]
    )
  },
  {
    id: "rl-contextual-translation",
    clusterId: "llm-post-training",
    type: "paper",
    title: {
      zh: "RL 让模型学会利用上下文翻译未见语言",
      en: "RL Elicits Contextual Learning for Unseen Translation"
    },
    summary: {
      zh: "论文用 chrF 作为轻量奖励信号，训练模型从上下文语言资料中归纳未见语言的翻译规则。",
      en: "The paper uses chrF as a lightweight reward to train models to infer translation rules for unseen languages from context."
    },
    analysis: {
      zh: "这张卡说明 RL 后训练不只适合数学和代码，也能变成让模型掌握新语境技能的工具。",
      en: "This shows RL post-training can elicit contextual skills beyond math and code."
    },
    sourceName: "arXiv",
    url: "https://arxiv.org/abs/2606.06428",
    publishedAt: "2026-06-04T17:32:06Z",
    readingMinutes: 8,
    tags: {
      zh: ["强化学习", "上下文学习", "翻译"],
      en: ["RL", "contextual learning", "translation"]
    },
    domain: "arxiv.org",
    visual: visual(
      ["RL 能否诱导新语境技能？", "Can RL elicit new contextual skills?"],
      [["上下文语法", "chrF 奖励", "零样本迁移"], ["context grammar", "chrF reward", "zero-shot transfer"]],
      ["它补齐后训练频道里的 RL 泛化能力分支。", "It adds the RL generalization branch to the post-training channel."],
      [["入门价值", "High"], ["前沿程度", "Medium"], [80, 64]]
    )
  },
  {
    id: "hf-code2lora",
    clusterId: "llm-post-training",
    type: "paper",
    title: {
      zh: "Code2LoRA：代码模型演化下的适配器生成",
      en: "Code2LoRA: Adapter Generation for Evolving Code Models"
    },
    summary: {
      zh: "Hugging Face Daily Papers 6 月 5 日收录的论文，关注代码语言模型随软件演化进行 LoRA 适配。",
      en: "A June 5 Hugging Face Daily Papers item on LoRA adaptation for code models under software evolution."
    },
    analysis: {
      zh: "它不是 RL 主线，但属于后训练的适配器方向：模型如何在新代码分布上低成本跟进。",
      en: "It is not the RL branch, but it belongs to post-training as low-cost adapter adaptation."
    },
    sourceName: "Hugging Face Daily Papers",
    url: "https://huggingface.co/papers/date/2026-06-05",
    publishedAt: "2026-06-05T12:00:00Z",
    readingMinutes: 6,
    tags: {
      zh: ["LoRA", "代码模型", "适配器"],
      en: ["LoRA", "code models", "adapters"]
    },
    domain: "huggingface.co",
    visual: visual(
      ["代码模型如何跟上软件变化？", "How do code models keep up with software change?"],
      [["代码分布变化", "LoRA 生成", "演化适配"], ["code drift", "LoRA generation", "evolution adaptation"]],
      ["这张卡补齐后训练里的参数高效适配分支。", "This fills the parameter-efficient adaptation branch of post-training."],
      [["适配价值", "High"], ["方法复杂度", "Medium"], [78, 61]]
    )
  },
  {
    id: "openai-frontier-blueprint",
    clusterId: "ai-safety",
    type: "report",
    title: {
      zh: "OpenAI：Frontier AI 民主治理蓝图",
      en: "OpenAI: Democratic Governance Blueprint for Frontier AI"
    },
    summary: {
      zh: "OpenAI 发布美国 frontier AI 治理蓝图，提出联邦框架、CAISI 和更广泛的韧性计划。",
      en: "OpenAI released a frontier AI governance blueprint centered on a federal framework, CAISI, and resilience planning."
    },
    analysis: {
      zh: "这类内容属于 AI 安全的制度层：不是模型训练技巧，而是前沿能力如何被治理。",
      en: "This is the institutional layer of AI safety: governing frontier capability rather than training tricks."
    },
    sourceName: "OpenAI",
    url: "https://openai.com/index/frontier-safety-blueprint/",
    publishedAt: "2026-06-03T12:00:00Z",
    readingMinutes: 7,
    tags: {
      zh: ["治理", "Frontier AI", "CAISI"],
      en: ["governance", "frontier AI", "CAISI"]
    },
    domain: "openai.com",
    visual: visual(
      ["前沿模型安全谁来治理？", "Who governs frontier model safety?"],
      [["联邦框架", "CAISI", "韧性计划"], ["federal framework", "CAISI", "resilience plan"]],
      ["它把安全从技术评测延伸到制度和国家能力建设。", "It extends safety from technical evals to institutions and national capacity."],
      [["政策信号", "High"], ["技术细节", "Low"], [86, 35]]
    )
  },
  {
    id: "anthropic-cyber-threats",
    clusterId: "ai-safety",
    type: "blog",
    title: {
      zh: "一年 AI 网络威胁映射：攻击者正在把 AI 用到更深阶段",
      en: "A Year of AI-Enabled Cyber Threats"
    },
    summary: {
      zh: "Anthropic 分析 832 个被封禁账号，指出 AI 正进入横向移动、账号发现等复杂攻击环节。",
      en: "Anthropic maps 832 banned accounts and finds AI moving into more complex attack stages."
    },
    analysis: {
      zh: "这是安全类的攻防卡：AI 安全不只是拒答，还包括真实攻击链中的工具放大。",
      en: "This is the cyber card: AI safety includes tool amplification across real attack chains."
    },
    sourceName: "Anthropic",
    url: "https://www.anthropic.com/news/AI-enabled-cyber-threats-mitre-attack",
    publishedAt: "2026-06-03T16:00:00Z",
    readingMinutes: 7,
    tags: {
      zh: ["AI 安全", "网络攻防", "MITRE ATT&CK"],
      en: ["AI safety", "cyber", "MITRE ATT&CK"]
    },
    domain: "anthropic.com",
    visual: visual(
      ["AI 正在放大哪些攻击阶段？", "Which attack stages does AI amplify?"],
      [["账号发现", "横向移动", "攻击链映射"], ["account discovery", "lateral movement", "attack mapping"]],
      ["适合用作“安全风险已进入操作层”的证据卡。", "Use it as evidence that safety risk is operational."],
      [["风险现实性", "High"], ["处置紧迫度", "High"], [89, 84]]
    )
  },
  {
    id: "openai-biodefense",
    clusterId: "ai-safety",
    type: "report",
    title: {
      zh: "OpenAI：智能时代的生物防御行动计划",
      en: "OpenAI: Biodefense in the Intelligence Age"
    },
    summary: {
      zh: "OpenAI 提出 AI 驱动的生物韧性计划，强调用前沿模型帮助可信防御者更早发现和应对生物风险。",
      en: "OpenAI lays out an AI-powered biological resilience plan focused on helping trusted defenders detect and respond earlier."
    },
    analysis: {
      zh: "它属于 AI 安全的高风险能力治理：同一类生物能力既能支持科研，也会改变防御体系要求。",
      en: "It belongs in safety because biology-capable models change both research upside and defense requirements."
    },
    sourceName: "OpenAI",
    url: "https://openai.com/index/biodefense-in-the-intelligence-age/",
    publishedAt: "2026-06-04T12:00:00Z",
    readingMinutes: 7,
    tags: {
      zh: ["生物安全", "Frontier AI", "防御者优先"],
      en: ["biosecurity", "frontier AI", "defender-first"]
    },
    domain: "openai.com",
    visual: visual(
      ["生物能力提升后如何优先增强防御？", "How should biology capability strengthen defense first?"],
      [["可信开发者", "检测响应", "治理证据"], ["trusted developers", "detect and respond", "governance evidence"]],
      ["这张卡把 AI 安全从模型评测延伸到高风险科学能力治理。", "This card extends AI safety into high-risk scientific capability governance."],
      [["政策信号", "High"], ["安全深度", "High"], [87, 82]]
    )
  },
  {
    id: "llm-memorization-propensity",
    clusterId: "ai-safety",
    type: "paper",
    title: {
      zh: "LLM 会泄露训练数据，但它们“想”泄露吗？",
      en: "LLMs Can Leak Training Data, But Do They Want To?"
    },
    summary: {
      zh: "论文提出 propensity-aware 记忆评估，把最坏情况下可抽取能力和普通使用下泄露倾向区分开。",
      en: "The paper proposes propensity-aware memorization evaluation to separate worst-case extractability from ordinary leakage tendency."
    },
    analysis: {
      zh: "它适合 AI 安全频道：不是泛泛说模型会记忆，而是给安全审计一个更细的风险刻度。",
      en: "It fits safety because it turns memorization risk into a more precise audit scale."
    },
    sourceName: "arXiv",
    url: "https://arxiv.org/abs/2606.06286",
    publishedAt: "2026-06-04T15:25:24Z",
    readingMinutes: 8,
    tags: {
      zh: ["记忆泄漏", "训练数据", "安全评估"],
      en: ["memorization", "training data", "safety evals"]
    },
    domain: "arxiv.org",
    visual: visual(
      ["模型是能泄露，还是常态下会泄露？", "Can models leak, or do they tend to leak normally?"],
      [["能力攻击", "普通提示", "倾向评分"], ["capability attack", "ordinary prompts", "propensity score"]],
      ["这张卡帮助区分极端抽取能力和日常泄露倾向。", "This card separates extreme extraction capability from everyday leakage tendency."],
      [["风险现实性", "High"], ["评测价值", "High"], [84, 78]]
    )
  }
];

const heroCopy: Record<Locale, ShowcaseData["hero"]> = {
  zh: {
    eyebrow: "AI 研究日报",
    title: "三类 AI 前沿内容：Agent、后训练、安全",
    summary: "自动化 Agent 已把公开论文、博客和代码重组为三个固定频道：大模型 Agent、大模型后训练、AI 安全。每张卡片都用 AI 摘要转成可视化阅读界面。",
    updateLabel: "更新于 2026-06-06 19:35",
    searchPlaceholder: "搜索 Agent、SFT、强化学习、OPD、AI 安全、论文或代码"
  },
  en: {
    eyebrow: "AI Research Daily",
    title: "Three Frontiers: Agents, Post-Training, Safety",
    summary: "The agent reorganized public papers, blogs, and code into three fixed channels: LLM Agents, LLM Post-Training, and AI Safety. Each card is rendered as a visual AI summary.",
    updateLabel: "Updated Jun 6, 2026 19:35",
    searchPlaceholder: "Search agents, SFT, RL, OPD, AI safety, papers, or code"
  }
};

const statCopy: Record<Locale, Array<{ label: string; value: string }>> = {
  zh: [
    { label: "固定分类", value: "3" },
    { label: "可视化卡片", value: "14" },
    { label: "重点方法", value: "Agent / SFT / RL / OPD / Safety" }
  ],
  en: [
    { label: "Fixed channels", value: "3" },
    { label: "Visual cards", value: "14" },
    { label: "Focus methods", value: "Agents / SFT / RL / OPD / Safety" }
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

  const localizedClusters = clusters.map((cluster) => {
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
  });

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
  const visual = {
    question: document.visual.question[locale],
    approach: document.visual.approach[locale],
    takeaway: document.visual.takeaway[locale],
    metrics: document.visual.metrics.map((metric) => ({
      label: metric.label[locale],
      value: metric.value,
      score: metric.score
    }))
  };
  const searchText = [
    document.title.zh,
    document.title.en,
    document.summary.zh,
    document.summary.en,
    document.analysis.zh,
    document.analysis.en,
    visual.question,
    visual.takeaway,
    ...visual.approach,
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
    analysisHtmlPath: articleHtmlPath(document),
    searchText,
    visual
  };
}

function articleHtmlPath(document: ShowcaseDocument): string {
  const [year, month, day] = document.publishedAt.slice(0, 10).split("-");
  return `articles/${year}/${month}/${day}/${document.id}/index.html`;
}

function visual(
  question: [string, string],
  approach: [string[], string[]],
  takeaway: [string, string],
  metricValues: [[string, string], [string, string], [number, number]]
): DocumentVisual {
  const enMetricLabels: Record<string, string> = {
    "产品可用性": "Product usability",
    "工程完整度": "Engineering coverage",
    "组织影响": "Org impact",
    "可产品化": "Productization",
    "任务跨度": "Task span",
    "体验相关": "UX relevance",
    "用户入口": "User entry",
    "工程复用": "Engineering reuse",
    "社区信号": "Community signal",
    "前沿程度": "Frontier signal",
    "评测价值": "Evaluation value",
    "理论统摄": "Theory coverage",
    "实证粒度": "Empirical scale",
    "方法新颖度": "Method novelty",
    "工程风险": "Engineering risk",
    "效率信号": "Efficiency signal",
    "成本下降": "Cost reduction",
    "入门价值": "Primer value",
    "适配价值": "Adaptation value",
    "方法复杂度": "Method complexity",
    "政策信号": "Policy signal",
    "技术细节": "Technical depth",
    "风险现实性": "Risk realism",
    "处置紧迫度": "Response urgency",
    "产品相关": "Product relevance",
    "安全深度": "Safety depth",
    "框架完整度": "Framework coverage",
    "落地细节": "Implementation detail"
  };

  return {
    question: { zh: question[0], en: question[1] },
    approach: { zh: approach[0], en: approach[1] },
    takeaway: { zh: takeaway[0], en: takeaway[1] },
    metrics: [
      {
        label: { zh: metricValues[0][0], en: enMetricLabels[metricValues[0][0]] ?? metricValues[0][0] },
        value: metricValues[0][1],
        score: metricValues[2][0]
      },
      {
        label: { zh: metricValues[1][0], en: enMetricLabels[metricValues[1][0]] ?? metricValues[1][0] },
        value: metricValues[1][1],
        score: metricValues[2][1]
      }
    ]
  };
}
