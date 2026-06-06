# Runbook

## Local Verification

```bash
uv run pytest
uv run pyright
npm --prefix web install
npm --prefix web run build
npm --prefix web run test:e2e
swift build --package-path mac
swift run --package-path mac DailyReportSmoke
```

## Data Generation

```bash
uv run daily-report validate-fixtures
uv run daily-report generate-sample --output fixtures/public-data
uv run daily-report validate-public fixtures/public-data/public
```

## Deployment

GitHub Pages is deployed by `.github/workflows/pages.yml`. It checks out `main`,
optionally checks out `data`, validates public manifests, builds the Astro site,
uploads the Pages artifact, and deploys with the official Pages action.

The scheduled reconcile workflow runs hourly around minute 17 to avoid peak
cron contention. It rebuilds Pages from the newest available public manifest.

