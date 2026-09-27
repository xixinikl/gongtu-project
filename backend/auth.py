"""User authentication (register / login) — JWT tokens (no pyjwt deps)."""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field

from auth_rate_limit import auth_rate_limiter, enforce_auth_rate_limit

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
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class LoginIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)


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


# Keep missing-user logins on the same expensive verification path so response
# timing does not become a practical username-existence oracle.
_DUMMY_PASSWORD_HASH = hash_password("gontu-dummy-password-not-for-login")


def bootstrap_initial_admin(username: str, password: str) -> tuple[int, bool]:
    """Create or elevate the sole initial administrator from a local command.

    This function is intentionally not exposed as an HTTP route.  Possession of
    the public registration endpoint must never be enough to gain administrator
    privileges.
    """
    normalized_username = username.strip()
    if not 3 <= len(normalized_username) <= 64:
        raise ValueError("Administrator username must contain 3 to 64 characters")
    if len(password) < 12:
        raise ValueError("Administrator password must contain at least 12 characters")

    from database import get_db

    pw_hash = hash_password(password)
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        admin_count = conn.execute(
            "SELECT COUNT(*) FROM users WHERE is_admin = 1"
        ).fetchone()[0]
        if admin_count:
            raise RuntimeError("An administrator already exists; bootstrap refused")

        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", (normalized_username,)
        ).fetchone()
        if existing:
            user_id = int(existing["id"])
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                (pw_hash, user_id),
            )
            created = False
        else:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
                (normalized_username, pw_hash),
            )
            inserted_user_id = cursor.lastrowid
            assert inserted_user_id is not None, "INSERT should return a valid rowid"
            user_id = int(inserted_user_id)
            created = True
        conn.commit()
    return user_id, created


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


# ── VIP / AI 访问策略 ────────────────────────────────────────────
# 全站访问模式由后台「VIP / AI 积分」开关（app_settings.ai_access_mode）决定：
#   free（默认）— 所有登录用户平等使用全部学习模块，VIP 字段仅作展示。
#   vip         — 申论 AI 批改、AI 学习教练、三维空间几何模块仅对有效 VIP 开放，
#                 且每次调用 AI 消耗一点积分；积分不足或非 VIP 一律拒绝。
# 管理员账号始终放行，方便后台自查与维护。
def _get_ai_access_mode(conn) -> str:
    row = conn.execute(
        "SELECT value FROM app_settings WHERE key='ai_access_mode'"
    ).fetchone()
    return row["value"] if row else "free"


def _vip_is_active(row) -> bool:
    if not row["is_vip"]:
        return False
    expires_at = row["vip_expires_at"] or ""
    if not expires_at:
        return True  # 未设置到期日 = 长期有效
    try:
        return datetime.strptime(expires_at, "%Y-%m-%d").date() >= datetime.now().date()
    except ValueError:
        return True


async def require_vip_feature(request: Request) -> dict:
    """VIP 专属模块鉴权：free 模式下对所有登录用户放行；
    vip 模式下要求账号是有效 VIP（未过期）；管理员始终放行。"""
    user = await require_user(request)
    if user.get("is_admin"):
        return user
    from database import get_db
    with get_db() as conn:
        if _get_ai_access_mode(conn) != "vip":
            return user
        row = conn.execute(
            "SELECT is_vip, vip_expires_at FROM users WHERE id = ?",
            (user["user_id"],),
        ).fetchone()
    if not row or not _vip_is_active(row):
        raise HTTPException(status_code=403, detail="该功能仅限 VIP 用户使用，请联系管理员开通")
    return user


def consume_ai_credit(user_id: int, feature: str) -> None:
    """在 vip 模式下扣减一点 AI 积分；free 模式不扣减。积分不足或非 VIP 拒绝。"""
    from database import get_db
    with get_db() as conn:
        if _get_ai_access_mode(conn) != "vip":
            return
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT username, is_vip, vip_expires_at, ai_credits FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            conn.rollback()
            raise HTTPException(status_code=401, detail="Not authenticated")
        if not _vip_is_active(row):
            conn.rollback()
            raise HTTPException(status_code=403, detail="该功能仅限 VIP 用户使用，请联系管理员开通")
        credits = row["ai_credits"] or 0
        if credits <= 0:
            conn.rollback()
            raise HTTPException(status_code=402, detail="AI 使用积分已用完，请联系管理员充值")
        conn.execute(
            "UPDATE users SET ai_credits = ai_credits - 1 WHERE id = ?", (user_id,)
        )
        conn.execute(
            """INSERT INTO ai_credit_ledger(user_id, username, feature, delta, status)
               VALUES (?, ?, ?, -1, 'consumed')""",
            (user_id, row["username"], feature),
        )
        conn.commit()


def refund_ai_credit(user_id: int, feature: str, reason: str = "provider_failure") -> None:
    """AI 调用失败时返还刚才扣的那一点积分；free 模式无需返还。"""
    from database import get_db
    with get_db() as conn:
        if _get_ai_access_mode(conn) != "vip":
            return
        row = conn.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            return
        conn.execute(
            "UPDATE users SET ai_credits = ai_credits + 1 WHERE id = ?", (user_id,)
        )
        conn.execute(
            """INSERT INTO ai_credit_ledger(user_id, username, feature, delta, status, reason)
               VALUES (?, ?, ?, 1, 'refunded', ?)""",
            (user_id, row["username"], feature, reason),
        )
        conn.commit()


# ── Routes ─────────────────────────────────────────────────────
@router.post("/register", response_model=AuthOut)
def register(body: RegisterIn, request: Request):
    enforce_auth_rate_limit(request, action="register", account=body.username)
    from database import get_db
    pw_hash = hash_password(body.password)
    with get_db() as conn:
        # Serialize username creation. Public registration never grants admin.
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", (body.username,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
        is_admin = 0
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
def login(body: LoginIn, request: Request):
    rate_limit_keys = enforce_auth_rate_limit(
        request, action="login", account=body.username
    )
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            """SELECT id, password_hash, is_admin, is_vip, ai_credits
               FROM users WHERE username = ?""",
            (body.username,),
        ).fetchone()
        candidate_hash = row["password_hash"] if row else _DUMMY_PASSWORD_HASH
        password_is_valid = verify_password(body.password, candidate_hash)
        if not row or not password_is_valid:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        is_admin = row["is_admin"] or 0
    # A successful login clears only this account's failure bucket. Keeping the
    # source bucket prevents an attacker from resetting it with their own account.
    auth_rate_limiter.clear((rate_limit_keys[0],))
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
    """Tell operators whether an administrator has been initialized."""
    from database import get_db
    with get_db() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM users WHERE is_admin = 1"
        ).fetchone()[0]
    return BootstrapStatusOut(has_admin=count > 0)
