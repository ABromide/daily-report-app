# Runbook

## Local Verification

```bash
uv run pytest
uv run daily-report validate-fixtures
uv run daily-report validate-public fixtures/public-data/public
npm install
npm run pyright
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
uv run daily-report secret-scan fixtures/public-data/public
```

## Deployment

GitHub Pages is deployed by `.github/workflows/pages.yml`. It checks out `main`,
optionally checks out `data` into `_data_branch`, validates public manifests,
builds the Astro site, uploads the Pages artifact, and deploys with the official
Pages action. If the `data` branch does not exist yet, the workflow falls back to
`fixtures/public-data/public`.

The scheduled reconcile workflow runs hourly around minute 17 to avoid peak
cron contention. It calls the Pages workflow as a reusable workflow so the same
checkout, fallback, artifact upload, and deploy path is exercised for scheduled,
manual, and data-updated rebuilds.

## GitHub Actions

- `.github/workflows/ci.yml`: runs Python tests/schema validation/pyright, Web
  npm build/e2e, and Swift build/smoke checks with read-only repository
  permissions.
- `.github/workflows/pages.yml`: deploys GitHub Pages on `main` pushes,
  `repository_dispatch` events of type `data-updated`, manual
  `workflow_dispatch`, or reusable `workflow_call`.
- `.github/workflows/scheduled-reconcile.yml`: runs at `17 * * * *` and manually
  via `workflow_dispatch`; it delegates deployment to the Pages workflow.

## Codex Hourly Automation

The Codex hourly task should generate public data, validate it, publish the
public files to the `data` branch, then notify Pages with a dispatch event. The
collector command can be swapped in when the schema/data branch lands; the
pre-integration fixture command is:

```bash
cd /path/to/daily-report-app
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
uv run daily-report generate-sample --output fixtures/public-data
uv run daily-report validate-public fixtures/public-data/public

# After publishing fixtures/public-data/public to the data branch:
DATA_SHA="$(git -C /path/to/data-worktree rev-parse HEAD)"
scripts/automation/dispatch-data-updated.sh \
  --repo OWNER/REPO \
  --data-sha "$DATA_SHA" \
  --run-id "$RUN_ID" \
  --send
```

The dispatch helper defaults to a dry run unless `--send` is present. It expects
`GITHUB_TOKEN` to be set when sending.

The equivalent raw API call is:

```bash
curl -fsSL \
  -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/dispatches \
  -d '{"event_type":"data-updated","client_payload":{"data_sha":"DATA_SHA","run_id":"RUN_ID"}}'
```
