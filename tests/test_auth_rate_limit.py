import os
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

TEMP = tempfile.TemporaryDirectory()
os.environ["GONTU_DB_PATH"] = str(Path(TEMP.name) / "auth-rate-limit.db")
os.environ["GONTU_JWT_SECRET_FILE"] = str(Path(TEMP.name) / "jwt-secret")

from fastapi.testclient import TestClient  # noqa: E402
from starlette.requests import Request  # noqa: E402

from auth_rate_limit import auth_rate_limiter, request_source  # noqa: E402
from main import app  # noqa: E402


class AuthRateLimitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context = TestClient(app)
        cls.client = cls.context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)
        TEMP.cleanup()

    def setUp(self):
        auth_rate_limiter.reset()
        os.environ.pop("GONTU_TRUSTED_PROXIES", None)

    def test_login_account_is_blocked_and_success_clears_failures(self):
        created = self.client.post(
            "/api/auth/register",
            json={"username": "rate_user", "password": "correct-password"},
        )
        self.assertEqual(created.status_code, 200)
        for _ in range(5):
            failed = self.client.post(
                "/api/auth/login",
                json={"username": "rate_user", "password": "wrong-password"},
            )
            self.assertEqual(failed.status_code, 401)

        blocked = self.client.post(
            "/api/auth/login",
            json={"username": "rate_user", "password": "correct-password"},
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertGreaterEqual(int(blocked.headers["retry-after"]), 1)

        auth_rate_limiter.reset()
        success = self.client.post(
            "/api/auth/login",
            json={"username": "rate_user", "password": "correct-password"},
        )
        self.assertEqual(success.status_code, 200)
        self.assertEqual(success.json()["is_admin"], 0)

    def test_registration_source_limit_and_input_boundaries(self):
        for index in range(5):
            response = self.client.post(
                "/api/auth/register",
                json={"username": f"learner_{index}", "password": "valid-password"},
            )
            self.assertEqual(response.status_code, 200)
        blocked = self.client.post(
            "/api/auth/register",
            json={"username": "learner_blocked", "password": "valid-password"},
        )
        self.assertEqual(blocked.status_code, 429)

        auth_rate_limiter.reset()
        too_large = self.client.post(
            "/api/auth/login",
            json={"username": "x" * 65, "password": "x" * 257},
        )
        self.assertEqual(too_large.status_code, 422)

    def test_forwarded_source_requires_an_explicit_trusted_peer(self):
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": [(b"x-forwarded-for", b"198.51.100.9, 203.0.113.7")],
            "client": ("127.0.0.1", 50000),
            "server": ("testserver", 80),
            "scheme": "http",
            "query_string": b"",
        }
        request = Request(scope)
        self.assertEqual(request_source(request), "127.0.0.1")

        os.environ["GONTU_TRUSTED_PROXIES"] = "127.0.0.1"
        self.assertEqual(request_source(request), "203.0.113.7")


if __name__ == "__main__":
    unittest.main()
