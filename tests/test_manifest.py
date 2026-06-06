from __future__ import annotations

from pathlib import Path

from collector.jsonio import read_json, sha256_file
from collector.sample import generate_sample
from collector.validation import format_issues, validate_public


def test_latest_manifest_sha256_matches_generated_manifest(tmp_path: Path) -> None:
    result = generate_sample(tmp_path / "sample")
    latest = read_json(result.latest_path)

    assert latest["manifest_path"] == result.manifest_path.relative_to(result.public_root).as_posix()
    assert latest["manifest_sha256"] == sha256_file(result.manifest_path)


def test_sample_manifest_is_deterministic(tmp_path: Path) -> None:
    first = generate_sample(tmp_path / "first")
    second = generate_sample(tmp_path / "second")

    assert first.manifest_sha256 == second.manifest_sha256
    assert read_json(first.manifest_path) == read_json(second.manifest_path)


def test_sample_manifest_contains_article_markdown_and_audit_record(tmp_path: Path) -> None:
    result = generate_sample(tmp_path / "sample")
    manifest = read_json(result.manifest_path)
    paths = {str(entry["path"]) for entry in manifest["files"]}

    assert "audits/2026/06/06/sample-20260606t000000z.json" in paths
    assert any(path.startswith("articles/2026/06/06/itm_") and path.endswith("/index.md") for path in paths)

    report = validate_public(result.public_root)
    assert report.ok, format_issues(report.issues)

    article_path = next(result.public_root.glob("articles/2026/06/06/*/index.md"))
    article_markdown = article_path.read_text(encoding="utf-8")
    assert "[打开原文]" in article_markdown
    assert "$$" in article_markdown
    assert "来源与材料地图" in article_markdown
    assert "代码或项目结构深挖" in article_markdown
    assert "审稿式结论" in article_markdown
