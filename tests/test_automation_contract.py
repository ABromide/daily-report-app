from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = REPO_ROOT / "config" / "automation" / "codex-hourly.zh.json"


def test_chinese_automation_contract_is_recent_deduped_and_categorized() -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

    category_ids = [category["id"] for category in contract["categories"]]
    assert category_ids == ["llm-agent", "llm-post-training", "ai-safety"]
    assert contract["language"] == "zh-CN"
    assert contract["date_window"]["max_age_days"] <= 7
    assert "今天或本周" in contract["date_window"]["rule"]
    assert contract["dedupe"]["ledger_path"] == "public/index/known-links.json"
    assert "canonical_url" in contract["dedupe"]["keys"]
    assert "重复" in contract["dedupe"]["rule"]
    assert "替代" in contract["dedupe"]["rule"]
    assert "category_id" in contract["output_contract"]["required_item_fields"]
    assert "visual" in contract["output_contract"]["required_item_fields"]
    assert "analysis_html_path" in contract["output_contract"]["required_item_fields"]
    assert contract["analysis_requirements"]["minimum_sections"] >= 6
    assert "逐部分细读" in contract["analysis_requirements"]["required_sections"]
    assert "完整原文" in contract["analysis_requirements"]["depth_rule"]
    assert "article_paths" in contract["audit_contract"]["required_fields"]
    assert "validate-public" in contract["codex_prompt_zh"]
    assert "secret-scan" in contract["codex_prompt_zh"]
    assert "深度分析文件" in contract["codex_prompt_zh"]
