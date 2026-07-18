"""User authentication (register / login) — JWT tokens (no pyjwt deps)."""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer
from pydantic import BaseModel

# ── Config ─────────────────────────────────────────────────────
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_SECONDS = 7 * 24 * 3600  # 7 days
_MIN_JWT_SECRET_BYTES = 32
_RETIRED_PUBLIC_SECRET = b"gontu-unified-secret-key-change-in-production"


def _validate_jwt_secret(raw: str | bytes, *, source: str) -> bytes:
    secret = raw.encode("utf-8") if isinstance(raw, str) else raw
    secret = secret.strip()
    if len(secret) < _MIN_JWT_SECRET_BYTES:
        raise RuntimeError(f"JWT secret from {source} must contain at least 32 bytes")
    if secrets.compare_digest(secret, _RETIRED_PUBLIC_SECRET):
        raise RuntimeError(f"JWT secret from {source} uses a retired public value")
    return secret


def _default_jwt_secret_file() -> Path:
    configured = os.environ.get("GONTU_JWT_SECRET_FILE", "").strip()
    if configured:
        return Path(configured).expanduser()
    database_path = Path(
        os.environ.get("GONTU_DB_PATH", str(Path(__file__).resolve().parent / "data.db"))
    ).expanduser()
    return database_path.parent / ".gontu-jwt-secret"


def _load_jwt_secret() -> bytes:
    configured = os.environ.get("GONTU_JWT_SECRET", "").strip()
    if configured:
        return _validate_jwt_secret(configured, source="GONTU_JWT_SECRET")

    environment = os.environ.get("GONTU_ENV", "development").strip().lower()
    if environment in {"prod", "production"}:
        raise RuntimeError("GONTU_JWT_SECRET is required when GONTU_ENV=production")

    secret_file = _default_jwt_secret_file()
    secret_file.parent.mkdir(parents=True, exist_ok=True)
    try:
        stored = secret_file.read_bytes()
    except FileNotFoundError:
        generated = secrets.token_urlsafe(48).encode("ascii")
        try:
            descriptor = os.open(secret_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            stored = secret_file.read_bytes()
        else:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(generated)
            stored = generated
    try:
        secret_file.chmod(0o600)
    except OSError:
        pass
    return _validate_jwt_secret(stored, source=str(secret_file))


JWT_SECRET = _load_jwt_secret()

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


# ── Models ─────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    username: str
    password: str


class LoginIn(BaseModel):
    username: str
    password: str


class AuthOut(BaseModel):
    token: str
    user_id: int
    username: str
    is_admin: int = 0  # 新增：返回是否为管理员
    is_vip: int = 0
    ai_credits: int = 0


class BootstrapStatusOut(BaseModel):
    has_admin: bool


# ── JWT helpers (manual, no pyjwt) ─────────────────────────────
def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * padding)


def create_token(user_id: int, username: str, is_admin: int = 0) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(user_id),
        "username": username,
        "is_admin": is_admin,   # 写入 JWT，前端可快速判断
        "exp": int(time.time()) + JWT_EXPIRE_SECONDS,
    }
    h = b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    p = b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    msg = f"{h}.{p}".encode()
    sig = hmac.new(JWT_SECRET, msg, hashlib.sha256).digest()
    s = b64url_encode(sig)
    return f"{h}.{p}.{s}"


def decode_token(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("invalid token")
    h, p, s = parts
    # Verify signature
    msg = f"{h}.{p}".encode()
    expected_sig = hmac.new(JWT_SECRET, msg, hashlib.sha256).digest()
    actual_sig = b64url_decode(s)
    if not secrets.compare_digest(expected_sig, actual_sig):
        raise ValueError("invalid signature")
    # Check exp
    payload = json.loads(b64url_decode(p))
    if payload.get("exp", 0) < time.time():
        raise ValueError("token expired")
    return payload


# ── Password hashing (pbkdf2_hmac) ─────────────────────────
def hash_password(password: str) -> str:
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return (salt + key).hex()


def verify_password(password: str, hashed: str) -> bool:
    try:
        raw = bytes.fromhex(hashed)
        salt, stored_key = raw[:32], raw[32:]
        key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
        return secrets.compare_digest(key, stored_key)
    except Exception:
        return False


# ── Auth dependency ─────────────────────────────────────────────
async def get_current_user(request: Request) -> dict | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        payload = decode_token(token)
        return {
            "user_id": int(payload["sub"]),
            "username": payload["username"],
            "is_admin": payload.get("is_admin", 0),
        }
    except Exception:
        return None


async def require_user(request: Request) -> dict:
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    # A correctly signed token is not sufficient when its account has been
    # deleted or the browser is pointed at a fresh database.  Validate the
    # subject here so downstream writes cannot fail later on foreign keys.
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, username, is_admin FROM users WHERE id = ?",
            (user["user_id"],),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return {
        "user_id": row["id"],
        "username": row["username"],
        "is_admin": row["is_admin"] or 0,
    }


# ── Admin dependency ───────────────────────────────────────────
async def require_admin(request: Request) -> dict:
    """管理员鉴权：先验证登录，再检查 is_admin"""
    user = await require_user(request)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Routes ─────────────────────────────────────────────────────
@router.post("/register", response_model=AuthOut)
def register(body: RegisterIn):
    from database import get_db
    with get_db() as conn:
        # Serialize bootstrap registration so two simultaneous requests cannot
        # both become the initial administrator.
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", (body.username,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
        admin_count = conn.execute(
            "SELECT COUNT(*) FROM users WHERE is_admin = 1"
        ).fetchone()[0]
        is_admin = 1 if admin_count == 0 else 0
        pw_hash = hash_password(body.password)
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)",
            (body.username, pw_hash, is_admin),
        )
        conn.commit()
        user_id = cur.lastrowid
    assert user_id is not None, "INSERT should return a valid rowid"
    token = create_token(user_id, body.username, is_admin=is_admin)
    return AuthOut(
        token=token,
        user_id=user_id,
        username=body.username,
        is_admin=is_admin,
    )


@router.post("/login", response_model=AuthOut)
def login(body: LoginIn):
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            """SELECT id, password_hash, is_admin, is_vip, ai_credits
               FROM users WHERE username = ?""",
            (body.username,),
        ).fetchone()
        if not row or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        is_admin = row["is_admin"] or 0
    token = create_token(row["id"], body.username, is_admin=is_admin)
    return AuthOut(
        token=token,
        user_id=row["id"],
        username=body.username,
        is_admin=is_admin,
        is_vip=row["is_vip"] or 0,
        ai_credits=row["ai_credits"] or 0,
    )


@router.get("/me")
def get_me(user: dict = Depends(require_user)):
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_vip, ai_credits, vip_expires_at FROM users WHERE id=?",
            (user["user_id"],),
        ).fetchone()
    result = dict(user)
    if row:
        result.update({
            "is_vip": row["is_vip"] or 0,
            "ai_credits": row["ai_credits"] or 0,
            "vip_expires_at": row["vip_expires_at"] or "",
        })
    return result


@router.get("/bootstrap-status", response_model=BootstrapStatusOut)
def bootstrap_status():
    """Tell the unified login page whether the first account will be admin."""
    from database import get_db
    with get_db() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM users WHERE is_admin = 1"
        ).fetchone()[0]
    return BootstrapStatusOut(has_admin=count > 0)
