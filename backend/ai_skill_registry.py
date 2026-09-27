"""Strict, versioned Skill registry for every AI coach domain.

The registry is repository-owned.  User text never selects files or modules.
Every resolved bundle is path-safe, version checked and reproducibly hashed.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
from typing import Any


DATA_ROOT = Path(__file__).resolve().parent / "data"
REGISTRY_PATH = DATA_ROOT / "skill-registry.json"
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$")
YAML_VERSION = re.compile(r"^version:\s*([^\s]+)\s*$", re.MULTILINE)
INLINE_VERSION = re.compile(r"Skill version:\s*`([^`]+)`")


class SkillRegistryError(RuntimeError):
    """A fail-closed registry, package or task resolution error."""


@dataclass(frozen=True)
class SkillBundle:
    module_id: str
    task_kind: str
    skill_id: str
    version: str
    package_hash: str
    bundle_hash: str
    files: tuple[str, ...]
    response_schema_path: str
    response_schema: dict[str, Any]
    content: str


def _read_registry(path: Path = REGISTRY_PATH) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SkillRegistryError("skill_registry_unavailable") from exc
    if payload.get("schema_version") != 1 or not isinstance(payload.get("modules"), dict):
        raise SkillRegistryError("skill_registry_invalid")
    return payload


def _safe_file(relative: str, *, root: Path = DATA_ROOT) -> Path:
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise SkillRegistryError("skill_path_invalid")
    raw = Path(relative)
    if raw.is_absolute() or ".." in raw.parts:
        raise SkillRegistryError("skill_path_escape")
    candidate = root.joinpath(raw)
    if candidate.is_symlink():
        raise SkillRegistryError("skill_path_symlink")
    resolved_root = root.resolve()
    resolved = candidate.resolve()
    if resolved_root != resolved and resolved_root not in resolved.parents:
        raise SkillRegistryError("skill_path_escape")
    if not resolved.is_file():
        raise SkillRegistryError(f"skill_file_missing:{relative}")
    if not resolved.read_text(encoding="utf-8").strip():
        raise SkillRegistryError(f"skill_file_empty:{relative}")
    return resolved


def _hash_files(paths: list[str], *, root: Path = DATA_ROOT) -> str:
    digest = hashlib.sha256()
    for relative in paths:
        path = _safe_file(relative, root=root)
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _entry_version(text: str) -> str:
    match = YAML_VERSION.search(text) or INLINE_VERSION.search(text)
    if not match or not SEMVER.fullmatch(match.group(1)):
        raise SkillRegistryError("skill_version_missing_or_invalid")
    return match.group(1)


def resolve_skill(module_id: str, task_kind: str, *, registry_path: Path = REGISTRY_PATH,
                  data_root: Path = DATA_ROOT) -> SkillBundle:
    """Resolve an allowlisted module/task to an exact validated Skill bundle."""
    registry = _read_registry(registry_path)
    config = registry["modules"].get(module_id)
    if not isinstance(config, dict):
        raise SkillRegistryError("skill_module_unsupported")
    if config.get("status") != "enabled":
        raise SkillRegistryError("skill_unavailable")
    skill_id = config.get("skill_id")
    version = config.get("version")
    if not isinstance(skill_id, str) or not skill_id or not isinstance(version, str) or not SEMVER.fullmatch(version):
        raise SkillRegistryError("skill_metadata_invalid")
    tasks = config.get("tasks")
    task = tasks.get(task_kind) if isinstance(tasks, dict) else None
    if not isinstance(task, dict):
        raise SkillRegistryError("skill_task_unsupported")
    entry = config.get("entry")
    package_files = config.get("package_files")
    references = task.get("references", [])
    schema_path = task.get("response_schema")
    if not isinstance(entry, str) or not isinstance(package_files, list) or not package_files:
        raise SkillRegistryError("skill_package_invalid")
    if not all(isinstance(item, str) for item in package_files + references) or not isinstance(schema_path, str):
        raise SkillRegistryError("skill_bundle_invalid")
    if entry not in package_files or schema_path not in package_files:
        raise SkillRegistryError("skill_package_incomplete")
    if len(package_files) != len(set(package_files)) or len(references) != len(set(references)):
        raise SkillRegistryError("skill_files_duplicated")
    entry_text = _safe_file(entry, root=data_root).read_text(encoding="utf-8").strip()
    if _entry_version(entry_text) != version:
        raise SkillRegistryError("skill_version_mismatch")
    for relative in package_files:
        _safe_file(relative, root=data_root)
    bundle_files = [entry, *references, schema_path]
    for relative in bundle_files:
        if relative not in package_files:
            raise SkillRegistryError("skill_reference_unlisted")
    try:
        response_schema = json.loads(_safe_file(schema_path, root=data_root).read_text(encoding="utf-8"))
    except Exception as exc:
        raise SkillRegistryError("skill_response_schema_invalid") from exc
    if not isinstance(response_schema, dict) or response_schema.get("type") != "object":
        raise SkillRegistryError("skill_response_schema_invalid")
    expected = config.get("package_hash")
    package_hash = _hash_files(package_files, root=data_root)
    if expected and expected != package_hash:
        raise SkillRegistryError("skill_package_hash_mismatch")
    bundle_hash = _hash_files(bundle_files, root=data_root)
    content = "\n\n---\n\n".join(
        _safe_file(relative, root=data_root).read_text(encoding="utf-8").strip()
        for relative in [entry, *references]
    )
    return SkillBundle(
        module_id=module_id,
        task_kind=task_kind,
        skill_id=skill_id,
        version=version,
        package_hash=package_hash,
        bundle_hash=bundle_hash,
        files=tuple(bundle_files),
        response_schema_path=schema_path,
        response_schema=response_schema,
        content=content,
    )


def registry_status(*, registry_path: Path = REGISTRY_PATH) -> list[dict[str, str]]:
    registry = _read_registry(registry_path)
    return [
        {"module_id": module_id, "skill_id": config.get("skill_id", ""),
         "version": config.get("version", ""), "status": config.get("status", "")}
        for module_id, config in sorted(registry["modules"].items())
    ]
