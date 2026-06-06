#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  dispatch-data-updated.sh --repo OWNER/REPO --data-sha SHA [--run-id ID] [--send]

Options:
  --repo       GitHub repository in OWNER/REPO form.
  --data-sha   Commit SHA written to the data branch.
  --run-id     Optional automation run identifier.
  --send       Send the repository_dispatch request. Without this flag, print a dry run.

Environment:
  GITHUB_TOKEN must be set when --send is used.
USAGE
}

repo=""
data_sha=""
run_id=""
send="0"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      repo="${2:-}"
      shift 2
      ;;
    --data-sha)
      data_sha="${2:-}"
      shift 2
      ;;
    --run-id)
      run_id="${2:-}"
      shift 2
      ;;
    --send)
      send="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$repo" ] || [ -z "$data_sha" ]; then
  usage >&2
  exit 2
fi

payload="$(
  python3 - "$data_sha" "$run_id" <<'PY'
import json
import sys

data_sha, run_id = sys.argv[1], sys.argv[2]
client_payload = {"data_sha": data_sha}
if run_id:
    client_payload["run_id"] = run_id
print(json.dumps({"event_type": "data-updated", "client_payload": client_payload}))
PY
)"

api_url="https://api.github.com/repos/${repo}/dispatches"

if [ "$send" != "1" ]; then
  echo "DRY RUN: POST $api_url"
  echo "$payload"
  exit 0
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN is required when --send is used." >&2
  exit 2
fi

curl -fsSL \
  -X POST \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$api_url" \
  -d "$payload"
