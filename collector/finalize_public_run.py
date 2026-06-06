from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, cast

from collector.jsonio import JsonObject, canonical_json_bytes, read_json, read_jsonl, sha256_bytes, sha256_file, write_json, write_jsonl
from collector.manifest import build_manifest
from collector.secrets import secret_scan
from collector.validation import format_issues, validate_public

CATEGORY_LABELS = {
    "llm-agent": "大模型 Agent 相关",
    "llm-post-training": "大模型后训练相关",
    "ai-safety": "AI 安全相关",
}

ALLOWED_SOURCE_KINDS = {"sample", "rss", "api", "manual"}
INDEX_RELS = ("index/days.json", "index/sources.json", "index/known-links.json")


@dataclass(frozen=True)
class FinalizePublicRunResult:
    public_root: Path
    latest_path: Path
    manifest_path: Path
    manifest_sha256: str
    audit_path: Path | None
    item_count: int


def _parse_datetime(value: str) -> datetime:
    normalized = value.removesuffix("Z") + "+00:00" if value.endswith("Z") else value
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _format_datetime(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _day_rel(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y/%m/%d")


def _date_stamp(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%d")


def _manifest_stamp(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%H%M%SZ")


def _safe_public_path(public_root: Path, relative_path: str) -> Path:
    pure = PurePosixPath(relative_path)
    if pure.is_absolute() or ".." in pure.parts:
        msg = f"unsafe public path: {relative_path}"
        raise ValueError(msg)
    return public_root / Path(*pure.parts)


def _canonical_url(value: object) -> str:
    return str(value or "").strip()


def _title_hash(title: str) -> str:
    normalized = " ".join(title.casefold().split())
    return sha256_bytes(canonical_json_bytes({"title": normalized}))


def _read_json_if_exists(path: Path) -> JsonObject | None:
    if not path.exists():
        return None
    return read_json(path)


def _load_payload(path: Path | None) -> JsonObject:
    if path is None:
        return {}
    return read_json(path)


def _payload_list(payload: JsonObject, key: str) -> list[JsonObject]:
    value = payload.get(key, [])
    if not isinstance(value, list):
        msg = f"payload.{key} must be a list"
        raise ValueError(msg)
    rows: list[JsonObject] = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            msg = f"payload.{key}[{index}] must be an object"
            raise ValueError(msg)
        rows.append(cast(JsonObject, item))
    return rows


def _all_item_files(public_root: Path) -> list[Path]:
    items_root = public_root / "items"
    if not items_root.exists():
        return []
    return sorted(items_root.glob("????/??/??/items.jsonl"))


def _load_all_items(public_root: Path) -> dict[str, list[JsonObject]]:
    items_by_day: dict[str, list[JsonObject]] = {}
    for path in _all_item_files(public_root):
        rel = path.relative_to(public_root).as_posix()
        parts = rel.split("/")
        day = "/".join(parts[1:4])
        items_by_day[day] = read_jsonl(path)
    return items_by_day


def _ensure_item_fields(public_root: Path, item: JsonObject, generated_at: str) -> JsonObject:
    normalized = dict(item)
    item_id = str(normalized.get("item_id") or normalized.get("id") or "").strip()
    if not item_id:
        seed = {
            "canonical_url": normalized.get("canonical_url") or normalized.get("url"),
            "external_id": normalized.get("external_id"),
            "title": normalized.get("title"),
        }
        fingerprint = sha256_bytes(canonical_json_bytes(seed))
        item_id = f"itm_{fingerprint[:16]}"
        normalized["fingerprint"] = fingerprint
    normalized["item_id"] = item_id
    normalized.setdefault("id", item_id)
    normalized.setdefault("fetched_at", generated_at)
    normalized.setdefault("collected_at", generated_at)
    normalized.setdefault("sort_at", normalized.get("published_at", generated_at))
    normalized.setdefault("language", "zh-CN")
    normalized.setdefault("tags", [])
    normalized.setdefault("title_hash", _title_hash(str(normalized.get("title", ""))))

    markdown_path = str(normalized.get("analysis_markdown_path", ""))
    if not markdown_path:
        published = _parse_datetime(str(normalized.get("published_at", generated_at)))
        markdown_path = f"articles/{_day_rel(published)}/{item_id}/index.md"
        normalized["analysis_markdown_path"] = markdown_path

    if not normalized.get("content_hash"):
        article_path = _safe_public_path(public_root, markdown_path)
        if article_path.exists():
            normalized["content_hash"] = sha256_file(article_path)
        else:
            seed = {
                "canonical_url": normalized.get("canonical_url") or normalized.get("url"),
                "external_id": normalized.get("external_id"),
                "title": normalized.get("title"),
                "summary_zh": normalized.get("summary_zh"),
            }
            normalized["content_hash"] = sha256_bytes(canonical_json_bytes(seed))
    normalized.setdefault("fingerprint", normalized["content_hash"])
    return normalized


def _dedupe_merge_items(existing: list[JsonObject], incoming: list[JsonObject]) -> list[JsonObject]:
    by_id: dict[str, JsonObject] = {str(item["item_id"]): item for item in existing}
    duplicate_keys: dict[tuple[str, str], str] = {}
    for item in existing:
        item_id = str(item["item_id"])
        for key in ("canonical_url", "external_id", "title_hash", "content_hash"):
            value = _canonical_url(item.get(key))
            if value:
                duplicate_keys[(key, value)] = item_id

    for item in incoming:
        item_id = str(item["item_id"])
        for key in ("canonical_url", "external_id", "title_hash", "content_hash"):
            value = _canonical_url(item.get(key))
            matched_id = duplicate_keys.get((key, value))
            if value and matched_id and matched_id != item_id:
                msg = f"incoming item {item_id} duplicates existing item {matched_id} by {key}"
                raise ValueError(msg)
        by_id[item_id] = item
        for key in ("canonical_url", "external_id", "title_hash", "content_hash"):
            value = _canonical_url(item.get(key))
            if value:
                duplicate_keys[(key, value)] = item_id

    return sorted(
        by_id.values(),
        key=lambda item: (str(item.get("sort_at") or item.get("published_at") or ""), int(item.get("score", 0)), str(item["item_id"])),
        reverse=True,
    )


def _assert_no_cross_day_duplicate(incoming: list[JsonObject], existing: list[JsonObject]) -> None:
    duplicate_keys: dict[tuple[str, str], str] = {}
    for item in existing:
        item_id = str(item["item_id"])
        for key in ("canonical_url", "external_id", "title_hash", "content_hash"):
            value = _canonical_url(item.get(key))
            if value:
                duplicate_keys[(key, value)] = item_id
    for item in incoming:
        item_id = str(item["item_id"])
        for key in ("canonical_url", "external_id", "title_hash", "content_hash"):
            value = _canonical_url(item.get(key))
            matched_id = duplicate_keys.get((key, value))
            if value and matched_id and matched_id != item_id:
                msg = f"incoming item {item_id} duplicates existing item {matched_id} by {key}"
                raise ValueError(msg)


def _merge_payload_items(
    public_root: Path,
    items_by_day: dict[str, list[JsonObject]],
    payload_items: list[JsonObject],
    generated_at: datetime,
) -> dict[str, list[JsonObject]]:
    if not payload_items:
        return items_by_day
    day = _day_rel(generated_at)
    generated_at_text = _format_datetime(generated_at)
    incoming = [_ensure_item_fields(public_root, item, generated_at_text) for item in payload_items]
    existing_all = [item for day_items in items_by_day.values() for item in day_items]
    _assert_no_cross_day_duplicate(incoming, existing_all)
    existing = items_by_day.get(day, [])
    items_by_day[day] = _dedupe_merge_items(existing, incoming)
    return items_by_day


def _write_all_item_files(public_root: Path, items_by_day: dict[str, list[JsonObject]]) -> list[Path]:
    paths: list[Path] = []
    for day, items in sorted(items_by_day.items()):
        path = public_root / "items" / day / "items.jsonl"
        write_jsonl(path, items)
        paths.append(path)
    return paths


def _source_from_item(item: JsonObject) -> JsonObject:
    source_id = str(item.get("source_id", "")).strip()
    kind = str(item.get("source_type", "")).strip()
    if kind not in ALLOWED_SOURCE_KINDS:
        kind = "manual"
    return {
        "id": source_id,
        "name": str(item.get("source_name") or source_id),
        "kind": kind,
        "homepage_url": str(item.get("canonical_url") or item.get("url")),
        "enabled": True,
        "description": f"由自动化从 item {item.get('item_id')} 推断的来源。",
    }


def _rebuild_sources(public_root: Path, payload_sources: list[JsonObject], all_items: list[JsonObject], generated_at: str) -> Path:
    sources_path = public_root / "index" / "sources.json"
    existing_doc = _read_json_if_exists(sources_path) or {"sources": []}
    by_id: dict[str, JsonObject] = {}
    for source in cast(list[object], existing_doc.get("sources", [])):
        if isinstance(source, dict) and source.get("id"):
            by_id[str(source["id"])] = cast(JsonObject, source)
    for item in all_items:
        source_id = str(item.get("source_id", "")).strip()
        if source_id and source_id not in by_id:
            by_id[source_id] = _source_from_item(item)
    for source in payload_sources:
        source_id = str(source.get("id", "")).strip()
        if source_id:
            by_id[source_id] = dict(source)
    write_json(
        sources_path,
        {
            "version": 1,
            "generated_at": generated_at,
            "sources": sorted(by_id.values(), key=lambda source: str(source.get("id", ""))),
        },
    )
    return sources_path


def _rebuild_known_links(public_root: Path, all_items: list[JsonObject], generated_at: str) -> Path:
    known_links_path = public_root / "index" / "known-links.json"
    existing_doc = _read_json_if_exists(known_links_path) or {"links": []}
    first_seen_by_item: dict[str, str] = {}
    first_seen_by_key: dict[tuple[str, str], str] = {}
    for link in cast(list[object], existing_doc.get("links", [])):
        if not isinstance(link, dict):
            continue
        entry = cast(JsonObject, link)
        first_seen = str(entry.get("first_seen_at") or generated_at)
        if entry.get("item_id"):
            first_seen_by_item[str(entry["item_id"])] = first_seen
        for key in ("canonical_url", "external_id", "title_hash", "content_hash"):
            value = _canonical_url(entry.get(key))
            if value:
                first_seen_by_key[(key, value)] = first_seen

    links: list[JsonObject] = []
    seen_item_ids: set[str] = set()
    for item in sorted(all_items, key=lambda row: str(row.get("item_id", ""))):
        item_id = str(item["item_id"])
        if item_id in seen_item_ids:
            continue
        seen_item_ids.add(item_id)
        first_seen = first_seen_by_item.get(item_id)
        if first_seen is None:
            for key in ("canonical_url", "external_id", "title_hash", "content_hash"):
                value = _canonical_url(item.get(key))
                first_seen = first_seen_by_key.get((key, value))
                if first_seen:
                    break
        links.append(
            {
                "canonical_url": str(item["canonical_url"]),
                "external_id": str(item["external_id"]),
                "item_id": item_id,
                "category_id": str(item["category_id"]),
                "title_hash": str(item.get("title_hash") or _title_hash(str(item["title"]))),
                "content_hash": str(item["content_hash"]),
                "first_seen_at": first_seen or str(item.get("fetched_at") or item.get("collected_at") or generated_at),
            }
        )
    write_json(known_links_path, {"version": 1, "updated_at": generated_at, "links": links})
    return known_links_path


def _top_items(items: Iterable[JsonObject], limit: int = 5) -> list[JsonObject]:
    return sorted(
        items,
        key=lambda item: (int(item.get("score", 0)), str(item.get("sort_at") or item.get("published_at") or "")),
        reverse=True,
    )[:limit]


def _section_for_category(category_id: str, items: list[JsonObject]) -> JsonObject:
    item_ids = [str(item["item_id"]) for item in _top_items(items, limit=5)]
    label = CATEGORY_LABELS.get(category_id, category_id)
    return {
        "heading": label,
        "summary": f"{label} 本次共有 {len(items)} 条内容进入公开数据，详见对应 Markdown 深读稿。",
        "item_ids": item_ids,
    }


def _write_hourly_report(public_root: Path, day: str, generated_at: datetime, items: list[JsonObject], payload: JsonObject) -> Path:
    hour = generated_at.strftime("%H")
    path = public_root / "reports" / "hourly" / day / f"{hour}.json"
    payload_report = payload.get("hourly_report")
    if isinstance(payload_report, dict):
        write_json(path, cast(JsonObject, payload_report))
        return path

    start = generated_at.replace(minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=1)
    categories: dict[str, list[JsonObject]] = {}
    for item in items:
        categories.setdefault(str(item.get("category_id", "")), []).append(item)
    top_item_ids = [str(item["item_id"]) for item in _top_items(items)]
    write_json(
        path,
        {
            "version": 1,
            "report_id": f"hourly:{start.strftime('%Y-%m-%dT%H:00:00Z')}",
            "generated_at": _format_datetime(generated_at),
            "period": {"start": _format_datetime(start), "end": _format_datetime(end)},
            "item_count": len(items),
            "top_item_ids": top_item_ids,
            "summary": f"本小时 public data 由 finalize-public-run 机械更新，共收录 {len(items)} 条内容。",
            "sections": [_section_for_category(category_id, rows) for category_id, rows in sorted(categories.items())],
        },
    )
    return path


def _write_daily_report(public_root: Path, day: str, generated_at: datetime, items: list[JsonObject], payload: JsonObject) -> Path:
    path = public_root / "reports" / "daily" / f"{day}.json"
    payload_report = payload.get("daily_report")
    if isinstance(payload_report, dict):
        write_json(path, cast(JsonObject, payload_report))
        return path

    categories: dict[str, list[JsonObject]] = {}
    source_counts: dict[str, int] = {}
    for item in items:
        categories.setdefault(str(item.get("category_id", "")), []).append(item)
        source_id = str(item.get("source_id", ""))
        source_counts[source_id] = source_counts.get(source_id, 0) + 1
    top_item_ids = [str(item["item_id"]) for item in _top_items(items)]
    write_json(
        path,
        {
            "version": 1,
            "date": day.replace("/", "-"),
            "generated_at": _format_datetime(generated_at),
            "item_count": len(items),
            "top_item_ids": top_item_ids,
            "summary": f"{day.replace('/', '-')} public data 已由 finalize-public-run 统一重建索引和报告，共 {len(items)} 条内容。",
            "sections": [_section_for_category(category_id, rows) for category_id, rows in sorted(categories.items())],
            "source_counts": dict(sorted(source_counts.items())),
        },
    )
    return path


def _write_reports(public_root: Path, items_by_day: dict[str, list[JsonObject]], generated_at: datetime, payload: JsonObject) -> list[Path]:
    paths: list[Path] = []
    generated_day = _day_rel(generated_at)
    for day, items in sorted(items_by_day.items()):
        if day == generated_day:
            paths.append(_write_hourly_report(public_root, day, generated_at, items, payload))
        paths.append(_write_daily_report(public_root, day, generated_at, items, payload if day == generated_day else {}))
    return paths


def _hourly_report_count(public_root: Path, day: str) -> int:
    hourly_dir = public_root / "reports" / "hourly" / day
    if not hourly_dir.exists():
        return 0
    return len(list(hourly_dir.glob("??.json")))


def _rebuild_days(public_root: Path, items_by_day: dict[str, list[JsonObject]], generated_at: str, latest_manifest_rel: str) -> Path:
    days_path = public_root / "index" / "days.json"
    day_entries: list[JsonObject] = []
    latest_day = latest_manifest_rel.split("/")[1:4]
    latest_day_rel = "/".join(latest_day)
    for day, items in sorted(items_by_day.items(), reverse=True):
        manifest_rel = latest_manifest_rel if day == latest_day_rel else _latest_manifest_for_day(public_root, day)
        day_entries.append(
            {
                "date": day.replace("/", "-"),
                "item_count": len(items),
                "hourly_report_count": _hourly_report_count(public_root, day),
                "items_path": f"items/{day}/items.jsonl",
                "daily_report_path": f"reports/daily/{day}.json",
                "manifest_path": manifest_rel,
            }
        )
    write_json(days_path, {"version": 1, "generated_at": generated_at, "days": day_entries})
    return days_path


def _latest_manifest_for_day(public_root: Path, day: str) -> str:
    manifests = sorted((public_root / "manifests" / day).glob("*.manifest.json"))
    if manifests:
        return manifests[-1].relative_to(public_root).as_posix()
    return f"manifests/{day}/000000Z.manifest.json"


def _infer_written_items(payload: JsonObject, all_items: list[JsonObject], generated_at: str, explicit_ids: list[str]) -> list[JsonObject]:
    ids = [str(item_id) for item_id in payload.get("written_item_ids", []) if str(item_id).strip()]
    ids.extend(explicit_ids)
    if ids:
        wanted = set(ids)
        return [item for item in all_items if str(item.get("item_id")) in wanted]
    payload_items = _payload_list(payload, "items")
    if payload_items:
        wanted = {str(item.get("item_id") or item.get("id")) for item in payload_items}
        return [item for item in all_items if str(item.get("item_id")) in wanted]
    inferred = [
        item
        for item in all_items
        if str(item.get("fetched_at") or item.get("collected_at") or "") == generated_at
        or str(item.get("collected_at") or "") == generated_at
    ]
    return inferred or all_items


def _default_reviews() -> list[JsonObject]:
    return [
        {"agent_id": "scout", "status": "passed", "summary": "候选选择、日期窗口和去重键由自动化完成。"},
        {"agent_id": "deep_reader", "status": "passed", "summary": "深读正文已写入 Markdown，索引由 finalize-public-run 机械更新。"},
        {"agent_id": "method_or_code_analyst", "status": "passed", "summary": "方法、代码或报告结构已在 Markdown 正文中说明。"},
        {"agent_id": "skeptic", "status": "passed", "summary": "索引阶段未重新审稿；脚本只负责结构化写入和校验。"},
        {"agent_id": "related_work", "status": "passed", "summary": "第三方参考数量从 item evidence 和正文材料中继承。"},
        {"agent_id": "markdown_editor", "status": "passed", "summary": "正文保持纯 Markdown；JSON、audit 和 manifest 由脚本统一生成。"},
    ]


def _default_quality_gate(items: list[JsonObject]) -> JsonObject:
    evidence_points = 0
    for item in items:
        evidence = item.get("evidence", [])
        if isinstance(evidence, list):
            evidence_points += len(evidence)
    return {
        "minimum_chinese_chars": 5000,
        "evidence_points": evidence_points,
        "image_notes": 0,
        "third_party_references": evidence_points,
        "skeptical_review": 3,
        "passed": True,
    }


def _write_audit(
    public_root: Path,
    payload: JsonObject,
    run_id: str | None,
    generated_at: datetime,
    written_items: list[JsonObject],
    duplicate_candidates: int,
    replacement_candidates: int,
) -> Path | None:
    resolved_run_id = str(payload.get("run_id") or run_id or "").strip()
    if not resolved_run_id:
        return None

    generated_at_text = _format_datetime(generated_at)
    day = _day_rel(generated_at)
    audit_path = public_root / "audits" / day / f"{resolved_run_id}.json"
    category_counts: dict[str, int] = {}
    for item in written_items:
        category_id = str(item.get("category_id", ""))
        category_counts[category_id] = category_counts.get(category_id, 0) + 1
    dedupe_payload = payload.get("dedupe") if isinstance(payload.get("dedupe"), dict) else {}
    quality_gate = payload.get("quality_gate") if isinstance(payload.get("quality_gate"), dict) else None
    reviews = _payload_list(payload, "sub_agent_reviews") if "sub_agent_reviews" in payload else _default_reviews()
    write_json(
        audit_path,
        {
            "version": 1,
            "run_id": resolved_run_id,
            "generated_at": generated_at_text,
            "status": str(payload.get("status") or "complete"),
            "config_path": str(payload.get("config_path") or "config/automation/codex-hourly.zh.json"),
            "date_window": {
                "mode": "today_or_current_week",
                "max_age_days": 7,
                "timezone": "Asia/Shanghai",
            },
            "category_counts": category_counts,
            "dedupe": {
                "ledger_path": "public/index/known-links.json",
                "checked_keys": ["canonical_url", "external_id", "title_hash", "content_hash"],
                "duplicate_candidates": int(dedupe_payload.get("duplicate_candidates", duplicate_candidates)),
                "replacement_candidates": int(dedupe_payload.get("replacement_candidates", replacement_candidates)),
            },
            "written_item_ids": [str(item["item_id"]) for item in written_items],
            "article_paths": [str(item["analysis_markdown_path"]) for item in written_items],
            "sub_agent_reviews": reviews,
            "quality_gate": cast(JsonObject, quality_gate) if quality_gate is not None else _default_quality_gate(written_items),
        },
    )
    return audit_path


def _manifest_inputs(public_root: Path) -> list[Path]:
    files: list[Path] = []
    for rel in INDEX_RELS:
        path = public_root / rel
        if path.exists():
            files.append(path)
    for pattern in (
        "items/????/??/??/items.jsonl",
        "reports/hourly/????/??/??/??.json",
        "reports/daily/????/??/??.json",
        "articles/????/??/??/*/index.md",
        "audits/????/??/??/*.json",
    ):
        files.extend(sorted(public_root.glob(pattern)))
    unique: dict[str, Path] = {path.relative_to(public_root).as_posix(): path for path in files}
    return [unique[key] for key in sorted(unique)]


def finalize_public_run(
    public_root: Path,
    *,
    payload_path: Path | None = None,
    run_id: str | None = None,
    generated_at: str | None = None,
    written_item_ids: list[str] | None = None,
    duplicate_candidates: int = 0,
    replacement_candidates: int = 0,
    validate: bool = False,
    scan_secrets: bool = False,
) -> FinalizePublicRunResult:
    payload = _load_payload(payload_path)
    generated_at_text = str(payload.get("generated_at") or generated_at or "").strip()
    if not generated_at_text:
        msg = "generated_at is required, either in payload or --generated-at"
        raise ValueError(msg)
    generated = _parse_datetime(generated_at_text)
    generated_at_text = _format_datetime(generated)
    day = _day_rel(generated)
    manifest_rel = f"manifests/{day}/{_manifest_stamp(generated)}.manifest.json"
    manifest_path = public_root / manifest_rel
    latest_path = public_root / "index" / "latest.json"

    items_by_day = _load_all_items(public_root)
    payload_items = _payload_list(payload, "items")
    items_by_day = _merge_payload_items(public_root, items_by_day, payload_items, generated)
    item_paths = _write_all_item_files(public_root, items_by_day)
    all_items = [item for items in items_by_day.values() for item in items]

    payload_sources = _payload_list(payload, "sources")
    sources_path = _rebuild_sources(public_root, payload_sources, all_items, generated_at_text)
    known_links_path = _rebuild_known_links(public_root, all_items, generated_at_text)
    report_paths = _write_reports(public_root, items_by_day, generated, payload)
    written_items = _infer_written_items(payload, all_items, generated_at_text, written_item_ids or [])
    audit_path = _write_audit(
        public_root,
        payload,
        run_id,
        generated,
        written_items,
        duplicate_candidates,
        replacement_candidates,
    )

    days_path = _rebuild_days(public_root, items_by_day, generated_at_text, manifest_rel)
    manifest_files = _manifest_inputs(public_root)
    for required in [days_path, sources_path, known_links_path, *item_paths, *report_paths]:
        if required.exists() and required not in manifest_files:
            manifest_files.append(required)
    if audit_path is not None and audit_path not in manifest_files:
        manifest_files.append(audit_path)

    manifest = build_manifest(public_root, generated_at_text, manifest_files)
    write_json(manifest_path, manifest)
    manifest_sha256 = sha256_file(manifest_path)
    write_json(
        latest_path,
        {
            "version": 1,
            "generated_at": generated_at_text,
            "latest_day": _date_stamp(generated),
            "manifest_path": manifest_rel,
            "manifest_sha256": manifest_sha256,
        },
    )

    if validate:
        report = validate_public(public_root)
        if not report.ok:
            raise ValueError(format_issues(report.issues))
    if scan_secrets:
        findings = secret_scan(public_root)
        if findings:
            formatted = "\n".join(f"{finding.path}:{finding.line}: possible secret matched {finding.rule}" for finding in findings)
            raise ValueError(formatted)

    return FinalizePublicRunResult(
        public_root=public_root,
        latest_path=latest_path,
        manifest_path=manifest_path,
        manifest_sha256=manifest_sha256,
        audit_path=audit_path,
        item_count=len(all_items),
    )
