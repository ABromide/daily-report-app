# ADR 0001: Keep generated public data on a separate branch

## Decision

Use `main` for code and `data` for append-only generated public data.

## Rationale

Hourly automation creates frequent commits. Keeping generated data out of `main`
keeps source history reviewable, avoids unnecessary CI churn, and gives web and
macOS clients a stable public-data ref.

## Consequences

Pages workflows must check out both `main` and `data`. Local automation needs a
push/retry strategy for the `data` branch.

