from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from collector.finalize_public_run import finalize_public_run
from collector.paths import FIXTURE_PUBLIC_ROOT
from collector.publish_public_run import DEFAULT_REPO, PublishPublicRunError, automation_preflight, publish_public_run
from collector.sample import generate_sample
from collector.secrets import secret_scan
from collector.validation import format_issues, validate_public


def _validate_public_command(public_root: Path) -> int:
    report = validate_public(public_root)
    if not report.ok:
        print(format_issues(report.issues))
        return 1
    print(f"validated {report.checked_files} public files under {public_root}")
    return 0


def _secret_scan_command(path: Path) -> int:
    if not path.exists():
        print(f"{path}: path does not exist")
        return 1
    findings = secret_scan(path)
    if findings:
        for finding in findings:
            print(f"{finding.path}:{finding.line}: possible secret matched {finding.rule}")
        return 1
    print(f"secret scan passed for {path}")
    return 0


def _automation_dry_run_command(output_root: Path) -> int:
    result = generate_sample(output_root)
    public_report = validate_public(result.public_root)
    if not public_report.ok:
        print(format_issues(public_report.issues))
        return 1
    findings = secret_scan(result.public_root)
    if findings:
        for finding in findings:
            print(f"{finding.path}:{finding.line}: possible secret matched {finding.rule}")
        return 1
    print(f"automation dry run wrote public data to {result.public_root}")
    print(f"manifest: {result.manifest_path} ({result.manifest_sha256})")
    print("validation: passed")
    print("secret scan: passed")
    return 0


def _finalize_public_run_command(args: argparse.Namespace) -> int:
    try:
        result = finalize_public_run(
            args.public_root,
            payload_path=args.payload,
            run_id=args.run_id,
            generated_at=args.generated_at,
            written_item_ids=args.written_item_id,
            duplicate_candidates=args.duplicate_candidates,
            replacement_candidates=args.replacement_candidates,
            validate=args.validate,
            scan_secrets=args.secret_scan,
        )
    except ValueError as exc:
        print(str(exc))
        return 1
    print(f"finalized public data under {result.public_root}")
    if result.audit_path is not None:
        print(f"audit: {result.audit_path}")
    print(f"manifest: {result.manifest_path} ({result.manifest_sha256})")
    print(f"latest: {result.latest_path}")
    print(f"items: {result.item_count}")
    return 0


def _automation_preflight_command(args: argparse.Namespace) -> int:
    try:
        result = automation_preflight(
            public_root=args.public_root,
            data_worktree=args.data_worktree,
            repo=args.repo,
            remote_checks=not args.skip_remote_checks,
        )
    except PublishPublicRunError as exc:
        print(str(exc))
        return 1
    print(f"preflight public root: {result.public_root}")
    print(f"preflight data worktree: {result.data_worktree}")
    for check in result.checks:
        print(f"check: {check}")
    return 0


def _publish_public_run_command(args: argparse.Namespace) -> int:
    try:
        result = publish_public_run(
            public_root=args.public_root,
            data_worktree=args.data_worktree,
            payload_path=args.payload,
            run_id=args.run_id,
            generated_at=args.generated_at,
            written_item_ids=args.written_item_id,
            repo=args.repo,
            commit_message=args.commit_message,
            push=not args.no_push,
            dispatch=not args.no_dispatch,
            remote_checks=not args.skip_remote_checks,
            push_without_proxy=args.push_without_proxy,
        )
    except (PublishPublicRunError, ValueError) as exc:
        print(str(exc))
        return 1
    for check in result.checks:
        print(f"check: {check}")
    print(f"finalized public data under {result.finalize.public_root}")
    if result.finalize.audit_path is not None:
        print(f"audit: {result.finalize.audit_path}")
    print(f"manifest: {result.finalize.manifest_path} ({result.finalize.manifest_sha256})")
    print(f"latest: {result.finalize.latest_path}")
    print(f"items: {result.finalize.item_count}")
    if result.committed:
        print(f"commit: {result.commit_sha}")
    else:
        print(f"commit: skipped, no staged public changes ({result.commit_sha})")
    print(f"push: {'sent' if result.pushed else 'skipped'}")
    print(f"dispatch: {'sent' if result.dispatched else 'skipped'}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="daily-report")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("validate-fixtures", help="validate committed public fixtures")

    validate_public_parser = subparsers.add_parser("validate-public", help="validate a public data root")
    validate_public_parser.add_argument("path", type=Path)

    generate_parser = subparsers.add_parser("generate-sample", help="generate deterministic sample public data")
    generate_parser.add_argument("--output", type=Path, required=True)

    automation_parser = subparsers.add_parser(
        "automation-dry-run",
        help="generate sample automation output, article Markdown, audit record, and validate it",
    )
    automation_parser.add_argument("--output", type=Path, required=True)

    secret_parser = subparsers.add_parser("secret-scan", help="scan a file or directory for secret-like values")
    secret_parser.add_argument("path", type=Path)

    finalize_parser = subparsers.add_parser(
        "finalize-public-run",
        help="mechanically merge items and rebuild known-links, reports, days/latest indexes, audit, and manifest",
    )
    finalize_parser.add_argument("--public-root", type=Path, required=True)
    finalize_parser.add_argument("--payload", type=Path)
    finalize_parser.add_argument("--run-id")
    finalize_parser.add_argument("--generated-at")
    finalize_parser.add_argument("--written-item-id", action="append", default=[])
    finalize_parser.add_argument("--duplicate-candidates", type=int, default=0)
    finalize_parser.add_argument("--replacement-candidates", type=int, default=0)
    finalize_parser.add_argument("--validate", action="store_true")
    finalize_parser.add_argument("--secret-scan", action="store_true")

    preflight_parser = subparsers.add_parser(
        "automation-preflight",
        help="check data worktree, public root, git remote, and GitHub CLI readiness",
    )
    preflight_parser.add_argument("--public-root", type=Path, required=True)
    preflight_parser.add_argument("--data-worktree", type=Path, required=True)
    preflight_parser.add_argument("--repo", default=DEFAULT_REPO)
    preflight_parser.add_argument("--skip-remote-checks", action="store_true")

    publish_parser = subparsers.add_parser(
        "publish-public-run",
        help="finalize public data, validate, secret-scan, commit data worktree, push data branch, and dispatch",
    )
    publish_parser.add_argument("--public-root", type=Path, required=True)
    publish_parser.add_argument("--data-worktree", type=Path, required=True)
    publish_parser.add_argument("--payload", type=Path)
    publish_parser.add_argument("--run-id")
    publish_parser.add_argument("--generated-at")
    publish_parser.add_argument("--written-item-id", action="append", default=[])
    publish_parser.add_argument("--repo", default=DEFAULT_REPO)
    publish_parser.add_argument("--commit-message")
    publish_parser.add_argument("--no-push", action="store_true")
    publish_parser.add_argument("--no-dispatch", action="store_true")
    publish_parser.add_argument("--skip-remote-checks", action="store_true")
    publish_parser.add_argument("--push-without-proxy", action="store_true")

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    command = str(args.command)
    if command == "validate-fixtures":
        return _validate_public_command(FIXTURE_PUBLIC_ROOT)
    if command == "validate-public":
        return _validate_public_command(args.path)
    if command == "generate-sample":
        result = generate_sample(args.output)
        print(
            "generated sample public data "
            f"at {result.public_root} with manifest {result.manifest_path} "
            f"({result.manifest_sha256})"
        )
        return 0
    if command == "automation-dry-run":
        return _automation_dry_run_command(args.output)
    if command == "secret-scan":
        return _secret_scan_command(args.path)
    if command == "finalize-public-run":
        return _finalize_public_run_command(args)
    if command == "automation-preflight":
        return _automation_preflight_command(args)
    if command == "publish-public-run":
        return _publish_public_run_command(args)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
