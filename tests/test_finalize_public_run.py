from __future__ import annotations

from pathlib import Path

import pytest

from collector.finalize_public_run import finalize_public_run
from collector.jsonio import read_json, sha256_file, write_json
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
