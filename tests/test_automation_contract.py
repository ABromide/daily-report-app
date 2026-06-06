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
    assert "analysis_markdown_path" in required_item_fields
    assert "analysis_zh" not in required_item_fields
    assert "visual" not in required_item_fields
    assert contract["analysis_requirements"]["mode"] == "depth_first"
    assert contract["analysis_requirements"]["minimum_chinese_chars"] >= 5000
    assert contract["analysis_requirements"]["style_reference"]["url"] == "https://www.mlpod.com/1548.html"
    assert "MLPod" in contract["analysis_requirements"]["style_reference"]["name"]
    assert "论文或项目元信息" in contract["analysis_requirements"]["required_sections"]
    assert "按内容类型选择正文结构" in contract["analysis_requirements"]["required_sections"]
    assert "5. 图表与图片解读" in contract["analysis_requirements"]["required_sections"]
    assert "6. 讨论、相关工作与第三方解读" in contract["analysis_requirements"]["required_sections"]
    assert "审稿式结论" in contract["analysis_requirements"]["required_sections"]
    assert "完整原文" in contract["analysis_requirements"]["depth_rule"]
    assert "README" in contract["analysis_requirements"]["code_rule"]
    assert "figures/tables" in contract["analysis_requirements"]["paper_rule"]
    assert "不能硬套论文模板" in contract["analysis_requirements"]["blog_rule"]
    assert "逐段总结" in contract["analysis_requirements"]["blog_rule"]
    assert "短摘录" in contract["analysis_requirements"]["blog_rule"]
    assert "单条不超过 25" in contract["analysis_requirements"]["blog_rule"]
    assert "不要给博客编造论文式实验" in " ".join(
        instruction
        for step in contract["codex_prompt_zh"]["steps"]
        for instruction in step["instructions"]
    )
    assert "不要把博客写成审稿式证据链" in " ".join(
        instruction
        for step in contract["codex_prompt_zh"]["steps"]
        for instruction in step["instructions"]
    )
    assert "paper" in contract["analysis_requirements"]["type_templates"]
    assert "blog_or_report" in contract["analysis_requirements"]["type_templates"]
    assert "code" in contract["analysis_requirements"]["type_templates"]
    assert "原始图片链接" in contract["analysis_requirements"]["image_rule"]
    assert "每张图片必须配中文说明" in contract["analysis_requirements"]["image_rule"]
    assert "第三方解读" in contract["analysis_requirements"]["reference_search_rule"]
    assert "Markdown" in contract["analysis_requirements"]["format"]
    assert "公式" in contract["analysis_requirements"]["format"]
    assert "5000 字" in contract["analysis_requirements"]["format"]
    assert any("image_notes" in gate for gate in contract["analysis_requirements"]["quality_gate"])
    assert any("third_party_references" in gate for gate in contract["analysis_requirements"]["quality_gate"])
    assert any("skeptical_review" in gate for gate in contract["analysis_requirements"]["quality_gate"])
    assert "article_paths" in contract["audit_contract"]["required_fields"]
    assert "sub_agent_reviews" in contract["audit_contract"]["required_fields"]
    assert "quality_gate" in contract["audit_contract"]["required_fields"]
    sub_agent_ids = [agent["id"] for agent in contract["sub_agents"]]
    assert sub_agent_ids == [
        "scout",
        "deep_reader",
        "method_or_code_analyst",
        "skeptic",
        "related_work",
        "markdown_editor",
    ]
    prompt = contract["codex_prompt_zh"]
    assert prompt["role"].startswith("你是 Daily Report")
    assert len(prompt["steps"]) >= 11
    assert any("validate-public" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("secret-scan" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("index.md" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("纯 Markdown" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("MLPod" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("第三方解读" in step["name"] for step in prompt["steps"])
    assert any("不少于 5000 字" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("Markdown 图片语法" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("子 Agent" in step["name"] for step in prompt["steps"])
    assert any("优先选择 1 篇" in " ".join(step["instructions"]) for step in prompt["steps"])
