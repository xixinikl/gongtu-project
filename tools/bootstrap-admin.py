#!/usr/bin/env python3
"""Initialize the first Gongtu administrator from the server itself."""

from __future__ import annotations

import argparse
import getpass
import os
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create or elevate the initial administrator. The command refuses "
            "to run after any administrator exists."
        )
    )
    parser.add_argument("--username", required=True, help="Administrator username")
    parser.add_argument(
        "--database",
        type=Path,
        help="SQLite database path (defaults to GONTU_DB_PATH or backend/data.db)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.database:
        os.environ["GONTU_DB_PATH"] = str(args.database.expanduser().resolve())

    sys.path.insert(0, str(BACKEND))
    from auth import bootstrap_initial_admin
    from database import DB_PATH, init_db

    password = getpass.getpass("New administrator password (12+ characters): ")
    confirmation = getpass.getpass("Confirm administrator password: ")
    if password != confirmation:
        print("Administrator passwords do not match.", file=sys.stderr)
        return 2

    init_db()
    try:
        user_id, created = bootstrap_initial_admin(args.username, password)
    except (RuntimeError, ValueError) as exc:
        print(f"Administrator bootstrap refused: {exc}", file=sys.stderr)
        return 1

    action = "created" if created else "elevated and password reset"
    print(f"Administrator {action}: {args.username.strip()} (user_id={user_id})")
    print(f"Database: {DB_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
