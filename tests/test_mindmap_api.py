"""JWT isolation, private media and resumable review tests for planar reasoning."""
from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

_TEMP_DIR = tempfile.TemporaryDirectory()
os.environ["GONTU_DB_PATH"] = str(Path(_TEMP_DIR.name) / "mindmap.db")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from auth import create_token, hash_password  # noqa: E402
import database  # noqa: E402
import mindmap  # noqa: E402


PNG = b"\x89PNG\r\n\x1a\n" + b"test-image"


class MindmapApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db()
        mindmap.PRIVATE_IMAGES_DIR = Path(_TEMP_DIR.name) / "private-images"
        with database.get_db() as conn:
            conn.executemany(
                "INSERT INTO users (id,username,password_hash) VALUES (?,?,?)",
                [
                    (101, "mindmap-a", hash_password("secret-a")),
                    (202, "mindmap-b", hash_password("secret-b")),
                ],
            )
            conn.commit()
        app = FastAPI()
        app.include_router(mindmap.router)
        cls.client = TestClient(app)
        cls.headers_a = {"Authorization": f"Bearer {create_token(101, 'mindmap-a')}"}
        cls.headers_b = {"Authorization": f"Bearer {create_token(202, 'mindmap-b')}"}

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        _TEMP_DIR.cleanup()

    def setUp(self):
        conn = mindmap.get_conn()
        conn.execute("DELETE FROM mindmap_review_attempts")
        conn.execute("DELETE FROM mindmap_review_sessions")
        conn.execute("DELETE FROM learning_activities_v2 WHERE module_id='reasoning.planar'")
        conn.execute("DELETE FROM questions")
        conn.commit()
        conn.close()

    def create_question(self, title="旋转错题", image=False):
        files = {"image": ("question.png", PNG, "image/png")} if image else None
        return self.client.post(
            "/api/mindmap/questions",
            headers=self.headers_a,
            data={"node_path": "位置>旋转", "title": title, "correct_answer": "C"},
            files=files,
        )

    def test_auth_private_media_and_activity_owner(self):
        self.assertEqual(self.client.get("/api/mindmap/questions").status_code, 401)
        created = self.create_question(image=True)
        self.assertEqual(created.status_code, 200, created.text)
        qid = created.json()["id"]
        self.assertEqual(created.json()["activity_id"], f"mindmap:question:{qid}")
        self.assertEqual(self.client.get(f"/api/mindmap/questions/{qid}/image").status_code, 401)
        self.assertEqual(self.client.get(f"/api/mindmap/questions/{qid}/image", headers=self.headers_b).status_code, 404)
        media = self.client.get(f"/api/mindmap/questions/{qid}/image", headers=self.headers_a)
        self.assertEqual(media.status_code, 200)
        self.assertEqual(media.content, PNG)
        self.assertEqual(self.client.get("/api/mindmap/questions", headers=self.headers_b).json(), {"questions": []})
        detail = self.client.get(f"/api/mindmap/questions/{qid}", headers=self.headers_a).json()
        self.assertEqual(detail["activity_id"], f"mindmap:question:{qid}")
        listed = self.client.get("/api/mindmap/questions", headers=self.headers_a).json()["questions"]
        self.assertEqual(listed[0]["activity_id"], f"mindmap:question:{qid}")
        with database.get_db() as conn:
            activity = conn.execute(
                "SELECT user_id,activity_type,source_id FROM learning_activities_v2 WHERE id=?",
                (f"mindmap:question:{qid}",),
            ).fetchone()
        self.assertEqual((activity["user_id"], activity["activity_type"], activity["source_id"]), (101, "mistake_saved", str(qid)))
        self.assertEqual(self.client.delete(f"/api/mindmap/questions/{qid}", headers=self.headers_b).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/mindmap/questions/{qid}", headers=self.headers_a).status_code, 200)
        self.assertEqual(self.client.get(f"/api/mindmap/questions/{qid}/image", headers=self.headers_a).status_code, 404)

    def test_json_edit_fixes_previous_multipart_mismatch(self):
        qid = self.create_question().json()["id"]
        updated = self.client.put(
            f"/api/mindmap/questions/{qid}",
            headers=self.headers_a,
            json={"title": "已修正标题", "notes": "先看旋转方向"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        detail = self.client.get(f"/api/mindmap/questions/{qid}", headers=self.headers_a).json()
        self.assertEqual(detail["title"], "已修正标题")
        self.assertEqual(self.client.put(
            f"/api/mindmap/questions/{qid}", headers=self.headers_b, json={"title": "越权"}
        ).status_code, 404)

    def test_review_resumes_isolated_and_percent_is_bounded(self):
        self.create_question("题一")
        self.create_question("题二")
        started = self.client.get("/api/mindmap/review-session", headers=self.headers_a)
        self.assertEqual(started.status_code, 200, started.text)
        state = started.json()
        sid = state["session"]["id"]
        first_id = state["questions"][0]["id"]
        self.assertEqual(state["questions"][0]["activity_id"], f"mindmap:question:{first_id}")
        forgotten = self.client.post(
            f"/api/mindmap/review-session/{sid}/attempt",
            headers=self.headers_a,
            json={"question_id": first_id, "outcome": "forgotten"},
        )
        self.assertEqual(forgotten.status_code, 200, forgotten.text)
        restored = self.client.get("/api/mindmap/review-session", headers=self.headers_a).json()
        self.assertEqual(restored["session"]["id"], sid)
        self.assertEqual(restored["stats"]["studied"], 1)
        self.assertLessEqual(restored["stats"]["percent"], 100)
        self.assertIsNone(self.client.get("/api/mindmap/review-session", headers=self.headers_b).json()["session"])

        state = restored
        for _ in range(10):
            if state["session"]["status"] == "completed":
                break
            current = state["questions"][0]["id"]
            response = self.client.post(
                f"/api/mindmap/review-session/{sid}/attempt",
                headers=self.headers_a,
                json={"question_id": current, "outcome": "remembered"},
            )
            self.assertEqual(response.status_code, 200, response.text)
            state = response.json()
        self.assertEqual(state["session"]["status"], "completed")
        self.assertLessEqual(state["stats"]["percent"], 100)
        with database.get_db() as conn:
            activity = conn.execute(
                "SELECT user_id,activity_type FROM learning_activities_v2 WHERE id=?",
                (f"mindmap:review:{sid}",),
            ).fetchone()
        self.assertEqual((activity["user_id"], activity["activity_type"]), (101, "review_session"))
        self.assertEqual(self.client.delete(f"/api/mindmap/review-session/{sid}", headers=self.headers_b).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/mindmap/review-session/{sid}", headers=self.headers_a).status_code, 200)


if __name__ == "__main__":
    unittest.main()
