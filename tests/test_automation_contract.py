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
    required_item_fields = contract["output_contract"]["required_item_fields"]
    assert "category_id" in required_item_fields
    assert "analysis_html_path" in required_item_fields
    assert "analysis_zh" not in required_item_fields
    assert "visual" not in required_item_fields
    assert contract["analysis_requirements"]["minimum_sections"] >= 6
    assert "逐部分细读" in contract["analysis_requirements"]["required_sections"]
    assert "完整原文" in contract["analysis_requirements"]["depth_rule"]
    assert "原始图片链接" in contract["analysis_requirements"]["image_rule"]
    assert "article_paths" in contract["audit_contract"]["required_fields"]
    prompt = contract["codex_prompt_zh"]
    assert prompt["role"].startswith("你是 Daily Report")
    assert len(prompt["steps"]) >= 8
    assert any("validate-public" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("secret-scan" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("完整文档" in " ".join(step["instructions"]) for step in prompt["steps"])
