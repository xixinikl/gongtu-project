import os
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

TEMP = tempfile.TemporaryDirectory()
os.environ["GONTU_DB_PATH"] = str(Path(TEMP.name) / "admin-vip.db")
os.environ["GONTU_JWT_SECRET_FILE"] = str(Path(TEMP.name) / "jwt-secret")

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402


class AdminVipTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context = TestClient(app)
        cls.client = cls.context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)
        TEMP.cleanup()

    @staticmethod
    def auth(token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def test_01_first_account_bootstraps_admin_once(self):
        status = self.client.get("/api/auth/bootstrap-status")
        self.assertEqual(status.status_code, 200)
        self.assertFalse(status.json()["has_admin"])

        first = self.client.post(
            "/api/auth/register",
            json={"username": "initial_admin", "password": "secret123"},
        )
        second = self.client.post(
            "/api/auth/register",
            json={"username": "learner", "password": "secret123"},
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["is_admin"], 1)
        self.assertEqual(second.json()["is_admin"], 0)
        self.__class__.admin = first.json()
        self.__class__.learner = second.json()
        self.assertTrue(
            self.client.get("/api/auth/bootstrap-status").json()["has_admin"]
        )

    def test_02_admin_authorization_uses_current_database_role(self):
        learner_headers = self.auth(self.learner["token"])
        self.assertEqual(
            self.client.get("/api/admin/users", headers=learner_headers).status_code,
            403,
        )

        grant = self.client.put(
            f"/api/admin/users/{self.learner['user_id']}/admin",
            headers=self.auth(self.admin["token"]),
            json={"is_admin": True},
        )
        self.assertEqual(grant.status_code, 200)
        # The original learner token immediately gains the database-backed role.
        self.assertEqual(
            self.client.get("/api/admin/users", headers=learner_headers).status_code,
            200,
        )
        self.assertEqual(
            self.client.put(
                f"/api/admin/users/{self.learner['user_id']}/admin",
                headers=learner_headers,
                json={"is_admin": False},
            ).status_code,
            400,
        )

    def test_03_vip_credits_and_policy_persist(self):
        headers = self.auth(self.admin["token"])
        user_id = self.learner["user_id"]
        updated = self.client.put(
            f"/api/admin/users/{user_id}/vip",
            headers=headers,
            json={
                "is_vip": True,
                "ai_credits": 120,
                "vip_expires_at": "2027-07-18",
            },
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["ai_credits"], 120)

        me = self.client.get(
            "/api/auth/me", headers=self.auth(self.learner["token"])
        )
        self.assertEqual(me.json()["is_vip"], 1)
        self.assertEqual(me.json()["ai_credits"], 120)
        self.assertEqual(me.json()["vip_expires_at"], "2027-07-18")

        policy = self.client.put(
            "/api/admin/settings/vip",
            headers=headers,
            json={"ai_access_mode": "vip"},
        )
        self.assertEqual(policy.status_code, 200)
        self.assertEqual(
            self.client.get("/api/admin/settings/vip", headers=headers).json()[
                "ai_access_mode"
            ],
            "vip",
        )

    def test_04_validation_and_full_user_overview(self):
        headers = self.auth(self.admin["token"])
        user_id = self.learner["user_id"]
        invalid_credits = self.client.put(
            f"/api/admin/users/{user_id}/vip",
            headers=headers,
            json={"is_vip": True, "ai_credits": -1, "vip_expires_at": ""},
        )
        invalid_date = self.client.put(
            f"/api/admin/users/{user_id}/vip",
            headers=headers,
            json={"is_vip": True, "ai_credits": 1, "vip_expires_at": "18/07/2027"},
        )
        self.assertEqual(invalid_credits.status_code, 400)
        self.assertEqual(invalid_date.status_code, 400)

        users = self.client.get("/api/admin/users", headers=headers)
        self.assertEqual(users.status_code, 200)
        learner = next(item for item in users.json() if item["id"] == user_id)
        for key in (
            "is_admin",
            "is_vip",
            "ai_credits",
            "vip_expires_at",
            "learning_events",
            "shenlun_mistake_count",
            "last_activity",
            "verbal",
        ):
            self.assertIn(key, learner)


if __name__ == "__main__":
    unittest.main()
