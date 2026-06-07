#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"

public_root="${DAILY_REPORT_PUBLIC_ROOT:-/Users/lizewei/Documents/projects/personal/daily-report-app-worktrees/data/public}"
data_worktree="${DAILY_REPORT_DATA_WORKTREE:-/Users/lizewei/Documents/projects/personal/daily-report-app-worktrees/data}"
repo="${DAILY_REPORT_GITHUB_REPO:-ABromide/daily-report-app}"

cd "${repo_root}"

case ":${PYTHONPATH:-}:" in
  *":${repo_root}:"*) ;;
  *) export PYTHONPATH="${repo_root}${PYTHONPATH:+:${PYTHONPATH}}" ;;
esac

exec uv run --project "${repo_root}" daily-report automation-preflight \
  --public-root "${public_root}" \
  --data-worktree "${data_worktree}" \
  --repo "${repo}" \
  "$@"
