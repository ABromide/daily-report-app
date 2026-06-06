from __future__ import annotations

from pathlib import Path

from collector.jsonio import JsonObject, write_json


def write_archive_record(
    archive_root: Path,
    *,
    run_id: str,
    generated_at: str,
    manifest_path: str,
    manifest_sha256: str,
    item_count: int,
) -> Path:
    record: JsonObject = {
        "version": 1,
        "run_id": run_id,
        "generated_at": generated_at,
        "mode": "deterministic-sample",
        "manifest_path": manifest_path,
        "manifest_sha256": manifest_sha256,
        "item_count": item_count,
        "network": "disabled",
    }
    path = archive_root / "runs" / f"{run_id}.json"
    write_json(path, record)
    return path
