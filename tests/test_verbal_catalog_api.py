import json
import os
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

_TEMP_DIR = tempfile.TemporaryDirectory()
os.environ["GONTU_DB_PATH"] = str(Path(_TEMP_DIR.name) / "verbal-catalog.db")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
import database  # noqa: E402
from auth import create_token, hash_password  # noqa: E402
from verbal_catalog import ensure_verbal_catalog_schema, router  # noqa: E402


class VerbalCatalogAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db()
        ensure_verbal_catalog_schema()
        ensure_verbal_catalog_schema()  # migration hook is repeatable
        with database.get_db() as conn:
            conn.execute(
                "INSERT INTO users(id,username,password_hash) VALUES(?,?,?)",
                (101, "catalog-a", hash_password("password-a")),
            )
            conn.execute(
                "INSERT INTO users(id,username,password_hash) VALUES(?,?,?)",
                (202, "catalog-b", hash_password("password-b")),
            )
            conn.commit()
        app = FastAPI()
        app.include_router(router)
        cls.client = TestClient(app)
        cls.headers_a = {"Authorization": f"Bearer {create_token(101, 'catalog-a')}"}
        cls.headers_b = {"Authorization": f"Bearer {create_token(202, 'catalog-b')}"}

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        _TEMP_DIR.cleanup()

    def setUp(self):
        with database.get_db() as conn:
            conn.execute("DELETE FROM verbal_vocab_state_v2")
            conn.execute("DELETE FROM verbal_logic_attempts_v2")
            conn.commit()

    def test_catalog_counts_examples_links_and_authentication(self):
        self.assertEqual(self.client.get("/api/verbal-catalog/vocab").status_code, 401)
        response = self.client.get(
            "/api/verbal-catalog/vocab?limit=801", headers=self.headers_a
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["total"], 801)
        self.assertEqual(len(payload["items"]), 801)
        self.assertTrue(all(item["examples"] for item in payload["items"]))
        self.assertTrue(
            all(item["search_url"].startswith("https://search.people.cn/") for item in payload["items"])
        )

        data = json.loads((ROOT / "data/verbal_catalog/logic_fill_231.json").read_text())
        self.assertEqual(data["count"], 231)
        self.assertTrue(all(item["official_analysis"] is None for item in data["items"]))

    def test_question_listing_never_leaks_answers(self):
        response = self.client.get(
            "/api/verbal-catalog/logic-fill/questions?limit=100", headers=self.headers_a
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["total"], 231)
        self.assertEqual(len(payload["items"]), 100)
        forbidden = {"answer", "correct_answer", "official_analysis", "explanation", "ai_context"}
        for item in payload["items"]:
            self.assertFalse(forbidden.intersection(item))
            self.assertFalse(item["official_analysis_available"])
            self.assertEqual(set(item["options"]), {"A", "B", "C", "D"})

        # Unknown query parameters cannot restore the old include_answer backdoor.
        attempted_backdoor = self.client.get(
            "/api/verbal-catalog/logic-fill/questions?include_answer=1&limit=1",
            headers=self.headers_a,
        ).json()["items"][0]
        self.assertFalse(forbidden.intersection(attempted_backdoor))

    def test_server_grading_separates_missing_official_analysis_and_ai(self):
        first = self.client.get(
            "/api/verbal-catalog/logic-fill/questions?limit=1", headers=self.headers_a
        ).json()["items"][0]
        result = self.client.post(
            "/api/verbal-catalog/logic-fill/attempts",
            headers=self.headers_a,
            json={
                "question_id": first["id"],
                "selected_answer": "A",
                "elapsed_ms": 2345,
                "user_id": 202,
            },
        )
        self.assertEqual(result.status_code, 201, result.text)
        body = result.json()
        self.assertIn(body["correct_answer"], {"A", "B", "C", "D"})
        self.assertEqual(body["official_analysis"]["status"], "missing")
        self.assertEqual(body["official_analysis"]["label"], "本题暂无原书解析")
        self.assertIsNone(body["official_analysis"]["content"])
        self.assertEqual(body["ai_explanation"]["status"], "not_generated")
        self.assertEqual(body["ai_explanation"]["label"], "AI讲解")
        self.assertIsNone(body["ai_explanation"]["content"])
        self.assertEqual(body["ai_context"]["user_answer"], "A")
        self.assertEqual(body["ai_context"]["correct_answer"], body["correct_answer"])
        with database.get_db() as conn:
            owner = conn.execute(
                "SELECT user_id FROM verbal_logic_attempts_v2 WHERE id=?", (body["id"],)
            ).fetchone()["user_id"]
            activity = conn.execute(
                """SELECT user_id,module_id,status,summary_json
                   FROM learning_activities_v2 WHERE source_id=?""",
                (body["question_id"],),
            ).fetchone()
        self.assertEqual(owner, 101)
        self.assertEqual(activity["user_id"], 101)
        self.assertEqual(activity["module_id"], "verbal.logic_fill")
        self.assertEqual(activity["status"], "completed")
        self.assertFalse(json.loads(activity["summary_json"])["official_analysis_available"])

    def test_vocab_and_attempt_state_are_isolated_by_jwt_user(self):
        save = self.client.put(
            "/api/verbal-catalog/vocab/state",
            headers=self.headers_a,
            json={"word": "源远流长", "favorite": True, "study_count": 2, "user_id": 202},
        )
        self.assertEqual(save.status_code, 200, save.text)
        self.assertEqual(len(self.client.get("/api/verbal-catalog/vocab/state", headers=self.headers_a).json()), 1)
        self.assertEqual(self.client.get("/api/verbal-catalog/vocab/state", headers=self.headers_b).json(), [])

        question = self.client.get(
            "/api/verbal-catalog/logic-fill/questions?limit=1", headers=self.headers_a
        ).json()["items"][0]
        self.client.post(
            "/api/verbal-catalog/logic-fill/attempts",
            headers=self.headers_a,
            json={"question_id": question["id"], "selected_answer": "B"},
        )
        self.assertEqual(
            len(self.client.get("/api/verbal-catalog/logic-fill/attempts", headers=self.headers_a).json()),
            1,
        )
        self.assertEqual(
            self.client.get("/api/verbal-catalog/logic-fill/attempts", headers=self.headers_b).json(), []
        )

    def test_invalid_question_answer_and_word_are_rejected(self):
        self.assertEqual(
            self.client.post(
                "/api/verbal-catalog/logic-fill/attempts",
                headers=self.headers_a,
                json={"question_id": "missing", "selected_answer": "A"},
            ).status_code,
            404,
        )
        question = self.client.get(
            "/api/verbal-catalog/logic-fill/questions?limit=1", headers=self.headers_a
        ).json()["items"][0]
        self.assertEqual(
            self.client.post(
                "/api/verbal-catalog/logic-fill/attempts",
                headers=self.headers_a,
                json={"question_id": question["id"], "selected_answer": "E"},
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.put(
                "/api/verbal-catalog/vocab/state",
                headers=self.headers_a,
                json={"word": "不存在的词"},
            ).status_code,
            404,
        )


if __name__ == "__main__":
    unittest.main()
