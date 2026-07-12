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
os.environ["GONTU_DB_PATH"] = str(Path(_TEMP_DIR.name) / "verbal-api-test.db")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-key-not-real")

from fastapi.testclient import TestClient  # noqa: E402
import database  # noqa: E402
from auth import create_token, hash_password  # noqa: E402
from main import app  # noqa: E402
from verbal_reading_provider import ProviderResult, TextProviderResult  # noqa: E402


class VerbalReadingAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db()
        with database.get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
                (101, "verbal-a", hash_password("password-a")),
            )
            conn.execute(
                "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
                (202, "verbal-b", hash_password("password-b")),
            )
            conn.commit()
        cls.client = TestClient(app)
        cls.headers_a = {
            "Authorization": f"Bearer {create_token(101, 'verbal-a')}"
        }
        cls.headers_b = {
            "Authorization": f"Bearer {create_token(202, 'verbal-b')}"
        }

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        _TEMP_DIR.cleanup()

    def setUp(self):
        with database.get_db() as conn:
            conn.execute("DELETE FROM verbal_training_recommendations")
            conn.execute("DELETE FROM verbal_ai_messages")
            conn.execute("DELETE FROM verbal_ai_runs")
            conn.execute("DELETE FROM verbal_attempt_items")
            conn.execute("DELETE FROM verbal_practice_sessions")
            conn.commit()

    def _create(self, headers=None, body=None):
        return self.client.post(
            "/api/verbal-reading/sessions",
            headers=headers or self.headers_a,
            json=body or {"set_id": "verbal_hs13_set28"},
        )

    def test_unauthenticated_requests_are_rejected(self):
        response = self.client.post(
            "/api/verbal-reading/sessions", json={"set_id": "verbal_hs13_set28"}
        )
        self.assertEqual(response.status_code, 401)

    def test_invalid_set_is_rejected(self):
        response = self._create(body={"set_id": "missing-set"})
        self.assertEqual(response.status_code, 404)

    def test_session_answers_submit_restore_and_idempotency(self):
        created = self._create()
        self.assertEqual(created.status_code, 201, created.text)
        session_id = created.json()["id"]
        question_id = "verbal_hs13_set28_q01"

        first = self.client.put(
            f"/api/verbal-reading/sessions/{session_id}/answers",
            headers=self.headers_a,
            json={"question_id": question_id, "answer": "C", "elapsed_ms": 12000},
        )
        self.assertEqual(first.status_code, 200, first.text)
        changed = self.client.put(
            f"/api/verbal-reading/sessions/{session_id}/answers",
            headers=self.headers_a,
            json={"question_id": question_id, "answer": "B", "elapsed_ms": 18000},
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        attempt = changed.json()["attempts"][0]
        self.assertEqual(attempt["first_answer"], "C")
        self.assertEqual(attempt["final_answer"], "B")
        self.assertEqual(attempt["change_count"], 1)
        self.assertNotIn("correct_answer", attempt)
        self.assertNotIn("is_correct", attempt)

        submitted = self.client.post(
            f"/api/verbal-reading/sessions/{session_id}/submit",
            headers=self.headers_a,
            json={"elapsed_ms": 45000},
        )
        self.assertEqual(submitted.status_code, 200, submitted.text)
        self.assertEqual(submitted.json()["status"], "submitted")
        self.assertEqual(submitted.json()["score"], 1)
        submitted_attempt = submitted.json()["attempts"][0]
        self.assertEqual(submitted_attempt["correct_answer"], "B")
        self.assertEqual(submitted_attempt["is_correct"], 1)
        self.assertEqual(len(submitted.json()["review_questions"]), 20)
        replay = self.client.post(
            f"/api/verbal-reading/sessions/{session_id}/submit",
            headers=self.headers_a,
            json={"elapsed_ms": 99999},
        )
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json()["elapsed_ms"], 45000)

        after_submit = self.client.put(
            f"/api/verbal-reading/sessions/{session_id}/answers",
            headers=self.headers_a,
            json={"question_id": question_id, "answer": "A", "elapsed_ms": 20000},
        )
        self.assertEqual(after_submit.status_code, 409)

        restored = self.client.get(
            f"/api/verbal-reading/sessions/{session_id}", headers=self.headers_a
        )
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.json()["attempts"][0]["final_answer"], "B")

    def test_user_isolation_and_frontend_user_id_is_ignored(self):
        created = self._create(
            body={"set_id": "verbal_hs13_set28", "user_id": 202}
        )
        self.assertEqual(created.status_code, 201, created.text)
        session_id = created.json()["id"]
        with database.get_db() as conn:
            owner = conn.execute(
                "SELECT user_id FROM verbal_practice_sessions WHERE id=?", (session_id,)
            ).fetchone()["user_id"]
        self.assertEqual(owner, 101)

        other_get = self.client.get(
            f"/api/verbal-reading/sessions/{session_id}", headers=self.headers_b
        )
        self.assertEqual(other_get.status_code, 404)
        other_write = self.client.put(
            f"/api/verbal-reading/sessions/{session_id}/answers",
            headers=self.headers_b,
            json={
                "question_id": "verbal_hs13_set28_q01",
                "answer": "B",
                "elapsed_ms": 1000,
            },
        )
        self.assertEqual(other_write.status_code, 404)
        self.assertEqual(
            self.client.get("/api/verbal-reading/sessions", headers=self.headers_b).json(),
            [],
        )
        self.assertEqual(
            len(self.client.get("/api/verbal-reading/sessions", headers=self.headers_a).json()),
            1,
        )

    def test_question_must_belong_to_session_set(self):
        session_id = self._create().json()["id"]
        response = self.client.put(
            f"/api/verbal-reading/sessions/{session_id}/answers",
            headers=self.headers_a,
            json={
                "question_id": "verbal_hs13_set29_q01",
                "answer": "D",
                "elapsed_ms": 1000,
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_practice_question_payload_hides_answers_until_submit(self):
        response = self.client.get(
            "/api/verbal-reading/sets/verbal_hs13_set28/questions",
            headers=self.headers_a,
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()), 20)
        first = response.json()[0]
        for forbidden in (
            "answer",
            "official_analysis",
            "peanut_notes",
            "ai_brief_example",
            "analysis_source",
        ):
            self.assertNotIn(forbidden, first)
        self.assertNotIn("method_tags", first["learning_tags"])
        self.assertNotIn("option_trap_tags", first["learning_tags"])
        self.assertIsInstance(first["related_terms"], list)

        unauthenticated = self.client.get(
            "/api/verbal-reading/sets/verbal_hs13_set28/questions"
        )
        self.assertEqual(unauthenticated.status_code, 401)

        set_one = self.client.get(
            "/api/verbal-reading/sets/verbal_hs13_set01/questions",
            headers=self.headers_a,
        ).json()
        self.assertIn("一成不变", set_one[2]["related_terms"])

    def test_real_diagnosis_contract_is_persisted_and_user_owned(self):
        session_id = self._create().json()["id"]
        before_submit = self.client.post(
            f"/api/verbal-reading/sessions/{session_id}/diagnosis",
            headers=self.headers_a,
        )
        self.assertEqual(before_submit.status_code, 409)
        self.client.put(
            f"/api/verbal-reading/sessions/{session_id}/answers",
            headers=self.headers_a,
            json={
                "question_id": "verbal_hs13_set28_q01",
                "answer": "C",
                "elapsed_ms": 12000,
            },
        )
        self.client.post(
            f"/api/verbal-reading/sessions/{session_id}/submit",
            headers=self.headers_a,
            json={"elapsed_ms": 12000},
        )
        output = {
            "schema_version": 1,
            "status": "completed",
            "summary": "本套暴露出对策主体识别风险。",
            "primary_weakness": {
                "skill": "对策主体保留",
                "evidence_question_ids": ["verbal_hs13_set28_q01"],
                "confidence": 0.55,
                "reason": "本套仅有一道明确错题，因此按单题风险表述。",
            },
            "mistake_patterns": [
                {
                    "label": "主体偷换",
                    "question_ids": ["verbal_hs13_set28_q01"],
                    "explanation": "用户选择未保留原文对策主体。",
                }
            ],
            "question_feedback": [
                {
                    "question_id": "verbal_hs13_set28_q01",
                    "user_answer": "C",
                    "correct_answer": "B",
                    "why_user_missed": "错误项扩大了对策主体。",
                    "better_path": ["识别问法", "锁定对策主体", "比较选项"],
                    "next_signal": "看到对策句时先圈出执行主体。",
                }
            ],
            "next_training": {
                "focus": "对策主体保留",
                "recommended_question_ids": [],
                "reason": "Phase 2尚未启用推荐候选池。",
                "practice_instruction": "复盘时圈出每道对策题的主体。",
            },
            "limitations": ["只有一道错题，不能推断长期弱项。"],
        }
        fake_result = ProviderResult(
            output=output,
            usage={"prompt_tokens": 100, "completion_tokens": 200, "total_tokens": 300},
            latency_ms=321,
        )
        with patch("verbal_reading.call_deepseek_json", return_value=fake_result) as provider:
            response = self.client.post(
                f"/api/verbal-reading/sessions/{session_id}/diagnosis",
                headers=self.headers_a,
            )
            replay = self.client.post(
                f"/api/verbal-reading/sessions/{session_id}/diagnosis",
                headers=self.headers_a,
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["ai_status"], "completed")
        self.assertEqual(response.json()["ai_run"]["provider"], "deepseek")
        self.assertEqual(response.json()["ai_run"]["skill_version"], "1.1.0")
        self.assertEqual(response.json()["ai_run"]["latency_ms"], 321)
        self.assertEqual(response.json()["ai_run"]["usage"]["total_tokens"], 300)
        self.assertEqual(response.json()["ai_run"]["diagnosis"], output)
        self.assertEqual(replay.json()["ai_run"]["id"], response.json()["ai_run"]["id"])
        self.assertEqual(provider.call_count, 1)
        recommendations = self.client.get(
            f"/api/verbal-reading/sessions/{session_id}/recommendations",
            headers=self.headers_a,
        )
        self.assertEqual(recommendations.status_code, 200, recommendations.text)
        self.assertGreaterEqual(len(recommendations.json()), 3)
        self.assertLessEqual(len(recommendations.json()), 5)
        for item in recommendations.json():
            self.assertNotEqual(item["set_id"], "verbal_hs13_set28")
            self.assertNotIn("answer", item)
            self.assertNotIn("official_analysis", item)
            dimensions = {tag.split(":", 1)[0] for tag in item["reason_tags"]}
            self.assertGreaterEqual(len(dimensions), 2)
            self.assertFalse(
                any(tag.startswith("陷阱:正确") for tag in item["reason_tags"]),
                item["reason_tags"],
            )
            self.assertIsInstance(item["content"]["options"], list)
        self.assertEqual(
            self.client.post(
                f"/api/verbal-reading/sessions/{session_id}/diagnosis",
                headers=self.headers_b,
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.get(
                f"/api/verbal-reading/sessions/{session_id}/recommendations",
                headers=self.headers_b,
            ).status_code,
            404,
        )

    def test_follow_up_uses_bound_question_context_and_persists_messages(self):
        session_id = self._create().json()["id"]
        self.client.put(
            f"/api/verbal-reading/sessions/{session_id}/answers",
            headers=self.headers_a,
            json={
                "question_id": "verbal_hs13_set28_q01",
                "answer": "C",
                "elapsed_ms": 9000,
            },
        )
        self.client.post(
            f"/api/verbal-reading/sessions/{session_id}/submit",
            headers=self.headers_a,
            json={"elapsed_ms": 9000},
        )
        fake = TextProviderResult(
            content="你这题选择C，官方答案是B。官方解析强调主体不能扩大；下次先圈出对策主体。",
            usage={"total_tokens": 180},
            latency_ms=222,
        )
        with patch("verbal_reading.call_deepseek_text", return_value=fake) as provider:
            response = self.client.post(
                f"/api/verbal-reading/sessions/{session_id}/messages",
                headers=self.headers_a,
                json={
                    "content": "我为什么会选错？",
                    "question_id": "verbal_hs13_set28_q01",
                },
            )
        self.assertEqual(response.status_code, 200, response.text)
        messages = response.json()["messages"]
        self.assertEqual([item["role"] for item in messages], ["user", "assistant"])
        self.assertEqual(messages[0]["question_id"], "verbal_hs13_set28_q01")
        self.assertIn("选择C", messages[1]["content"])
        prompt = provider.call_args.kwargs["user_prompt"]
        self.assertIn('"user_answer":"C"', prompt)
        self.assertIn('"correct_answer":"B"', prompt)
        self.assertIn('"official_analysis":', prompt)
        self.assertEqual(
            self.client.post(
                f"/api/verbal-reading/sessions/{session_id}/messages",
                headers=self.headers_b,
                json={"content": "越权追问"},
            ).status_code,
            404,
        )
        invalid_question = self.client.post(
            f"/api/verbal-reading/sessions/{session_id}/messages",
            headers=self.headers_a,
            json={"content": "错误题号", "question_id": "missing-question"},
        )
        self.assertEqual(invalid_question.status_code, 422)


if __name__ == "__main__":
    unittest.main()
