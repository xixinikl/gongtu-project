import os
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
TEMP = tempfile.TemporaryDirectory()
os.environ["GONTU_DB_PATH"] = str(Path(TEMP.name) / "spatial.db")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
import database  # noqa: E402
from auth import create_token, hash_password  # noqa: E402
from spatial_learning import router  # noqa: E402


class SpatialLearningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db()
        with database.get_db() as conn:
            conn.executemany("INSERT INTO users(id,username,password_hash) VALUES(?,?,?)", [
                (301, "spatial-a", hash_password("pass-a")),
                (302, "spatial-b", hash_password("pass-b")),
            ])
            conn.commit()
        app = FastAPI()
        app.include_router(router)
        cls.client = TestClient(app)
        cls.a = {"Authorization": f"Bearer {create_token(301, 'spatial-a')}"}
        cls.b = {"Authorization": f"Bearer {create_token(302, 'spatial-b')}"}

    def setUp(self):
        with database.get_db() as conn:
            conn.execute("DELETE FROM spatial_learning_records") if conn.execute(
                "SELECT name FROM sqlite_master WHERE name='spatial_learning_records'"
            ).fetchone() else None
            conn.execute("DELETE FROM learning_activities_v2")
            conn.commit()

    def test_auth_and_ab_isolation(self):
        self.assertEqual(self.client.get("/api/spatial-learning/records").status_code, 401)
        made = self.client.post("/api/spatial-learning/records", headers=self.a, json={
            "stage_id": "foundation", "activity_kind": "task", "source_id": "task-1"
        })
        self.assertEqual(made.status_code, 201, made.text)
        self.assertEqual(len(self.client.get("/api/spatial-learning/records", headers=self.a).json()), 1)
        self.assertEqual(self.client.get("/api/spatial-learning/records", headers=self.b).json(), [])

    def test_three_view_score_and_unified_activity(self):
        result = self.client.post("/api/spatial-learning/records", headers=self.a, json={
            "stage_id": "three-view", "activity_kind": "three_view_group",
            "source_id": "threeview-group-01", "score": 5, "total": 5, "duration_ms": 61000,
            "detail": {"answers": [
                {"caseId": "threeview-auto-001", "selected": "B"},
                {"caseId": "threeview-auto-002", "selected": "C"},
                {"caseId": "threeview-auto-003", "selected": "A"},
                {"caseId": "threeview-auto-004", "selected": "C"},
                {"caseId": "threeview-auto-005", "selected": "D"},
            ]}
        })
        self.assertEqual(result.status_code, 201, result.text)
        self.assertEqual(result.json()["score"], 5)
        with database.get_db() as conn:
            activity = conn.execute("SELECT * FROM learning_activities_v2 WHERE user_id=301").fetchone()
        self.assertEqual(activity["module_id"], "reasoning.spatial")
        self.assertEqual(activity["activity_type"], "three_view_group")

        forged = self.client.post("/api/spatial-learning/records", headers=self.a, json={
            "stage_id": "three-view", "activity_kind": "three_view_group",
            "source_id": "threeview-group-01", "score": 5, "total": 5,
            "detail": {"answers": [
                {"caseId": "threeview-auto-001", "selected": "A"},
                {"caseId": "threeview-auto-002", "selected": "C"},
                {"caseId": "threeview-auto-003", "selected": "A"},
                {"caseId": "threeview-auto-004", "selected": "C"},
                {"caseId": "threeview-auto-005", "selected": "D"},
            ]}
        })
        self.assertEqual(forged.status_code, 422)

    def test_experiments_cannot_fake_accuracy(self):
        bad = self.client.post("/api/spatial-learning/records", headers=self.a, json={
            "stage_id": "free-cut", "activity_kind": "task", "score": 1, "total": 1
        })
        self.assertEqual(bad.status_code, 422)
        bad_group = self.client.post("/api/spatial-learning/records", headers=self.a, json={
            "stage_id": "three-view", "activity_kind": "three_view_group"
        })
        self.assertEqual(bad_group.status_code, 422)


if __name__ == "__main__":
    unittest.main()
