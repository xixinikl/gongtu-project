import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

TEMP = tempfile.TemporaryDirectory()
os.environ["GONTU_DB_PATH"] = str(Path(TEMP.name) / "admin-vip.db")
os.environ["GONTU_JWT_SECRET_FILE"] = str(Path(TEMP.name) / "jwt-secret")

from fastapi.testclient import TestClient  # noqa: E402
from auth import bootstrap_initial_admin  # noqa: E402
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

    def test_01_public_registration_never_bootstraps_admin(self):
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
        self.assertEqual(first.json()["is_admin"], 0)
        self.assertEqual(second.json()["is_admin"], 0)
        self.assertEqual(
            self.client.get(
                "/api/admin/users", headers=self.auth(first.json()["token"])
            ).status_code,
            403,
        )
        self.assertFalse(
            self.client.get("/api/auth/bootstrap-status").json()["has_admin"]
        )

        user_id, created = bootstrap_initial_admin(
            "initial_admin", "local-admin-password-2026"
        )
        self.assertEqual(user_id, first.json()["user_id"])
        self.assertFalse(created)
        self.assertEqual(
            self.client.post(
                "/api/auth/login",
                json={"username": "initial_admin", "password": "secret123"},
            ).status_code,
            401,
        )
        admin_login = self.client.post(
            "/api/auth/login",
            json={
                "username": "initial_admin",
                "password": "local-admin-password-2026",
            },
        )
        self.assertEqual(admin_login.status_code, 200)
        self.assertEqual(admin_login.json()["is_admin"], 1)
        self.__class__.admin = admin_login.json()
        self.__class__.learner = second.json()
        self.assertTrue(
            self.client.get("/api/auth/bootstrap-status").json()["has_admin"]
        )
        with self.assertRaisesRegex(RuntimeError, "already exists"):
            bootstrap_initial_admin("another_admin", "another-password-2026")

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

    def test_05_admin_mutations_are_queryable_without_secrets(self):
        headers = self.auth(self.admin["token"])
        with patch("main._write_admin_audit", side_effect=sqlite3.OperationalError):
            with self.assertRaises(sqlite3.OperationalError):
                self.client.put(
                    f"/api/admin/users/{self.learner['user_id']}/vip",
                    headers=headers,
                    json={
                        "is_vip": True,
                        "ai_credits": 999,
                        "vip_expires_at": "2028-01-01",
                    },
                )
        unchanged = self.client.get(
            "/api/auth/me", headers=self.auth(self.learner["token"])
        )
        self.assertEqual(unchanged.json()["ai_credits"], 120)

        self.assertEqual(
            self.client.delete(
                f"/api/admin/users/{self.learner['user_id']}/shenlun",
                headers=headers,
            ).status_code,
            200,
        )
        deleted = self.client.delete(
            f"/api/admin/users/{self.learner['user_id']}", headers=headers
        )
        self.assertEqual(deleted.status_code, 200)

        response = self.client.get("/api/admin/audit-log?limit=50", headers=headers)
        self.assertEqual(response.status_code, 200)
        rows = response.json()
        actions = {row["action"] for row in rows}
        self.assertTrue(
            {
                "set_user_admin",
                "set_user_vip",
                "set_ai_access_mode",
                "delete_user_shenlun",
                "delete_user",
            }.issubset(actions)
        )
        deleted_user = next(row for row in rows if row["action"] == "delete_user")
        self.assertEqual(deleted_user["target_username"], "learner")
        serialized = str(rows).casefold()
        for forbidden in ("secret123", "password", "gontu_token", "api_key"):
            self.assertNotIn(forbidden, serialized)
        self.assertEqual(
            self.client.get("/api/admin/audit-log?limit=0", headers=headers).status_code,
            400,
        )
        self.assertEqual(self.client.get("/api/admin/audit-log").status_code, 401)


if __name__ == "__main__":
    unittest.main()
