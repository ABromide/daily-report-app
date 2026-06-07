import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Locale } from "./i18n";

export type ContentType = "paper" | "blog" | "code" | "report";

type ClusterId = "llm-agent" | "llm-post-training" | "ai-safety";

interface LocalizedMetric {
  label: string;
  value: string;
  score: number;
}

interface ClusterCopy {
  title: Record<Locale, string>;
  thesis: Record<Locale, string>;
  summary: Record<Locale, string>;
  tags: Record<Locale, string[]>;
}

export interface LocalizedDocument {
  id: string;
  clusterId: ClusterId;
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
  analysisMarkdownPath: string;
  analysisMarkdown: string | null;
  searchText: string;
  visual: {
    question: string;
    approach: string[];
    takeaway: string;
    metrics: LocalizedMetric[];
  };
}

export interface LocalizedCluster {
  id: ClusterId;
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

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(webRoot, "..");
const fallbackPublicDataDir = path.resolve(repoRoot, "fixtures/public-data/public");
const repoUrl = "https://github.com/ABromide/daily-report-app";
const clusterOrder: ClusterId[] = ["llm-agent", "llm-post-training", "ai-safety"];

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

const clusterCopy: Record<ClusterId, ClusterCopy> = {
  "llm-agent": {
    title: {
      zh: "大模型 Agent 相关",
      en: "LLM Agents"
    },
    thesis: {
      zh: "关注大模型从回答问题走向调用工具、执行任务、进入真实开发流的能力变化。",
      en: "Tracks the shift from answering questions toward tool use, task execution, and real development workflows."
    },
    summary: {
      zh: "这一组聚焦 Agent 平台、长期任务、代码工作流和本地 AI 界面。",
      en: "This group focuses on agent platforms, long-running tasks, coding workflows, and local AI interfaces."
    },
    tags: {
      zh: ["Agent 平台", "工具调用", "代码工作流"],
      en: ["agent platforms", "tool use", "coding workflows"]
    }
  },
  "llm-post-training": {
    title: {
      zh: "大模型后训练相关",
      en: "LLM Post-Training"
    },
    thesis: {
      zh: "覆盖 SFT、强化学习、OPD、适配器和蒸馏等前沿工作，重点看训练状态、奖励信号和推理能力如何被重塑。",
      en: "Covers SFT, reinforcement learning, OPD, adapters, and distillation work that reshapes reasoning behavior."
    },
    summary: {
      zh: "这一组把后训练当作独立频道，而不是泛泛的“模型研究”。",
      en: "This group treats post-training as a first-class channel instead of a generic model research bucket."
    },
    tags: {
      zh: ["SFT", "强化学习", "OPD"],
      en: ["SFT", "RL", "OPD"]
    }
  },
  "ai-safety": {
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
    }
  }
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

interface PublicSnapshot {
  generatedAt: string;
  items: Record<string, unknown>[];
  sourcesById: Map<string, Record<string, unknown>>;
  publicDataDir: string;
}

export function getShowcaseData(locale: Locale): ShowcaseData {
  const snapshot = loadPublicSnapshot();
  const localizedDocuments = snapshot.items
    .map((item, index) => localizePublicItem(item, snapshot, locale, index))
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

  const localizedClusters = clusterOrder.map((clusterId) => {
    const copy = clusterCopy[clusterId];
    const clusterDocuments = localizedDocuments.filter((document) => document.clusterId === clusterId);
    return {
      id: clusterId,
      title: copy.title[locale],
      thesis: copy.thesis[locale],
      summary: copy.summary[locale],
      tags: copy.tags[locale],
      documents: clusterDocuments,
      lastUpdatedAt: clusterDocuments[0]?.publishedAt ?? snapshot.generatedAt
    };
  });

  return {
    generatedAt: snapshot.generatedAt,
    repoUrl,
    hero: buildHeroCopy(locale, snapshot.generatedAt),
    stats: buildStats(locale, localizedDocuments),
    filters: filterCopy[locale],
    clusters: localizedClusters,
    documents: localizedDocuments
  };
}

function loadPublicSnapshot(): PublicSnapshot {
  const publicDataDir = resolvePublicDataDir();
  const latestPath = path.join(publicDataDir, "index/latest.json");

  if (!existsSync(latestPath)) {
    return {
      generatedAt: new Date().toISOString(),
      items: [],
      sourcesById: new Map(),
      publicDataDir
    };
  }

  const latest = readJson(latestPath);
  const manifestPath = asString(latest.manifest_path);
  if (!manifestPath) {
    throw new Error(`Missing manifest_path in ${latestPath}`);
  }

  const manifest = readJson(readPublicPath(publicDataDir, manifestPath));
  const files = Array.isArray(manifest.files) ? manifest.files.map(asRecord) : [];
  const itemPaths = findManifestPaths(files, (filePath) => filePath.startsWith("items/") && filePath.endsWith(".jsonl"));
  const sourcesPath = findManifestPath(files, (filePath) => filePath === "index/sources.json") ?? "index/sources.json";

  const items = itemPaths.flatMap((itemsPath) => readJsonl(readPublicPath(publicDataDir, itemsPath)).map(asRecord));
  const sourcesIndex = existsPublicPath(publicDataDir, sourcesPath) ? readJson(readPublicPath(publicDataDir, sourcesPath)) : {};
  const sources = isRecord(sourcesIndex) && Array.isArray(sourcesIndex.sources)
    ? sourcesIndex.sources.map(asRecord)
    : [];
  const sourcesById = new Map(
    sources
      .map((source) => [asString(source.id ?? source.source_id), source] as const)
      .filter((entry): entry is readonly [string, Record<string, unknown>] => entry[0] !== null)
  );

  return {
    generatedAt: asString(manifest.generated_at) ?? asString(latest.generated_at) ?? new Date().toISOString(),
    items,
    sourcesById,
    publicDataDir
  };
}

function resolvePublicDataDir(): string {
  if (process.env.PUBLIC_DATA_DIR) {
    return path.resolve(process.env.PUBLIC_DATA_DIR);
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "fixtures/public-data/public"),
    path.resolve(cwd, "../fixtures/public-data/public"),
    fallbackPublicDataDir
  ];

  return candidates.find((candidate) => existsSync(path.join(candidate, "index/latest.json"))) ?? candidates[0];
}

function localizePublicItem(
  item: Record<string, unknown>,
  snapshot: PublicSnapshot,
  locale: Locale,
  index: number
): LocalizedDocument {
  const id = asString(item.item_id ?? item.id) ?? `item-${index + 1}`;
  const clusterId = asClusterId(item.category_id);
  const type = asContentType(item.type);
  const source = snapshot.sourcesById.get(asString(item.source_id) ?? "");
  const title = asString(item.title) ?? "Untitled research signal";
  const summary = asString(item.summary_zh ?? item.summary) ?? "这篇内容还没有摘要。";
  const sourceName = asString(item.source_name ?? source?.name) ?? asString(item.source_id) ?? "Unknown source";
  const url = asString(item.url ?? item.canonical_url) ?? repoUrl;
  const domain = hostname(url);
  const tags = asStringArray(item.tags);
  const publishedAt = asString(item.published_at ?? item.sort_at ?? item.fetched_at) ?? snapshot.generatedAt;
  const readingMinutes = asNumber(item.reading_minutes, Math.max(4, Math.ceil(summary.length / 140)));
  const analysisMarkdownPath = asString(item.analysis_markdown_path) ?? articleMarkdownPath(publishedAt, id);
  const analysisMarkdown = readPublicText(snapshot.publicDataDir, analysisMarkdownPath);
  const clusterTitle = clusterCopy[clusterId].title[locale];
  const localizedTitle = title;
  const localizedSummary = summary;
  const analysis = asString(item.analysis ?? item.analysis_zh) ?? "";

  const searchText = [
    localizedTitle,
    localizedSummary,
    ...(analysis ? [analysis] : []),
    sourceName,
    domain,
    clusterTitle,
    type,
    ...tags
  ]
    .join(" ")
    .toLowerCase();

  return {
    id,
    clusterId,
    type,
    typeLabel: typeLabels[locale][type],
    title: localizedTitle,
    summary: localizedSummary,
    analysis,
    sourceName,
    url,
    publishedAt,
    readingMinutes,
    tags,
    domain,
    faviconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    analysisMarkdownPath,
    analysisMarkdown,
    searchText,
    visual: buildFallbackVisual(locale, clusterId, tags)
  };
}

function buildHeroCopy(locale: Locale, generatedAt: string): ShowcaseData["hero"] {
  const updateLabel =
    locale === "zh"
      ? formatShortDate(generatedAt, "zh")
      : formatShortDate(generatedAt, "en");

  return locale === "zh"
    ? {
        eyebrow: "AI 研究日报",
        title: "AI 研究日报",
        summary: "固定分类与 Markdown 深度稿统计。",
        updateLabel,
        searchPlaceholder: "搜索 Agent、SFT、强化学习、OPD、AI 安全、论文或代码"
      }
    : {
        eyebrow: "AI Research Daily",
        title: "AI Research Daily",
        summary: "Fixed-channel and Markdown brief statistics.",
        updateLabel,
        searchPlaceholder: "Search agents, SFT, RL, OPD, AI safety, papers, or code"
      };
}

function buildStats(locale: Locale, documents: LocalizedDocument[]): ShowcaseData["stats"] {
  return locale === "zh"
    ? [
        { label: "固定分类", value: "3" },
        { label: "Markdown 深度稿", value: String(documents.length) }
      ]
    : [
        { label: "Fixed channels", value: "3" },
        { label: "Markdown briefs", value: String(documents.length) }
      ];
}

function buildFallbackVisual(locale: Locale, clusterId: ClusterId, tags: string[]): LocalizedDocument["visual"] {
  const question =
    locale === "zh"
      ? `这篇内容为什么属于${clusterCopy[clusterId].title.zh}？`
      : `Why does this belong in ${clusterCopy[clusterId].title.en}?`;

  return {
    question,
    approach: tags.slice(0, 3),
    takeaway:
      locale === "zh"
        ? "先看首页判断，再进入 Markdown 深读页检查证据链。"
        : "Use the card for triage, then open the Markdown page for the evidence chain.",
    metrics: [
      {
        label: locale === "zh" ? "内容相关度" : "Relevance",
        value: "High",
        score: 82
      },
      {
        label: locale === "zh" ? "可追踪性" : "Traceability",
        value: "Markdown",
        score: 88
      }
    ]
  };
}

function findManifestPath(files: Record<string, unknown>[], predicate: (filePath: string) => boolean): string | null {
  return findManifestPaths(files, predicate)[0] ?? null;
}

function findManifestPaths(files: Record<string, unknown>[], predicate: (filePath: string) => boolean): string[] {
  return files
    .map((entry) => asString(entry.path))
    .filter((filePath): filePath is string => filePath !== null && predicate(filePath));
}

function articleMarkdownPath(publishedAt: string, id: string): string {
  const [year, month, day] = publishedAt.slice(0, 10).split("-");
  return `articles/${year}/${month}/${day}/${id}/index.md`;
}

function readJson(filePath: string): Record<string, unknown> {
  return asRecord(JSON.parse(readFileSync(filePath, "utf8")));
}

function readJsonl(filePath: string): unknown[] {
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function readPublicText(root: string, relativePath: string): string | null {
  const target = readPublicPath(root, relativePath);
  return existsSync(target) ? readFileSync(target, "utf8") : null;
}

function existsPublicPath(root: string, relativePath: string): boolean {
  return existsSync(readPublicPath(root, relativePath));
}

function readPublicPath(root: string, relativePath: string): string {
  const rootPath = path.resolve(root);
  const target = path.resolve(rootPath, relativePath);
  if (target !== rootPath && !target.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`Unsafe public data path: ${relativePath}`);
  }
  return target;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "daily-report.local";
  }
}

function formatShortDate(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    timeZone: "Asia/Shanghai",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asClusterId(value: unknown): ClusterId {
  return value === "llm-agent" || value === "llm-post-training" || value === "ai-safety"
    ? value
    : "llm-agent";
}

function asContentType(value: unknown): ContentType {
  return value === "paper" || value === "blog" || value === "code" || value === "report" ? value : "blog";
}
