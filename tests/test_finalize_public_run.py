from __future__ import annotations

import re
from pathlib import Path

import pytest

from collector.finalize_public_run import derive_item_id, finalize_public_run
from collector.jsonio import read_json, read_jsonl, sha256_file, write_json
from collector.sample import generate_sample
from collector.validation import format_issues, validate_public


def _new_item_payload(public_root: Path) -> Path:
    item_id = "itm_deadbeefcafebabe"
    article_rel = f"articles/2026/06/06/{item_id}/index.md"
    article_path = public_root / article_rel
    article_path.parent.mkdir(parents=True, exist_ok=True)
    article_path.write_text(
        "# Test automation item\n\n"
        "## TL;DR\n\n"
        "This fixture verifies that finalize-public-run can update public indexes mechanically.\n",
        encoding="utf-8",
    )
    payload_path = public_root.parent / "payload.json"
    write_json(
        payload_path,
        {
            "run_id": "codex-hourly-20260606t010000z",
            "generated_at": "2026-06-06T01:00:00Z",
            "items": [
                {
                    "item_id": item_id,
                    "category_id": "llm-agent",
                    "type": "code",
                    "source_id": "test-source",
                    "source_name": "Test Source",
                    "source_type": "manual",
                    "external_id": "test-source:deadbeef",
                    "title": "Finalize public run test item",
                    "url": "https://example.com/finalize-public-run",
                    "canonical_url": "https://example.com/finalize-public-run",
                    "published_at": "2026-06-06T00:00:00Z",
                    "fetched_at": "2026-06-06T01:00:00Z",
                    "summary_zh": "用于测试 finalize-public-run 的自动索引更新条目。",
                    "analysis_markdown_path": article_rel,
                    "tags": ["test", "automation"],
                    "content_hash": sha256_file(article_path),
                    "evidence": [
                        {
                            "type": "url",
                            "label": "Fixture source",
                            "url": "https://example.com/finalize-public-run",
                        }
                    ],
                }
            ],
            "sources": [
                {
                    "id": "test-source",
                    "name": "Test Source",
                    "kind": "manual",
                    "homepage_url": "https://example.com/finalize-public-run",
                    "enabled": True,
                    "description": "Fixture source for finalize-public-run.",
                }
            ],
            "quality_gate": {
                "minimum_chinese_chars": 5000,
                "evidence_points": 1,
                "image_notes": 0,
                "third_party_references": 1,
                "skeptical_review": 3,
                "passed": True,
            },
        },
    )
    return payload_path


def test_finalize_public_run_merges_payload_and_rebuilds_indexes(tmp_path: Path) -> None:
    result = generate_sample(tmp_path / "sample")
    payload_path = _new_item_payload(result.public_root)

    finalized = finalize_public_run(result.public_root, payload_path=payload_path, validate=True)

    latest = read_json(finalized.latest_path)
    assert latest["manifest_path"] == "manifests/2026/06/06/010000Z.manifest.json"
    assert latest["manifest_sha256"] == sha256_file(finalized.manifest_path)

    known_links = read_json(result.public_root / "index" / "known-links.json")
    assert any(link["item_id"] == "itm_deadbeefcafebabe" for link in known_links["links"])

    sources = read_json(result.public_root / "index" / "sources.json")
    assert any(source["id"] == "test-source" for source in sources["sources"])

    audit = read_json(result.public_root / "audits/2026/06/06/codex-hourly-20260606t010000z.json")
    assert audit["written_item_ids"] == ["itm_deadbeefcafebabe"]
    assert audit["article_paths"] == ["articles/2026/06/06/itm_deadbeefcafebabe/index.md"]

    report = validate_public(result.public_root)
    assert report.ok, format_issues(report.issues)


def test_derive_item_id_uses_stable_hex_prefix() -> None:
    item_id = derive_item_id(
        canonical_url="https://example.com/research/aura-agentic-reid",
        external_id="aura-agentic-reid",
        title="AURA: Agentic Re-ID for Visual Grounding",
    )

    assert re.fullmatch(r"itm_[a-f0-9]{16}", item_id)
    assert item_id == derive_item_id(
        canonical_url="https://example.com/research/aura-agentic-reid",
        external_id="aura-agentic-reid",
        title="AURA: Agentic Re-ID for Visual Grounding",
    )
    assert item_id != derive_item_id(
        canonical_url="https://example.com/research/aura-agentic-reid-v2",
        external_id="aura-agentic-reid",
        title="AURA: Agentic Re-ID for Visual Grounding",
    )


def test_finalize_public_run_orders_items_by_published_at_not_sort_at(tmp_path: Path) -> None:
    result = generate_sample(tmp_path / "sample")
    item_id = "itm_sortby_publication"
    article_rel = f"articles/2026/06/06/{item_id}/index.md"
    article_path = result.public_root / article_rel
    article_path.parent.mkdir(parents=True, exist_ok=True)
    article_path.write_text(
        "# Published-time ordering fixture\n\n"
        "## TL;DR\n\n"
        "This fixture catches accidental sorting by collection or page creation time.\n",
        encoding="utf-8",
    )
    payload_path = result.public_root.parent / "published-order-payload.json"
    write_json(
        payload_path,
        {
            "run_id": "codex-hourly-20260606t013000z",
            "generated_at": "2026-06-06T01:30:00Z",
            "items": [
                {
                    "item_id": item_id,
                    "category_id": "llm-agent",
                    "type": "paper",
                    "source_id": "test-source",
                    "source_name": "Test Source",
                    "source_type": "manual",
                    "external_id": "test-source:published-order",
                    "title": "Published time should drive item ordering",
                    "url": "https://example.com/published-time-ordering",
                    "canonical_url": "https://example.com/published-time-ordering",
                    "published_at": "2026-06-06T00:10:00Z",
                    "sort_at": "2026-06-06T23:59:00Z",
                    "fetched_at": "2026-06-06T01:30:00Z",
                    "summary_zh": "用于确认列表排序使用文章发布时间，而不是页面创建时间或 sort_at。",
                    "analysis_markdown_path": article_rel,
                    "tags": ["test", "ordering"],
                    "content_hash": sha256_file(article_path),
                }
            ],
        },
    )

    finalize_public_run(result.public_root, payload_path=payload_path, validate=True)

    items = read_jsonl(result.public_root / "items/2026/06/06/items.jsonl")
    ordered_ids = [str(item["item_id"]) for item in items]
    assert ordered_ids.index(item_id) > 0
    published_times = [str(item["published_at"]) for item in items]
    assert published_times == sorted(published_times, reverse=True)


def test_finalize_public_run_derives_missing_item_id(tmp_path: Path) -> None:
    result = generate_sample(tmp_path / "sample")
    item_id = derive_item_id(
        canonical_url="https://example.com/finalize-public-run-derived-id",
        external_id="test-source:derived-id",
        title="Finalize public run derives item ids",
    )
    article_rel = f"articles/2026/06/06/{item_id}/index.md"
    article_path = result.public_root / article_rel
    article_path.parent.mkdir(parents=True, exist_ok=True)
    article_path.write_text(
        "# Derived item id fixture\n\n"
        "## TL;DR\n\n"
        "This fixture verifies finalize-public-run derives schema-safe item ids when the payload omits them.\n",
        encoding="utf-8",
    )
    payload_path = result.public_root.parent / "derived-id-payload.json"
    write_json(
        payload_path,
        {
            "run_id": "codex-hourly-20260606t010500z",
            "generated_at": "2026-06-06T01:05:00Z",
            "items": [
                {
                    "category_id": "llm-agent",
                    "type": "code",
                    "source_id": "test-source",
                    "source_name": "Test Source",
                    "source_type": "manual",
                    "external_id": "test-source:derived-id",
                    "title": "Finalize public run derives item ids",
                    "url": "https://example.com/finalize-public-run-derived-id",
                    "canonical_url": "https://example.com/finalize-public-run-derived-id",
                    "published_at": "2026-06-06T00:00:00Z",
                    "fetched_at": "2026-06-06T01:05:00Z",
                    "summary_zh": "用于测试 finalize-public-run 在 payload 省略 item_id 时自动生成合法 id。",
                    "analysis_markdown_path": article_rel,
                    "tags": ["test", "automation"],
                    "content_hash": sha256_file(article_path),
                }
            ],
        },
    )

    finalize_public_run(result.public_root, payload_path=payload_path, validate=True)

    known_links = read_json(result.public_root / "index" / "known-links.json")
    assert any(link["item_id"] == item_id for link in known_links["links"])
    audit = read_json(result.public_root / "audits/2026/06/06/codex-hourly-20260606t010500z.json")
    assert audit["written_item_ids"] == [item_id]


def test_finalize_public_run_allows_non_hex_item_ids_in_reports(tmp_path: Path) -> None:
    result = generate_sample(tmp_path / "sample")
    item_id = "itm_harness1_260602373"
    article_rel = f"articles/2026/06/06/{item_id}/index.md"
    article_path = result.public_root / article_rel
    article_path.parent.mkdir(parents=True, exist_ok=True)
    article_path.write_text(
        "# Non-hex item id fixture\n\n"
        "## TL;DR\n\n"
        "This fixture verifies report schemas accept the same item id format as item records.\n",
        encoding="utf-8",
    )
    payload_path = result.public_root.parent / "non-hex-payload.json"
    write_json(
        payload_path,
        {
            "run_id": "codex-hourly-20260606t011500z",
            "generated_at": "2026-06-06T01:15:00Z",
            "items": [
                {
                    "item_id": item_id,
                    "category_id": "llm-agent",
                    "type": "paper",
                    "source_id": "test-source",
                    "source_name": "Test Source",
                    "source_type": "manual",
                    "external_id": "test-source:harness1",
                    "title": "Report schema accepts non-hex item ids",
                    "url": "https://example.com/report-schema-non-hex",
                    "canonical_url": "https://example.com/report-schema-non-hex",
                    "published_at": "2026-06-06T00:00:00Z",
                    "fetched_at": "2026-06-06T01:15:00Z",
                    "summary_zh": "用于测试 report schema 与 item schema 使用一致的 item_id 格式。",
                    "analysis_markdown_path": article_rel,
                    "tags": ["test", "schema"],
                    "content_hash": sha256_file(article_path),
                }
            ],
        },
    )

    finalize_public_run(result.public_root, payload_path=payload_path, validate=True)

    hourly = read_json(result.public_root / "reports/hourly/2026/06/06/01.json")
    daily = read_json(result.public_root / "reports/daily/2026/06/06.json")
    assert item_id in hourly["top_item_ids"]
    assert item_id in daily["top_item_ids"]
    report = validate_public(result.public_root)
    assert report.ok, format_issues(report.issues)


def test_finalize_public_run_reconciles_existing_public_data(tmp_path: Path) -> None:
    result = generate_sample(tmp_path / "sample")

    finalized = finalize_public_run(
        result.public_root,
        run_id="codex-hourly-20260606t020000z",
        generated_at="2026-06-06T02:00:00Z",
        validate=True,
    )

    latest = read_json(finalized.latest_path)
    assert latest["manifest_path"] == "manifests/2026/06/06/020000Z.manifest.json"
    assert latest["manifest_sha256"] == sha256_file(finalized.manifest_path)

    audit = read_json(result.public_root / "audits/2026/06/06/codex-hourly-20260606t020000z.json")
    assert len(audit["written_item_ids"]) == 3

    report = validate_public(result.public_root)
    assert report.ok, format_issues(report.issues)


def test_finalize_public_run_rejects_cross_day_duplicate_payload(tmp_path: Path) -> None:
    result = generate_sample(tmp_path / "sample")
    payload_path = _new_item_payload(result.public_root)
    payload = read_json(payload_path)
    first_item = read_json(result.latest_path)
    assert first_item["latest_day"] == "2026-06-06"
    payload["items"][0]["canonical_url"] = "https://example.com/research/local-first-manifests"
    write_json(payload_path, payload)

    with pytest.raises(ValueError, match="duplicates existing item"):
        finalize_public_run(result.public_root, payload_path=payload_path)
