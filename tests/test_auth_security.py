import base64
import hashlib
import hmac
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _sign_with(secret: bytes, user_id: int = 1) -> str:
    header = _b64url(b'{"alg":"HS256","typ":"JWT"}')
    payload = _b64url(json.dumps({
        "sub": str(user_id),
        "username": "forged",
        "is_admin": 1,
        "exp": int(time.time()) + 3600,
    }, separators=(",", ":")).encode())
    message = f"{header}.{payload}".encode()
    signature = _b64url(hmac.new(secret, message, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


class AuthSecretSecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = {
            key: os.environ.get(key)
            for key in ("GONTU_DB_PATH", "GONTU_JWT_SECRET", "GONTU_JWT_SECRET_FILE", "GONTU_ENV")
        }
        os.environ["GONTU_DB_PATH"] = str(Path(self.temp.name) / "auth.db")
        for key in ("GONTU_JWT_SECRET", "GONTU_JWT_SECRET_FILE", "GONTU_ENV"):
            os.environ.pop(key, None)

    def tearDown(self):
        for key, value in self.original.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.temp.cleanup()

    def _reload_auth(self):
        import auth
        return importlib.reload(auth)

    def test_retired_public_secret_cannot_forge_identity(self):
        auth = self._reload_auth()
        forged = _sign_with(b"gontu-unified-secret-key-change-in-production")
        with self.assertRaisesRegex(ValueError, "invalid signature"):
            auth.decode_token(forged)

    def test_local_secret_is_private_and_stable_across_restart(self):
        auth = self._reload_auth()
        token = auth.create_token(7, "stable-user")
        secret_file = Path(self.temp.name) / ".gontu-jwt-secret"
        self.assertTrue(secret_file.exists())
        self.assertEqual(secret_file.stat().st_mode & 0o777, 0o600)

        restarted = self._reload_auth()
        self.assertEqual(restarted.decode_token(token)["sub"], "7")

    def test_production_requires_explicit_non_public_secret(self):
        os.environ["GONTU_ENV"] = "production"
        with self.assertRaisesRegex(RuntimeError, "GONTU_JWT_SECRET is required"):
            self._reload_auth()

        os.environ["GONTU_JWT_SECRET"] = "gontu-unified-secret-key-change-in-production"
        with self.assertRaisesRegex(RuntimeError, "retired public value"):
            self._reload_auth()

        os.environ["GONTU_JWT_SECRET"] = "phase6-test-only-secret-material-0123456789"
        auth = self._reload_auth()
        self.assertEqual(auth.decode_token(auth.create_token(9, "production-user"))["sub"], "9")


if __name__ == "__main__":
    unittest.main()
