from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PublishPlan:
    public_root: Path
    manifest_path: Path
    target_branch: str = "data"

    @property
    def summary(self) -> str:
        return (
            f"Publish {self.public_root} with manifest {self.manifest_path} "
            f"to branch {self.target_branch}"
        )


def build_publish_plan(public_root: Path, manifest_path: Path) -> PublishPlan:
    return PublishPlan(public_root=public_root, manifest_path=manifest_path)
