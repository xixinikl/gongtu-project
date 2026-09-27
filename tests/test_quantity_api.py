"""Security and behavior tests for the approved quantity adapter."""
from __future__ import annotations

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
os.environ["GONTU_DB_PATH"] = str(Path(_TEMP_DIR.name) / "quantity-api.db")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from auth import create_token, hash_password  # noqa: E402
from database import get_db, init_db  # noqa: E402
from quantity import _load_bank, router  # noqa: E402


class QuantityApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        with get_db() as conn:
            conn.executemany(
                "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
                [
                    (101, "quantity-a", hash_password("secret-a")),
                    (202, "quantity-b", hash_password("secret-b")),
                ],
            )
            conn.commit()
        app = FastAPI()
        app.include_router(router)
        cls.client = TestClient(app)
        cls.headers_a = {"Authorization": f"Bearer {create_token(101, 'quantity-a')}"}
        cls.headers_b = {"Authorization": f"Bearer {create_token(202, 'quantity-b')}"}

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        _TEMP_DIR.cleanup()

    def test_bank_gate_and_pre_submit_redaction(self):
        bank = _load_bank()
        self.assertEqual(sum(len(items) for items in bank["sets"].values()), 600)
        self.assertEqual(len(bank["sets"]), 60)
        response = self.client.get("/api/quantity/sets/8/questions", headers=self.headers_a)
        self.assertEqual(response.status_code, 200)
        questions = response.json()
        self.assertEqual(len(questions), 10)
        q7 = questions[6]
        self.assertEqual([item["key"] for item in q7["options"]], list("ABCDEFGH"))
        self.assertNotIn("answer", q7)
        self.assertNotIn("analysis", q7)
        self.assertNotIn("answer_source", q7)
        self.assertEqual(q7["decision_scope"], "question_baseline")
        topics = self.client.get("/api/quantity/topics", headers=self.headers_a)
        self.assertEqual(topics.status_code, 200)
        self.assertGreater(len(topics.json()), 1)
        self.assertEqual(sum(item["question_count"] for item in topics.json()), 600)
        self.assertTrue(all(1 <= item["first_set"] <= 60 for item in topics.json()))
        self.assertTrue(all(item["decision_label"] in {"必做", "可做", "先跳"} for item in topics.json()))
        self.assertEqual(
            topics.json(),
            sorted(
                topics.json(),
                key=lambda item: (-item["priority_score"], -item["question_count"], item["topic"]),
            ),
        )

    def test_single_diagnosis_is_one_real_question_and_review_recommends_next_step(self):
        topic = self.client.get("/api/quantity/topics", headers=self.headers_a).json()[0]["topic"]
        created = self.client.post(
            "/api/quantity/single-sessions",
            headers=self.headers_a,
            json={"topic": topic},
        )
        self.assertEqual(created.status_code, 201, created.text)
        single = created.json()
        self.assertEqual(single["topic"], topic)
        self.assertNotIn("answer", single["question"])
        answer = _load_bank()["by_id"][single["question_id"]]["answer"]
        submitted = self.client.post(
            f"/api/quantity/single-sessions/{single['id']}/submit",
            headers=self.headers_a,
            json={
                "answer": answer,
                "elapsed_ms": 64000,
                "stuck_step": "列式关系",
                "work_note": "设总量，列出关键关系式。",
            },
        )
        self.assertEqual(submitted.status_code, 200, submitted.text)
        self.assertTrue(submitted.json()["is_correct"])
        self.assertEqual(submitted.json()["question"]["answer"], answer)
        self.assertIn("analysis", submitted.json()["question"])
        summary = self.client.get("/api/quantity/review-summary", headers=self.headers_a)
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json()["single_count"], 1)
        self.assertEqual(summary.json()["recommendation"]["topic"], topic)
        self.assertIn("列式关系", summary.json()["recommendation"]["reason"])

        # Another account cannot read this single-question evidence.
        self.assertEqual(
            self.client.get(
                f"/api/quantity/single-sessions/{single['id']}", headers=self.headers_b
            ).status_code,
            404,
        )

    def test_all_routes_require_auth_and_media_is_safe(self):
        self.assertEqual(self.client.get("/api/quantity/sets").status_code, 401)
        self.assertEqual(self.client.get("/api/quantity/sets/1/questions").status_code, 401)
        self.assertEqual(self.client.post("/api/quantity/sessions", json={"set_no": 1}).status_code, 401)
        questions = self.client.get(
            "/api/quantity/sets/1/questions", headers=self.headers_a
        ).json()
        q4 = questions[3]
        self.assertEqual(len(q4["media"]), 1)
        self.assertNotIn(str(ROOT), q4["media"][0]["url"])
        media = self.client.get(q4["media"][0]["url"], headers=self.headers_a)
        self.assertEqual(media.status_code, 200)
        self.assertTrue(media.headers["content-type"].startswith("image/"))

    def test_server_judging_process_evidence_and_refresh_restore(self):
        created = self.client.post(
            "/api/quantity/sessions",
            json={"set_no": 8, "user_id": 202},
            headers=self.headers_a,
        )
        self.assertEqual(created.status_code, 201)
        session_id = created.json()["id"]
        q7_id = "quantity_hs13_set08_q07"

        first = self.client.put(
            f"/api/quantity/sessions/{session_id}/attempts",
            json={
                "question_id": q7_id,
                "answer": "D",
                "elapsed_ms": 92000,
                "stuck_step": "列式关系",
            },
            headers=self.headers_a,
        )
        self.assertEqual(first.status_code, 200)
        self.assertNotIn("correct_answer", first.json()["attempts"][0])
        changed = self.client.put(
            f"/api/quantity/sessions/{session_id}/attempts",
            json={
                "question_id": q7_id,
                "answer": "E",
                "elapsed_ms": 105000,
                "stuck_step": "计算速度",
            },
            headers=self.headers_a,
        ).json()
        self.assertEqual(changed["attempts"][0]["change_count"], 1)

        # A new token for the same user models refresh/logout-login restoration;
        # persistence is keyed by JWT identity rather than browser memory.
        relogin_headers = {
            "Authorization": f"Bearer {create_token(101, 'quantity-a')}"
        }
        restored = self.client.get(
            f"/api/quantity/sessions/{session_id}", headers=relogin_headers
        ).json()
        self.assertEqual(restored["attempts"][0]["elapsed_ms"], 105000)
        self.assertEqual(restored["attempts"][0]["stuck_step"], "计算速度")

        submitted = self.client.post(
            f"/api/quantity/sessions/{session_id}/submit",
            json={"elapsed_ms": 130000},
            headers=self.headers_a,
        )
        self.assertEqual(submitted.status_code, 200)
        result = submitted.json()
        self.assertEqual(result["score"], 1)
        self.assertEqual(result["attempts"][0]["correct_answer"], "E")
        self.assertTrue(result["attempts"][0]["is_correct"])
        self.assertEqual(result["review_questions"][6]["answer"], "E")
        self.assertIn("analysis", result["review_questions"][6])
        self.assertEqual(result["analysis_visual_audit"]["status"], "incomplete")
        self.assertFalse(result["analysis_visual_audit"]["analysis_media_available"])
        with get_db() as conn:
            activity = conn.execute(
                """SELECT user_id,module_id,status,duration_ms,summary_json
                   FROM learning_activities_v2 WHERE id=?""",
                (f"quantity:{session_id}",),
            ).fetchone()
        self.assertEqual(activity["user_id"], 101)
        self.assertEqual(activity["module_id"], "quantity.exam")
        self.assertEqual(activity["status"], "completed")
        self.assertEqual(activity["duration_ms"], 130000)
        self.assertEqual(json.loads(activity["summary_json"])["set_no"], 8)

    def test_skip_history_validation_and_user_isolation(self):
        created = self.client.post(
            "/api/quantity/sessions", json={"set_no": 1}, headers=self.headers_a
        ).json()
        session_id = created["id"]
        q1 = "quantity_hs13_set01_q01"
        skipped = self.client.put(
            f"/api/quantity/sessions/{session_id}/attempts",
            json={
                "question_id": q1,
                "skipped": True,
                "elapsed_ms": 35000,
                "stuck_step": "取舍判断",
            },
            headers=self.headers_a,
        )
        self.assertEqual(skipped.status_code, 200)
        self.assertTrue(skipped.json()["attempts"][0]["is_skipped"])
        self.assertEqual(skipped.json()["attempts"][0]["skip_count"], 1)

        invalid = self.client.put(
            f"/api/quantity/sessions/{session_id}/attempts",
            json={"question_id": q1, "answer": "H", "elapsed_ms": 1},
            headers=self.headers_a,
        )
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(
            self.client.get(
                f"/api/quantity/sessions/{session_id}", headers=self.headers_b
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.put(
                f"/api/quantity/sessions/{session_id}/attempts",
                json={"question_id": q1, "answer": "D", "elapsed_ms": 1},
                headers=self.headers_b,
            ).status_code,
            404,
        )
        self.assertEqual(self.client.get("/api/quantity/sessions", headers=self.headers_b).json(), [])


if __name__ == "__main__":
    unittest.main()
