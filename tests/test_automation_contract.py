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
    assert "itm_<16位小写hex>" in contract["output_contract"]["item_id_format"]
    assert "不要使用" in contract["output_contract"]["item_id_format"]
    assert contract["analysis_requirements"]["mode"] == "depth_first"
    assert contract["analysis_requirements"]["minimum_chinese_chars"] >= 5000
    assert contract["analysis_requirements"]["style_reference"]["url"] == "https://www.mlpod.com/1548.html"
    assert "MLPod" in contract["analysis_requirements"]["style_reference"]["name"]
    assert "automation_tools" in contract
    assert "publish-public-run.sh" in contract["automation_tools"]["publish"]["command"]
    assert "真实删除" in contract["automation_tools"]["publish"]["purpose"]
    assert "make-item-id.sh" in contract["automation_tools"]["item_id"]["command"]
    assert "schema-safe" in contract["automation_tools"]["item_id"]["purpose"]
    assert "automation-preflight.sh" in contract["automation_tools"]["preflight"]["command"]
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
    assert "来源与材料地图" not in contract["analysis_requirements"]["suggested_sections"]
    assert "作者论证路线" in contract["analysis_requirements"]["suggested_sections"]
    assert "问题意识或研究问题" in contract["analysis_requirements"]["suggested_sections"]
    assert "图表、公式或伪代码" in contract["analysis_requirements"]["suggested_sections"]
    assert "领域延伸与继续追问" in contract["analysis_requirements"]["suggested_sections"]
    assert "研究者视角" in contract["analysis_requirements"]["research_reading_rule"]
    assert "claim → mechanism → evidence → boundary" in contract["analysis_requirements"]["research_reading_rule"]
    assert "不要写 Daily Report 产品化启发" in contract["analysis_requirements"]["research_reading_rule"]
    assert "完整公开原文" in contract["analysis_requirements"]["depth_rule"]
    assert "summary_zh" in contract["analysis_requirements"]["summary_rule"]
    assert "自包含" in contract["analysis_requirements"]["summary_rule"]
    assert "detail_extraction_rule" in contract["analysis_requirements"]
    assert "benchmark" in contract["analysis_requirements"]["detail_extraction_rule"]
    assert "伪代码" in contract["analysis_requirements"]["detail_extraction_rule"]
    assert "markdown_layout_rule" in contract["analysis_requirements"]
    assert "Mermaid" in contract["analysis_requirements"]["markdown_layout_rule"]
    assert "README" in contract["analysis_requirements"]["code_rule"]
    assert "论文主张与论证路线" in contract["analysis_requirements"]["paper_rule"]
    assert "Figure/Table" in contract["analysis_requirements"]["paper_rule"]
    assert "公式" in contract["analysis_requirements"]["paper_rule"]
    assert "Input、State、循环、条件、Output 和失败边界" in contract["analysis_requirements"]["paper_rule"]
    assert "不要编造实验" in contract["analysis_requirements"]["blog_rule"]
    assert "作者如何展开问题" in contract["analysis_requirements"]["blog_rule"]
    assert "不要硬套论文审稿" in contract["analysis_requirements"]["blog_rule"]
    assert "短摘录" in contract["analysis_requirements"]["blog_rule"]
    assert "单条不超过 25" in contract["analysis_requirements"]["blog_rule"]
    assert "type_templates" not in contract["analysis_requirements"]
    assert "paper" in contract["analysis_requirements"]["type_guidance"]
    assert "blog_or_report" in contract["analysis_requirements"]["type_guidance"]
    assert "code" in contract["analysis_requirements"]["type_guidance"]
    assert "图片不是正文目标" in contract["analysis_requirements"]["image_rule"]
    assert "不要单独写来源页或本地附件页" in contract["analysis_requirements"]["image_rule"]
    assert "不要列素材地址" in contract["analysis_requirements"]["image_rule"]
    assert "第三方解读" in contract["analysis_requirements"]["reference_search_rule"]
    assert "Markdown" in contract["analysis_requirements"]["format"]
    assert "public/articles/YYYY/MM/DD/ITEM_ID/index.md" in contract["analysis_requirements"]["format"]
    assert any("5000 中文字" in gate for gate in contract["analysis_requirements"]["quality_gate"])
    assert any("TL;DR" in gate for gate in contract["analysis_requirements"]["quality_gate"])
    assert any("每个关键设计" in gate for gate in contract["analysis_requirements"]["quality_gate"])
    assert any("claim → mechanism → evidence → boundary" in gate for gate in contract["analysis_requirements"]["quality_gate"])
    assert any("领域延伸思考" in gate for gate in contract["analysis_requirements"]["quality_gate"])
    assert "article_paths" in contract["audit_contract"]["required_fields"]
    assert "sub_agent_reviews" in contract["audit_contract"]["required_fields"]
    assert "quality_gate" in contract["audit_contract"]["required_fields"]
    sub_agent_ids = [agent["id"] for agent in contract["sub_agents"]]
    assert sub_agent_ids == ["scout"]
    assert "一次性覆盖" in contract["sub_agents"][0]["responsibility"]
    assert "不要按方向拆成多个 Agent" in contract["sub_agents"][0]["responsibility"]
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
    assert "研究问题" in prompt_text
    assert "claim → mechanism → evidence → boundary" in prompt_text
    assert "博客或报告，不要硬套论文审稿" in prompt_text
    assert "研究者视角" in prompt_text
    assert "不要写 Daily Report 产品化启发" in prompt_text
    assert "伪代码要写清" in prompt_text
    assert "detail_inventory" in prompt_text
    assert "TL;DR 与 summary_zh 必须自包含" in prompt_text
    assert "默认分点写" in prompt_text
    assert "连续两段以上纯文本" in prompt_text
    assert "Mermaid 图" in prompt_text
    assert "publish-public-run" in prompt_text
    assert "finalize-public-run" in prompt_text
    assert "不要运行 rm" in prompt_text
    assert "public/.automation-trash" in prompt_text
    assert "不要单独写“来源与材料地图”“来源与本地附件”等章节" in prompt_text
    assert "不要为了界面填充而写很多素材地址" in prompt_text
    assert "素材记录留在 payload/audit" in prompt_text
    assert "不要手工展开" in prompt_text
    assert any("图表取舍" in step["name"] for step in prompt["steps"])
    assert any("从候选表选择 1 篇" in " ".join(step["instructions"]) for step in prompt["steps"])
    assert "只启动一个 Scout Agent" in prompt_text
    assert "一次性搜索三个方向" in prompt_text
    assert "不要按方向拆成三个 Agent" in prompt_text
    assert "主 Agent 从候选表选择" in prompt_text
    assert "make-item-id" in prompt_text
    assert "itm_<16位小写hex>" in prompt_text
    assert "不要用可读 slug" in prompt_text
