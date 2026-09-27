"""Negative-path contract tests for the two versioned practice banks."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

_TEMP_DIR = tempfile.TemporaryDirectory()
os.environ["GONTU_DB_PATH"] = str(Path(_TEMP_DIR.name) / "bank-contract.db")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from auth import create_token, hash_password  # noqa: E402
from database import get_db, init_db  # noqa: E402
import quantity  # noqa: E402
import verbal_reading  # noqa: E402


class BankUnavailableContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
                (901, "bank-contract", hash_password("secret")),
            )
            conn.commit()
        app = FastAPI()
        app.include_router(quantity.router)
        app.include_router(verbal_reading.router)
        cls.client = TestClient(app, raise_server_exceptions=False)
        cls.headers = {"Authorization": f"Bearer {create_token(901, 'bank-contract')}"}

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        _TEMP_DIR.cleanup()

    def setUp(self):
        quantity._load_bank.cache_clear()
        verbal_reading._load_bank.cache_clear()

    def tearDown(self):
        quantity._load_bank.cache_clear()
        verbal_reading._load_bank.cache_clear()

    def assert_unavailable(self, response, module_id: str, forbidden: str = ""):
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(
            response.json(),
            {
                "detail": {
                    "code": "bank_unavailable",
                    "module_id": module_id,
                    "message": "题库暂不可用，请稍后再试。",
                    "retryable": True,
                }
            },
        )
        if forbidden:
            self.assertNotIn(forbidden, response.text)

    def test_missing_banks_are_structured_and_auth_still_runs_first(self):
        missing = Path(_TEMP_DIR.name) / "private-missing-bank.json"
        with patch.object(quantity, "APPROVED_BANK_PATH", missing):
            self.assertEqual(self.client.get("/api/quantity/sets").status_code, 401)
            self.assert_unavailable(
                self.client.get("/api/quantity/sets", headers=self.headers),
                "quantity.exam",
                str(missing),
            )
            quantity._load_bank.cache_clear()
            self.assert_unavailable(
                self.client.get(
                    "/api/quantity/media/quantity_hs13_set01_q04/0",
                    headers=self.headers,
                ),
                "quantity.exam",
                "Versioned approved quantity bank is missing",
            )

        with patch.object(verbal_reading, "MANIFEST_PATH", missing):
            self.assertEqual(
                self.client.get("/api/verbal-reading/sets").status_code, 401
            )
            self.assert_unavailable(
                self.client.get("/api/verbal-reading/sets", headers=self.headers),
                "verbal.reading",
                str(missing),
            )
            verbal_reading._load_bank.cache_clear()
            self.assert_unavailable(
                self.client.get(
                    "/api/verbal-reading/sets/verbal_hs13_set01/questions",
                    headers=self.headers,
                ),
                "verbal.reading",
                "Verbal-reading manifest is missing",
            )

    def test_corrupt_and_count_mismatched_banks_use_the_same_contract(self):
        corrupt = Path(_TEMP_DIR.name) / "secret-corrupt.json"
        corrupt.write_text("{not-json", encoding="utf-8")
        with patch.object(quantity, "APPROVED_BANK_PATH", corrupt):
            self.assert_unavailable(
                self.client.get("/api/quantity/sets", headers=self.headers),
                "quantity.exam",
                str(corrupt),
            )

        verbal_reading._load_bank.cache_clear()
        with patch.object(verbal_reading, "MANIFEST_PATH", corrupt):
            self.assert_unavailable(
                self.client.get("/api/verbal-reading/sets", headers=self.headers),
                "verbal.reading",
                str(corrupt),
            )

        quantity._load_bank.cache_clear()
        wrong_count = Path(_TEMP_DIR.name) / "secret-wrong-count.json"
        wrong_count.write_text("[]", encoding="utf-8")
        with patch.object(quantity, "APPROVED_BANK_PATH", wrong_count):
            self.assert_unavailable(
                self.client.get("/api/quantity/sets", headers=self.headers),
                "quantity.exam",
                "exactly 600 questions",
            )

        verbal_reading._load_bank.cache_clear()
        package = Path(_TEMP_DIR.name) / "secret-package.json"
        package.write_text(json.dumps({"questions": []}), encoding="utf-8")
        manifest = Path(_TEMP_DIR.name) / "secret-manifest.json"
        manifest.write_text(
            json.dumps(
                {
                    "sets": [
                        {
                            "set_id": "broken-set",
                            "question_count": 20,
                            "files": [str(package)],
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        with patch.object(verbal_reading, "MANIFEST_PATH", manifest):
            self.assert_unavailable(
                self.client.get("/api/verbal-reading/sets", headers=self.headers),
                "verbal.reading",
                "Question count mismatch",
            )

    def test_healthy_banks_keep_unknown_sets_as_404(self):
        quantity_response = self.client.get(
            "/api/quantity/sets/61/questions", headers=self.headers
        )
        verbal_response = self.client.get(
            "/api/verbal-reading/sets/not-provided/questions", headers=self.headers
        )
        self.assertEqual(quantity_response.status_code, 404)
        self.assertEqual(verbal_response.status_code, 404)
        self.assertNotIn("bank_unavailable", quantity_response.text)
        self.assertNotIn("bank_unavailable", verbal_response.text)


if __name__ == "__main__":
    unittest.main()
