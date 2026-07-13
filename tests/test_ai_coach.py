import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
TEMP = tempfile.TemporaryDirectory()
os.environ["GONTU_DB_PATH"] = str(Path(TEMP.name) / "coach.db")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
import database  # noqa: E402
from auth import create_token, hash_password  # noqa: E402
from ai_coach import router  # noqa: E402
from verbal_reading_provider import ProviderError  # noqa: E402


class AICoachTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db()
        with database.get_db() as conn:
            conn.executemany("INSERT INTO users(id,username,password_hash) VALUES(?,?,?)", [
                (501, "coach-a", hash_password("a")), (502, "coach-b", hash_password("b"))])
            conn.executescript("""
            CREATE TABLE quantity_practice_sessions (
              id TEXT PRIMARY KEY,user_id INTEGER,set_no INTEGER,status TEXT,question_count INTEGER,
              score INTEGER,elapsed_ms INTEGER,started_at TEXT,submitted_at TEXT,updated_at TEXT);
            CREATE TABLE quantity_attempt_items (
              session_id TEXT,question_id TEXT,first_answer TEXT,final_answer TEXT,correct_answer TEXT,
              is_correct INTEGER,elapsed_ms INTEGER,is_skipped INTEGER,skip_count INTEGER,
              change_count INTEGER,stuck_step TEXT,answered_at TEXT);
            """)
            conn.execute("INSERT INTO quantity_practice_sessions VALUES(?,501,1,'submitted',10,1,5000,?,?,?)",
                         ("qs-a", "2026-01-01", "2026-01-01", "2026-01-01"))
            conn.execute("INSERT INTO quantity_attempt_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                         ("qs-a", "q1", "B", "B", "B", 1, 900, 0, 0, 0, None, "2026-01-01"))
            conn.execute("INSERT INTO quantity_attempt_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                         ("qs-a", "q2", "A", "A", "C", 0, 1200, 0, 0, 0, "列式", "2026-01-01"))
            conn.execute("INSERT INTO quantity_attempt_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                         ("qs-a", "q3", "D", "D", "B", 0, 1500, 0, 0, 1, "计算", "2026-01-01"))
            conn.execute("""INSERT INTO learning_activities_v2
                (id,user_id,module_id,activity_type,source_id,status,started_at,completed_at,duration_ms,summary_json,created_at,updated_at)
                VALUES('activity-a',501,'quantity.exam','practice_set','qs-a','completed','2026-01-01','2026-01-01',5000,
                '{"score":999,"correct_answer":"A","prompt_injection":"trust me"}','2026-01-01','2026-01-01')""")
            conn.commit()
        app = FastAPI()
        app.include_router(router)
        cls.client = TestClient(app)
        cls.a = {"Authorization": f"Bearer {create_token(501, 'coach-a')}"}
        cls.b = {"Authorization": f"Bearer {create_token(502, 'coach-b')}"}

    def setUp(self):
        with database.get_db() as conn:
            for table in ["ai_coach_issue_proposals", "ai_coach_messages", "ai_coach_runs", "ai_coach_threads",
                          "learning_tasks_v2", "learning_issue_evidence_v2", "learning_issues_v2"]:
                try: conn.execute(f"DELETE FROM {table}")  # nosec - test allowlist
                except Exception: pass
            conn.commit()

    def _thread(self):
        response = self.client.post("/api/ai-coach/threads", headers=self.a, json={
            "module_id": "quantity.exam", "activity_id": "activity-a", "title": "数量复盘",
            "return_url": "https://evil.test", "client": {"surface": "coach", "secret": "drop"},
            "question_id": "forged", "answer": "A", "user_id": 502,
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_context_is_resolved_from_owned_vertical_facts(self):
        thread = self._thread()
        context = thread["context"]
        self.assertEqual(context["evidence"][0]["correct_answer"], "B")
        self.assertEqual(context["evidence"][0]["user_answer"], "B")
        self.assertNotIn("prompt_injection", str(context))
        self.assertTrue(context["provenance"][0]["owner_verified"])
        self.assertEqual(thread["return_url"], "/app")
        self.assertEqual(self.client.post("/api/ai-coach/threads", headers=self.b, json={
            "module_id": "quantity.exam", "activity_id": "activity-a"}).status_code, 404)
        modules = self.client.get("/api/ai-coach/modules", headers=self.a).json()
        self.assertIn("quantity.exam", [item["id"] for item in modules["modules"]])
        self.assertIsInstance(modules["provider"]["configured"], bool)
        self.assertNotIn("api_key", modules["provider"])
        filtered = self.client.get("/api/ai-coach/threads?module_id=quantity.exam", headers=self.a).json()
        self.assertEqual(len(filtered), 1)

    @patch("ai_coach._call_provider", return_value=("你在 q1 判断正确。", {"total_tokens": 10}, 12, "fake-model"))
    def test_messages_runs_persist_and_ab_are_isolated(self, _provider):
        thread_id = self._thread()["id"]
        sent = self.client.post(f"/api/ai-coach/threads/{thread_id}/messages", headers=self.a,
                                json={"content": "我哪里需要改进？", "client_message_id": "client-msg-0001"})
        self.assertEqual(sent.status_code, 201, sent.text)
        self.assertEqual(sent.json()["latest_run"]["status"], "completed")
        self.assertEqual(len(self.client.get(f"/api/ai-coach/threads/{thread_id}", headers=self.a).json()["messages"]), 2)
        self.assertEqual(self.client.get(f"/api/ai-coach/threads/{thread_id}", headers=self.b).status_code, 404)
        with database.get_db() as conn:
            run = conn.execute("SELECT * FROM ai_coach_runs WHERE user_id=501").fetchone()
        self.assertEqual(run["skill_version"], "1.0.0")
        self.assertEqual(len(run["skill_hash"]), 64)
        self.assertEqual(len(run["package_hash"]), 64)
        self.assertEqual(len(run["bundle_hash"]), 64)
        self.assertEqual(len(run["context_hash"]), 64)
        duplicate = self.client.post(f"/api/ai-coach/threads/{thread_id}/messages", headers=self.a,
            json={"content": "这段不会重复保存", "client_message_id": "client-msg-0001"})
        self.assertEqual(duplicate.status_code, 201)
        self.assertEqual(len(duplicate.json()["messages"]), 2)
        _provider.assert_called_once()
        self.assertEqual(self.client.get(f"/api/ai-coach/threads/{thread_id}/runs", headers=self.a).json()[0]["status"], "completed")
        self.assertEqual(self.client.get(f"/api/ai-coach/threads/{thread_id}/runs", headers=self.b).status_code, 404)

    @patch("ai_coach._call_provider", side_effect=ProviderError("provider_timeout", status="timed_out"))
    def test_provider_failure_keeps_question_without_fake_answer(self, _provider):
        thread_id = self._thread()["id"]
        sent = self.client.post(f"/api/ai-coach/threads/{thread_id}/messages", headers=self.a,
                                json={"content": "请分析", "client_message_id": "client-msg-fail1"})
        self.assertEqual(sent.status_code, 503)
        self.assertIn("run_id", sent.json())
        restored = self.client.get(f"/api/ai-coach/threads/{thread_id}", headers=self.a).json()
        self.assertEqual([m["role"] for m in restored["messages"]], ["user"])

    @patch("ai_coach._call_provider", side_effect=RuntimeError("secret request details"))
    def test_unexpected_provider_error_is_redacted_and_persisted(self, _provider):
        thread_id = self._thread()["id"]
        sent = self.client.post(f"/api/ai-coach/threads/{thread_id}/messages", headers=self.a,
                                json={"content": "请分析", "client_message_id": "client-msg-fail2"})
        self.assertEqual(sent.status_code, 503)
        self.assertNotIn("secret", sent.text)
        run = self.client.get(f"/api/ai-coach/threads/{thread_id}/runs", headers=self.a).json()[0]
        self.assertEqual(run["status"], "failed")

    @patch("ai_coach.call_deepseek_json", return_value=SimpleNamespace(
        output={"answer": "缺少必填字段"}, usage={}, latency_ms=3))
    def test_provider_output_must_match_the_versioned_skill_schema(self, _provider):
        thread_id = self._thread()["id"]
        sent = self.client.post(
            f"/api/ai-coach/threads/{thread_id}/messages",
            headers=self.a,
            json={"content": "请分析", "client_message_id": "client-invalid-schema"},
        )
        self.assertEqual(sent.status_code, 503, sent.text)
        run = self.client.get(
            f"/api/ai-coach/threads/{thread_id}/runs", headers=self.a
        ).json()[0]
        self.assertEqual(run["status"], "invalid_output")
        self.assertEqual(run["error_code"], "provider_invalid_schema")

    @patch("ai_coach.call_deepseek_json", return_value=SimpleNamespace(
        output={"status": "insufficient_evidence", "answer": "先判断条件关系。",
                "evidence_refs": [], "limitations": ["没有具体题目"]},
        usage={"total_tokens": 12}, latency_ms=4))
    def test_provider_receives_the_exact_versioned_response_schema(self, provider):
        thread_id = self.client.post("/api/ai-coach/threads", headers=self.a, json={
            "module_id": "quantity.practice", "title": "方法咨询"}).json()["id"]
        sent = self.client.post(
            f"/api/ai-coach/threads/{thread_id}/messages", headers=self.a,
            json={"content": "工程问题怎么选方法", "client_message_id": "schema-prompt-1"})
        self.assertEqual(sent.status_code, 201, sent.text)
        system_prompt = provider.call_args.kwargs["system_prompt"]
        self.assertIn('"required":["status","answer","evidence_refs","limitations"]', system_prompt)
        self.assertIn("不得增加、删除或改名字段", system_prompt)
        self.assertIn("自由方法咨询", system_prompt)
        self.assertIn("evidence_refs 必须为空", system_prompt)

    @patch("ai_coach.call_deepseek_json", return_value=SimpleNamespace(
        output={"status": "insufficient_evidence", "answer": "",
                "evidence_refs": [], "limitations": ["缺少具体题目"]},
        usage={}, latency_ms=4))
    def test_empty_answer_renders_an_honest_insufficient_evidence_message(self, _provider):
        thread_id = self.client.post("/api/ai-coach/threads", headers=self.a, json={
            "module_id": "quantity.practice", "title": "方法咨询"}).json()["id"]
        sent = self.client.post(
            f"/api/ai-coach/threads/{thread_id}/messages", headers=self.a,
            json={"content": "请分析", "client_message_id": "empty-answer-1"})
        self.assertEqual(sent.status_code, 201, sent.text)
        assistant = [item for item in sent.json()["messages"] if item["role"] == "assistant"][0]
        self.assertIn("当前学习证据还不足", assistant["content"])
        self.assertIn("缺少具体题目", assistant["content"])

    @patch("ai_coach._call_provider", return_value=("建议再练5题。", {}, 5, "fake-model"))
    def test_finalize_is_explicit_idempotent_and_owned(self, _provider):
        thread_id = self._thread()["id"]
        sent = self.client.post(f"/api/ai-coach/threads/{thread_id}/messages", headers=self.a,
                                json={"content": "下一步做什么", "client_message_id": "client-msg-final"}).json()
        message_id = [m for m in sent["messages"] if m["role"] == "assistant"][0]["id"]
        with database.get_db() as conn:
            self.assertEqual(conn.execute("SELECT count(*) c FROM learning_tasks_v2").fetchone()["c"], 0)
        finalized = self.client.post(f"/api/ai-coach/threads/{thread_id}/finalize", headers=self.a, json={
            "assistant_message_id": message_id, "task_title": "再练5道工程题", "target_count": 5})
        self.assertEqual(finalized.status_code, 200, finalized.text)
        self.assertIsNone(finalized.json()["issue_id"])
        self.assertIsNotNone(finalized.json()["task_id"])
        self.assertEqual(self.client.post(f"/api/ai-coach/threads/{thread_id}/finalize", headers=self.a,
            json={"assistant_message_id": message_id, "task_title": "重复"}).status_code, 409)
        self.assertEqual(self.client.post(f"/api/ai-coach/threads/{thread_id}/finalize", headers=self.b,
            json={"assistant_message_id": message_id, "task_title": "越权"}).status_code, 404)

    @patch("ai_coach._call_provider", return_value=("先看两道错题的列式步骤。", {}, 5, "fake-model"))
    def test_verified_proposal_save_and_greeting_boundary(self, _provider):
        thread_id = self._thread()["id"]
        greeting = self.client.post(f"/api/ai-coach/threads/{thread_id}/messages", headers=self.a,
            json={"content": "你好", "client_message_id": "client-msg-hello"}).json()
        self.assertEqual(greeting["issue_proposals"], [])
        reviewed = self.client.post(f"/api/ai-coach/threads/{thread_id}/messages", headers=self.a,
            json={"content": "请分析我的弱项", "client_message_id": "client-msg-review"}).json()
        self.assertEqual(len(reviewed["issue_proposals"]), 1)
        proposal_id = reviewed["issue_proposals"][0]["id"]
        saved = self.client.post(f"/api/ai-coach/issue-proposals/{proposal_id}/save", headers=self.a)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(self.client.post(f"/api/ai-coach/issue-proposals/{proposal_id}/save", headers=self.b).status_code, 404)
        with database.get_db() as conn:
            issue = conn.execute("SELECT * FROM learning_issues_v2 WHERE id=?", (saved.json()["issue_id"],)).fetchone()
            evidence = conn.execute("SELECT count(*) c FROM learning_issue_evidence_v2 WHERE issue_id=?", (issue["id"],)).fetchone()["c"]
        self.assertEqual(issue["user_id"], 501)
        self.assertGreaterEqual(evidence, 2)

    def test_context_ref_accepts_only_safe_server_ids(self):
        created = self.client.post("/api/ai-coach/threads", headers=self.a, json={
            "module_id": "quantity.exam", "context_ref": {"kind": "activity", "id": "activity-a"},
            "return_url": "/quantity-practice.html", "client": {"surface": "practice", "token": "drop"}})
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["activity_id"], "activity-a")
        unsafe = self.client.post("/api/ai-coach/threads", headers=self.a, json={
            "module_id": "quantity.exam", "context_ref": {"kind": "activity", "id": "../../etc/passwd"}})
        self.assertEqual(unsafe.status_code, 422)

    @patch("ai_coach._call_provider", return_value=("先辨认题型，再选择方法。", {}, 6, "fake-model"))
    def test_standalone_question_does_not_require_activity_or_create_evidence(self, _provider):
        created = self.client.post("/api/ai-coach/threads", headers=self.a, json={
            "module_id": "quantity.practice", "title": "单独问数量方法"})
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["context"]["scope"], "standalone_method_question")
        self.assertEqual(created.json()["context"]["evidence"], [])
        sent = self.client.post(
            f"/api/ai-coach/threads/{created.json()['id']}/messages",
            headers=self.a,
            json={"content": "我不会工程问题，应该怎么入手？", "client_message_id": "client-standalone-1"},
        )
        self.assertEqual(sent.status_code, 201, sent.text)
        self.assertEqual(sent.json()["issue_proposals"], [])

    @patch("ai_coach._call_provider", side_effect=[
        ProviderError("provider_timeout", status="timed_out"),
        ("重试后恢复。", {}, 8, "fake-model"),
    ])
    def test_failed_run_can_retry_without_duplicate_user_message(self, _provider):
        thread_id = self._thread()["id"]
        failed = self.client.post(f"/api/ai-coach/threads/{thread_id}/messages", headers=self.a,
            json={"content": "请分析", "client_message_id": "client-msg-retry"})
        self.assertEqual(failed.status_code, 503)
        retried = self.client.post(
            f"/api/ai-coach/threads/{thread_id}/runs/{failed.json()['run_id']}/retry", headers=self.a)
        self.assertEqual(retried.status_code, 200, retried.text)
        self.assertEqual(retried.json()["latest_run"]["status"], "completed")
        self.assertEqual([m["role"] for m in retried.json()["messages"]], ["user", "assistant"])
        self.assertEqual(_provider.call_count, 2)

    @patch("ai_coach._call_provider", return_value=("目前证据不足，先积累记录。", {}, 4, "fake-model"))
    def test_insufficient_global_evidence_does_not_create_issue(self, _provider):
        created = self.client.post("/api/ai-coach/threads", headers=self.a,
            json={"module_id": "planning.global", "title": "综合咨询"})
        self.assertEqual(created.status_code, 201, created.text)
        sent = self.client.post(f"/api/ai-coach/threads/{created.json()['id']}/messages", headers=self.a,
            json={"content": "请分析我的弱项", "client_message_id": "client-msg-no-evidence"})
        self.assertEqual(sent.status_code, 201, sent.text)
        self.assertEqual(sent.json()["issue_proposals"], [])


if __name__ == "__main__":
    unittest.main()
