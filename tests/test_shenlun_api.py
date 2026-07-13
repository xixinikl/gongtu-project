import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

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
from src.models import GradingResult, Question  # noqa: E402
import shenlun  # noqa: E402
from src import grader, prompt_builder  # noqa: E402

VALID_DIMENSIONS = {
    "内容完整性": "优秀",
    "逻辑结构": "优秀",
    "语言表达": "优秀",
    "对策可行性": "优秀",
    "格式规范": "优秀",
}


def valid_grade(
    *,
    dimensions: dict[str, str] | None = None,
    comment: str = "总体评价",
    suggestions: list[str] | None = None,
) -> GradingResult:
    values = dict(VALID_DIMENSIONS)
    values.update(dimensions or {})
    return GradingResult(
        dimensions=values,
        overallComment=comment,
        suggestions=suggestions or ["建议一", "建议二", "建议三"],
    )


def question_model(qid: str = "q3-1") -> Question:
    question = shenlun._get_question(qid)
    payload = dict(question)
    scoring_points = payload.pop("scoringPoints", [])
    payload["referenceAnswer"] = {
        "fullText": payload.pop("referenceAnswer", ""),
        "scoringPoints": scoring_points,
    }
    return Question(**payload)


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
        self._grade_counter = 0
        with database.get_db() as conn:
            conn.execute("DELETE FROM shenlun_grade_requests")
            conn.execute("DELETE FROM learning_issue_evidence_v2")
            conn.execute("DELETE FROM learning_tasks_v2")
            conn.execute("DELETE FROM learning_issues_v2")
            conn.execute("DELETE FROM learning_activities_v2")
            conn.execute("DELETE FROM shenlun_mistakes")
            conn.execute("DELETE FROM shenlun_history")
            conn.commit()

    def post_grade(self, *, headers: dict, payload: dict, key: str | None = None):
        self._grade_counter += 1
        request_headers = dict(headers)
        request_headers["Idempotency-Key"] = (
            key or f"test-grade-{self._grade_counter:04d}"
        )
        return self.client.post(
            "/api/shenlun/grade",
            headers=request_headers,
            json=payload,
        )

    def test_questions_require_live_account_and_never_leak_answers(self):
        catalog = json.loads(
            (BACKEND / "data/questions.json").read_text(encoding="utf-8")
        )
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
        self.assertTrue(
            all(item["contentStatus"] == "summary-only" for item in listed.json())
        )

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
                headers = dict(self.headers_a)
                if path == "/api/shenlun/grade":
                    headers["Idempotency-Key"] = "source-unavailable"
                response = self.client.request(
                    method.upper(), path, headers=headers, json=payload
                )
                self.assertEqual(response.status_code, 503, response.text)
                self.assertEqual(response.json(), expected)
                self.assertNotIn(str(missing), response.text)
                self.assertNotIn("Shenlun question source is missing", response.text)

        corrupt = Path(_TEMP_DIR.name) / "private-corrupt-questions.json"
        corrupt.write_text("{not-json", encoding="utf-8")
        with patch.object(shenlun, "QUESTIONS_FILE", corrupt):
            response = self.client.get("/api/shenlun/catalog", headers=self.headers_a)
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
        with (
            patch.object(shenlun, "llm_grade") as grade_mock,
            patch.object(shenlun, "llm_chat") as chat_mock,
        ):
            responses = [
                self.client.get(
                    "/api/shenlun/questions/not-provided", headers=self.headers_a
                ),
                self.post_grade(
                    headers=self.headers_a,
                    payload={"questionId": "not-provided", "studentAnswer": "测试作答"},
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

        first = valid_grade(
            dimensions={"内容完整性": "一般"},
            comment="第一次批改",
            suggestions=["补齐要点", "分类表达", "核对题干"],
        )
        second = valid_grade(
            dimensions={"内容完整性": "一般"},
            comment="第二次批改",
            suggestions=["继续精炼", "补全要点", "复核材料"],
        )
        with patch.object(shenlun, "llm_grade", side_effect=[first, second]):
            for answer in ("第一次正式作答", "第二次正式作答"):
                response = self.post_grade(
                    headers=self.headers_a,
                    payload={"questionId": "q3-1", "studentAnswer": answer},
                )
                self.assertEqual(response.status_code, 200, response.text)
                meta = response.json()["runMetadata"]
                self.assertEqual(meta["skillVersion"], "1.0.0")
                self.assertEqual(len(meta["skillHash"]), 64)
                self.assertTrue(meta["model"])
                self.assertTrue(meta["provider"])

        mistakes = self.client.get(
            "/api/shenlun/mistakes", headers=self.headers_a
        ).json()
        self.assertEqual(len(mistakes), 1)
        self.assertEqual(mistakes[0]["studentAnswer"], "第二次正式作答")
        history = self.client.get("/api/shenlun/history", headers=self.headers_a).json()
        self.assertEqual(len(history), 3)  # one chat + two preserved grading attempts
        self.assertEqual(
            sum(
                item["gradingResult"].get("recordType") == "grading" for item in history
            ),
            2,
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
            tasks = conn.execute("""SELECT user_id,module_id,task_type,status,title
                   FROM learning_tasks_v2""").fetchall()
        self.assertEqual(len(activities), 2)
        self.assertTrue(all(row["user_id"] == 301 for row in activities))
        self.assertTrue(all(row["module_id"] == "shenlun.review" for row in activities))
        self.assertTrue(all(row["activity_type"] == "grading" for row in activities))
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["issue_key"], "dimension:内容完整性")
        self.assertEqual(issues[0]["evidence_count"], 2)
        self.assertEqual(len(evidence), 2)
        self.assertEqual(
            len(tasks), 1
        )  # redo adds evidence, not a duplicate active task
        self.assertEqual(tasks[0]["task_type"], "dimension_practice")
        self.assertEqual(tasks[0]["status"], "pending")

    def test_delete_and_clear_are_scoped_to_jwt_owner(self):
        result = valid_grade(
            dimensions={"逻辑结构": "一般"},
            comment="需要调整",
            suggestions=["先列提纲", "合并同类项", "检查层次"],
        )
        with patch.object(shenlun, "llm_grade", return_value=result):
            self.post_grade(
                headers=self.headers_a,
                payload={"questionId": "q3-1", "studentAnswer": "A用户作答"},
            )
            self.post_grade(
                headers=self.headers_b,
                payload={"questionId": "q3-1", "studentAnswer": "B用户作答"},
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
        mistake_a = self.client.get(
            "/api/shenlun/mistakes", headers=self.headers_a
        ).json()[0]
        forbidden = self.client.delete(
            f"/api/shenlun/mistakes/{mistake_a['id']}", headers=self.headers_b
        )
        self.assertEqual(forbidden.status_code, 404)
        self.assertEqual(
            len(
                self.client.get("/api/shenlun/mistakes", headers=self.headers_a).json()
            ),
            1,
        )

        cleared = self.client.delete("/api/shenlun/mistakes", headers=self.headers_a)
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(
            self.client.get("/api/shenlun/mistakes", headers=self.headers_a).json(), []
        )
        self.assertEqual(
            len(
                self.client.get("/api/shenlun/mistakes", headers=self.headers_b).json()
            ),
            1,
        )

    def test_weakness_analysis_uses_only_valid_grading_attempts_and_skill(self):
        grade_result = valid_grade(
            dimensions={"语言表达": "一般"},
            comment="表达需要精炼",
            suggestions=["缩短长句", "替换口语", "核对主谓"],
        )
        with patch.object(shenlun, "llm_chat", return_value="普通聊天"):
            self.client.post(
                "/api/shenlun/chat", headers=self.headers_a, json={"message": "老师好"}
            )
        with patch.object(shenlun, "llm_grade", return_value=grade_result):
            self.post_grade(
                headers=self.headers_a,
                payload={"questionId": "q3-2", "studentAnswer": "正式作答"},
            )
        llm_json = json.dumps(
            {
                "weakDimensions": ["语言表达"],
                "summary": "表达需要精炼",
                "recommendations": ["缩短长句", "替换口语", "复盘病句"],
            },
            ensure_ascii=False,
        )
        with patch("src.grader.call_llm_api", return_value=llm_json) as mocked:
            response = self.client.post(
                "/api/shenlun/mistakes/analyze", headers=self.headers_a
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "completed")
        self.assertEqual(response.json()["recordsReviewed"], 1)
        self.assertEqual(response.json()["runMetadata"]["skillVersion"], "1.0.0")
        self.assertIn("飞扬", mocked.call_args.kwargs["system_prompt"])

    def test_grader_rejects_invalid_schema_and_never_returns_raw_provider_text(self):
        valid_payload = {
            **VALID_DIMENSIONS,
            "overallComment": "结构完整",
            "suggestions": ["建议一", "建议二", "建议三"],
        }
        self.assertEqual(
            grader.validate_grading_result(valid_payload).dimensions,
            VALID_DIMENSIONS,
        )
        invalid_payloads = [
            {**valid_payload, "格式规范": "满分"},
            {**valid_payload, "逻辑结构": None},
            {**valid_payload, "overallComment": " "},
            {**valid_payload, "suggestions": ["只有一条"]},
            {
                "dimensions": {"内容完整性": "优秀"},
                "overallComment": "不完整",
                "suggestions": ["建议一", "建议二", "建议三"],
            },
        ]
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaisesRegex(
                    grader.ProviderFailure, "provider_invalid_output"
                ):
                    grader.validate_grading_result(payload)

        secret = "Authorization: Bearer sk-provider-secret"
        create = MagicMock(
            return_value=SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=secret))]
            )
        )
        client = SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=create))
        )
        with (
            patch.object(grader, "API_KEY", "test-key"),
            patch.object(grader, "OpenAI", return_value=client),
            patch.object(grader.time, "sleep"),
            self.assertLogs("grader", level="WARNING") as captured,
            self.assertRaisesRegex(grader.ProviderFailure, "provider_invalid_output"),
        ):
            grader.grade(question_model(), "学生作答")
        self.assertEqual(create.call_count, 3)
        self.assertNotIn(secret, "\n".join(captured.output))

    def test_provider_failures_are_safe_and_write_no_learning_facts(self):
        cases = (
            (grader.ProviderFailure("provider_timeout"), 504, "provider_timeout"),
            (
                grader.ProviderFailure("provider_invalid_output"),
                503,
                "provider_invalid_output",
            ),
            (
                RuntimeError("Authorization: Bearer sk-route-secret"),
                503,
                "provider_unavailable",
            ),
        )
        for error, status, code in cases:
            with (
                self.subTest(code=code),
                patch.object(shenlun, "llm_grade", side_effect=error),
                self.assertLogs("shenlun", level="WARNING") as captured,
            ):
                response = self.post_grade(
                    headers=self.headers_a,
                    payload={"questionId": "q3-1", "studentAnswer": "测试作答"},
                )
            self.assertEqual(response.status_code, status, response.text)
            self.assertEqual(response.json()["detail"]["code"], code)
            self.assertTrue(response.json()["detail"]["retryable"])
            self.assertNotIn("sk-route-secret", response.text)
            self.assertNotIn("sk-route-secret", "\n".join(captured.output))

        with database.get_db() as conn:
            counts = {
                table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                for table in (
                    "shenlun_history",
                    "shenlun_mistakes",
                    "learning_activities_v2",
                    "learning_issues_v2",
                    "learning_issue_evidence_v2",
                    "learning_tasks_v2",
                )
            }
        self.assertEqual(set(counts.values()), {0}, counts)

    def test_chat_and_analysis_failures_are_redacted_and_never_fabricate_results(self):
        secret = "upstream said sk-chat-analysis-secret"
        with (
            patch.object(shenlun, "llm_chat", side_effect=RuntimeError(secret)),
            self.assertLogs("shenlun", level="WARNING") as chat_logs,
        ):
            chat = self.client.post(
                "/api/shenlun/chat",
                headers=self.headers_a,
                json={"questionId": "q3-1", "message": "请讲解方法"},
            )
        self.assertEqual(chat.status_code, 503, chat.text)
        self.assertEqual(chat.json()["detail"]["code"], "provider_unavailable")
        self.assertNotIn(secret, chat.text)
        self.assertNotIn(secret, "\n".join(chat_logs.output))
        with database.get_db() as conn:
            self.assertEqual(
                conn.execute("SELECT COUNT(*) FROM shenlun_history").fetchone()[0], 0
            )

        with patch.object(
            shenlun,
            "llm_grade",
            return_value=valid_grade(dimensions={"内容完整性": "一般"}),
        ):
            graded = self.post_grade(
                headers=self.headers_a,
                payload={"questionId": "q3-1", "studentAnswer": "有效作答"},
            )
        self.assertEqual(graded.status_code, 200, graded.text)
        with database.get_db() as conn:
            before = {
                table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                for table in (
                    "shenlun_history",
                    "shenlun_mistakes",
                    "learning_activities_v2",
                    "learning_issues_v2",
                    "learning_issue_evidence_v2",
                    "learning_tasks_v2",
                )
            }

        with (
            patch("src.grader.call_llm_api", side_effect=RuntimeError(secret)),
            self.assertLogs("shenlun", level="WARNING") as analysis_logs,
        ):
            analysis = self.client.post(
                "/api/shenlun/mistakes/analyze", headers=self.headers_a
            )
        self.assertEqual(analysis.status_code, 200, analysis.text)
        self.assertEqual(analysis.json()["status"], "unavailable")
        self.assertEqual(analysis.json()["errorCode"], "provider_unavailable")
        self.assertEqual(analysis.json()["recommendations"], [])
        self.assertNotIn(secret, analysis.text)
        self.assertNotIn(secret, "\n".join(analysis_logs.output))

        with (
            patch("src.grader.call_llm_api", return_value=f"not-json {secret}"),
            self.assertLogs("shenlun", level="WARNING") as invalid_logs,
        ):
            invalid = self.client.post(
                "/api/shenlun/mistakes/analyze", headers=self.headers_a
            )
        self.assertEqual(invalid.status_code, 200, invalid.text)
        self.assertEqual(invalid.json()["status"], "unavailable")
        self.assertEqual(invalid.json()["errorCode"], "provider_invalid_output")
        self.assertEqual(invalid.json()["recommendations"], [])
        self.assertNotIn(secret, invalid.text)
        self.assertNotIn(secret, "\n".join(invalid_logs.output))

        with database.get_db() as conn:
            after = {
                table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                for table in before
            }
        self.assertEqual(after, before)

    def test_grade_requires_a_well_formed_idempotency_key(self):
        payload = {"questionId": "q3-1", "studentAnswer": "正式作答"}
        with patch.object(shenlun, "llm_grade") as provider:
            missing = self.client.post(
                "/api/shenlun/grade",
                headers=self.headers_a,
                json=payload,
            )
            invalid = self.client.post(
                "/api/shenlun/grade",
                headers={**self.headers_a, "Idempotency-Key": "short"},
                json=payload,
            )
        self.assertEqual(missing.status_code, 400, missing.text)
        self.assertEqual(invalid.status_code, 400, invalid.text)
        self.assertEqual(missing.json()["detail"]["code"], "idempotency_key_invalid")
        self.assertEqual(invalid.json()["detail"]["code"], "idempotency_key_invalid")
        provider.assert_not_called()
        with database.get_db() as conn:
            self.assertEqual(
                conn.execute("SELECT COUNT(*) FROM shenlun_grade_requests").fetchone()[
                    0
                ],
                0,
            )

    def test_completed_grade_replays_once_and_new_key_is_an_intentional_redo(self):
        payload = {"questionId": "q3-1", "studentAnswer": "同一次正式作答"}
        result = valid_grade(dimensions={"内容完整性": "一般"})
        provider = MagicMock(return_value=result)
        with patch.object(shenlun, "llm_grade", provider):
            first = self.post_grade(
                headers=self.headers_a,
                payload=payload,
                key="completed-grade-key",
            )
            replay = self.post_grade(
                headers=self.headers_a,
                payload=payload,
                key="completed-grade-key",
            )
            conflict = self.post_grade(
                headers=self.headers_a,
                payload={**payload, "studentAnswer": "另一份作答"},
                key="completed-grade-key",
            )
            redo = self.post_grade(
                headers=self.headers_a,
                payload=payload,
                key="intentional-redo-key",
            )

        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json(), first.json())
        self.assertEqual(conflict.status_code, 409, conflict.text)
        self.assertEqual(conflict.json()["detail"]["code"], "idempotency_conflict")
        self.assertEqual(redo.status_code, 200, redo.text)
        self.assertNotEqual(redo.json()["id"], first.json()["id"])
        self.assertEqual(provider.call_count, 2)

        with database.get_db() as conn:
            counts = {
                "requests": conn.execute(
                    "SELECT COUNT(*) FROM shenlun_grade_requests WHERE status='completed'"
                ).fetchone()[0],
                "history": conn.execute(
                    "SELECT COUNT(*) FROM shenlun_history"
                ).fetchone()[0],
                "mistakes": conn.execute(
                    "SELECT COUNT(*) FROM shenlun_mistakes"
                ).fetchone()[0],
                "activities": conn.execute(
                    "SELECT COUNT(*) FROM learning_activities_v2"
                ).fetchone()[0],
                "evidence": conn.execute(
                    "SELECT COUNT(*) FROM learning_issue_evidence_v2"
                ).fetchone()[0],
                "tasks": conn.execute(
                    "SELECT COUNT(*) FROM learning_tasks_v2"
                ).fetchone()[0],
            }
        self.assertEqual(
            counts,
            {
                "requests": 2,
                "history": 2,
                "mistakes": 1,
                "activities": 2,
                "evidence": 2,
                "tasks": 1,
            },
        )

    def test_pending_failed_and_persistence_outcomes_replay_without_side_effects(self):
        pending_payload = {"questionId": "q3-1", "studentAnswer": "处理中作答"}
        pending_key = "pending-grade-key"
        pending_hash = shenlun._grade_request_hash(
            question_id=pending_payload["questionId"],
            student_answer=pending_payload["studentAnswer"],
        )
        with database.get_db() as conn:
            conn.execute(
                """INSERT INTO shenlun_grade_requests
                   (user_id,idempotency_key,request_hash,status,created_at,updated_at)
                   VALUES(301,?,?, 'pending','2026-07-13T00:00:00','2026-07-13T00:00:00')""",
                (pending_key, pending_hash),
            )
            conn.commit()

        with patch.object(shenlun, "llm_grade") as provider:
            pending = self.post_grade(
                headers=self.headers_a,
                payload=pending_payload,
                key=pending_key,
            )
        self.assertEqual(pending.status_code, 409, pending.text)
        self.assertEqual(pending.json()["detail"]["code"], "idempotency_in_progress")
        provider.assert_not_called()

        failed_payload = {"questionId": "q3-1", "studentAnswer": "失败作答"}
        failure = MagicMock(
            side_effect=grader.ProviderFailure("provider_invalid_output")
        )
        with patch.object(shenlun, "llm_grade", failure):
            first_failed = self.post_grade(
                headers=self.headers_a,
                payload=failed_payload,
                key="failed-grade-key",
            )
            replay_failed = self.post_grade(
                headers=self.headers_a,
                payload=failed_payload,
                key="failed-grade-key",
            )
        self.assertEqual(first_failed.status_code, 503, first_failed.text)
        self.assertEqual(replay_failed.status_code, 503, replay_failed.text)
        self.assertEqual(replay_failed.json(), first_failed.json())
        self.assertEqual(failure.call_count, 1)

        persistence_provider = MagicMock(return_value=valid_grade())
        with (
            patch.object(shenlun, "llm_grade", persistence_provider),
            patch.object(
                shenlun,
                "_record_unified_grade",
                side_effect=RuntimeError("private database detail"),
            ),
        ):
            persistence = self.post_grade(
                headers=self.headers_a,
                payload={"questionId": "q3-1", "studentAnswer": "保存失败作答"},
                key="persistence-failure-key",
            )
            persistence_replay = self.post_grade(
                headers=self.headers_a,
                payload={"questionId": "q3-1", "studentAnswer": "保存失败作答"},
                key="persistence-failure-key",
            )
        self.assertEqual(persistence.status_code, 503, persistence.text)
        self.assertEqual(
            persistence.json()["detail"]["code"], "persistence_unavailable"
        )
        self.assertEqual(persistence_replay.json(), persistence.json())
        self.assertNotIn("private database detail", persistence.text)
        self.assertEqual(persistence_provider.call_count, 1)

        with database.get_db() as conn:
            rows = conn.execute(
                """SELECT idempotency_key,status,error_code FROM shenlun_grade_requests
                   ORDER BY idempotency_key"""
            ).fetchall()
            history_count = conn.execute(
                "SELECT COUNT(*) FROM shenlun_history"
            ).fetchone()[0]
            activity_count = conn.execute(
                "SELECT COUNT(*) FROM learning_activities_v2"
            ).fetchone()[0]
        self.assertEqual(
            {row["idempotency_key"]: row["status"] for row in rows},
            {
                "failed-grade-key": "failed",
                "pending-grade-key": "pending",
                "persistence-failure-key": "failed",
            },
        )
        self.assertEqual(history_count, 0)
        self.assertEqual(activity_count, 0)

    def test_idempotency_keys_are_scoped_to_the_jwt_user(self):
        shared_key = "shared-user-grade-key"
        provider = MagicMock(return_value=valid_grade())
        with patch.object(shenlun, "llm_grade", provider):
            response_a = self.post_grade(
                headers=self.headers_a,
                payload={"questionId": "q3-1", "studentAnswer": "A用户作答"},
                key=shared_key,
            )
            response_b = self.post_grade(
                headers=self.headers_b,
                payload={"questionId": "q3-1", "studentAnswer": "B用户作答"},
                key=shared_key,
            )
        self.assertEqual(response_a.status_code, 200, response_a.text)
        self.assertEqual(response_b.status_code, 200, response_b.text)
        self.assertEqual(provider.call_count, 2)
        with database.get_db() as conn:
            owners = conn.execute(
                """SELECT user_id FROM shenlun_grade_requests
                   WHERE idempotency_key=? ORDER BY user_id""",
                (shared_key,),
            ).fetchall()
        self.assertEqual([row["user_id"] for row in owners], [301, 302])

    def test_skill_loader_fails_closed_when_required_files_are_missing(self):
        with patch.object(
            prompt_builder, "SKILL_DIR", Path(_TEMP_DIR.name) / "missing-skill"
        ):
            with self.assertRaisesRegex(RuntimeError, "Required Feiyang skill file"):
                prompt_builder.get_skill_metadata()


if __name__ == "__main__":
    unittest.main()
