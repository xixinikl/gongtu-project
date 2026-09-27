import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

import database  # noqa: E402


class DatabaseBackendTests(unittest.TestCase):
    def test_local_sqlite_remains_the_default(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "local.db"
            with patch.dict(
                os.environ,
                {"TURSO_DATABASE_URL": "", "TURSO_AUTH_TOKEN": ""},
            ), patch.object(database, "DB_PATH", str(path)):
                connection = database.connect_db()
                try:
                    connection.execute("CREATE TABLE facts(id INTEGER PRIMARY KEY, value TEXT)")
                    cursor = connection.execute(
                        "INSERT INTO facts(value) VALUES(?)", ("local",)
                    )
                    connection.commit()
                    row = connection.execute(
                        "SELECT id, value FROM facts"
                    ).fetchone()
                finally:
                    connection.close()

            self.assertEqual(cursor.lastrowid, 1)
            self.assertEqual(row["value"], "local")
            self.assertEqual(dict(row), {"id": 1, "value": "local"})

    def test_partial_remote_configuration_fails_closed(self):
        with patch.dict(
            os.environ,
            {"TURSO_DATABASE_URL": "libsql://example.invalid"},
            clear=False,
        ):
            os.environ.pop("TURSO_AUTH_TOKEN", None)
            with self.assertRaisesRegex(RuntimeError, "must be configured together"):
                database.connect_db()

    def test_libsql_adapter_preserves_row_and_cursor_contract(self):
        import libsql

        with tempfile.TemporaryDirectory() as temp:
            raw = libsql.connect(str(Path(temp) / "adapter.db"))
            connection = database.LibsqlConnectionAdapter(raw)
            try:
                connection.executescript(
                    """
                    CREATE TABLE facts(
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        value TEXT NOT NULL UNIQUE
                    );
                    """
                )
                cursor = connection.execute(
                    "INSERT INTO facts(value) VALUES(?)", ("remote-compatible",)
                )
                connection.commit()
                row = connection.execute(
                    "SELECT id, value FROM facts"
                ).fetchone()
                rows = list(
                    connection.execute("SELECT id, value FROM facts ORDER BY id")
                )
            finally:
                connection.close()

            self.assertEqual(cursor.lastrowid, 1)
            self.assertEqual(row[0], 1)
            self.assertEqual(row["value"], "remote-compatible")
            self.assertEqual(
                dict(row), {"id": 1, "value": "remote-compatible"}
            )
            self.assertEqual(rows[0]["value"], "remote-compatible")

    def test_libsql_constraint_errors_keep_existing_sqlite_contract(self):
        import libsql

        with tempfile.TemporaryDirectory() as temp:
            raw = libsql.connect(str(Path(temp) / "errors.db"))
            connection = database.LibsqlConnectionAdapter(raw)
            try:
                connection.execute("CREATE TABLE facts(value TEXT UNIQUE)")
                connection.execute("INSERT INTO facts(value) VALUES(?)", ("same",))
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "INSERT INTO facts(value) VALUES(?)", ("same",)
                    )
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
