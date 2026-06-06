from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Callable, Protocol, Sequence, cast

import pytest

import collector.publish_public_run as publish_module
from collector.jsonio import read_json, sha256_file, write_json
from collector.publish_public_run import CommandResult, automation_preflight, publish_public_run
from collector.sample import generate_sample


class RunCommand(Protocol):
    def __call__(self, command: Sequence[str], *, input_text: str | None = None) -> CommandResult: ...


def _git(worktree: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(worktree), *args],
        text=True,
        capture_output=True,
        check=True,
    )
    return completed.stdout.strip()


def _write_payload(public_root: Path, payload_path: Path) -> Path:
    item_id = "itm_0011223344556677"
    article_rel = f"articles/2026/06/06/{item_id}/index.md"
    article_path = public_root / article_rel
    article_path.parent.mkdir(parents=True, exist_ok=True)
    article_path.write_text(
        "# Publish public run test\n\n"
        "## TL;DR\n\n"
        "This test verifies the one-command automation publishing path.\n",
        encoding="utf-8",
    )
    write_json(
        payload_path,
        {
            "run_id": "codex-hourly-20260606t030000z",
            "generated_at": "2026-06-06T03:00:00Z",
            "items": [
                {
                    "item_id": item_id,
                    "category_id": "llm-agent",
                    "type": "code",
                    "source_id": "publish-source",
                    "source_name": "Publish Source",
                    "source_type": "manual",
                    "external_id": "publish-source:001",
                    "title": "Publish public run test item",
                    "url": "https://example.com/publish-public-run",
                    "canonical_url": "https://example.com/publish-public-run",
                    "published_at": "2026-06-06T03:00:00Z",
                    "fetched_at": "2026-06-06T03:00:00Z",
                    "summary_zh": "用于测试 publish-public-run 的一键发布条目。",
                    "analysis_markdown_path": article_rel,
                    "tags": ["test", "publish"],
                    "content_hash": sha256_file(article_path),
                }
            ],
            "sources": [
                {
                    "id": "publish-source",
                    "name": "Publish Source",
                    "kind": "manual",
                    "homepage_url": "https://example.com/publish-public-run",
                    "enabled": True,
                    "description": "Fixture source for publish-public-run.",
                }
            ],
            "quality_gate": {
                "minimum_chinese_chars": 5000,
                "evidence_points": 1,
                "image_notes": 0,
                "third_party_references": 1,
                "skeptical_review": 3,
                "passed": True,
            },
        },
    )
    return payload_path


def test_automation_preflight_checks_local_git_worktree(tmp_path: Path) -> None:
    sample = generate_sample(tmp_path / "data")
    data_worktree = sample.public_root.parent
    _git(data_worktree, "init", "-b", "data")
    _git(data_worktree, "config", "user.email", "test@example.com")
    _git(data_worktree, "config", "user.name", "Daily Report Test")
    _git(data_worktree, "add", "-A")
    _git(data_worktree, "commit", "-m", "data: initial")

    result = automation_preflight(
        public_root=sample.public_root,
        data_worktree=data_worktree,
        remote_checks=False,
    )

    assert "git worktree: ok" in result.checks
    assert "branch: data" in result.checks
    assert "status: clean" in result.checks


def test_publish_public_run_finalizes_and_commits_without_remote_side_effects(tmp_path: Path) -> None:
    sample = generate_sample(tmp_path / "data")
    data_worktree = sample.public_root.parent
    _git(data_worktree, "init", "-b", "data")
    _git(data_worktree, "config", "user.email", "test@example.com")
    _git(data_worktree, "config", "user.name", "Daily Report Test")
    _git(data_worktree, "add", "-A")
    _git(data_worktree, "commit", "-m", "data: initial")
    initial_sha = _git(data_worktree, "rev-parse", "HEAD")
    payload_path = _write_payload(sample.public_root, tmp_path / "publish-payload.json")

    result = publish_public_run(
        public_root=sample.public_root,
        data_worktree=data_worktree,
        payload_path=payload_path,
        run_id="codex-hourly-20260606t030000z",
        commit_message="data: publish test item",
        push=False,
        dispatch=False,
        remote_checks=False,
    )

    assert result.committed is True
    assert result.pushed is False
    assert result.dispatched is False
    assert result.commit_sha != initial_sha
    assert _git(data_worktree, "status", "--short") == ""
    audit = read_json(sample.public_root / "audits/2026/06/06/codex-hourly-20260606t030000z.json")
    assert audit["written_item_ids"] == ["itm_0011223344556677"]


def test_automation_preflight_retries_remote_check_without_dead_local_proxy(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sample = generate_sample(tmp_path / "data")
    data_worktree = sample.public_root.parent
    _git(data_worktree, "init", "-b", "data")
    _git(data_worktree, "config", "user.email", "test@example.com")
    _git(data_worktree, "config", "user.name", "Daily Report Test")
    _git(data_worktree, "add", "-A")
    _git(data_worktree, "commit", "-m", "data: initial")
    real_run = cast(RunCommand, getattr(publish_module, "_run"))
    real_run_optional = cast(Callable[[Sequence[str]], CommandResult], getattr(publish_module, "_run_optional"))

    def fake_run(command: Sequence[str], *, input_text: str | None = None) -> CommandResult:
        if "ls-remote" in command and "http.proxy=" in command:
            return CommandResult(tuple(command), 0, "deadbeef\trefs/heads/data\n", "")
        return real_run(command, input_text=input_text)

    def fake_run_optional(command: Sequence[str]) -> CommandResult:
        if "ls-remote" in command and "http.proxy=" not in command:
            return CommandResult(
                tuple(command),
                128,
                "",
                "fatal: unable to access 'https://github.com/example/repo.git/': "
                "Failed to connect to 127.0.0.1 port 17891",
            )
        return real_run_optional(command)

    monkeypatch.setattr(publish_module, "_run", fake_run)
    monkeypatch.setattr(publish_module, "_run_optional", fake_run_optional)

    result = automation_preflight(
        public_root=sample.public_root,
        data_worktree=data_worktree,
        remote_checks=True,
    )

    assert "origin/data: reachable without git proxy" in result.checks
