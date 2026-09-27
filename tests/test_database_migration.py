import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


class DatabaseMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "legacy.db"
        self.backup_path = Path(self.temp_dir.name) / "legacy.before-v11.db"
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    is_admin INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO users(username, password_hash, is_admin)
                VALUES('kept_learner', 'legacy-hash', 1);
                """
            )
        shutil.copy2(self.db_path, self.backup_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_migration(self):
        env = os.environ.copy()
        env["GONTU_DB_PATH"] = str(self.db_path)
        subprocess.run(
            [sys.executable, "-c", "from database import init_db; init_db()"],
            cwd=BACKEND,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )

    @staticmethod
    def columns(conn, table):
        return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}

    def test_v11_upgrade_is_idempotent_and_preserves_existing_user(self):
        self.run_migration()
        self.run_migration()

        with sqlite3.connect(self.db_path) as conn:
            user = conn.execute(
                """SELECT username, password_hash, is_admin, is_vip,
                          vip_expires_at, ai_credits
                   FROM users WHERE username = 'kept_learner'"""
            ).fetchone()
            policy = conn.execute(
                "SELECT value FROM app_settings WHERE key = 'ai_access_mode'"
            ).fetchone()

        self.assertEqual(
            user,
            ("kept_learner", "legacy-hash", 1, 0, "", 0),
        )
        self.assertEqual(policy, ("free",))

    def test_offline_file_backup_restores_pre_migration_schema_and_data(self):
        self.run_migration()
        shutil.copy2(self.backup_path, self.db_path)
        for suffix in ("-wal", "-shm"):
            Path(f"{self.db_path}{suffix}").unlink(missing_ok=True)

        with sqlite3.connect(self.db_path) as conn:
            columns = self.columns(conn, "users")
            user = conn.execute(
                "SELECT username, password_hash, is_admin FROM users"
            ).fetchone()
            integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]

        self.assertNotIn("is_vip", columns)
        self.assertNotIn("ai_credits", columns)
        self.assertEqual(user, ("kept_learner", "legacy-hash", 1))
        self.assertEqual(integrity, "ok")


if __name__ == "__main__":
    unittest.main()
