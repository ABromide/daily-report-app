import type { DashboardData } from "./data";

export const mockDashboardData: DashboardData = {
  generatedAt: "2026-06-06T08:17:00.000Z",
  windowLabel: "Mock research window · last 24h",
  dataMode: "mock",
  dataPath: "",
  metrics: [
    { label: "Signals triaged", value: "128", trend: "+18 vs yesterday", status: "good" },
    { label: "High-confidence leads", value: "34", trend: "81% validated", status: "good" },
    { label: "Sources delayed", value: "2", trend: "GitHub + arXiv", status: "warn" },
    { label: "Draft reports", value: "7", trend: "3 ready for review", status: "neutral" }
  ],
  signals: [
    {
      id: "sig-runtime-sca",
      title: "Runtime-aware SCA keeps showing up as the practical security wedge",
      source: "GitHub Trending",
      sourceType: "repository",
      category: "Security",
      summary:
        "Several fast-rising projects combine static dependency scans with runtime proof, aiming to reduce noisy vulnerability backlogs.",
      impact:
        "Treat exploitability evidence as the differentiator: show which vulnerable packages are actually loaded, reachable, or exercised in production-like traces.",
      confidence: 88,
      score: 94,
      publishedAt: "2026-06-06T06:42:00.000Z",
      labels: ["runtime", "SCA", "developer tooling"],
      runId: "run-20260606-0817",
      reportId: "report-security-wedges",
      url: "https://github.com/trending"
    },
    {
      id: "sig-agent-replay",
      title: "Agent replay logs are becoming product telemetry, not just debug artifacts",
      source: "Codex Sessions",
      sourceType: "local archive",
      category: "AI Ops",
      summary:
        "Session JSONL streams now expose enough intent, tool, and token events to reconstruct durable work reports and quality signals.",
      impact:
        "A daily report UI should surface provenance, completion state, and verification evidence beside every generated summary.",
      confidence: 84,
      score: 90,
      publishedAt: "2026-06-06T05:20:00.000Z",
      labels: ["agents", "observability", "reports"],
      runId: "run-20260606-0617",
      reportId: "report-agent-telemetry"
    },
    {
      id: "sig-model-routing",
      title: "Smaller specialist models are reclaiming routine extraction workloads",
      source: "Hugging Face Papers",
      sourceType: "paper index",
      category: "Models",
      summary:
        "Recent model releases emphasize narrow extraction accuracy, lower latency, and predictable structured output over broad chat capability.",
      impact:
        "Daily automation can split source ingestion, evidence extraction, and synthesis into separate budgets instead of one large model pass.",
      confidence: 77,
      score: 83,
      publishedAt: "2026-06-05T23:58:00.000Z",
      labels: ["routing", "extraction", "cost control"],
      runId: "run-20260606-0017",
      reportId: "report-agent-telemetry"
    },
    {
      id: "sig-mobile-local-first",
      title: "Local-first readers want sync status in the primary chrome",
      source: "Product Notes",
      sourceType: "manual note",
      category: "UX",
      summary:
        "Desktop research tools feel trustworthy when data age, import status, and source health are always visible without opening settings.",
      impact:
        "Keep sync health and data source mode in the workstation header so mock, fixture, and data-branch states are explicit.",
      confidence: 79,
      score: 78,
      publishedAt: "2026-06-05T19:12:00.000Z",
      labels: ["local-first", "trust", "workstation"],
      runId: "run-20260605-2017",
      reportId: "report-ui-patterns"
    }
  ],
  sources: [
    {
      id: "src-github-trending",
      name: "GitHub Trending",
      type: "Repository surge",
      status: "healthy",
      lastSeen: "2026-06-06T06:42:00.000Z",
      coverage: "daily + weekly",
      latency: "11m",
      signals: 42,
      notes: "Tracks repo velocity and extracts product-space themes."
    },
    {
      id: "src-hf-papers",
      name: "Hugging Face Papers",
      type: "Research index",
      status: "delayed",
      lastSeen: "2026-06-05T23:58:00.000Z",
      coverage: "top semantic matches",
      latency: "3h 18m",
      signals: 18,
      notes: "Needs retry when paper metadata arrives after index refresh."
    },
    {
      id: "src-codex-sessions",
      name: "Codex Sessions",
      type: "Local run archive",
      status: "healthy",
      lastSeen: "2026-06-06T05:20:00.000Z",
      coverage: "final answers + token events",
      latency: "4m",
      signals: 37,
      notes: "Converts local completion evidence into durable report facts."
    },
    {
      id: "src-manual-notes",
      name: "Product Notes",
      type: "Curated notes",
      status: "paused",
      lastSeen: "2026-06-05T19:12:00.000Z",
      coverage: "selected observations",
      latency: "manual",
      signals: 8,
      notes: "Paused until schema-data branch exposes editor provenance."
    }
  ],
  runs: [
    {
      id: "run-20260606-0817",
      agent: "codex-hourly-reconcile",
      startedAt: "2026-06-06T08:17:00.000Z",
      duration: "9m 44s",
      status: "complete",
      signalsValidated: 51,
      errors: 0
    },
    {
      id: "run-20260606-0617",
      agent: "codex-hourly-reconcile",
      startedAt: "2026-06-06T06:17:00.000Z",
      duration: "12m 06s",
      status: "warning",
      signalsValidated: 44,
      errors: 1
    },
    {
      id: "run-20260606-0017",
      agent: "paper-extractor",
      startedAt: "2026-06-06T00:17:00.000Z",
      duration: "7m 31s",
      status: "complete",
      signalsValidated: 22,
      errors: 0
    }
  ],
  reports: [
    {
      id: "report-security-wedges",
      title: "Security product wedges worth prototyping",
      date: "2026-06-06",
      owner: "research desk",
      status: "ready",
      summary:
        "Runtime exploitability evidence is the clearest path from trending security repos to a useful developer product.",
      sections: ["Market signal", "Prototype wedge", "Evidence gaps"],
      sources: 6,
      signals: 19
    },
    {
      id: "report-agent-telemetry",
      title: "Agent telemetry as a daily reporting substrate",
      date: "2026-06-06",
      owner: "automation desk",
      status: "draft",
      summary:
        "Codex session streams can become a factual backbone for report generation if provenance and verification are first-class.",
      sections: ["Signals", "Run evidence", "UI implications"],
      sources: 4,
      signals: 14
    },
    {
      id: "report-ui-patterns",
      title: "Dense workstation patterns for local-first intelligence",
      date: "2026-06-05",
      owner: "product desk",
      status: "published",
      summary:
        "Trust improves when sync age, source health, and detail inspection live inside the main scanning flow.",
      sections: ["Navigation", "Inspector", "Mobile"],
      sources: 3,
      signals: 9
    }
  ]
};
