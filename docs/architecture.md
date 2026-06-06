# Architecture

## Overview

Daily Report App is split into three layers:

1. **Producer**: Codex automation collects public research signals, normalizes them, validates the contract, and writes append-only files to the `data` branch.
2. **Public data contract**: JSON Schema plus public manifests provide one shared format for all readers.
3. **Consumers**: Astro renders the public web UI; SwiftUI imports the same files into a local cache for the macOS app.

## Branches

- `main`: source code, schemas, fixtures, workflows, and documentation.
- `data`: public generated data only.
- `agent/schema-data`: schema, collector, fixtures, and validation work.
- `agent/web-ui`: Astro web application work.
- `agent/mac-swift`: SwiftUI application work.
- `agent/ci-deploy`: GitHub Actions and deployment work.

## Automation and Deployment

CI is split by surface so failures identify the owning layer quickly:

- Python validates schema fixtures, runs pytest, and runs pyright.
- Web uses npm for dependency install, build, and e2e checks.
- Swift builds the macOS package and runs `DailyReportSmoke`.

Pages deployment is centralized in `.github/workflows/pages.yml`. The workflow
always checks out `main`, tries to check out `data` into `_data_branch`, and
uses `fixtures/public-data/public` as the fallback public dataset until the data
branch exists. It then validates the selected public data, builds the Astro site,
uploads the artifact, and deploys through the official Pages actions.

The hourly reconcile workflow runs at minute 17 and calls the same Pages workflow
as a reusable workflow. Data-producing automation can also trigger the same path
with a `repository_dispatch` event of type `data-updated`.

## Data Flow

```mermaid
flowchart LR
  Sources["Public sources"] --> Codex["Codex hourly automation"]
  Codex --> LocalArchive["Private local run archive"]
  Codex --> Validator["Schema + manifest validation"]
  Validator --> DataBranch["GitHub data branch"]
  DataBranch --> Pages["GitHub Actions Pages build"]
  Codex --> Dispatch["repository_dispatch data-updated"]
  Dispatch --> Pages
  DataBranch --> MacSync["Swift local importer"]
  Pages --> Web["Astro web app"]
  MacSync --> Mac["SwiftUI macOS app"]
```

## Public Data Rules

- Public data must not include secrets, cookies, private raw API responses, or personal-only notes.
- Generated files are append-only where practical.
- Corrections use tombstones instead of silently rewriting historical facts.
- `latest.json` points to a manifest, and every manifest path must include a sha256 checksum.
