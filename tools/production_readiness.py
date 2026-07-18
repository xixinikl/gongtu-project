#!/usr/bin/env python3
"""Fail-closed production readiness gate for the Gongtu backend."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import ipaddress
import json
import os
from pathlib import Path
import sqlite3
import stat
from urllib.parse import urlsplit

from gontu_db import BACKUP_PATTERN, verify_database


RETIRED_JWT_SECRET = "gontu-unified-secret-key-change-in-production"


def _private_file(path: Path) -> bool:
    return stat.S_IMODE(path.stat().st_mode) & 0o077 == 0


def _database_facts(path: Path) -> dict[str, int]:
    verify_database(path)
    with sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        required = {"users", "admin_audit_log"}
        missing = sorted(required - tables)
        if missing:
            raise ValueError(f"Missing production tables: {', '.join(missing)}")
        users = int(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])
        admins = int(
            conn.execute("SELECT COUNT(*) FROM users WHERE is_admin=1").fetchone()[0]
        )
    if admins < 1:
        raise ValueError("No administrator has been initialized")
    return {"users": users, "administrators": admins}


def _valid_cors() -> list[str]:
    raw = os.environ.get("GONTU_CORS_ORIGINS", "")
    origins = [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]
    if not origins or "*" in origins:
        raise ValueError("Explicit non-wildcard GONTU_CORS_ORIGINS is required")
    for origin in origins:
        parsed = urlsplit(origin)
        if parsed.scheme != "https" or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
            raise ValueError("Production CORS origins must be path-free HTTPS origins")
    return origins


def _valid_trusted_proxies() -> int:
    raw = os.environ.get("GONTU_TRUSTED_PROXIES", "").strip()
    if not raw:
        return 0
    for item in raw.split(","):
        try:
            ipaddress.ip_address(item.strip())
        except ValueError as exc:
            raise ValueError("GONTU_TRUSTED_PROXIES contains an invalid IP") from exc
    return len(raw.split(","))


def run_checks(
    *,
    database: Path,
    backup_dir: Path,
    restore_drill_database: Path,
    max_backup_age_hours: float,
) -> list[dict[str, str]]:
    checks: list[dict[str, str]] = []

    def check(name: str, operation) -> None:
        try:
            detail = operation()
        except Exception as exc:
            checks.append({"name": name, "status": "fail", "detail": str(exc)})
        else:
            checks.append({"name": name, "status": "pass", "detail": str(detail)})

    check(
        "environment",
        lambda: "production"
        if os.environ.get("GONTU_ENV", "").strip().lower() in {"prod", "production"}
        else (_ for _ in ()).throw(ValueError("GONTU_ENV must be production")),
    )

    def jwt_secret() -> str:
        secret = os.environ.get("GONTU_JWT_SECRET", "").strip()
        if len(secret.encode()) < 32 or secret == RETIRED_JWT_SECRET or "replace" in secret.casefold():
            raise ValueError("GONTU_JWT_SECRET must be a non-placeholder secret of 32+ bytes")
        return "configured"

    check("jwt_secret", jwt_secret)
    def ai_provider_key() -> str:
        key = (os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("LLM_API_KEY") or "").strip()
        if not key or "replace" in key.casefold():
            raise ValueError("A non-placeholder AI provider key is required")
        return "configured"

    check("ai_provider_key", ai_provider_key)
    check("cors_origins", lambda: f"{len(_valid_cors())} HTTPS origin(s)")
    check("trusted_proxies", lambda: f"{_valid_trusted_proxies()} configured")
    check(
        "worker_count",
        lambda: "single worker"
        if int(os.environ.get("GONTU_WORKERS", "1")) == 1
        else (_ for _ in ()).throw(
            ValueError("GONTU_WORKERS must remain 1 while rate limiting is in-memory")
        ),
    )

    database = database.expanduser().resolve()
    check(
        "database_permissions",
        lambda: "private"
        if database.is_file() and _private_file(database)
        else (_ for _ in ()).throw(ValueError("Database must exist and deny group/other access")),
    )
    check("database_integrity_and_admin", lambda: _database_facts(database))

    def newest_backup() -> str:
        candidates = sorted(
            (item for item in backup_dir.expanduser().resolve().glob(BACKUP_PATTERN) if item.is_file()),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )
        if not candidates:
            raise ValueError("No verified backup candidate found")
        latest = candidates[0]
        age_hours = (
            datetime.now(timezone.utc).timestamp() - latest.stat().st_mtime
        ) / 3600
        if age_hours > max_backup_age_hours:
            raise ValueError(f"Newest backup is stale: {age_hours:.1f} hours")
        if not _private_file(latest):
            raise ValueError("Newest backup permits group/other access")
        verify_database(latest)
        return f"verified, {age_hours:.1f} hours old"

    check("recent_verified_backup", newest_backup)

    restore_path = restore_drill_database.expanduser().resolve()

    def restore_drill() -> str:
        if restore_path == database:
            raise ValueError("Restore drill database must not be the live database")
        facts = _database_facts(restore_path)
        return f"independent verified restore: {facts}"

    check("restore_drill", restore_drill)
    return checks


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--backup-dir", type=Path, required=True)
    parser.add_argument("--restore-drill-database", type=Path, required=True)
    parser.add_argument("--max-backup-age-hours", type=float, default=24.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    checks = run_checks(
        database=args.database,
        backup_dir=args.backup_dir,
        restore_drill_database=args.restore_drill_database,
        max_backup_age_hours=args.max_backup_age_hours,
    )
    passed = all(item["status"] == "pass" for item in checks)
    print(json.dumps({"ready": passed, "checks": checks}, ensure_ascii=False, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
