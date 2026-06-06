from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable, cast

from jsonschema import Draft202012Validator, FormatChecker

from collector.jsonio import JsonObject, read_json
from collector.paths import SCHEMA_ROOT

SCHEMA_BY_NAME = {
    "daily-report": "daily-report.schema.json",
    "days": "days.schema.json",
    "hourly-report": "hourly-report.schema.json",
    "item": "item.schema.json",
    "known-links": "known-links.schema.json",
    "latest": "latest.schema.json",
    "manifest": "manifest.schema.json",
    "sources": "sources.schema.json",
}


def load_schema(name: str) -> JsonObject:
    schema_file = SCHEMA_BY_NAME[name]
    return read_json(SCHEMA_ROOT / schema_file)


def iter_schema_files(schema_root: Path = SCHEMA_ROOT) -> Iterable[Path]:
    return sorted(schema_root.glob("*.schema.json"))


def check_schema_files(schema_root: Path = SCHEMA_ROOT) -> None:
    for path in iter_schema_files(schema_root):
        Draft202012Validator.check_schema(read_json(path))


def validate_json_document(name: str, value: JsonObject) -> list[str]:
    validator = Draft202012Validator(load_schema(name), format_checker=FormatChecker())
    validator_any = cast(Any, validator)
    errors = sorted(validator_any.iter_errors(value), key=lambda error: list(error.path))
    messages: list[str] = []
    for error in errors:
        location = "/".join(str(part) for part in error.path)
        prefix = f"{location}: " if location else ""
        messages.append(f"{prefix}{error.message}")
    return messages
