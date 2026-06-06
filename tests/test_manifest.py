from __future__ import annotations

from pathlib import Path

from collector.jsonio import read_json, sha256_file
from collector.sample import generate_sample


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
