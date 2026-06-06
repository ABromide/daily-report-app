import type {
  DashboardData,
  ReportRecord,
  RunRecord,
  Signal,
  SourceRecord,
  ViewId
} from "./data";

export type Locale = "zh" | "en";

export const defaultLocale: Locale = "zh";

export const localeMeta: Record<Locale, { htmlLang: string; label: string; shortLabel: string }> = {
  zh: { htmlLang: "zh-CN", label: "中文", shortLabel: "中" },
  en: { htmlLang: "en", label: "English", shortLabel: "EN" }
};

export const viewOrder: ViewId[] = ["feed", "sources", "runs", "reports"];

const viewPaths: Record<Locale, Record<ViewId, string>> = {
  zh: {
    feed: "/",
    sources: "/sources",
    runs: "/runs",
    reports: "/reports"
  },
  en: {
    feed: "/en",
    sources: "/en/sources",
    runs: "/en/runs",
    reports: "/en/reports"
  }
};

export const copy = {
  zh: {
    appName: "Daily Report App",
    appTitle: "日报情报操作台",
    layoutDescription: "一个本地优先、面向研究情报的密集型工作台。",
    eyebrow: "Agent 情报简报",
    workstationTitle: "情报工作台",
    fixtureData: "样例数据",
    fixtureManifest: "样例清单",
    mockFallback: "备用模拟数据",
    currentDataStatus: "当前数据状态",
    workspaceViews: "工作台视图",
    mobileViews: "移动端视图",
    dataSource: "数据来源",
    language: "语言",
    switchLanguage: "切换语言",
    views: {
      feed: "信息流",
      sources: "来源",
      runs: "运行",
      reports: "报告"
    },
    viewMeta: {
      feed: (count: number) => `${count} 条信号`,
      sources: (count: number) => `${count} 个连接器`,
      runs: (count: number) => `${count} 次近期运行`,
      reports: (count: number) => `${count} 个产物`
    },
    kpiEyebrow: "运行快照",
    kpiTitle: "关键指标",
    feedEyebrow: "实时分诊",
    feedTitle: "优先级信息流",
    itemCount: (count: number) => `${count} 条`,
    score: "评分",
    confidence: "置信度",
    selectedSignal: "已选信号",
    detailInspector: "详情检查器",
    priority: "优先级",
    source: "来源",
    type: "类型",
    published: "发布时间",
    run: "运行",
    report: "报告",
    evidenceNotes: "证据笔记",
    openSource: "打开来源",
    noSignalTitle: "未选择信号",
    noSignalDescription: "公开数据已经载入，但当前视图还没有可检查的信号。",
    connectors: "连接器",
    sourceRegistry: "来源登记表",
    status: "状态",
    coverage: "覆盖范围",
    latency: "延迟",
    signals: "信号",
    automation: "自动化",
    runLedger: "运行账本",
    started: "开始时间",
    duration: "耗时",
    validated: "已验证",
    errors: "错误",
    artifacts: "产物",
    reportArchive: "报告归档",
    sources: "来源",
    sourceStatus: {
      healthy: "健康",
      delayed: "延迟",
      paused: "暂停"
    },
    runStatus: {
      complete: "完成",
      warning: "警告",
      failed: "失败"
    },
    reportStatus: {
      draft: "草稿",
      ready: "待审",
      published: "已发布"
    }
  },
  en: {
    appName: "Daily Report App",
    appTitle: "Research Workstation",
    layoutDescription: "A dense local-first research workstation for Daily Report App.",
    eyebrow: "Agent Research Briefing",
    workstationTitle: "Research Workstation",
    fixtureData: "Fixture data",
    fixtureManifest: "Fixture manifest",
    mockFallback: "Mock fallback",
    currentDataStatus: "Current data status",
    workspaceViews: "Workspace views",
    mobileViews: "Mobile views",
    dataSource: "Data Source",
    language: "Language",
    switchLanguage: "Switch language",
    views: {
      feed: "Feed",
      sources: "Sources",
      runs: "Runs",
      reports: "Reports"
    },
    viewMeta: {
      feed: (count: number) => `${count} signals`,
      sources: (count: number) => `${count} connectors`,
      runs: (count: number) => `${count} recent`,
      reports: (count: number) => `${count} artifacts`
    },
    kpiEyebrow: "Operating Snapshot",
    kpiTitle: "KPI Strip",
    feedEyebrow: "Live Triage",
    feedTitle: "Priority Feed",
    itemCount: (count: number) => `${count} items`,
    score: "score",
    confidence: "confidence",
    selectedSignal: "Selected Signal",
    detailInspector: "Detail Inspector",
    priority: "Priority",
    source: "Source",
    type: "Type",
    published: "Published",
    run: "Run",
    report: "Report",
    evidenceNotes: "Evidence Notes",
    openSource: "Open source",
    noSignalTitle: "No signal selected",
    noSignalDescription: "Public data loaded, but this view has no signal to inspect yet.",
    connectors: "Connectors",
    sourceRegistry: "Source Registry",
    status: "Status",
    coverage: "Coverage",
    latency: "Latency",
    signals: "Signals",
    automation: "Automation",
    runLedger: "Run Ledger",
    started: "Started",
    duration: "Duration",
    validated: "Validated",
    errors: "Errors",
    artifacts: "Artifacts",
    reportArchive: "Report Archive",
    sources: "sources",
    sourceStatus: {
      healthy: "healthy",
      delayed: "delayed",
      paused: "paused"
    },
    runStatus: {
      complete: "complete",
      warning: "warning",
      failed: "failed"
    },
    reportStatus: {
      draft: "draft",
      ready: "ready",
      published: "published"
    }
  }
};

export type UiCopy = typeof copy.zh;

const signalZh: Record<string, Partial<Signal>> = {
  itm_3fcb6ef14e59761c: {
    title: "小语言模型获得更可靠的工具规划能力",
    category: "智能体",
    summary: "样例批次显示，小模型在工具调用和规划任务上开始呈现更稳定的可复现能力。",
    impact: "适合把采集、抽取和初步整理拆成低成本模型预算，再把综合判断交给更强模型。",
    labels: ["智能体", "小模型", "工具使用"]
  },
  itm_f4b29831fa65e61f: {
    title: "评测框架开始转向可复查的证据包",
    category: "评测",
    summary: "样例信号强调评测报告需要带上可重复检查的证据，而不只是最终分数。",
    impact: "日报界面应把摘要、证据来源和验证状态放在同一个检查面板里，方便人工复核。",
    labels: ["评测", "证据", "质量"]
  },
  itm_ab7b9d44942b5524: {
    title: "本地优先研究阅读器开始采用清单校验",
    category: "本地优先",
    summary: "离线客户端通过 manifest 和 sha256 校验公开数据，能降低同步后的信任成本。",
    impact: "Mac 端应优先读取缓存摘要，并明确展示同步时间、远端引用和失败状态。",
    labels: ["本地优先", "清单", "同步"]
  },
  "sig-runtime-sca": {
    title: "运行时感知 SCA 反复成为务实的安全产品切入口",
    category: "安全",
    summary: "多个上升项目把静态依赖扫描和运行时证据结合起来，试图减少漏洞队列里的噪音。",
    impact: "把可利用性证据作为差异化：展示哪些有漏洞的包真正被加载、可达或在类生产轨迹中被触发。",
    labels: ["运行时", "SCA", "开发者工具"]
  },
  "sig-agent-replay": {
    title: "Agent 回放日志正在从调试材料变成产品遥测",
    category: "AI 运维",
    summary: "Session JSONL 已经暴露出意图、工具和 token 事件，足够重建持久化工作报告和质量信号。",
    impact: "日报 UI 应在每条生成摘要旁边展示来源、完成状态和验证证据。",
    labels: ["智能体", "可观测性", "报告"]
  },
  "sig-model-routing": {
    title: "小型专用模型正在重新拿回常规抽取工作",
    category: "模型",
    summary: "近期模型发布更强调窄域抽取准确率、低延迟和可预测结构化输出，而不是泛聊天能力。",
    impact: "日常自动化可以把来源采集、证据抽取和综合写作拆成独立预算，而不是一次大模型通吃。",
    labels: ["路由", "抽取", "成本控制"]
  },
  "sig-mobile-local-first": {
    title: "本地优先阅读器需要把同步状态放进主界面",
    category: "体验",
    summary: "桌面研究工具只有在数据年龄、导入状态和来源健康度始终可见时，才更容易获得信任。",
    impact: "把同步健康度和数据模式放在工作台头部，让模拟、样例和 data 分支状态都清晰可见。",
    labels: ["本地优先", "信任", "工作台"]
  }
};

const sourceZh: Record<string, Partial<SourceRecord>> = {
  "sample-research-feed": {
    name: "确定性研究信号",
    type: "样例源",
    coverage: "样例批次",
    latency: "样例",
    notes: "用于 schema fixture 和采集器测试的本地确定性来源。"
  },
  "src-github-trending": {
    type: "仓库热度",
    coverage: "每日 + 每周",
    latency: "11 分钟",
    notes: "追踪仓库增速，并抽取产品方向主题。"
  },
  "src-hf-papers": {
    type: "研究索引",
    coverage: "高相关语义结果",
    latency: "3 小时 18 分",
    notes: "当论文元数据晚于索引刷新到达时需要重试。"
  },
  "src-codex-sessions": {
    type: "本地运行归档",
    coverage: "最终回答 + token 事件",
    latency: "4 分钟",
    notes: "把本地完成证据转成可持久化的报告事实。"
  },
  "src-manual-notes": {
    name: "产品笔记",
    type: "精选笔记",
    coverage: "人工选择观察",
    latency: "手动",
    notes: "暂停到 schema-data 分支暴露编辑来源后再恢复。"
  }
};

const reportZh: Record<string, Partial<ReportRecord>> = {
  "report-security-wedges": {
    title: "值得原型验证的安全产品切入口",
    owner: "研究台",
    summary: "运行时可利用性证据，是把热门安全仓库转化为有用开发者产品的清晰路径。",
    sections: ["市场信号", "原型切入口", "证据缺口"]
  },
  "report-agent-telemetry": {
    title: "把 Agent 遥测作为每日报告底座",
    owner: "自动化台",
    summary: "如果来源和验证成为一等公民，Codex session 流可以成为报告生成的事实骨架。",
    sections: ["信号", "运行证据", "界面含义"]
  },
  "report-ui-patterns": {
    title: "本地优先情报工具的密集工作台模式",
    owner: "产品台",
    summary: "同步年龄、来源健康度和详情检查器进入主扫描流程后，工具的可信度明显提升。",
    sections: ["导航", "检查器", "移动端"]
  }
};

const phraseZh = new Map<string, string>([
  ["Public fixture snapshot", "公开样例快照"],
  [
    "Three deterministic public research signals were collected for fixture validation.",
    "已为 fixture 校验收集 3 条确定性公开研究信号。"
  ],
  [
    "The deterministic daily report exercises item, source, report, and manifest validation without network access.",
    "确定性日报在无网络条件下覆盖 item、source、report 和 manifest 校验。"
  ],
  [
    "Tool planning, evidence-based evaluation, and manifest-backed sync all appear in the sample batch.",
    "样例批次同时覆盖工具规划、证据化评测和 manifest 支持的同步。"
  ],
  [
    "The sample day covers JSONL items, hourly summaries, daily summaries, and sha256 manifest entries.",
    "样例日覆盖 JSONL 条目、小时摘要、日报摘要和 sha256 manifest 记录。"
  ],
  ["Agent research signals", "Agent 研究信号"],
  ["Public data contract", "公开数据契约"],
  ["Hourly Agent Research Briefing", "小时级 Agent 研究简报"],
  ["Daily Agent Research Briefing", "每日 Agent 研究简报"],
  ["Report summary pending.", "报告摘要待生成。"],
  ["research desk", "研究台"],
  ["fixture", "样例批次"],
  ["confidence >= 80", "置信度 >= 80"],
  ["open questions + lower score", "开放问题 + 低分信号"],
  ["hourly + daily", "小时 + 每日"],
  ["fixture batch", "样例批次"],
  ["Public source", "公开来源"],
  ["No summary supplied.", "暂无摘要。"],
  ["Needs triage and human review.", "需要分诊和人工复核。"],
  ["General", "通用"],
  ["public", "公开"],
  ["sample", "样例"]
]);

const metricZh: Record<string, string> = {
  "Sources scanned": "扫描来源",
  "High confidence": "高置信度",
  "Needs review": "需要复核",
  "Reports ready": "可用报告",
  "Signals triaged": "已分诊信号",
  "High-confidence leads": "高置信线索",
  "Sources delayed": "延迟来源",
  "Draft reports": "草稿报告"
};

const trendZh: Record<string, string> = {
  "public signals": "条公开信号",
  "vs yesterday": "较昨日",
  "validated": "已验证",
  "GitHub + arXiv": "GitHub + arXiv",
  "ready for review": "待复核"
};

export function getCopy(locale: Locale): UiCopy {
  return copy[locale];
}

export function getViewPath(view: ViewId, locale: Locale): string {
  return viewPaths[locale][view];
}

export function getLocalePath(targetLocale: Locale, view: ViewId): string {
  return viewPaths[targetLocale][view];
}

export function localizeDashboardData(data: DashboardData, locale: Locale): DashboardData {
  if (locale === "en") {
    return data;
  }

  return {
    ...data,
    windowLabel: translatePhrase(data.windowLabel),
    dataPath: translatePhrase(data.dataPath),
    metrics: data.metrics.map((metric) => ({
      ...metric,
      label: metricZh[metric.label] ?? translatePhrase(metric.label),
      trend: translateTrend(metric.trend)
    })),
    signals: data.signals.map((signal) => ({
      ...signal,
      ...signalZh[signal.id],
      sourceType: translatePhrase(signal.sourceType)
    })),
    sources: data.sources.map((source) => ({
      ...source,
      ...sourceZh[source.id],
      type: translatePhrase(sourceZh[source.id]?.type ?? source.type),
      coverage: translatePhrase(sourceZh[source.id]?.coverage ?? source.coverage),
      latency: translatePhrase(sourceZh[source.id]?.latency ?? source.latency),
      notes: translatePhrase(sourceZh[source.id]?.notes ?? source.notes)
    })),
    runs: data.runs.map((run) => ({
      ...run,
      duration: translatePhrase(run.duration)
    })),
    reports: data.reports.map((report) => ({
      ...report,
      ...reportZh[report.id],
      title: translateReportTitle(report),
      owner: reportZh[report.id]?.owner ?? translatePhrase(report.owner),
      summary: reportZh[report.id]?.summary ?? translatePhrase(report.summary),
      sections: reportZh[report.id]?.sections ?? report.sections.map(translatePhrase)
    }))
  };
}

export function sourceStatusLabel(status: SourceRecord["status"], locale: Locale): string {
  return copy[locale].sourceStatus[status];
}

export function runStatusLabel(status: RunRecord["status"], locale: Locale): string {
  return copy[locale].runStatus[status];
}

export function reportStatusLabel(status: ReportRecord["status"], locale: Locale): string {
  return copy[locale].reportStatus[status];
}

function translateReportTitle(report: ReportRecord): string {
  const localizedTitle = reportZh[report.id]?.title;
  if (localizedTitle) {
    return localizedTitle;
  }

  if (report.id.startsWith("hourly:")) {
    return "小时级 Agent 研究简报";
  }

  if (report.id.startsWith("report-") || report.id.includes("daily")) {
    return translatePhrase(report.title);
  }

  return translatePhrase(report.title);
}

function translatePhrase(value: string): string {
  return phraseZh.get(value) ?? value;
}

function translateTrend(value: string): string {
  if (/^\d+ public signals$/.test(value)) {
    return value.replace("public signals", "条公开信号");
  }

  if (/^\+\d+ vs yesterday$/.test(value)) {
    return value.replace("vs yesterday", "较昨日");
  }

  if (/^\d+% validated$/.test(value)) {
    return value.replace("validated", "已验证");
  }

  if (/^\d+ ready for review$/.test(value)) {
    return value.replace("ready for review", "待复核");
  }

  return trendZh[value] ?? phraseZh.get(value) ?? value;
}
