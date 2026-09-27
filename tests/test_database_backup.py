from pathlib import Path
import sqlite3
import stat
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from gontu_db import backup_database, restore_database, verify_database  # noqa: E402


class DatabaseBackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "source.db"
        self.live = sqlite3.connect(self.source)
        self.live.execute("PRAGMA journal_mode=WAL")
        self.live.execute("CREATE TABLE facts(id INTEGER PRIMARY KEY, value TEXT)")
        self.live.execute("INSERT INTO facts(value) VALUES('preserved')")
        self.live.commit()

    def tearDown(self):
        self.live.close()
        self.temp.cleanup()

    def test_online_backup_is_verified_private_and_retained(self):
        backup_dir = self.root / "backups"
        paths = []
        for index in range(3):
            self.live.execute("INSERT INTO facts(value) VALUES(?)", (f"row-{index}",))
            self.live.commit()
            paths.append(backup_database(self.source, backup_dir, retain=2))

        existing = sorted(backup_dir.glob("gontu-*.sqlite3"))
        self.assertEqual(len(existing), 2)
        self.assertFalse(paths[0].exists())
        newest = paths[-1]
        self.assertEqual(verify_database(newest)["status"], "ok")
        self.assertEqual(stat.S_IMODE(newest.stat().st_mode), 0o600)
        with sqlite3.connect(newest) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM facts").fetchone()[0], 4)

    def test_restore_writes_only_to_a_new_verified_target(self):
        backup = backup_database(self.source, self.root / "backups")
        restored = restore_database(backup, self.root / "drill" / "restored.db")
        self.assertEqual(verify_database(restored)["status"], "ok")
        with sqlite3.connect(restored) as conn:
            self.assertEqual(conn.execute("SELECT value FROM facts").fetchone()[0], "preserved")
        with self.assertRaisesRegex(ValueError, "refusing to overwrite"):
            restore_database(backup, restored)

    def test_corrupt_database_is_rejected(self):
        corrupt = self.root / "corrupt.db"
        corrupt.write_bytes(b"not a sqlite database")
        with self.assertRaisesRegex(ValueError, "verification failed"):
            verify_database(corrupt)


if __name__ == "__main__":
    unittest.main()
