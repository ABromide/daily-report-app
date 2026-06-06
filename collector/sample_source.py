from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Iterable

from collector.jsonio import JsonObject, canonical_json_bytes, read_json, sha256_bytes
from collector.paths import SOURCE_CONFIG_ROOT

SAMPLE_DATE = "2026-06-06"
SAMPLE_GENERATED_AT = "2026-06-06T00:00:00Z"
SAMPLE_PERIOD_END = "2026-06-06T01:00:00Z"


def load_source_index(config_root: Path = SOURCE_CONFIG_ROOT) -> JsonObject:
    return read_json(config_root / "deterministic-sample.json")


def raw_sample_items() -> list[JsonObject]:
    source_id = "sample-research-feed"
    collected_at = SAMPLE_GENERATED_AT
    return [
        {
            "source_id": source_id,
            "title": "Small language models gain reliable tool planning",
            "url": "https://example.com/research/small-model-tool-planning",
            "published_at": "2026-06-06T00:05:00Z",
            "collected_at": collected_at,
            "summary": "A deterministic sample signal about compact models improving multi-step tool use.",
            "tags": ["agents", "tool-use", "small-models"],
            "score": 93,
        },
        {
            "source_id": source_id,
            "title": "Evaluation harnesses move toward evidence bundles",
            "url": "https://example.com/research/evidence-bundle-evals",
            "published_at": "2026-06-06T00:18:00Z",
            "collected_at": collected_at,
            "summary": "A deterministic sample signal about evaluation reports carrying reproducible evidence.",
            "tags": ["evals", "evidence", "quality"],
            "score": 88,
        },
        {
            "source_id": source_id,
            "title": "Local-first research readers adopt manifest checks",
            "url": "https://example.com/research/local-first-manifests",
            "published_at": "2026-06-06T00:42:00Z",
            "collected_at": collected_at,
            "summary": "A deterministic sample signal about offline clients verifying public data manifests.",
            "tags": ["local-first", "manifests", "sync"],
            "score": 84,
        },
        {
            "source_id": source_id,
            "title": "Small language models gain reliable tool planning",
            "url": "https://example.com/research/small-model-tool-planning",
            "published_at": "2026-06-06T00:05:00Z",
            "collected_at": collected_at,
            "summary": "A deterministic duplicate variant that should collapse to the same fingerprint.",
            "tags": ["agents", "small-models", "tool-use"],
            "score": 92,
        },
    ]


def item_identity(raw_item: JsonObject) -> JsonObject:
    return {
        "published_at": raw_item["published_at"],
        "source_id": raw_item["source_id"],
        "title": raw_item["title"],
        "url": raw_item["url"],
    }


def item_fingerprint(raw_item: JsonObject) -> str:
    return sha256_bytes(canonical_json_bytes(item_identity(raw_item)))


def normalize_item(raw_item: JsonObject) -> JsonObject:
    fingerprint = item_fingerprint(raw_item)
    item = deepcopy(raw_item)
    item["fingerprint"] = fingerprint
    item["id"] = f"itm_{fingerprint[:16]}"
    item["tags"] = sorted(set(str(tag) for tag in raw_item["tags"]))
    item["evidence"] = [
        {
            "type": "url",
            "label": "Source URL",
            "url": raw_item["url"],
        }
    ]
    return item


def dedupe_items(items: Iterable[JsonObject]) -> list[JsonObject]:
    by_fingerprint: dict[str, JsonObject] = {}
    for raw_item in items:
        normalized = normalize_item(raw_item)
        fingerprint = str(normalized["fingerprint"])
        previous = by_fingerprint.get(fingerprint)
        if previous is None or canonical_json_bytes(normalized) < canonical_json_bytes(previous):
            by_fingerprint[fingerprint] = normalized
    return sorted(
        by_fingerprint.values(),
        key=lambda item: (str(item["published_at"]), str(item["id"])),
    )


def sample_items() -> list[JsonObject]:
    return dedupe_items(raw_sample_items())
