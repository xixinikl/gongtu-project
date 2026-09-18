"""VIP / AI-access enforcement across the previously ungated feature routers.

Covers the actual gap this test closes: `app_settings.ai_access_mode` existed
and the admin console could already set is_vip / ai_credits, but nothing on
the shenlun, ai-coach or spatial-learning routers ever checked either value.
"""
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

TEMP = tempfile.TemporaryDirectory()
os.environ["GONTU_DB_PATH"] = str(Path(TEMP.name) / "vip-access.db")
os.environ["GONTU_JWT_SECRET_FILE"] = str(Path(TEMP.name) / "jwt-secret")
os.environ.setdefault("LLM_API_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402
from src.models import GradingResult  # noqa: E402
import database  # noqa: E402
from auth import bootstrap_initial_admin, hash_password  # noqa: E402
import shenlun  # noqa: E402
from main import app  # noqa: E402


def _grading_result() -> GradingResult:
    dims = {
        "内容完整性": "优秀", "逻辑结构": "优秀", "语言表达": "优秀",
        "对策可行性": "优秀", "格式规范": "优秀",
    }
    return GradingResult(dimensions=dims, overallComment="总体评价", suggestions=["a", "b", "c"])


def _question_id() -> str:
    data = shenlun._load_questions_data()
    return data["questions"][0]["id"]


class VipAccessControlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db()
        with database.get_db() as conn:
            conn.executemany(
                "INSERT INTO users(id, username, password_hash) VALUES (?, ?, ?)",
                [
                    (901, "vip-plain", hash_password("plain-pass-1")),
                    (902, "vip-holder", hash_password("vip-pass-1")),
                ],
            )
            conn.commit()
        admin_id, _ = bootstrap_initial_admin("vip-admin", "admin-pass-2026")
        cls.admin_id = admin_id
        cls.context = TestClient(app)
        cls.client = cls.context.__enter__()

        def token_for(username: str, password: str) -> str:
            resp = cls.client.post(
                "/api/auth/login", json={"username": username, "password": password}
            )
            return resp.json()["token"]

        cls.admin = {"Authorization": f"Bearer {token_for('vip-admin', 'admin-pass-2026')}"}
        cls.plain = {"Authorization": f"Bearer {token_for('vip-plain', 'plain-pass-1')}"}
        cls.vip = {"Authorization": f"Bearer {token_for('vip-holder', 'vip-pass-1')}"}

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)
        TEMP.cleanup()

    def setUp(self):
        # Every test starts from a clean, known policy/VIP baseline.
        self.client.put(
            "/api/admin/settings/vip", headers=self.admin, json={"ai_access_mode": "free"}
        )
        self.client.put(
            "/api/admin/users/902/vip",
            headers=self.admin,
            json={"is_vip": True, "ai_credits": 3, "vip_expires_at": "2099-01-01"},
        )

    def _set_mode(self, mode: str) -> None:
        resp = self.client.put(
            "/api/admin/settings/vip", headers=self.admin, json={"ai_access_mode": mode}
        )
        self.assertEqual(resp.status_code, 200, resp.text)

    def test_free_mode_leaves_every_module_open_to_any_logged_in_user(self):
        self._set_mode("free")
        for headers in (self.plain, self.vip):
            self.assertEqual(
                self.client.get("/api/spatial-learning/overview", headers=headers).status_code,
                200,
            )
            self.assertEqual(
                self.client.get("/api/shenlun/questions", headers=headers).status_code,
                200,
            )
            self.assertEqual(
                self.client.get("/api/ai-coach/modules", headers=headers).status_code,
                200,
            )

    def test_vip_mode_blocks_plain_users_and_admits_admin_and_vip(self):
        self._set_mode("vip")
        for path in (
            "/api/spatial-learning/overview",
            "/api/shenlun/questions",
            "/api/ai-coach/modules",
        ):
            self.assertEqual(
                self.client.get(path, headers=self.plain).status_code, 403, path
            )
            self.assertEqual(
                self.client.get(path, headers=self.admin).status_code, 200, path
            )
            self.assertEqual(
                self.client.get(path, headers=self.vip).status_code, 200, path
            )

    def test_expired_vip_is_treated_as_not_vip(self):
        self.client.put(
            "/api/admin/users/902/vip",
            headers=self.admin,
            json={"is_vip": True, "ai_credits": 3, "vip_expires_at": "2020-01-01"},
        )
        self._set_mode("vip")
        self.assertEqual(
            self.client.get("/api/spatial-learning/overview", headers=self.vip).status_code,
            403,
        )

    def test_grade_consumes_one_credit_and_does_not_refund_on_success(self):
        self._set_mode("vip")
        qid = _question_id()
        with patch.object(shenlun, "llm_grade", return_value=_grading_result()):
            resp = self.client.post(
                "/api/shenlun/grade",
                headers={**self.vip, "Idempotency-Key": "vip-credit-success-1"},
                json={"questionId": qid, "studentAnswer": "作答内容" * 10},
            )
        self.assertEqual(resp.status_code, 200, resp.text)
        me = self.client.get("/api/auth/me", headers=self.vip).json()
        self.assertEqual(me["ai_credits"], 2)  # started this test at 3 (see setUp)

    def test_grade_refunds_the_credit_when_the_provider_fails(self):
        self._set_mode("vip")
        qid = _question_id()
        before = self.client.get("/api/auth/me", headers=self.vip).json()["ai_credits"]
        with patch.object(shenlun, "llm_grade", side_effect=RuntimeError("provider down")):
            resp = self.client.post(
                "/api/shenlun/grade",
                headers={**self.vip, "Idempotency-Key": "vip-credit-failure-1"},
                json={"questionId": qid, "studentAnswer": "作答内容" * 10},
            )
        self.assertEqual(resp.status_code, 503)
        after = self.client.get("/api/auth/me", headers=self.vip).json()["ai_credits"]
        self.assertEqual(after, before)  # consumed, then refunded: net unchanged

    def test_zero_credits_is_rejected_before_any_provider_call(self):
        self.client.put(
            "/api/admin/users/902/vip",
            headers=self.admin,
            json={"is_vip": True, "ai_credits": 0, "vip_expires_at": "2099-01-01"},
        )
        self._set_mode("vip")
        qid = _question_id()
        with patch.object(shenlun, "llm_grade") as provider:
            resp = self.client.post(
                "/api/shenlun/grade",
                headers={**self.vip, "Idempotency-Key": "vip-credit-zero-1"},
                json={"questionId": qid, "studentAnswer": "作答内容" * 10},
            )
        provider.assert_not_called()
        self.assertEqual(resp.status_code, 402)

    def test_plain_user_never_reaches_the_provider_in_vip_mode(self):
        self._set_mode("vip")
        qid = _question_id()
        with patch.object(shenlun, "llm_grade") as provider:
            resp = self.client.post(
                "/api/shenlun/grade",
                headers={**self.plain, "Idempotency-Key": "vip-credit-plain-1"},
                json={"questionId": qid, "studentAnswer": "作答内容" * 10},
            )
        provider.assert_not_called()
        self.assertEqual(resp.status_code, 403)


if __name__ == "__main__":
    unittest.main()
