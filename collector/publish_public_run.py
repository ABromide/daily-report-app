from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from collector.finalize_public_run import FinalizePublicRunResult, finalize_public_run


DEFAULT_REPO = "ABromide/daily-report-app"
DEFAULT_BRANCH = "data"


@dataclass(frozen=True)
class CommandResult:
    command: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str

    @property
    def output(self) -> str:
        return "\n".join(part for part in (self.stdout.strip(), self.stderr.strip()) if part)


@dataclass(frozen=True)
class PreflightResult:
    public_root: Path
    data_worktree: Path
    checks: tuple[str, ...]


@dataclass(frozen=True)
class PublishPublicRunResult:
    finalize: FinalizePublicRunResult
    data_worktree: Path
    committed: bool
    commit_sha: str
    pushed: bool
    dispatched: bool
    checks: tuple[str, ...]


class PublishPublicRunError(ValueError):
    pass


def _run(command: Sequence[str], *, input_text: str | None = None) -> CommandResult:
    completed = subprocess.run(
        list(command),
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
    )
    result = CommandResult(
        command=tuple(command),
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )
    if result.returncode != 0:
        rendered = " ".join(result.command)
        msg = f"command failed ({result.returncode}): {rendered}"
        if result.output:
            msg = f"{msg}\n{result.output}"
        raise PublishPublicRunError(msg)
    return result


def _run_optional(command: Sequence[str]) -> CommandResult:
    completed = subprocess.run(
        list(command),
        text=True,
        capture_output=True,
        check=False,
    )
    return CommandResult(
        command=tuple(command),
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )


def _git(data_worktree: Path, *args: str) -> CommandResult:
    return _run(["git", "-C", str(data_worktree), *args])


def _git_optional(data_worktree: Path, *args: str) -> CommandResult:
    return _run_optional(["git", "-C", str(data_worktree), *args])


def _git_without_proxy(data_worktree: Path, *args: str) -> CommandResult:
    return _run(["git", "-C", str(data_worktree), "-c", "http.proxy=", "-c", "https.proxy=", *args])


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
    except ValueError:
        return False
    return True


def _is_local_proxy_failure(result: CommandResult) -> bool:
    output = result.output.casefold()
    return "127.0.0.1" in output and (
        "proxy" in output
        or "failed to connect" in output
        or "couldn't connect" in output
        or "connection refused" in output
    )


def _raise_command_failure(result: CommandResult) -> None:
    rendered = " ".join(result.command)
    msg = f"command failed ({result.returncode}): {rendered}"
    if result.output:
        msg = f"{msg}\n{result.output}"
    raise PublishPublicRunError(msg)


def _check_remote(data_worktree: Path) -> str:
    result = _git_optional(data_worktree, "ls-remote", "--heads", "origin", DEFAULT_BRANCH)
    if result.returncode == 0:
        return f"origin/{DEFAULT_BRANCH}: reachable"
    if _is_local_proxy_failure(result):
        _git_without_proxy(data_worktree, "ls-remote", "--heads", "origin", DEFAULT_BRANCH)
        return f"origin/{DEFAULT_BRANCH}: reachable without git proxy"
    _raise_command_failure(result)
    return f"origin/{DEFAULT_BRANCH}: unreachable"


def automation_preflight(
    *,
    public_root: Path,
    data_worktree: Path,
    repo: str = DEFAULT_REPO,
    remote_checks: bool = True,
) -> PreflightResult:
    checks: list[str] = []
    if not data_worktree.exists():
        msg = f"data worktree does not exist: {data_worktree}"
        raise PublishPublicRunError(msg)
    if not public_root.exists():
        msg = f"public root does not exist: {public_root}"
        raise PublishPublicRunError(msg)
    if not _is_relative_to(public_root, data_worktree):
        msg = f"public root must live inside data worktree: {public_root} is not under {data_worktree}"
        raise PublishPublicRunError(msg)

    inside = _git(data_worktree, "rev-parse", "--is-inside-work-tree").stdout.strip()
    if inside != "true":
        msg = f"not a git worktree: {data_worktree}"
        raise PublishPublicRunError(msg)
    checks.append("git worktree: ok")

    branch = _git(data_worktree, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    checks.append(f"branch: {branch}")

    status = _git(data_worktree, "status", "--short").stdout.strip()
    checks.append(f"status: {'dirty' if status else 'clean'}")

    if remote_checks:
        checks.append(_check_remote(data_worktree))
        if shutil.which("gh") is not None:
            gh_status = _run_optional(["gh", "auth", "status"])
            checks.append("gh auth: ok" if gh_status.returncode == 0 else "gh auth: unavailable")
        else:
            checks.append("gh auth: gh CLI not installed")
        checks.append(f"dispatch repo: {repo}")

    return PreflightResult(public_root=public_root, data_worktree=data_worktree, checks=tuple(checks))


def _commit_message(message: str | None, run_id: str | None) -> str:
    if message:
        return message
    if run_id:
        return f"data: publish {run_id}"
    return "data: publish Daily Report analysis"


def _has_staged_public_changes(data_worktree: Path) -> bool:
    result = _git_optional(data_worktree, "diff", "--cached", "--quiet", "--", "public")
    if result.returncode == 0:
        return False
    if result.returncode == 1:
        return True
    rendered = " ".join(result.command)
    msg = f"command failed ({result.returncode}): {rendered}"
    if result.output:
        msg = f"{msg}\n{result.output}"
    raise PublishPublicRunError(msg)


def _public_deletion_paths(data_worktree: Path) -> tuple[str, ...]:
    paths: list[str] = []
    seen: set[str] = set()
    for args in (
        ("ls-files", "--deleted", "--", "public"),
        ("diff", "--cached", "--diff-filter=D", "--name-only", "--", "public"),
    ):
        result = _git(data_worktree, *args)
        for line in result.stdout.splitlines():
            path = line.strip()
            if path and path not in seen:
                paths.append(path)
                seen.add(path)
    return tuple(paths)


def _assert_no_public_deletions(data_worktree: Path) -> None:
    deletions = _public_deletion_paths(data_worktree)
    if not deletions:
        return
    formatted = "\n".join(f"- {path}" for path in deletions)
    msg = (
        "publish-public-run refuses to publish real deletions under public/.\n"
        "Automation must not delete tracked public data. For untracked scratch files, move them to "
        ".automation-trash/<run-id>/ or public/.automation-trash/<run-id>/ instead; those paths are ignored "
        "by the data branch .gitignore.\n"
        f"Working-tree or staged deletions:\n{formatted}"
    )
    raise PublishPublicRunError(msg)


def _push_command(data_worktree: Path, *, without_proxy: bool) -> list[str]:
    command = ["git", "-C", str(data_worktree)]
    if without_proxy:
        command.extend(["-c", "http.proxy=", "-c", "https.proxy="])
    command.extend(["push", "origin", DEFAULT_BRANCH])
    return command


def _push_with_fallback(data_worktree: Path, *, without_proxy: bool) -> str:
    if without_proxy:
        _run(_push_command(data_worktree, without_proxy=True))
        return "push: sent without git proxy"

    result = _run_optional(_push_command(data_worktree, without_proxy=False))
    if result.returncode == 0:
        return "push: sent"
    if _is_local_proxy_failure(result):
        _run(_push_command(data_worktree, without_proxy=True))
        return "push: sent without git proxy fallback"
    _raise_command_failure(result)
    return "push: failed"


def _dispatch(repo: str, commit_sha: str, run_id: str | None) -> None:
    script = _repo_root() / "scripts" / "automation" / "dispatch-data-updated.sh"
    command = [str(script), "--repo", repo, "--data-sha", commit_sha]
    if run_id:
        command.extend(["--run-id", run_id])
    command.append("--send")
    _run(command)


def publish_public_run(
    *,
    public_root: Path,
    data_worktree: Path,
    payload_path: Path | None = None,
    run_id: str | None = None,
    generated_at: str | None = None,
    written_item_ids: list[str] | None = None,
    repo: str = DEFAULT_REPO,
    commit_message: str | None = None,
    push: bool = True,
    dispatch: bool = True,
    remote_checks: bool = True,
    push_without_proxy: bool = False,
) -> PublishPublicRunResult:
    preflight = automation_preflight(
        public_root=public_root,
        data_worktree=data_worktree,
        repo=repo,
        remote_checks=remote_checks,
    )
    checks = list(preflight.checks)
    finalized = finalize_public_run(
        public_root,
        payload_path=payload_path,
        run_id=run_id,
        generated_at=generated_at,
        written_item_ids=written_item_ids or [],
        validate=True,
        scan_secrets=True,
    )

    _assert_no_public_deletions(data_worktree)
    _git(data_worktree, "add", "-A", "public")
    _assert_no_public_deletions(data_worktree)
    if not _has_staged_public_changes(data_worktree):
        commit_sha = _git(data_worktree, "rev-parse", "HEAD").stdout.strip()
        return PublishPublicRunResult(
            finalize=finalized,
            data_worktree=data_worktree,
            committed=False,
            commit_sha=commit_sha,
            pushed=False,
            dispatched=False,
            checks=preflight.checks,
        )

    _git(data_worktree, "commit", "-m", _commit_message(commit_message, run_id))
    commit_sha = _git(data_worktree, "rev-parse", "HEAD").stdout.strip()
    pushed = False
    dispatched = False
    if push:
        checks.append(_push_with_fallback(data_worktree, without_proxy=push_without_proxy))
        pushed = True
    if push and dispatch:
        _dispatch(repo, commit_sha, run_id)
        dispatched = True
    return PublishPublicRunResult(
        finalize=finalized,
        data_worktree=data_worktree,
        committed=True,
        commit_sha=commit_sha,
        pushed=pushed,
        dispatched=dispatched,
        checks=tuple(checks),
    )
