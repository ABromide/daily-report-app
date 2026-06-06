from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from collector.jsonio import iter_files


@dataclass(frozen=True)
class SecretFinding:
    path: Path
    line: int
    rule: str


SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----")),
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{30,}\b")),
    ("openai-token", re.compile(r"\bsk-[A-Za-z0-9]{32,}\b")),
    ("anthropic-token", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b")),
    ("slack-token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b")),
    ("cookie-header", re.compile(r"(?i)\b(cookie|sessionid|authorization)\s*[:=]\s*[^\s]+")),
)


def scan_text(path: Path, text: str) -> list[SecretFinding]:
    findings: list[SecretFinding] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        for rule, pattern in SECRET_PATTERNS:
            if pattern.search(line):
                findings.append(SecretFinding(path=path, line=line_number, rule=rule))
    return findings


def secret_scan(root: Path) -> list[SecretFinding]:
    findings: list[SecretFinding] = []
    files: Iterable[Path]
    files = [root] if root.is_file() else iter_files(root)
    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        findings.extend(scan_text(path, text))
    return findings
