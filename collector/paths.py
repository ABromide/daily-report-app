from __future__ import annotations

from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
REPO_ROOT = PACKAGE_ROOT.parent
SCHEMA_ROOT = REPO_ROOT / "schemas" / "public"
FIXTURE_ROOT = REPO_ROOT / "fixtures" / "public-data"
FIXTURE_PUBLIC_ROOT = FIXTURE_ROOT / "public"
SOURCE_CONFIG_ROOT = REPO_ROOT / "config" / "sources"
