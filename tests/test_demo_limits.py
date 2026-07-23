import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from demo_limits import _limiter, enforce_ai_limit


def request_for(source: str = "127.0.0.1") -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/ai",
        "headers": [],
        "client": (source, 1234),
        "server": ("testserver", 80),
        "scheme": "http",
    }
    return Request(scope)


class DemoLimitTests(unittest.TestCase):
    def setUp(self):
        _limiter.reset()

    def tearDown(self):
        _limiter.reset()

    def test_local_default_is_unlimited(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GONTU_DEMO_MODE", None)
            for _ in range(30):
                enforce_ai_limit(request_for(), 1)

    def test_demo_mode_enforces_user_quota(self):
        with patch.dict(
            os.environ,
            {"GONTU_DEMO_MODE": "1", "GONTU_DEMO_AI_PER_USER": "2", "GONTU_DEMO_AI_PER_SOURCE": "99"},
        ):
            enforce_ai_limit(request_for(), 1)
            enforce_ai_limit(request_for(), 1)
            with self.assertRaises(HTTPException) as ctx:
                enforce_ai_limit(request_for(), 1)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertIn("Retry-After", ctx.exception.headers)

    def test_demo_mode_source_quota_protects_multiple_users(self):
        with patch.dict(
            os.environ,
            {"GONTU_DEMO_MODE": "1", "GONTU_DEMO_AI_PER_USER": "99", "GONTU_DEMO_AI_PER_SOURCE": "2"},
        ):
            enforce_ai_limit(request_for(), 1)
            enforce_ai_limit(request_for(), 2)
            with self.assertRaises(HTTPException):
                enforce_ai_limit(request_for(), 3)


if __name__ == "__main__":
    unittest.main()
