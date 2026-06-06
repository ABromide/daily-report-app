from __future__ import annotations

from collector.jsonio import canonical_json_bytes
from collector.sample_source import dedupe_items, known_link_entries, raw_sample_items


def test_duplicate_item_stability_across_input_order() -> None:
    raw_items = raw_sample_items()
    first = dedupe_items(raw_items)
    second = dedupe_items(list(reversed(raw_items)))

    assert [item["item_id"] for item in first] == [item["item_id"] for item in second]
    assert [item["content_hash"] for item in first] == [item["content_hash"] for item in second]
    assert [canonical_json_bytes(item) for item in first] == [
        canonical_json_bytes(item) for item in second
    ]
    assert len({item["item_id"] for item in first}) == len(first)


def test_known_link_ledger_has_unique_dedupe_keys() -> None:
    entries = known_link_entries(dedupe_items(raw_sample_items()))

    assert len({entry["canonical_url"] for entry in entries}) == len(entries)
    assert len({entry["title_hash"] for entry in entries}) == len(entries)
    assert len({entry["content_hash"] for entry in entries}) == len(entries)
    assert {entry["category_id"] for entry in entries} == {"llm-agent"}
