from __future__ import annotations

from pathlib import Path
from typing import Iterable

from collector.jsonio import JsonObject, sha256_file


def content_type_for(path: Path) -> str:
    if path.suffix == ".jsonl":
        return "application/x-ndjson"
    if path.suffix == ".md":
        return "text/markdown"
    return "application/json"


def public_relative_path(public_root: Path, path: Path) -> str:
    return path.relative_to(public_root).as_posix()


def build_manifest(public_root: Path, generated_at: str, files: Iterable[Path]) -> JsonObject:
    entries: list[JsonObject] = []
    for path in sorted(files, key=lambda item: item.as_posix()):
        entries.append(
            {
                "path": public_relative_path(public_root, path),
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
                "content_type": content_type_for(path),
            }
        )

    total_bytes = sum(int(entry["bytes"]) for entry in entries)
    return {
        "version": 1,
        "generated_at": generated_at,
        "root": "public",
        "files": entries,
        "total_files": len(entries),
        "total_bytes": total_bytes,
    }
