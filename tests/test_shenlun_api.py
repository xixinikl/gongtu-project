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
os.environ["GONTU_DB_PATH"] = str(Path(_TEMP_DIR.name) / "shenlun.db")
os.environ.setdefault("LLM_API_KEY", "test-key")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
import database  # noqa: E402
from auth import create_token, hash_password  # noqa: E402
from src.models import GradingResult  # noqa: E402
import shenlun  # noqa: E402
from src import prompt_builder  # noqa: E402


class ShenlunAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db()
        with database.get_db() as conn:
            conn.execute(
                "INSERT INTO users(id,username,password_hash) VALUES(?,?,?)",
                (301, "shenlun-a", hash_password("password-a")),
            )
            conn.execute(
                "INSERT INTO users(id,username,password_hash) VALUES(?,?,?)",
                (302, "shenlun-b", hash_password("password-b")),
            )
            conn.commit()
        app = FastAPI()
        app.include_router(shenlun.router)
        cls.client = TestClient(app)
        cls.headers_a = {"Authorization": f"Bearer {create_token(301, 'shenlun-a')}"}
        cls.headers_b = {"Authorization": f"Bearer {create_token(302, 'shenlun-b')}"}

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        _TEMP_DIR.cleanup()

    def setUp(self):
        with database.get_db() as conn:
            conn.execute("DELETE FROM learning_issue_evidence_v2")
            conn.execute("DELETE FROM learning_tasks_v2")
            conn.execute("DELETE FROM learning_issues_v2")
            conn.execute("DELETE FROM learning_activities_v2")
            conn.execute("DELETE FROM shenlun_mistakes")
            conn.execute("DELETE FROM shenlun_history")
            conn.commit()

    def test_questions_require_live_account_and_never_leak_answers(self):
        catalog = json.loads((BACKEND / "data/questions.json").read_text(encoding="utf-8"))
        self.assertEqual(catalog["catalogStatus"], "summary-only")
        self.assertFalse(catalog["isComplete"])
        catalog_response = self.client.get(
            "/api/shenlun/catalog", headers=self.headers_a
        )
        self.assertEqual(
            catalog_response.json(),
            {
                "catalogStatus": "summary-only",
                "isComplete": False,
                "contentNotice": catalog["contentNotice"],
                "questionCount": 10,
            },
        )
        self.assertNotIn("referenceAnswer", catalog_response.text)
        self.assertNotIn("scoringPoints", catalog_response.text)
        self.assertEqual(self.client.get("/api/shenlun/catalog").status_code, 401)
        self.assertEqual(self.client.get("/api/shenlun/questions").status_code, 401)
        listed = self.client.get("/api/shenlun/questions", headers=self.headers_a)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(len(listed.json()), 10)
        self.assertTrue(all(item["contentStatus"] == "summary-only" for item in listed.json()))

        detail = self.client.get("/api/shenlun/questions/q4-4", headers=self.headers_a)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertFalse(detail.json()["isComplete"])
        self.assertNotIn("referenceAnswer", detail.json())
        self.assertNotIn("scoringPoints", detail.json())

        deleted_token = create_token(9999, "deleted")
        stale = self.client.get(
            "/api/shenlun/questions",
            headers={"Authorization": f"Bearer {deleted_token}"},
        )
        self.assertEqual(stale.status_code, 401)

    def test_missing_or_corrupt_question_source_is_explicit_and_private(self):
        expected = {
            "detail": {
                "code": "question_source_unavailable",
                "module_id": "shenlun.review",
                "content_status": "not_provided",
                "message": "申论题源暂未提供，请稍后再试。",
                "retryable": True,
            }
        }
        missing = Path(_TEMP_DIR.name) / "private-missing-questions.json"
        with patch.object(shenlun, "QUESTIONS_FILE", missing):
            for method, path, payload in (
                ("get", "/api/shenlun/catalog", None),
                ("get", "/api/shenlun/questions", None),
                ("get", "/api/shenlun/questions/q3-1", None),
                (
                    "post",
                    "/api/shenlun/grade",
                    {"questionId": "q3-1", "studentAnswer": "测试作答"},
                ),
                (
                    "post",
                    "/api/shenlun/chat",
                    {"questionId": "q3-1", "message": "如何审题？"},
                ),
            ):
                response = self.client.request(
                    method.upper(), path, headers=self.headers_a, json=payload
                )
                self.assertEqual(response.status_code, 503, response.text)
                self.assertEqual(response.json(), expected)
                self.assertNotIn(str(missing), response.text)
                self.assertNotIn("Shenlun question source is missing", response.text)

        corrupt = Path(_TEMP_DIR.name) / "private-corrupt-questions.json"
        corrupt.write_text("{not-json", encoding="utf-8")
        with patch.object(shenlun, "QUESTIONS_FILE", corrupt):
            response = self.client.get(
                "/api/shenlun/catalog", headers=self.headers_a
            )
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json(), expected)
            self.assertNotIn(str(corrupt), response.text)

    def test_unknown_question_is_not_provided_and_never_reaches_ai(self):
        expected = {
            "detail": {
                "code": "question_not_provided",
                "content_status": "not_provided",
                "message": "当前题库未提供这道题。",
                "retryable": False,
            }
        }
        with patch.object(shenlun, "llm_grade") as grade_mock, patch.object(
            shenlun, "llm_chat"
        ) as chat_mock:
            responses = [
                self.client.get(
                    "/api/shenlun/questions/not-provided", headers=self.headers_a
                ),
                self.client.post(
                    "/api/shenlun/grade",
                    headers=self.headers_a,
                    json={"questionId": "not-provided", "studentAnswer": "测试作答"},
                ),
                self.client.post(
                    "/api/shenlun/chat",
                    headers=self.headers_a,
                    json={"questionId": "not-provided", "message": "如何审题？"},
                ),
            ]
        for response in responses:
            self.assertEqual(response.status_code, 404, response.text)
            self.assertEqual(response.json(), expected)
        grade_mock.assert_not_called()
        chat_mock.assert_not_called()

    def test_chat_is_not_a_mistake_and_grade_is_aggregated_with_history(self):
        with patch.object(shenlun, "llm_chat", return_value="这是一次方法提问回复"):
            chat = self.client.post(
                "/api/shenlun/chat",
                headers=self.headers_a,
                json={"questionId": "q3-1", "message": "这道题应该怎么审题？"},
            )
        self.assertEqual(chat.status_code, 200, chat.text)
        self.assertEqual(
            self.client.get("/api/shenlun/mistakes", headers=self.headers_a).json(), []
        )
        with database.get_db() as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT COUNT(*) FROM learning_activities_v2 WHERE user_id=301"
                ).fetchone()[0],
                0,
            )

        first = GradingResult(
            dimensions={"内容完整性": "一般", "语言表达": "优秀"},
            overallComment="第一次批改",
            suggestions=["补齐要点"],
        )
        second = GradingResult(
            dimensions={"内容完整性": "一般", "语言表达": "优秀"},
            overallComment="第二次批改",
            suggestions=["继续精炼"],
        )
        with patch.object(shenlun, "llm_grade", side_effect=[first, second]):
            for answer in ("第一次正式作答", "第二次正式作答"):
                response = self.client.post(
                    "/api/shenlun/grade",
                    headers=self.headers_a,
                    json={"questionId": "q3-1", "studentAnswer": answer},
                )
                self.assertEqual(response.status_code, 200, response.text)
                meta = response.json()["runMetadata"]
                self.assertEqual(meta["skillVersion"], "1.0.0")
                self.assertEqual(len(meta["skillHash"]), 64)
                self.assertTrue(meta["model"])
                self.assertTrue(meta["provider"])

        mistakes = self.client.get("/api/shenlun/mistakes", headers=self.headers_a).json()
        self.assertEqual(len(mistakes), 1)
        self.assertEqual(mistakes[0]["studentAnswer"], "第二次正式作答")
        history = self.client.get("/api/shenlun/history", headers=self.headers_a).json()
        self.assertEqual(len(history), 3)  # one chat + two preserved grading attempts
        self.assertEqual(
            sum(item["gradingResult"].get("recordType") == "grading" for item in history), 2
        )
        self.assertEqual(
            self.client.get("/api/shenlun/mistakes", headers=self.headers_b).json(), []
        )
        with database.get_db() as conn:
            activities = conn.execute(
                """SELECT user_id,module_id,activity_type,status,summary_json
                   FROM learning_activities_v2 ORDER BY created_at"""
            ).fetchall()
            issues = conn.execute(
                """SELECT user_id,issue_key,user_facing_title,evidence_count
                   FROM learning_issues_v2"""
            ).fetchall()
            evidence = conn.execute(
                "SELECT user_id,evidence_type FROM learning_issue_evidence_v2"
            ).fetchall()
            tasks = conn.execute(
                """SELECT user_id,module_id,task_type,status,title
                   FROM learning_tasks_v2"""
            ).fetchall()
        self.assertEqual(len(activities), 2)
        self.assertTrue(all(row["user_id"] == 301 for row in activities))
        self.assertTrue(all(row["module_id"] == "shenlun.review" for row in activities))
        self.assertTrue(all(row["activity_type"] == "grading" for row in activities))
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["issue_key"], "dimension:内容完整性")
        self.assertEqual(issues[0]["evidence_count"], 2)
        self.assertEqual(len(evidence), 2)
        self.assertEqual(len(tasks), 1)  # redo adds evidence, not a duplicate active task
        self.assertEqual(tasks[0]["task_type"], "dimension_practice")
        self.assertEqual(tasks[0]["status"], "pending")

    def test_delete_and_clear_are_scoped_to_jwt_owner(self):
        result = GradingResult(
            dimensions={"逻辑结构": "一般"},
            overallComment="需要调整",
            suggestions=["先列提纲"],
        )
        with patch.object(shenlun, "llm_grade", return_value=result):
            self.client.post(
                "/api/shenlun/grade",
                headers=self.headers_a,
                json={"questionId": "q3-1", "studentAnswer": "A用户作答"},
            )
            self.client.post(
                "/api/shenlun/grade",
                headers=self.headers_b,
                json={"questionId": "q3-1", "studentAnswer": "B用户作答"},
            )
        with database.get_db() as conn:
            owners = conn.execute(
                """SELECT 'activity' kind,user_id FROM learning_activities_v2
                   UNION ALL SELECT 'issue',user_id FROM learning_issues_v2
                   UNION ALL SELECT 'evidence',user_id FROM learning_issue_evidence_v2
                   UNION ALL SELECT 'task',user_id FROM learning_tasks_v2"""
            ).fetchall()
        self.assertEqual({row["user_id"] for row in owners}, {301, 302})
        for owner_id in (301, 302):
            self.assertTrue(any(row["user_id"] == owner_id for row in owners))
        mistake_a = self.client.get("/api/shenlun/mistakes", headers=self.headers_a).json()[0]
        forbidden = self.client.delete(
            f"/api/shenlun/mistakes/{mistake_a['id']}", headers=self.headers_b
        )
        self.assertEqual(forbidden.status_code, 404)
        self.assertEqual(len(self.client.get("/api/shenlun/mistakes", headers=self.headers_a).json()), 1)

        cleared = self.client.delete("/api/shenlun/mistakes", headers=self.headers_a)
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(self.client.get("/api/shenlun/mistakes", headers=self.headers_a).json(), [])
        self.assertEqual(len(self.client.get("/api/shenlun/mistakes", headers=self.headers_b).json()), 1)

    def test_weakness_analysis_uses_only_valid_grading_attempts_and_skill(self):
        grade_result = GradingResult(
            dimensions={"语言表达": "一般"},
            overallComment="表达需要精炼",
            suggestions=["缩短长句"],
        )
        with patch.object(shenlun, "llm_chat", return_value="普通聊天"):
            self.client.post(
                "/api/shenlun/chat", headers=self.headers_a, json={"message": "老师好"}
            )
        with patch.object(shenlun, "llm_grade", return_value=grade_result):
            self.client.post(
                "/api/shenlun/grade",
                headers=self.headers_a,
                json={"questionId": "q3-2", "studentAnswer": "正式作答"},
            )
        llm_json = json.dumps({
            "weakDimensions": ["语言表达"],
            "summary": "表达需要精炼",
            "recommendations": ["缩短长句"],
        }, ensure_ascii=False)
        with patch("src.grader.call_llm_api", return_value=llm_json) as mocked:
            response = self.client.post(
                "/api/shenlun/mistakes/analyze", headers=self.headers_a
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["recordsReviewed"], 1)
        self.assertEqual(response.json()["runMetadata"]["skillVersion"], "1.0.0")
        self.assertIn("飞扬", mocked.call_args.kwargs["system_prompt"])

    def test_skill_loader_fails_closed_when_required_files_are_missing(self):
        with patch.object(prompt_builder, "SKILL_DIR", Path(_TEMP_DIR.name) / "missing-skill"):
            with self.assertRaisesRegex(RuntimeError, "Required Feiyang skill file"):
                prompt_builder.get_skill_metadata()


if __name__ == "__main__":
    unittest.main()
