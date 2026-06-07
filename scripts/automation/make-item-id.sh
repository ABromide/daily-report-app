#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"

cd "${repo_root}"

case ":${PYTHONPATH:-}:" in
  *":${repo_root}:"*) ;;
  *) export PYTHONPATH="${repo_root}${PYTHONPATH:+:${PYTHONPATH}}" ;;
esac

exec uv run --project "${repo_root}" daily-report make-item-id "$@"
