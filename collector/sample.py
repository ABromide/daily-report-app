from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from collector.archive import write_archive_record
from collector.article_html import render_article_html
from collector.jsonio import JsonObject, sha256_file, write_json, write_jsonl
from collector.manifest import build_manifest
from collector.sample_source import (
    SAMPLE_DATE,
    SAMPLE_GENERATED_AT,
    SAMPLE_PERIOD_END,
    known_link_entries,
    load_source_index,
    sample_items,
)


@dataclass(frozen=True)
class SampleGenerationResult:
    output_root: Path
    public_root: Path
    latest_path: Path
    manifest_path: Path
    manifest_sha256: str
    archive_record_path: Path


def _reset_generated_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def _date_parts() -> tuple[str, str, str]:
    year, month, day = SAMPLE_DATE.split("-")
    return year, month, day


def _hourly_report(items: list[JsonObject]) -> JsonObject:
    item_ids = [str(item["item_id"]) for item in items]
    return {
        "version": 1,
        "report_id": "hourly:2026-06-06T00:00:00Z",
        "generated_at": SAMPLE_GENERATED_AT,
        "period": {
            "start": SAMPLE_GENERATED_AT,
            "end": SAMPLE_PERIOD_END,
        },
        "item_count": len(items),
        "top_item_ids": item_ids,
        "summary": "Three deterministic public research signals were collected for fixture validation.",
        "sections": [
            {
                "heading": "Agent research signals",
                "summary": "Tool planning, evidence-based evaluation, and manifest-backed sync all appear in the sample batch.",
                "item_ids": item_ids,
            }
        ],
    }


def _daily_report(items: list[JsonObject]) -> JsonObject:
    item_ids = [str(item["item_id"]) for item in items]
    return {
        "version": 1,
        "date": SAMPLE_DATE,
        "generated_at": SAMPLE_GENERATED_AT,
        "item_count": len(items),
        "top_item_ids": item_ids,
        "summary": "The deterministic daily report exercises item, source, report, and manifest validation without network access.",
        "sections": [
            {
                "heading": "Public data contract",
                "summary": "The sample day covers JSONL items, hourly summaries, daily summaries, and sha256 manifest entries.",
                "item_ids": item_ids,
            }
        ],
        "source_counts": {
            "sample-research-feed": len(items),
        },
    }


def generate_sample(output_root: Path) -> SampleGenerationResult:
    public_root = output_root / "public"
    archive_root = output_root / "archive"
    _reset_generated_dir(public_root)
    _reset_generated_dir(archive_root)

    year, month, day = _date_parts()
    manifest_rel = f"manifests/{year}/{month}/{day}/000000Z.manifest.json"
    items_rel = f"items/{year}/{month}/{day}/items.jsonl"
    hourly_rel = f"reports/hourly/{year}/{month}/{day}/00.json"
    daily_rel = f"reports/daily/{year}/{month}/{day}.json"
    audit_rel = f"audits/{year}/{month}/{day}/sample-20260606t000000z.json"

    items = sample_items()
    source_index = load_source_index()

    sources_path = public_root / "index" / "sources.json"
    known_links_path = public_root / "index" / "known-links.json"
    items_path = public_root / items_rel
    hourly_path = public_root / hourly_rel
    daily_path = public_root / daily_rel
    audit_path = public_root / audit_rel
    days_path = public_root / "index" / "days.json"
    latest_path = public_root / "index" / "latest.json"
    manifest_path = public_root / manifest_rel

    write_json(sources_path, {**source_index, "generated_at": SAMPLE_GENERATED_AT})
    write_json(
        known_links_path,
        {
            "version": 1,
            "updated_at": SAMPLE_GENERATED_AT,
            "links": known_link_entries(items),
        },
    )
    write_jsonl(items_path, items)
    article_paths: list[Path] = []
    for item in items:
        article_path = public_root / str(item["analysis_html_path"])
        article_path.parent.mkdir(parents=True, exist_ok=True)
        article_path.write_text(render_article_html(item), encoding="utf-8")
        article_paths.append(article_path)
    write_json(hourly_path, _hourly_report(items))
    write_json(daily_path, _daily_report(items))
    write_json(
        audit_path,
        {
            "version": 1,
            "run_id": "sample-20260606T000000Z",
            "generated_at": SAMPLE_GENERATED_AT,
            "status": "dry-run",
            "config_path": "config/automation/codex-hourly.zh.json",
            "date_window": {
                "mode": "today_or_current_week",
                "max_age_days": 7,
                "timezone": "Asia/Shanghai",
            },
            "category_counts": {
                "llm-agent": len(items),
                "llm-post-training": 0,
                "ai-safety": 0,
            },
            "dedupe": {
                "ledger_path": "public/index/known-links.json",
                "checked_keys": ["canonical_url", "external_id", "title_hash", "content_hash"],
                "duplicate_candidates": 1,
                "replacement_candidates": 1,
            },
            "written_item_ids": [str(item["item_id"]) for item in items],
            "article_paths": [str(item["analysis_html_path"]) for item in items],
            "sub_agent_reviews": [
                {
                    "agent_id": "scout",
                    "status": "passed",
                    "summary": "确认样例候选满足今天或本周窗口，并完成 canonical_url、title_hash、content_hash 去重。",
                },
                {
                    "agent_id": "deep_reader",
                    "status": "passed",
                    "summary": "按完整公开材料结构生成深读笔记，覆盖总览、逐部分细读、证据边界和后续追踪。",
                },
                {
                    "agent_id": "method_or_code_analyst",
                    "status": "passed",
                    "summary": "把样例信号拆成方法或系统流程，并解释它在固定分类中的位置。",
                },
                {
                    "agent_id": "skeptic",
                    "status": "passed",
                    "summary": "检查重复、日期窗口和过度解释风险，保留边界说明。",
                },
                {
                    "agent_id": "html_editor",
                    "status": "passed",
                    "summary": "写入完整 HTML 分析稿，正文不依赖 item JSON 字段。",
                },
            ],
            "quality_gate": {
                "minimum_chinese_chars": 3500,
                "minimum_sections": 10,
                "evidence_points": 5,
                "skeptical_review": 3,
                "passed": True,
            },
        },
    )
    write_json(
        days_path,
        {
            "version": 1,
            "generated_at": SAMPLE_GENERATED_AT,
            "days": [
                {
                    "date": SAMPLE_DATE,
                    "item_count": len(items),
                    "hourly_report_count": 1,
                    "items_path": items_rel,
                    "daily_report_path": daily_rel,
                    "manifest_path": manifest_rel,
                }
            ],
        },
    )

    manifest = build_manifest(
        public_root,
        SAMPLE_GENERATED_AT,
        [
            days_path,
            known_links_path,
            sources_path,
            items_path,
            hourly_path,
            daily_path,
            audit_path,
            *article_paths,
        ],
    )
    write_json(manifest_path, manifest)
    manifest_sha256 = sha256_file(manifest_path)
    write_json(
        latest_path,
        {
            "version": 1,
            "generated_at": SAMPLE_GENERATED_AT,
            "latest_day": SAMPLE_DATE,
            "manifest_path": manifest_rel,
            "manifest_sha256": manifest_sha256,
        },
    )

    archive_record_path = write_archive_record(
        archive_root,
        run_id="sample-20260606T000000Z",
        generated_at=SAMPLE_GENERATED_AT,
        manifest_path=manifest_rel,
        manifest_sha256=manifest_sha256,
        item_count=len(items),
    )
    return SampleGenerationResult(
        output_root=output_root,
        public_root=public_root,
        latest_path=latest_path,
        manifest_path=manifest_path,
        manifest_sha256=manifest_sha256,
        archive_record_path=archive_record_path,
    )
