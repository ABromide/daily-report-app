from __future__ import annotations

from collector.paths import FIXTURE_PUBLIC_ROOT
from collector.schema_validation import check_schema_files
from collector.validation import format_issues, validate_public


def test_schema_files_are_valid_json_schema() -> None:
    check_schema_files()


def test_committed_public_fixture_validates() -> None:
    report = validate_public(FIXTURE_PUBLIC_ROOT)
    assert report.ok, format_issues(report.issues)
