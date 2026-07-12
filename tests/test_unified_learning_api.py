import os
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

_TEMP_DIR = tempfile.TemporaryDirectory()
os.environ["GONTU_DB_PATH"] = str(Path(_TEMP_DIR.name) / "unified-learning.db")

from fastapi.testclient import TestClient  # noqa: E402
import database  # noqa: E402
from auth import create_token, hash_password  # noqa: E402
from main import app  # noqa: E402


class UnifiedLearningAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db()
        database.init_db()  # migrations must be repeatable
        with database.get_db() as conn:
            conn.execute(
                "INSERT INTO users (id,username,password_hash) VALUES (?,?,?)",
                (101, "unified-a", hash_password("password-a")),
            )
            conn.execute(
                "INSERT INTO users (id,username,password_hash) VALUES (?,?,?)",
                (202, "unified-b", hash_password("password-b")),
            )
            conn.commit()
        cls.client = TestClient(app)
        cls.headers_a = {"Authorization": f"Bearer {create_token(101, 'unified-a')}"}
        cls.headers_b = {"Authorization": f"Bearer {create_token(202, 'unified-b')}"}

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
            conn.execute("DELETE FROM verbal_attempt_items")
            conn.execute("DELETE FROM verbal_practice_sessions")
            conn.execute("DELETE FROM shenlun_history")
            conn.execute("DELETE FROM questions")
            conn.commit()

    def test_unauthenticated_and_unknown_module_are_rejected(self):
        self.assertEqual(self.client.get("/api/learning/activities").status_code, 401)
        missing_user_headers = {
            "Authorization": f"Bearer {create_token(9999, 'removed-user')}"
        }
        missing_user = self.client.get("/api/auth/me", headers=missing_user_headers)
        self.assertEqual(missing_user.status_code, 401)
        self.assertEqual(missing_user.json()["detail"], "Account no longer exists")
        response = self.client.post(
            "/api/learning/activities",
            headers=self.headers_a,
            json={"module_id": "unknown", "activity_type": "practice"},
        )
        self.assertEqual(response.status_code, 422)

    def test_activity_uses_jwt_owner_and_survives_new_request(self):
        created = self.client.post(
            "/api/learning/activities",
            headers=self.headers_a,
            json={
                "module_id": "verbal.reading",
                "activity_type": "practice_set",
                "source_id": "set-01",
                "summary": {"total": 20},
                "user_id": 202,
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        activity_id = created.json()["id"]
        with database.get_db() as conn:
            owner = conn.execute(
                "SELECT user_id FROM learning_activities_v2 WHERE id=?", (activity_id,)
            ).fetchone()["user_id"]
        self.assertEqual(owner, 101)

        completed = self.client.patch(
            f"/api/learning/activities/{activity_id}",
            headers=self.headers_a,
            json={"status": "completed", "duration_ms": 32000, "summary": {"score": 16}},
        )
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(completed.json()["summary"], {"score": 16})
        self.assertIsNotNone(completed.json()["completed_at"])

        # A later request with the same JWT sees the server record; logout is not a delete operation.
        restored = self.client.get("/api/learning/activities", headers=self.headers_a)
        self.assertEqual(restored.status_code, 200)
        self.assertEqual([item["id"] for item in restored.json()], [activity_id])
        self.assertEqual(
            self.client.get("/api/learning/activities", headers=self.headers_b).json(), []
        )
        self.assertEqual(
            self.client.patch(
                f"/api/learning/activities/{activity_id}",
                headers=self.headers_b,
                json={"status": "abandoned"},
            ).status_code,
            404,
        )

    def test_issue_evidence_and_task_are_owned_and_user_facing(self):
        activity = self.client.post(
            "/api/learning/activities",
            headers=self.headers_a,
            json={"module_id": "verbal.logic_fill", "activity_type": "practice"},
        ).json()
        issue = self.client.post(
            "/api/learning/issues",
            headers=self.headers_a,
            json={
                "module_id": "verbal.logic_fill",
                "issue_key": "turning_word_direction",
                "user_facing_title": "转折后的选词方向还不稳定",
                "internal_confidence": 0.42,
                "evidence": [
                    {
                        "activity_id": activity["id"],
                        "item_id": "logic-001",
                        "evidence_type": "wrong_answer",
                        "evidence": {"selected": "A", "correct": "C"},
                    }
                ],
            },
        )
        self.assertEqual(issue.status_code, 201, issue.text)
        self.assertEqual(issue.json()["evidence_count"], 1)
        self.assertNotIn("internal_confidence", issue.json())

        task = self.client.post(
            "/api/learning/tasks",
            headers=self.headers_a,
            json={
                "module_id": "verbal.logic_fill",
                "issue_id": issue.json()["id"],
                "task_type": "similar_questions",
                "title": "补做5道转折语境题",
                "target_count": 5,
                "user_id": 202,
            },
        )
        self.assertEqual(task.status_code, 201, task.text)
        task_id = task.json()["id"]
        done = self.client.patch(
            f"/api/learning/tasks/{task_id}",
            headers=self.headers_a,
            json={"status": "completed", "result": {"correct": 4}},
        )
        self.assertEqual(done.status_code, 200, done.text)
        self.assertEqual(done.json()["result"], {"correct": 4})
        self.assertEqual(
            self.client.patch(
                f"/api/learning/tasks/{task_id}",
                headers=self.headers_b,
                json={"status": "dismissed"},
            ).status_code,
            404,
        )

    def test_timeline_maps_legacy_vertical_tables_without_cross_user_leak(self):
        with database.get_db() as conn:
            conn.execute(
                """INSERT INTO verbal_practice_sessions
                   (id,user_id,set_id,status,started_at,submitted_at,elapsed_ms,score,question_count,updated_at)
                   VALUES(10101,101,'set-a','submitted','2026-07-13T10:00:00Z','2026-07-13T10:30:00Z',1800000,16,20,'2026-07-13T10:30:00Z')"""
            )
            conn.execute(
                """INSERT INTO verbal_practice_sessions
                   (id,user_id,set_id,status,started_at,elapsed_ms,question_count,updated_at)
                   VALUES(20202,202,'set-b','in_progress','2026-07-13T11:00:00Z',0,20,'2026-07-13T11:00:00Z')"""
            )
            conn.execute(
                """INSERT INTO shenlun_history
                   (id,user_id,question_id,question_title,question_type,student_answer,
                    word_count,grading_result,created_at)
                   VALUES('sh-a',101,'s1','概括题','归纳概括','作答',2,
                    '{"recordType":"grading","dimensions":{"内容完整性":"良好"}}',
                    '2026-07-13T09:00:00Z')"""
            )
            conn.execute(
                """INSERT INTO shenlun_history
                   (id,user_id,question_id,question_title,question_type,student_answer,
                    word_count,grading_result,created_at)
                   VALUES('sh-chat',101,'s1','概括题','归纳概括','谢谢老师',4,
                    '{"recordType":"chat","reply":"不客气"}',
                    '2026-07-13T09:30:00Z')"""
            )
            conn.execute(
                """INSERT INTO questions(node_path,title,user_id,created_at)
                   VALUES('位置/旋转','图推错题','101','2026-07-13T08:00:00Z')"""
            )
            conn.commit()

        all_a = self.client.get("/api/learning/timeline", headers=self.headers_a)
        self.assertEqual(all_a.status_code, 200, all_a.text)
        sources = {item["source"] for item in all_a.json()}
        self.assertEqual(
            sources,
            {"verbal_practice_sessions", "shenlun_history", "questions"},
        )
        ids = {str(item["id"]) for item in all_a.json()}
        self.assertNotIn("20202", ids)
        self.assertNotIn("sh-chat", ids)

        reading = self.client.get(
            "/api/learning/timeline?module_id=verbal.reading", headers=self.headers_a
        )
        self.assertEqual({item["module_id"] for item in reading.json()}, {"verbal.reading"})
        self.assertEqual(reading.json()[0]["summary"], {"score": 16, "total": 20})
        self.assertEqual(
            self.client.get("/api/learning/timeline", headers=self.headers_b).json()[0]["id"],
            "20202",
        )

    def test_timeline_filters_module_before_applying_limit(self):
        reading = self.client.post(
            "/api/learning/activities",
            headers=self.headers_a,
            json={
                "module_id": "verbal.reading",
                "activity_type": "practice_set",
                "started_at": "2026-07-13T08:00:00Z",
            },
        ).json()
        for hour in (9, 10, 11):
            self.client.post(
                "/api/learning/activities",
                headers=self.headers_a,
                json={
                    "module_id": "quantity.practice",
                    "activity_type": "single_question",
                    "started_at": f"2026-07-13T{hour:02d}:00:00Z",
                },
            )

        response = self.client.get(
            "/api/learning/timeline?module_id=verbal.reading&limit=1",
            headers=self.headers_a,
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([item["id"] for item in response.json()], [reading["id"]])

    def test_timeline_does_not_double_count_vertical_rows_already_indexed(self):
        with database.get_db() as conn:
            conn.execute(
                """INSERT INTO shenlun_history
                   (id,user_id,question_id,question_title,question_type,student_answer,
                    word_count,grading_result,created_at)
                   VALUES('grade-1',101,'q1','概括题','概括题','作答',2,
                    '{"recordType":"grading","dimensions":{"内容完整性":"一般"}}',
                    '2026-07-13T12:00:00Z')"""
            )
            conn.execute(
                """INSERT INTO learning_activities_v2
                   (id,user_id,module_id,activity_type,source_id,status,started_at,
                    completed_at,summary_json,created_at,updated_at)
                   VALUES('ua-grade',101,'shenlun.review','grading','grade-1','completed',
                    '2026-07-13T12:00:00Z','2026-07-13T12:00:00Z','{}',
                    '2026-07-13T12:00:00Z','2026-07-13T12:00:00Z')"""
            )
            cursor = conn.execute(
                """INSERT INTO questions(node_path,title,user_id,created_at)
                   VALUES('位置/旋转','图推错题','101','2026-07-13T12:10:00Z')"""
            )
            qid = str(cursor.lastrowid)
            conn.execute(
                """INSERT INTO learning_activities_v2
                   (id,user_id,module_id,activity_type,source_id,status,started_at,
                    completed_at,summary_json,created_at,updated_at)
                   VALUES('ua-planar',101,'reasoning.planar','mistake_saved',?,'completed',
                    '2026-07-13T12:10:00Z','2026-07-13T12:10:00Z','{}',
                    '2026-07-13T12:10:00Z','2026-07-13T12:10:00Z')""",
                (qid,),
            )
            conn.commit()

        shenlun = self.client.get(
            "/api/learning/timeline?module_id=shenlun.review", headers=self.headers_a
        ).json()
        planar = self.client.get(
            "/api/learning/timeline?module_id=reasoning.planar", headers=self.headers_a
        ).json()
        self.assertEqual([item["id"] for item in shenlun], ["ua-grade"])
        self.assertEqual([item["id"] for item in planar], ["ua-planar"])


if __name__ == "__main__":
    unittest.main()
