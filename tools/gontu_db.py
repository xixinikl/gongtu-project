#!/usr/bin/env python3
"""Safe SQLite backup, verification and non-overwriting restore commands."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import stat
import sys


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE = ROOT / "backend" / "data.db"
BACKUP_PATTERN = "gontu-*.sqlite3"


def verify_database(database: Path) -> dict[str, int | str]:
    path = database.expanduser().resolve()
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError(f"Database is missing or empty: {path}")
    try:
        with sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True) as conn:
            result = conn.execute("PRAGMA integrity_check").fetchone()
            if not result or result[0] != "ok":
                raise ValueError(f"SQLite integrity check failed: {result[0] if result else 'no result'}")
            page_count = int(conn.execute("PRAGMA page_count").fetchone()[0])
    except sqlite3.DatabaseError as exc:
        raise ValueError(f"SQLite verification failed: {exc}") from exc
    return {"database": str(path), "status": "ok", "page_count": page_count}


def _copy_database(source: Path, destination: Path) -> None:
    source = source.expanduser().resolve()
    destination = destination.expanduser().resolve()
    if not source.is_file() or source.stat().st_size == 0:
        raise ValueError(f"Source database is missing or empty: {source}")
    if source == destination:
        raise ValueError("Source and destination database must differ")

    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError as exc:
        raise ValueError(f"Destination already exists; refusing to overwrite: {destination}") from exc
    os.close(descriptor)

    try:
        with sqlite3.connect(f"{source.as_uri()}?mode=ro", uri=True) as source_conn:
            with sqlite3.connect(destination) as destination_conn:
                source_conn.backup(destination_conn)
        destination.chmod(stat.S_IRUSR | stat.S_IWUSR)
        verify_database(destination)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def backup_database(source: Path, output_dir: Path, *, retain: int = 14) -> Path:
    if retain < 1:
        raise ValueError("retain must be at least 1")
    output_dir = output_dir.expanduser().resolve()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    destination = output_dir / f"gontu-{stamp}.sqlite3"
    _copy_database(source, destination)

    backups = sorted(
        (item for item in output_dir.glob(BACKUP_PATTERN) if item.is_file()),
        key=lambda item: item.stat().st_mtime_ns,
        reverse=True,
    )
    for expired in backups[retain:]:
        expired.unlink()
    return destination


def restore_database(backup: Path, destination: Path) -> Path:
    verify_database(backup)
    _copy_database(backup, destination)
    return destination.expanduser().resolve()


def _database_argument(value: str | None) -> Path:
    return Path(value or os.environ.get("GONTU_DB_PATH", DEFAULT_DATABASE))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    backup = subparsers.add_parser("backup", help="Create and verify an online backup")
    backup.add_argument("--source", help="Source SQLite database")
    backup.add_argument("--output-dir", type=Path, required=True)
    backup.add_argument("--retain", type=int, default=14)

    verify = subparsers.add_parser("verify", help="Run SQLite integrity_check")
    verify.add_argument("--database", type=Path, required=True)

    restore = subparsers.add_parser(
        "restore", help="Restore into a new path; existing destinations are refused"
    )
    restore.add_argument("--backup", type=Path, required=True)
    restore.add_argument("--destination", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.command == "backup":
            path = backup_database(
                _database_argument(args.source), args.output_dir, retain=args.retain
            )
            result = verify_database(path)
            result["retained_at_most"] = args.retain
        elif args.command == "verify":
            result = verify_database(args.database)
        else:
            path = restore_database(args.backup, args.destination)
            result = verify_database(path)
            result["restored_from"] = str(args.backup.expanduser().resolve())
    except (OSError, ValueError, sqlite3.DatabaseError) as exc:
        print(f"Database operation refused: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
