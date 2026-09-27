import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
TOOLS = ROOT / "tools"
sys.path.insert(0, str(TOOLS))

from gontu_db import backup_database, restore_database  # noqa: E402
from production_readiness import run_checks  # noqa: E402


class ProductionRuntimeConfigTests(unittest.TestCase):
    def run_import(self, cors_origins: str | None) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as temp:
            env = os.environ.copy()
            env.update(
                {
                    "PYTHONPATH": str(BACKEND),
                    "GONTU_ENV": "production",
                    "GONTU_JWT_SECRET": "production-test-secret-material-0123456789",
                    "GONTU_DB_PATH": str(Path(temp) / "production.db"),
                }
            )
            if cors_origins is None:
                env.pop("GONTU_CORS_ORIGINS", None)
            else:
                env["GONTU_CORS_ORIGINS"] = cors_origins
            return subprocess.run(
                [sys.executable, "-c", "import main; print(main.CORS_ORIGINS)"],
                cwd=BACKEND,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )

    def test_production_requires_explicit_non_wildcard_cors(self):
        missing = self.run_import(None)
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("GONTU_CORS_ORIGINS is required", missing.stderr)

        wildcard = self.run_import("*")
        self.assertNotEqual(wildcard.returncode, 0)
        self.assertIn("Wildcard CORS is forbidden", wildcard.stderr)

    def test_production_accepts_valid_origin_list(self):
        result = self.run_import(
            "https://gongtu.example.com,https://admin.gongtu.example.com/"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("https://gongtu.example.com", result.stdout)
        self.assertIn("https://admin.gongtu.example.com", result.stdout)

    def test_production_rejects_origins_with_paths(self):
        result = self.run_import("https://gongtu.example.com/not-an-origin")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Invalid CORS origin", result.stderr)


class ProductionReadinessGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.database = self.root / "live.db"
        import sqlite3

        with sqlite3.connect(self.database) as conn:
            conn.executescript("""
                CREATE TABLE users(
                    id INTEGER PRIMARY KEY,
                    username TEXT,
                    is_admin INTEGER
                );
                INSERT INTO users VALUES(1, 'admin', 1);
                CREATE TABLE admin_audit_log(id INTEGER PRIMARY KEY);
            """)
        self.database.chmod(0o600)
        self.backup_dir = self.root / "backups"
        self.backup = backup_database(self.database, self.backup_dir)
        self.restore = restore_database(self.backup, self.root / "drill.db")
        self.environment = {
            "GONTU_ENV": "production",
            "GONTU_JWT_SECRET": "readiness-test-secret-material-0123456789",
            "DEEPSEEK_API_KEY": "test-provider-key",
            "GONTU_CORS_ORIGINS": "https://gongtu.example.com",
            "GONTU_WORKERS": "1",
        }

    def tearDown(self):
        self.temp.cleanup()

    def run_gate(self):
        with patch.dict(os.environ, self.environment, clear=True):
            return run_checks(
                database=self.database,
                backup_dir=self.backup_dir,
                restore_drill_database=self.restore,
                max_backup_age_hours=24,
            )

    def test_ready_environment_passes_every_check(self):
        checks = self.run_gate()
        self.assertTrue(checks)
        self.assertTrue(all(item["status"] == "pass" for item in checks), checks)

    def test_placeholders_multiworker_and_live_restore_fail_closed(self):
        self.environment.update(
            {
                "GONTU_JWT_SECRET": "replace-with-at-least-32-random-bytes",
                "GONTU_WORKERS": "2",
                "GONTU_CORS_ORIGINS": "http://gongtu.example.com",
            }
        )
        with patch.dict(os.environ, self.environment, clear=True):
            checks = run_checks(
                database=self.database,
                backup_dir=self.backup_dir,
                restore_drill_database=self.database,
                max_backup_age_hours=24,
            )
        failed = {item["name"] for item in checks if item["status"] == "fail"}
        self.assertTrue(
            {"jwt_secret", "cors_origins", "worker_count", "restore_drill"}.issubset(failed)
        )


if __name__ == "__main__":
    unittest.main()
