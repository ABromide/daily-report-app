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
    assert "bootstrap 空账本" in contract["dedupe"]["rule"]
    required_item_fields = contract["output_contract"]["required_item_fields"]
    assert "category_id" in required_item_fields
    assert "analysis_markdown_path" in required_item_fields
    assert "analysis_zh" not in required_item_fields
    assert "visual" not in required_item_fields
    assert contract["analysis_requirements"]["mode"] == "depth_first"
    assert contract["analysis_requirements"]["minimum_chinese_chars"] >= 5000
    assert contract["analysis_requirements"]["style_reference"]["url"] == "https://www.mlpod.com/1548.html"
    assert "MLPod" in contract["analysis_requirements"]["style_reference"]["name"]
    assert "automation_tools" in contract
    assert "publish-public-run.sh" in contract["automation_tools"]["publish"]["command"]
    assert "真实删除" in contract["automation_tools"]["publish"]["purpose"]
    assert "automation-preflight" in contract["automation_tools"]["preflight"]["command"]
    assert "127.0.0.1:17891" in contract["automation_tools"]["preflight"]["purpose"]
    assert contract["automation_tools"]["delete_policy"]["soft_delete_dir"].startswith(".automation-trash")
    assert "不允许真实删除" in contract["automation_tools"]["delete_policy"]["rule"]
    assert "staged deletion" in contract["automation_tools"]["delete_policy"]["publish_guard"]
    assert "不要手工拼接 git add/commit/push/dispatch" in " ".join(
        contract["automation_tools"]["forbidden_manual_steps"]
    )
    assert "public/index/known-links.json" in " ".join(contract["automation_tools"]["forbidden_manual_steps"])
    assert ".automation-trash" in " ".join(contract["automation_tools"]["forbidden_manual_steps"])
    assert "required_sections" not in contract["analysis_requirements"]
    assert contract["analysis_requirements"]["suggested_section_count"] >= 8
    assert "元信息与 TL;DR" in contract["analysis_requirements"]["suggested_sections"]
    assert "方法、公式与流程" in contract["analysis_requirements"]["suggested_sections"]
    assert "本地附件图片、Figure 与 Table 解读" in contract["analysis_requirements"]["suggested_sections"]
    assert "实验、结果与消融" in contract["analysis_requirements"]["suggested_sections"]
    assert "结论与后续追踪" in contract["analysis_requirements"]["suggested_sections"]
    assert "完整公开原文" in contract["analysis_requirements"]["depth_rule"]
    assert "summary_zh" in contract["analysis_requirements"]["summary_rule"]
    assert "自包含" in contract["analysis_requirements"]["summary_rule"]
    assert "detail_extraction_rule" in contract["analysis_requirements"]
    assert "benchmark" in contract["analysis_requirements"]["detail_extraction_rule"]
    assert "markdown_layout_rule" in contract["analysis_requirements"]
    assert "Mermaid" in contract["analysis_requirements"]["markdown_layout_rule"]
    assert "README" in contract["analysis_requirements"]["code_rule"]
    assert "背景与问题" in contract["analysis_requirements"]["paper_rule"]
    assert "Figure/Table" in contract["analysis_requirements"]["paper_rule"]
    assert "公式" in contract["analysis_requirements"]["paper_rule"]
    assert "不要编造实验" in contract["analysis_requirements"]["blog_rule"]
    assert "逐段解释" in contract["analysis_requirements"]["blog_rule"]
    assert "短摘录" in contract["analysis_requirements"]["blog_rule"]
    assert "单条不超过 25" in contract["analysis_requirements"]["blog_rule"]
    assert "type_templates" not in contract["analysis_requirements"]
    assert "paper" in contract["analysis_requirements"]["type_guidance"]
    assert "blog_or_report" in contract["analysis_requirements"]["type_guidance"]
    assert "code" in contract["analysis_requirements"]["type_guidance"]
    assert "不直接用外部图片 URL" in contract["analysis_requirements"]["image_rule"]
    assert "public/assets/YYYY/MM/DD/ITEM_ID/" in contract["analysis_requirements"]["image_rule"]
    assert "sha256" in contract["analysis_requirements"]["image_rule"]
    assert "第三方解读" in contract["analysis_requirements"]["reference_search_rule"]
    assert "Markdown" in contract["analysis_requirements"]["format"]
    assert "public/articles/YYYY/MM/DD/ITEM_ID/index.md" in contract["analysis_requirements"]["format"]
    assert any("5000 中文字" in gate for gate in contract["analysis_requirements"]["quality_gate"])
    assert any("image_notes" in gate for gate in contract["analysis_requirements"]["quality_gate"])
    assert any("TL;DR" in gate for gate in contract["analysis_requirements"]["quality_gate"])
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
    assert len(prompt["steps"]) <= 7
    assert any("只读取 config/automation/codex-hourly.zh.json" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("不要读取本仓库 README" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("validate-public" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("secret-scan" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("index.md" in " ".join(step["instructions"]) for step in prompt["steps"])
    prompt_text = " ".join(
        instruction
        for step in prompt["steps"]
        for instruction in step["instructions"]
    )
    assert "纯 Markdown" in prompt_text
    assert "背景与研究问题" in prompt_text
    assert "按这个正文顺序写" in prompt_text
    assert "必须尽可能多写公式" in prompt_text
    assert "detail_inventory" in prompt_text
    assert "TL;DR 与 summary_zh 必须自包含" in prompt_text
    assert "默认分点写" in prompt_text
    assert "连续两段以上纯文本" in prompt_text
    assert "Mermaid 图" in prompt_text
    assert "publish-public-run" in prompt_text
    assert "finalize-public-run" in prompt_text
    assert "不要运行 rm" in prompt_text
    assert "public/.automation-trash" in prompt_text
    assert "所有用于展示的图片都必须先下载到 public/assets" in prompt_text
    assert "不要把外部图片 URL 直接放进 Markdown 图片语法" in prompt_text
    assert "不要手工展开" in prompt_text
    assert any("Markdown 图片语法" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert any("优先选择 1 篇" in " ".join(step["instructions"]) for step in prompt["steps"])
