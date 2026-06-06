from __future__ import annotations

from collector.jsonio import canonical_json_bytes
from collector.sample_source import dedupe_items, raw_sample_items


def test_duplicate_item_stability_across_input_order() -> None:
    raw_items = raw_sample_items()
    first = dedupe_items(raw_items)
    second = dedupe_items(list(reversed(raw_items)))

    assert [item["id"] for item in first] == [item["id"] for item in second]
    assert [item["fingerprint"] for item in first] == [item["fingerprint"] for item in second]
    assert [canonical_json_bytes(item) for item in first] == [
        canonical_json_bytes(item) for item in second
    ]
    assert len({item["id"] for item in first}) == len(first)
