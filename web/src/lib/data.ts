import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mockDashboardData } from "./mockData";

export type ViewId = "feed" | "sources" | "runs" | "reports";

export interface Metric {
  label: string;
  value: string;
  trend: string;
  status: "good" | "warn" | "risk" | "neutral";
}

export interface Signal {
  id: string;
  title: string;
  source: string;
  sourceType: string;
  category: string;
  summary: string;
  impact: string;
  confidence: number;
  score: number;
  publishedAt: string;
  labels: string[];
  runId: string;
  reportId: string;
  url?: string;
}

export interface SourceRecord {
  id: string;
  name: string;
  type: string;
  status: "healthy" | "delayed" | "paused";
  lastSeen: string;
  coverage: string;
  latency: string;
  signals: number;
  notes: string;
}

export interface RunRecord {
  id: string;
  agent: string;
  startedAt: string;
  duration: string;
  status: "complete" | "warning" | "failed";
  signalsValidated: number;
  errors: number;
}

export interface ReportRecord {
  id: string;
  title: string;
  date: string;
  owner: string;
  status: "draft" | "ready" | "published";
  summary: string;
  sections: string[];
  sources: number;
  signals: number;
}

export interface DashboardData {
  generatedAt: string;
  windowLabel: string;
  dataMode: "fixture" | "mock";
  dataPath: string;
  metrics: Metric[];
  signals: Signal[];
  sources: SourceRecord[];
  runs: RunRecord[];
  reports: ReportRecord[];
}

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(webRoot, "..");
const defaultPublicDataDir = path.resolve(repoRoot, "fixtures/public-data/public");

export async function loadDashboardData(): Promise<DashboardData> {
  const publicDataDir = process.env.PUBLIC_DATA_DIR
    ? path.resolve(process.env.PUBLIC_DATA_DIR)
    : defaultPublicDataDir;

  const fixtureData = await readFixtureSnapshot(publicDataDir);
  if (fixtureData) {
    return fixtureData;
  }

  return {
    ...mockDashboardData,
    dataPath: publicDataDir
  };
}

async function readFixtureSnapshot(publicDataDir: string): Promise<DashboardData | null> {
  const latestPath = path.join(publicDataDir, "index/latest.json");
  if (!(await exists(latestPath))) {
    return null;
  }

  try {
    const latest = await readJson(latestPath);
    const manifestRef = extractManifestRef(latest);
    if (!manifestRef) {
      throw new Error("latest.json does not point to a manifest.");
    }

    const manifest = await readJson(path.resolve(publicDataDir, manifestRef));
    return await normalizePublicSnapshot(manifest, publicDataDir);
  } catch (error) {
    console.warn(`Falling back to mock data because fixture loading failed: ${String(error)}`);
    return null;
  }
}

function extractManifestRef(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const direct =
    value.manifest_path ??
    value.manifestPath ??
    value.manifest ??
    value.path ??
    value.latest ??
    value.current;

  if (typeof direct === "string") {
    return direct;
  }

  if (isRecord(direct) && typeof direct.path === "string") {
    return direct.path;
  }

  return null;
}

async function normalizePublicSnapshot(raw: unknown, publicDataDir: string): Promise<DashboardData> {
  if (!isRecord(raw)) {
    throw new Error("Manifest root must be an object.");
  }

  const generatedAt = asString(raw.generated_at ?? raw.generatedAt ?? raw.createdAt) ?? new Date().toISOString();
  const runId = asString(raw.run_id ?? raw.runId) ?? "fixture-run";
  const files = Array.isArray(raw.files) ? raw.files.map(asRecord) : [];
  const reportPath = findManifestPath(files, "hourly_report") ?? findManifestPath(files, "daily_report");
  const dailyPath = findManifestPath(files, "daily_report");
  const itemsPath = findManifestPath(files, "items");
  const sourcesPath = findManifestPath(files, "sources") ?? "index/sources.json";

  const [hourlyReport, dailyReport, itemRecords, sourcesIndex] = await Promise.all([
    reportPath ? readJson(path.join(publicDataDir, reportPath)) : Promise.resolve(null),
    dailyPath ? readJson(path.join(publicDataDir, dailyPath)) : Promise.resolve(null),
    itemsPath ? readJsonl(path.join(publicDataDir, itemsPath)) : Promise.resolve([]),
    readJson(path.join(publicDataDir, sourcesPath)).catch(() => null)
  ]);

  const reportRecord = asRecord(hourlyReport);
  const dailyRecord = asRecord(dailyReport);
  const items = itemRecords.map(asRecord);
  const sources = normalizePublicSources(sourcesIndex, items);
  const signals = normalizePublicItems(items, reportRecord, runId);
  const reports = normalizePublicReports(reportRecord, dailyRecord, signals);
  const runWarnings = Array.isArray(reportRecord.open_questions) ? reportRecord.open_questions.length : 0;

  return {
    generatedAt,
    windowLabel: asString(reportRecord.summary) ?? "Public fixture snapshot",
    dataMode: "fixture",
    dataPath: publicDataDir,
    metrics: [
      {
        label: "Sources scanned",
        value: String(sources.length),
        trend: `${signals.length} public signals`,
        status: "good"
      },
      {
        label: "High confidence",
        value: String(signals.filter((signal) => signal.confidence >= 80).length),
        trend: "confidence >= 80",
        status: "good"
      },
      {
        label: "Needs review",
        value: String(Math.max(runWarnings, signals.filter((signal) => signal.score < 80).length)),
        trend: "open questions + lower score",
        status: runWarnings > 0 ? "warn" : "neutral"
      },
      {
        label: "Reports ready",
        value: String(reports.length),
        trend: "hourly + daily",
        status: "neutral"
      }
    ],
    signals,
    sources,
    runs: [
      {
        id: runId,
        agent: asString(reportRecord.generated_by) ?? "codex-hourly-reconcile",
        startedAt: generatedAt,
        duration: "fixture",
        status: runWarnings > 0 ? "warning" : "complete",
        signalsValidated: signals.length,
        errors: 0
      }
    ],
    reports
  };
}

function findManifestPath(files: Record<string, unknown>[], role: string): string | null {
  const file = files.find((entry) => entry.role === role);
  return asString(file?.path);
}

function normalizePublicItems(
  items: Record<string, unknown>[],
  report: Record<string, unknown>,
  runId: string
): Signal[] {
  const topItems = Array.isArray(report.top_items) ? report.top_items.map(asRecord) : [];
  const topById = new Map(topItems.map((item) => [asString(item.item_id), item]));

  return items.map((item, index) => {
    const itemId = asString(item.item_id) ?? `item-${index + 1}`;
    const top = topById.get(itemId) ?? {};
    const tags = asStringArray(item.tags);
    const score = asNumber(item.importance_score, asNumber(top.score, 70));

    return {
      id: itemId,
      title: asString(item.title) ?? "Untitled research signal",
      source: asString(item.source_id) ?? "unknown-source",
      sourceType: asString(item.type) ?? "public",
      category: tags[0] ?? "General",
      summary: asString(top.reason) ?? asString(item.summary) ?? "No summary supplied.",
      impact: asString(top.reason) ?? "Needs triage and human review.",
      confidence: Math.round(score),
      score: Math.round(score),
      publishedAt: asString(item.published_at) ?? asString(item.fetched_at) ?? new Date().toISOString(),
      labels: tags,
      runId,
      reportId: asString(report.report_id) ?? "fixture-report",
      url: asString(item.url) ?? undefined
    };
  });
}

function normalizePublicSources(value: unknown, items: Record<string, unknown>[]): SourceRecord[] {
  const sourceIndex = isRecord(value) && Array.isArray(value.sources) ? value.sources.map(asRecord) : [];
  const signalCounts = new Map<string, number>();
  for (const item of items) {
    const sourceId = asString(item.source_id) ?? "unknown-source";
    signalCounts.set(sourceId, (signalCounts.get(sourceId) ?? 0) + 1);
  }

  return sourceIndex.map((source, index) => {
    const id = asString(source.source_id ?? source.id) ?? `source-${index + 1}`;
    return {
      id,
      name: asString(source.name) ?? id,
      type: asString(source.type) ?? "public",
      status: asSourceStatus(source.status),
      lastSeen: asString(source.last_seen ?? source.updated_at) ?? new Date().toISOString(),
      coverage: asString(source.coverage) ?? asString(source.poll_interval) ?? "hourly",
      latency: asString(source.latency) ?? "fixture",
      signals: signalCounts.get(id) ?? 0,
      notes: asString(source.notes) ?? asString(source.url) ?? "Public source"
    };
  });
}

function normalizePublicReports(
  hourly: Record<string, unknown>,
  daily: Record<string, unknown>,
  signals: Signal[]
): ReportRecord[] {
  const reports = [hourly, daily]
    .filter((record) => Object.keys(record).length > 0)
    .map((record, index) => {
      const trends = Array.isArray(record.trends) ? record.trends.map(asRecord) : [];
      return {
        id: asString(record.report_id) ?? `report-${index + 1}`,
        title:
          asString(record.title) ??
          (index === 0 ? "Hourly Agent Research Briefing" : "Daily Agent Research Briefing"),
        date: asString(record.period) ?? asString(record.generated_at) ?? new Date().toISOString(),
        owner: asString(record.generated_by) ?? "research desk",
        status: index === 0 ? ("ready" as const) : ("published" as const),
        summary: asString(record.summary) ?? "Report summary pending.",
        sections: trends
          .map((trend) => asString(trend.topic))
          .filter((topic): topic is string => topic !== null),
        sources: new Set(signals.map((signal) => signal.source)).size,
        signals: signals.length
      };
    });

  return reports.length > 0 ? reports : mockDashboardData.reports;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonl(filePath: string): Promise<unknown[]> {
  const text = await readFile(filePath, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asSourceStatus(value: unknown): SourceRecord["status"] {
  return value === "healthy" || value === "delayed" || value === "paused" ? value : "healthy";
}
