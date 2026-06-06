from __future__ import annotations

from dataclasses import dataclass
from collections.abc import Mapping
from pathlib import Path, PurePosixPath
from typing import Iterable, cast

from collector.jsonio import JsonObject, read_json, read_jsonl, sha256_file
from collector.schema_validation import validate_json_document


@dataclass(frozen=True)
class ValidationIssue:
    path: str
    message: str


@dataclass(frozen=True)
class ValidationReport:
    root: Path
    issues: tuple[ValidationIssue, ...]
    checked_files: int

    @property
    def ok(self) -> bool:
        return len(self.issues) == 0


def _issue(path: str | Path, message: str) -> ValidationIssue:
    return ValidationIssue(path=str(path), message=message)


def _schema_issues(schema_name: str, path: str | Path, value: JsonObject) -> list[ValidationIssue]:
    return [_issue(path, message) for message in validate_json_document(schema_name, value)]


def _safe_public_path(public_root: Path, relative_path: str) -> Path | None:
    pure = PurePosixPath(relative_path)
    if pure.is_absolute() or ".." in pure.parts:
        return None
    return public_root / Path(*pure.parts)


def _validate_json_file(schema_name: str, path: Path) -> list[ValidationIssue]:
    try:
        value = read_json(path)
    except (OSError, ValueError) as exc:
        return [_issue(path, str(exc))]
    return _schema_issues(schema_name, path, value)


def _schema_for_manifest_path(path: str) -> str | None:
    if path == "index/days.json":
        return "days"
    if path == "index/sources.json":
        return "sources"
    if path.startswith("reports/hourly/") and path.endswith(".json"):
        return "hourly-report"
    if path.startswith("reports/daily/") and path.endswith(".json"):
        return "daily-report"
    return None


def _validate_items_jsonl(path: Path) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    try:
        rows = read_jsonl(path)
    except (OSError, ValueError) as exc:
        return [_issue(path, str(exc))]

    seen_ids: set[str] = set()
    seen_fingerprints: set[str] = set()
    for index, row in enumerate(rows, start=1):
        row_path = f"{path}:{index}"
        issues.extend(_schema_issues("item", row_path, row))
        item_id = str(row.get("id", ""))
        fingerprint = str(row.get("fingerprint", ""))
        if item_id in seen_ids:
            issues.append(_issue(row_path, f"duplicate item id {item_id}"))
        if fingerprint in seen_fingerprints:
            issues.append(_issue(row_path, f"duplicate item fingerprint {fingerprint}"))
        seen_ids.add(item_id)
        seen_fingerprints.add(fingerprint)
    return issues


def _validate_manifest_entry(public_root: Path, entry: JsonObject) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    relative_path = str(entry.get("path", ""))
    target = _safe_public_path(public_root, relative_path)
    if target is None:
        return [_issue(relative_path, "manifest path is not a safe public relative path")]
    if not target.exists():
        return [_issue(relative_path, "manifest entry target does not exist")]

    expected_sha = str(entry.get("sha256", ""))
    actual_sha = sha256_file(target)
    if expected_sha != actual_sha:
        issues.append(_issue(relative_path, f"sha256 mismatch: expected {expected_sha}, got {actual_sha}"))

    expected_bytes = entry.get("bytes")
    actual_bytes = target.stat().st_size
    if expected_bytes != actual_bytes:
        issues.append(_issue(relative_path, f"byte size mismatch: expected {expected_bytes}, got {actual_bytes}"))

    if relative_path.endswith("/items.jsonl"):
        issues.extend(_validate_items_jsonl(target))
    else:
        schema_name = _schema_for_manifest_path(relative_path)
        if schema_name is None:
            issues.append(_issue(relative_path, "manifest entry path has no schema mapping"))
        else:
            issues.extend(_validate_json_file(schema_name, target))
    return issues


def _validate_days_references(public_root: Path, days_doc: JsonObject) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    days_value = days_doc.get("days", [])
    if not isinstance(days_value, list):
        return issues
    for day_value in cast(list[object], days_value):
        if not isinstance(day_value, dict):
            continue
        day = cast(Mapping[str, object], day_value)
        for key in ("items_path", "daily_report_path", "manifest_path"):
            value = day.get(key)
            if not isinstance(value, str):
                continue
            path = _safe_public_path(public_root, value)
            if path is None or not path.exists():
                issues.append(_issue(f"index/days.json:{key}", f"referenced path is missing: {value}"))
    return issues


def validate_public(public_root: Path) -> ValidationReport:
    issues: list[ValidationIssue] = []
    checked_files = 0
    latest_path = public_root / "index" / "latest.json"
    days_path = public_root / "index" / "days.json"
    sources_path = public_root / "index" / "sources.json"

    for required in (latest_path, days_path, sources_path):
        if not required.exists():
            issues.append(_issue(required, "required public index file is missing"))

    if issues:
        return ValidationReport(root=public_root, issues=tuple(issues), checked_files=checked_files)

    latest = read_json(latest_path)
    days = read_json(days_path)
    sources = read_json(sources_path)
    checked_files += 3
    issues.extend(_schema_issues("latest", latest_path, latest))
    issues.extend(_schema_issues("days", days_path, days))
    issues.extend(_schema_issues("sources", sources_path, sources))
    issues.extend(_validate_days_references(public_root, days))

    manifest_path_value = str(latest.get("manifest_path", ""))
    manifest_path = _safe_public_path(public_root, manifest_path_value)
    if manifest_path is None or not manifest_path.exists():
        issues.append(_issue(latest_path, f"latest manifest path is missing: {manifest_path_value}"))
        return ValidationReport(root=public_root, issues=tuple(issues), checked_files=checked_files)

    expected_manifest_sha = str(latest.get("manifest_sha256", ""))
    actual_manifest_sha = sha256_file(manifest_path)
    if expected_manifest_sha != actual_manifest_sha:
        issues.append(
            _issue(
                latest_path,
                f"manifest sha256 mismatch: expected {expected_manifest_sha}, got {actual_manifest_sha}",
            )
        )

    manifest = read_json(manifest_path)
    checked_files += 1
    issues.extend(_schema_issues("manifest", manifest_path, manifest))

    files_value = manifest.get("files", [])
    if isinstance(files_value, list):
        seen_paths: set[str] = set()
        for entry_value in cast(list[object], files_value):
            if not isinstance(entry_value, dict):
                continue
            entry = cast(JsonObject, entry_value)
            relative_path = str(entry.get("path", ""))
            if relative_path in seen_paths:
                issues.append(_issue(manifest_path, f"duplicate manifest path {relative_path}"))
            seen_paths.add(relative_path)
            issues.extend(_validate_manifest_entry(public_root, entry))
            checked_files += 1

    return ValidationReport(root=public_root, issues=tuple(issues), checked_files=checked_files)


def format_issues(issues: Iterable[ValidationIssue]) -> str:
    return "\n".join(f"{issue.path}: {issue.message}" for issue in issues)
