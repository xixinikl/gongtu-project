"""

智学成语 · 后端 API 服务
统一版：所有端点接入 JWT 认证
"""
import sqlite3
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
import os
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse

from database import get_db, init_db, cleanup_old_events
from models import CardOut, QuizItemOut, SyncIn, SyncOut, VocabOut
from auth import router as auth_router, require_user, require_admin
from mindmap import router as mindmap_router
from shenlun import router as shenlun_router
from verbal_reading import router as verbal_reading_router
from verbal_catalog import (
    ensure_verbal_catalog_schema,
    router as verbal_catalog_router,
)
from quantity import router as quantity_router
from spatial_learning import (
    ensure_spatial_learning_schema,
    router as spatial_learning_router,
)
from unified_learning import router as unified_learning_router
from ai_coach import ensure_ai_coach_schema, router as ai_coach_router

# ── Logging ──
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("gontu.api")


def _load_cors_origins() -> list[str]:
    environment = os.environ.get("GONTU_ENV", "development").strip().lower()
    configured = os.environ.get("GONTU_CORS_ORIGINS", "").strip()
    if not configured:
        if environment in {"prod", "production"}:
            raise RuntimeError(
                "GONTU_CORS_ORIGINS is required when GONTU_ENV=production"
            )
        return ["*"]

    origins = []
    for item in configured.split(","):
        origin = item.strip().rstrip("/")
        if not origin:
            continue
        if origin == "*":
            if environment in {"prod", "production"}:
                raise RuntimeError("Wildcard CORS is forbidden in production")
            return ["*"]
        parsed = urlsplit(origin)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise RuntimeError(f"Invalid CORS origin: {origin}")
        origins.append(origin)
    if not origins:
        raise RuntimeError("GONTU_CORS_ORIGINS did not contain a valid origin")
    return origins


CORS_ORIGINS = _load_cors_origins()


# ── Lifespan ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    ensure_verbal_catalog_schema()
    ensure_spatial_learning_schema()
    ensure_ai_coach_schema()
    logger.info("Database initialized")
    yield
    # Background maintenance on shutdown
    cleanup_old_events()


app = FastAPI(
    title="公途学习平台 API",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(auth_router)
app.include_router(mindmap_router)
app.include_router(shenlun_router)
app.include_router(verbal_reading_router)
app.include_router(verbal_catalog_router)
app.include_router(quantity_router)
app.include_router(spatial_learning_router)
app.include_router(unified_learning_router)
app.include_router(ai_coach_router)


# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request logging middleware ──
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({duration:.3f}s)")
    return response


# ── Global exception handler ──
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


# ═══════════════════════════════════════════════════
#  GET /api/cards  — 获取题库卡片（需登录）
# ═══════════════════════════════════════════════════
@app.get("/api/cards", response_model=list[CardOut])
async def list_cards(deck: str = "math", user: dict = Depends(require_user)):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM cards WHERE deck = ? ORDER BY id", (deck,)
        ).fetchall()
        return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════
#  GET /api/quiz  — 获取题型识别题库（需登录）
# ═══════════════════════════════════════════════════
@app.get("/api/quiz", response_model=list[QuizItemOut])
async def list_quiz(user: dict = Depends(require_user)):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM quiz_items ORDER BY id").fetchall()
    result = []
    for r in rows:
        d = dict(r)
        try:
            d["opts"] = json.loads(d["opts"])
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="Data integrity error")
        result.append(d)
    return result


# ═══════════════════════════════════════════════════
#  POST /api/sync  — 提交学习事件（需登录，user_id从JWT取）
# ═══════════════════════════════════════════════════
@app.post("/api/sync", response_model=SyncOut)
async def sync_events(payload: SyncIn, user: dict = Depends(require_user)):
    now = datetime.now(timezone.utc).isoformat()
    user_id = user["user_id"]
    with get_db() as conn:
        count = 0
        for ev in payload.events:
            conn.execute(
                "INSERT INTO learning_events (user_id, card_id, action, created_at) VALUES (?, ?, ?, ?)",
                (user_id, ev.card_id, ev.action, now),
            )
            count += 1
        conn.commit()
    logger.info(f"Synced {count} events for user {user_id}")
    return SyncOut(accepted=count)


# ═══════════════════════════════════════════════════
#  GET /api/vocab/highfreq  — 高频词库（需登录）
# ═══════════════════════════════════════════════════
@app.get("/api/vocab/highfreq", response_model=list[VocabOut])
async def highfreq_vocab(user: dict = Depends(require_user)):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT word, meaning, category FROM highfreq_vocab ORDER BY id"
        ).fetchall()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════
#  GET /api/deck/vocab/highfreq  — 兼容前端调用路径（别名）
# ═══════════════════════════════════════════════════
@app.get("/api/deck/vocab/highfreq", response_model=list[VocabOut])
async def deck_vocab_highfreq(user: dict = Depends(require_user), limit: int = 100):
    """兼容前端 /api/deck/vocab/highfreq?limit=100 调用"""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT word, meaning, category FROM highfreq_vocab ORDER BY id LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════
#  GET /api/deck/{deck_type}  — 拉取用户牌组（核心！）
# ═══════════════════════════════════════════════════
@app.get("/api/deck/{deck_type}")
async def get_user_deck(deck_type: str, user: dict = Depends(require_user)):
    """拉取用户牌组数据：cards + queue + settings"""
    if deck_type not in ("idiom", "math"):
        raise HTTPException(400, f"Invalid deck_type: {deck_type}")
    user_id = user["user_id"]
    with get_db() as conn:
        row = conn.execute(
            "SELECT cards_json, queue_json, settings_json FROM user_decks WHERE user_id=? AND deck_type=?",
            (user_id, deck_type),
        ).fetchone()
        if not row:
            return {"cards": [], "queue": None, "settings": {}}
        return {
            "cards": json.loads(row["cards_json"]) if row["cards_json"] else [],
            "queue": json.loads(row["queue_json"]) if row["queue_json"] else None,
            "settings": json.loads(row["settings_json"]) if row["settings_json"] else {},
        }


# ═══════════════════════════════════════════════════
#  PUT /api/deck/{deck_type}  — 保存用户牌组（核心！）
# ═══════════════════════════════════════════════════
@app.put("/api/deck/{deck_type}")
async def save_user_deck(deck_type: str, request: Request, user: dict = Depends(require_user)):
    """保存用户牌组数据到后端"""
    if deck_type not in ("idiom", "math"):
        raise HTTPException(400, f"Invalid deck_type: {deck_type}")
    body = await request.json()
    user_id = user["user_id"]
    cards_json = json.dumps(body.get("cards", []), ensure_ascii=False)
    queue_json = json.dumps(body.get("queue"), ensure_ascii=False) if body.get("queue") is not None else None
    settings_json = json.dumps(body.get("settings", {}), ensure_ascii=False)
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM user_decks WHERE user_id=? AND deck_type=?", (user_id, deck_type)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE user_decks SET cards_json=?, queue_json=?, settings_json=?, updated_at=datetime('now') WHERE user_id=? AND deck_type=?",
                (cards_json, queue_json, settings_json, user_id, deck_type),
            )
        else:
            conn.execute(
                "INSERT INTO user_decks (user_id, deck_type, cards_json, queue_json, settings_json, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
                (user_id, deck_type, cards_json, queue_json, settings_json),
            )
        conn.commit()
    logger.info(f"Saved deck {deck_type} for user {user_id} ({len(body.get('cards',[]))} cards)")
    return {"ok": True}


# ═══════════════════════════════════════════════════
#  GET/PUT /api/user/meta  — 热力图+连续学习+每日目标
# ═══════════════════════════════════════════════════
@app.get("/api/user/meta")
async def get_user_meta(user: dict = Depends(require_user)):
    """获取用户热力图、连续学习天数、每日目标"""
    user_id = user["user_id"]
    with get_db() as conn:
        row = conn.execute(
            "SELECT heatmap_json, streak, last_study_date, daily_goal FROM user_meta WHERE user_id=?",
            (user_id,),
        ).fetchone()
        if not row:
            return {"heatmap": {}, "streak": 0, "lastStudyDate": "", "dailyGoal": 20}
        return {
            "heatmap": json.loads(row["heatmap_json"]) if row["heatmap_json"] else {},
            "streak": row["streak"],
            "lastStudyDate": row["last_study_date"] or "",
            "dailyGoal": row["daily_goal"],
        }


@app.put("/api/user/meta")
async def save_user_meta(request: Request, user: dict = Depends(require_user)):
    """保存热力图、连续学习数据"""
    body = await request.json()
    user_id = user["user_id"]
    heatmap_json = json.dumps(body.get("heatmap", {}), ensure_ascii=False)
    streak = body.get("streak", 0)
    last_study_date = body.get("lastStudyDate", "")
    daily_goal = body.get("dailyGoal", 20)
    with get_db() as conn:
        # 先检查是否存在
        existing = conn.execute("SELECT id FROM user_meta WHERE user_id=?", (user_id,)).fetchone()
        if existing:
            conn.execute(
                "UPDATE user_meta SET heatmap_json=?, streak=?, last_study_date=?, daily_goal=?, updated_at=datetime('now') WHERE user_id=?",
                (heatmap_json, streak, last_study_date, daily_goal, user_id),
            )
        else:
            conn.execute(
                "INSERT INTO user_meta (user_id, heatmap_json, streak, last_study_date, daily_goal, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
                (user_id, heatmap_json, streak, last_study_date, daily_goal),
            )
        conn.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════
#  Custom Vocab — 用户自定义词库管理
# ═══════════════════════════════════════════════════

@app.get("/api/vocab/sources")
async def list_vocab_sources(user: dict = Depends(require_user)):
    """列出用户可用的词库来源列表"""
    user_id = user["user_id"]
    sources = [{"id": "builtin", "name": "内置词库", "count": 0, "editable": False}]
    with get_db() as conn:
        builtin_count = conn.execute("SELECT COUNT(*) FROM highfreq_vocab").fetchone()[0]
        sources[0]["count"] = builtin_count
        # 按 source_name 分组统计自定义词库
        rows = conn.execute(
            "SELECT source_name, COUNT(*) as cnt FROM custom_vocab WHERE user_id=? GROUP BY source_name",
            (user_id,),
        ).fetchall()
        for row in rows:
            sources.append({
                "id": f"custom:{row['source_name']}",
                "name": row["source_name"],
                "count": row["cnt"],
                "editable": True,
            })
    return sources


@app.get("/api/vocab/custom")
async def get_custom_vocab(user: dict = Depends(require_user), source: str = ""):
    """获取用户自定义词库内容"""
    user_id = user["user_id"]
    with get_db() as conn:
        if source:
            rows = conn.execute(
                "SELECT word, meaning, category FROM custom_vocab WHERE user_id=? AND source_name=? ORDER BY id",
                (user_id, source),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT word, meaning, category, source_name FROM custom_vocab WHERE user_id=? ORDER BY source_name, id",
                (user_id,),
            ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/vocab/custom/upload")
async def upload_custom_vocab(request: Request, user: dict = Depends(require_user)):
    """上传自定义词库（Excel内容由前端解析后以JSON提交）"""
    body = await request.json()
    user_id = user["user_id"]
    source_name = body.get("sourceName", "我的词库").strip() or "我的词库"
    words = body.get("words", [])  # [{word, meaning}, ...]
    if not words:
        raise HTTPException(400, "词库数据为空")

    added, skipped = 0, 0
    with get_db() as conn:
        for w in words:
            word = (w.get("word") or w.get("name") or "").strip()
            meaning = (w.get("meaning") or "").strip()
            if not word:
                continue
            try:
                conn.execute(
                    "INSERT INTO custom_vocab (user_id, source_name, word, meaning, category) VALUES (?, ?, ?, ?, ?)",
                    (user_id, source_name, word, meaning, "自定义"),
                )
                added += 1
            except sqlite3.IntegrityError:  # noqa: F821
                skipped += 1
        conn.commit()

    logger.info(f"User {user_id} uploaded vocab '{source_name}': {added} added, {skipped} skipped")
    return {"ok": True, "added": added, "skipped": skipped, "sourceName": source_name}


@app.delete("/api/vocab/custom")
async def delete_custom_vocab(user: dict = Depends(require_user), source: str = ""):
    """删除用户自定义词库（source为空则全部删除）"""
    user_id = user["user_id"]
    with get_db() as conn:
        if source:
            conn.execute("DELETE FROM custom_vocab WHERE user_id=? AND source_name=?", (user_id, source))
        else:
            conn.execute("DELETE FROM custom_vocab WHERE user_id=?", (user_id,))
        conn.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════
#  Health check
# ═══════════════════════════════════════════════════
@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


# ═══════════════════════════════════════════════════
#  Static pages — serve HTML from parent directory
# ═══════════════════════════════════════════════════
PARENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """正式水墨首页；旧 index.html 继续作为首页片段素材。"""
    path = os.path.join(
        PARENT_DIR, "doc", "prototypes", "homepage-middle-ink-morph.html"
    )
    if not os.path.exists(path):
        raise HTTPException(404, "首页文件不存在")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


@app.get("/app", response_class=HTMLResponse)
async def serve_app():
    """功能页 - 学习面板"""
    path = os.path.join(PARENT_DIR, "智学成语-高级版.html")
    if not os.path.exists(path):
        raise HTTPException(404, "功能页文件不存在")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


@app.get("/mindmap", response_class=HTMLResponse)
async def serve_mindmap():
    """思维导图/图推错题"""
    path = os.path.join(PARENT_DIR, "mindmap.html")
    if not os.path.exists(path):
        # 兼容旧版位置
        path = os.path.join(PARENT_DIR, "思维导图.html")
    if not os.path.exists(path):
        raise HTTPException(404, "思维导图文件不存在")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


@app.get("/geometry", response_class=HTMLResponse)
async def serve_geometry():
    """空间几何实验室"""
    path = os.path.join(PARENT_DIR, "geometry.html")
    if not os.path.exists(path):
        raise HTTPException(404, "空间几何实验室文件不存在")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


@app.get("/shenlun", response_class=HTMLResponse)
async def serve_shenlun():
    """申论批改"""
    path = os.path.join(PARENT_DIR, "shenlun.html")
    if not os.path.exists(path):
        raise HTTPException(404, "申论文件不存在")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


@app.get("/ai-coach", response_class=HTMLResponse)
async def serve_ai_coach():
    """正式 AI 教练入口；旧文件名仅作静态兼容。"""
    path = os.path.join(PARENT_DIR, "ai-coach-demo.html")
    if not os.path.exists(path):
        raise HTTPException(404, "AI 教练页面不存在")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# ═══════════════════════════════════════════════════
#  Admin page
# ═══════════════════════════════════════════════════

@app.get("/admin")
async def serve_admin():
    path = os.path.join(PARENT_DIR, "admin.html")
    if not os.path.exists(path):
        raise HTTPException(404, "Admin 页面不存在")
    with open(path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read(), media_type="text/html")


# ═══════════════════════════════════════════════════
#  Admin API — 全部需要 require_admin 鉴权
# ═══════════════════════════════════════════════════

def _write_admin_audit(
    conn: sqlite3.Connection,
    *,
    admin: dict,
    action: str,
    target_user_id: int | None = None,
    target_username: str = "",
    details: dict | None = None,
) -> None:
    """Append a controlled, secret-free audit record in the caller transaction."""
    conn.execute(
        """INSERT INTO admin_audit_log(
               actor_user_id, actor_username, action,
               target_user_id, target_username, details_json
           ) VALUES (?, ?, ?, ?, ?, ?)""",
        (
            admin["user_id"],
            admin["username"],
            action,
            target_user_id,
            target_username,
            json.dumps(details or {}, ensure_ascii=False, sort_keys=True),
        ),
    )


@app.get("/api/admin/audit-log")
async def admin_get_audit_log(
    limit: int = 100,
    admin: dict = Depends(require_admin),
):
    """Return newest administrator mutations; ordinary users are rejected."""
    if not 1 <= limit <= 200:
        raise HTTPException(400, "limit 必须在 1 到 200 之间")
    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, actor_user_id, actor_username, action,
                      target_user_id, target_username, details_json, created_at
               FROM admin_audit_log ORDER BY id DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        try:
            item["details"] = json.loads(item.pop("details_json"))
        except (json.JSONDecodeError, TypeError):
            item["details"] = {}
            item.pop("details_json", None)
        result.append(item)
    return result

@app.get("/api/admin/users")
async def admin_list_users(admin: dict = Depends(require_admin)):
    """列出所有用户与跨模块学习统计。"""
    with get_db() as conn:
        def table_exists(name: str) -> bool:
            return bool(conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (name,),
            ).fetchone())

        def scalar(sql: str, params: tuple = ()) -> int:
            try:
                row = conn.execute(sql, params).fetchone()
                return int(row[0] or 0) if row else 0
            except (sqlite3.DatabaseError, TypeError, ValueError):
                return 0

        rows = conn.execute("""
            SELECT u.id, u.username, u.created_at, u.is_admin,
                   u.is_vip, u.vip_expires_at, u.ai_credits,
                   COUNT(DISTINCT cv.id) as vocab_count,
                   COUNT(DISTINCT sh.id) as shenlun_count
            FROM users u
            LEFT JOIN custom_vocab cv ON cv.user_id = u.id
            LEFT JOIN shenlun_history sh ON sh.user_id = u.id
            GROUP BY u.id
            ORDER BY u.id
        """).fetchall()
        users = []
        for r in rows:
            user_id = r["id"]
            decks = conn.execute(
                "SELECT deck_type, cards_json FROM user_decks WHERE user_id=?",
                (user_id,)
            ).fetchall()
            deck_info = {}
            for d in decks:
                try:
                    cards = json.loads(d["cards_json"] or "[]")
                    deck_info[d["deck_type"]] = len(cards)
                except Exception:
                    deck_info[d["deck_type"]] = 0

            meta = conn.execute(
                """SELECT streak, last_study_date, daily_goal, updated_at
                   FROM user_meta WHERE user_id=?""",
                (user_id,),
            ).fetchone()
            last_activity = meta["updated_at"] if meta else ""
            for sql, params in (
                ("SELECT MAX(created_at) FROM learning_events WHERE user_id=?", (str(user_id),)),
                ("SELECT MAX(created_at) FROM shenlun_history WHERE user_id=?", (user_id,)),
            ):
                value = conn.execute(sql, params).fetchone()[0]
                if value:
                    last_activity = max(last_activity, value)
            if table_exists("verbal_practice_sessions"):
                value = conn.execute(
                    "SELECT MAX(updated_at) FROM verbal_practice_sessions WHERE user_id=?",
                    (user_id,),
                ).fetchone()[0]
                if value:
                    last_activity = max(last_activity, value)

            users.append({
                "id": r["id"],
                "username": r["username"],
                "created_at": r["created_at"],
                "is_admin": r["is_admin"] or 0,
                "is_vip": r["is_vip"] or 0,
                "vip_expires_at": r["vip_expires_at"] or "",
                "ai_credits": r["ai_credits"] or 0,
                "vocab_count": r["vocab_count"],
                "shenlun_count": r["shenlun_count"],
                "shenlun_mistake_count": scalar(
                    "SELECT COUNT(*) FROM shenlun_mistakes WHERE user_id=?",
                    (user_id,),
                ),
                "decks": deck_info,
                "learning_events": scalar(
                    "SELECT COUNT(*) FROM learning_events WHERE user_id=?",
                    (str(user_id),),
                ),
                "question_count": scalar(
                    "SELECT COUNT(*) FROM questions WHERE user_id=?",
                    (str(user_id),),
                ),
                "review_count": scalar(
                    "SELECT COUNT(*) FROM reviews WHERE user_id=?",
                    (str(user_id),),
                ),
                "streak": meta["streak"] if meta else 0,
                "last_study_date": meta["last_study_date"] if meta else "",
                "daily_goal": meta["daily_goal"] if meta else 20,
                "last_activity": last_activity,
                "verbal": {
                    "sessions": scalar(
                        "SELECT COUNT(*) FROM verbal_practice_sessions WHERE user_id=?",
                        (user_id,),
                    ) if table_exists("verbal_practice_sessions") else 0,
                    "submitted": scalar(
                        """SELECT COUNT(*) FROM verbal_practice_sessions
                           WHERE user_id=? AND status='submitted'""",
                        (user_id,),
                    ) if table_exists("verbal_practice_sessions") else 0,
                    "questions": scalar(
                        """SELECT COUNT(*) FROM verbal_attempt_items vai
                           JOIN verbal_practice_sessions vps ON vps.id = vai.session_id
                           WHERE vps.user_id=?""",
                        (user_id,),
                    ) if table_exists("verbal_attempt_items") and table_exists("verbal_practice_sessions") else 0,
                    "ai_messages": scalar(
                        "SELECT COUNT(*) FROM verbal_ai_messages WHERE user_id=?",
                        (user_id,),
                    ) if table_exists("verbal_ai_messages") else 0,
                    "ai_runs": scalar(
                        "SELECT COUNT(*) FROM verbal_ai_runs WHERE user_id=?",
                        (user_id,),
                    ) if table_exists("verbal_ai_runs") else 0,
                },
            })
        return users


@app.get("/api/admin/settings/vip")
async def admin_get_vip_settings(admin: dict = Depends(require_admin)):
    """Return the saved AI access policy. Free remains the safe default."""
    with get_db() as conn:
        row = conn.execute(
            """SELECT value, updated_at FROM app_settings
               WHERE key='ai_access_mode'"""
        ).fetchone()
    return {
        "ai_access_mode": row["value"] if row else "free",
        "updated_at": row["updated_at"] if row else "",
    }


@app.put("/api/admin/settings/vip")
async def admin_update_vip_settings(
    request: Request,
    admin: dict = Depends(require_admin),
):
    body = await request.json()
    mode = body.get("ai_access_mode")
    if mode not in {"free", "vip"}:
        raise HTTPException(400, "ai_access_mode 只能是 free 或 vip")
    with get_db() as conn:
        previous = conn.execute(
            "SELECT value FROM app_settings WHERE key='ai_access_mode'"
        ).fetchone()
        conn.execute(
            """INSERT INTO app_settings(key, value, updated_at)
               VALUES('ai_access_mode', ?, datetime('now'))
               ON CONFLICT(key) DO UPDATE SET
                   value=excluded.value,
                   updated_at=datetime('now')""",
            (mode,),
        )
        _write_admin_audit(
            conn,
            admin=admin,
            action="set_ai_access_mode",
            details={
                "previous": previous["value"] if previous else "free",
                "current": mode,
            },
        )
        conn.commit()
    label = "全站免费" if mode == "free" else "VIP / 积分"
    return {"msg": f"AI 访问策略已设为：{label}", "ai_access_mode": mode}


@app.get("/api/admin/users/{user_id}/vocab")
async def admin_get_user_vocab(user_id: int, admin: dict = Depends(require_admin)):
    """查看某用户的所有自定义词库（按来源分组）"""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT source_name, COUNT(*) as cnt FROM custom_vocab WHERE user_id=? GROUP BY source_name",
            (user_id,)
        ).fetchall()
        return [{"source_name": r["source_name"], "word_count": r["cnt"]} for r in rows]


@app.delete("/api/admin/users/{user_id}/vocab")
async def admin_delete_user_vocab(user_id: int, source: str = "", admin: dict = Depends(require_admin)):
    """删除某用户的指定词库（source 为空则删除全部）"""
    with get_db() as conn:
        if source:
            cursor = conn.execute("DELETE FROM custom_vocab WHERE user_id=? AND source_name=?", (user_id, source))
            msg = f"已删除用户 {user_id} 的词库「{source}」"
        else:
            cursor = conn.execute("DELETE FROM custom_vocab WHERE user_id=?", (user_id,))
            msg = f"已删除用户 {user_id} 的全部自定义词库"
        _write_admin_audit(
            conn,
            admin=admin,
            action="delete_user_vocab",
            target_user_id=user_id,
            details={"scope": source[:120] if source else "all", "deleted": cursor.rowcount},
        )
        conn.commit()
        return {"msg": msg}


@app.get("/api/admin/users/{user_id}/decks")
async def admin_get_user_decks(user_id: int, admin: dict = Depends(require_admin)):
    """查看某用户的牌组状态"""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT deck_type, cards_json, updated_at FROM user_decks WHERE user_id=?",
            (user_id,)
        ).fetchall()
        result = []
        for r in rows:
            try:
                cards = json.loads(r["cards_json"] or "[]")
            except Exception:
                cards = []
            result.append({
                "deck_type": r["deck_type"],
                "card_count": len(cards),
                "updated_at": r["updated_at"],
            })
        return result


@app.delete("/api/admin/users/{user_id}/decks")
async def admin_delete_user_decks(user_id: int, deck: str = "", admin: dict = Depends(require_admin)):
    """清空某用户的牌组（deck 为空则清空全部）"""
    with get_db() as conn:
        if deck:
            cursor = conn.execute("DELETE FROM user_decks WHERE user_id=? AND deck_type=?", (user_id, deck))
            msg = f"已清空用户 {user_id} 的 {deck} 牌组"
        else:
            cursor = conn.execute("DELETE FROM user_decks WHERE user_id=?", (user_id,))
            msg = f"已清空用户 {user_id} 的全部牌组"
        _write_admin_audit(
            conn,
            admin=admin,
            action="delete_user_decks",
            target_user_id=user_id,
            details={"scope": deck[:120] if deck else "all", "deleted": cursor.rowcount},
        )
        conn.commit()
        return {"msg": msg}


@app.get("/api/admin/users/{user_id}/shenlun")
async def admin_get_user_shenlun(user_id: int, admin: dict = Depends(require_admin)):
    """查看某用户的申论批改历史"""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, question_title, question_type, word_count, created_at FROM shenlun_history WHERE user_id=? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        return [dict(r) for r in rows]


@app.delete("/api/admin/users/{user_id}/shenlun")
async def admin_delete_user_shenlun(user_id: int, admin: dict = Depends(require_admin)):
    """清空某用户的申论批改历史"""
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM shenlun_history WHERE user_id=?", (user_id,))
        _write_admin_audit(
            conn,
            admin=admin,
            action="delete_user_shenlun",
            target_user_id=user_id,
            details={"deleted": cursor.rowcount},
        )
        conn.commit()
        return {"msg": f"已清空用户 {user_id} 的申论批改历史"}


@app.put("/api/admin/users/{user_id}/admin")
async def admin_set_user_admin(
    user_id: int,
    request: Request,
    admin: dict = Depends(require_admin),
):
    """Grant or revoke administrator access without allowing self lockout."""
    body = await request.json()
    requested = body.get("is_admin")
    if requested not in (True, False, 0, 1):
        raise HTTPException(400, "is_admin 必须是布尔值")
    is_admin = 1 if requested else 0
    if user_id == admin["user_id"] and not is_admin:
        raise HTTPException(400, "不能取消自己的管理员权限")
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, username FROM users WHERE id=?", (user_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "用户不存在")
        previous = conn.execute(
            "SELECT is_admin FROM users WHERE id=?", (user_id,)
        ).fetchone()["is_admin"]
        conn.execute(
            "UPDATE users SET is_admin=? WHERE id=?", (is_admin, user_id)
        )
        _write_admin_audit(
            conn,
            admin=admin,
            action="set_user_admin",
            target_user_id=user_id,
            target_username=row["username"],
            details={"previous": int(previous or 0), "current": is_admin},
        )
        conn.commit()
    action = "设为管理员" if is_admin else "取消管理员"
    return {
        "msg": f"已将用户「{row['username']}」{action}",
        "user_id": user_id,
        "is_admin": is_admin,
    }


@app.put("/api/admin/users/{user_id}/vip")
async def admin_set_user_vip(
    user_id: int,
    request: Request,
    admin: dict = Depends(require_admin),
):
    """Set VIP status, expiry and a non-negative absolute credit balance."""
    body = await request.json()
    requested_vip = body.get("is_vip")
    if requested_vip not in (True, False, 0, 1):
        raise HTTPException(400, "is_vip 必须是布尔值")
    try:
        ai_credits = int(body.get("ai_credits", 0))
    except (TypeError, ValueError):
        raise HTTPException(400, "AI 积分必须是非负整数")
    if ai_credits < 0:
        raise HTTPException(400, "AI 积分必须是非负整数")
    vip_expires_at = str(body.get("vip_expires_at") or "").strip()
    if vip_expires_at:
        try:
            datetime.strptime(vip_expires_at, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "VIP 到期时间格式应为 YYYY-MM-DD")
    with get_db() as conn:
        row = conn.execute(
            """SELECT id, username, is_vip, vip_expires_at, ai_credits
               FROM users WHERE id=?""",
            (user_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "用户不存在")
        conn.execute(
            """UPDATE users
               SET is_vip=?, vip_expires_at=?, ai_credits=?
               WHERE id=?""",
            (1 if requested_vip else 0, vip_expires_at, ai_credits, user_id),
        )
        _write_admin_audit(
            conn,
            admin=admin,
            action="set_user_vip",
            target_user_id=user_id,
            target_username=row["username"],
            details={
                "previous": {
                    "is_vip": int(row["is_vip"] or 0),
                    "vip_expires_at": row["vip_expires_at"] or "",
                    "ai_credits": int(row["ai_credits"] or 0),
                },
                "current": {
                    "is_vip": 1 if requested_vip else 0,
                    "vip_expires_at": vip_expires_at,
                    "ai_credits": ai_credits,
                },
            },
        )
        conn.commit()
    return {
        "msg": f"已更新用户「{row['username']}」的 VIP 与积分",
        "user_id": user_id,
        "is_vip": 1 if requested_vip else 0,
        "vip_expires_at": vip_expires_at,
        "ai_credits": ai_credits,
    }


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: int, admin: dict = Depends(require_admin)):
    """删除整个用户（含所有关联数据）"""
    if user_id == admin["user_id"]:
        raise HTTPException(400, "不能删除自己的账号")
    owned_question_ids: list[int] = []
    with get_db() as conn:
        target = conn.execute(
            "SELECT username FROM users WHERE id=?", (user_id,)
        ).fetchone()
        if not target:
            raise HTTPException(404, "用户不存在")
        owned_question_ids = [row["id"] for row in conn.execute(
            "SELECT id FROM questions WHERE user_id=?", (str(user_id),)
        ).fetchall()]
        # 删除关联数据
        conn.execute("DELETE FROM custom_vocab WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM user_decks WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM user_meta WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM shenlun_history WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM shenlun_mistakes WHERE user_id=?", (user_id,))
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mindmap_review_attempts'").fetchone():
            conn.execute("DELETE FROM mindmap_review_attempts WHERE user_id=?", (user_id,))
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mindmap_review_sessions'").fetchone():
            conn.execute("DELETE FROM mindmap_review_sessions WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM reviews WHERE user_id=?", (str(user_id),))
        conn.execute("DELETE FROM questions WHERE user_id=?", (str(user_id),))
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='spatial_learning_records'").fetchone():
            conn.execute("DELETE FROM spatial_learning_records WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM learning_events WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
        _write_admin_audit(
            conn,
            admin=admin,
            action="delete_user",
            target_user_id=user_id,
            target_username=target["username"],
            details={"owned_question_count": len(owned_question_ids)},
        )
        conn.commit()
    import shutil
    shutil.rmtree(os.path.join(PARENT_DIR, "backend", "data", "mindmap-images", str(user_id)), ignore_errors=True)
    for qid in owned_question_ids:
        shutil.rmtree(os.path.join(PARENT_DIR, "data", "images", str(qid)), ignore_errors=True)
    return {"msg": f"已删除用户 {user_id} 及其全部数据"}


# ── Catch-all static file server (for JS/CSS/images in parent dir) ──
import mimetypes  # noqa: E402


@app.get("/{filename:path}")
async def serve_static(filename: str):
    """Serve any static file from the parent directory (not under /api/ or named routes)."""
    # Skip API routes — FastAPI matches /api/* first, but just in case:
    if filename.startswith("api/"):
        raise HTTPException(404)
    # Legacy mind-map uploads used enumerable /data/images/<question-id>/...
    # paths.  They remain readable only through the JWT-owned image endpoint.
    parts = filename.split("/")
    if len(parts) >= 4 and parts[:2] == ["data", "images"] and parts[2].isdigit():
        raise HTTPException(404)
    # Skip named page routes that already have dedicated handlers
    if filename in ("", "mindmap", "shenlun"):
        raise HTTPException(404)
    filepath = os.path.join(PARENT_DIR, filename)
    if not os.path.exists(filepath) or not os.path.isfile(filepath):
        raise HTTPException(404, f"File not found: {filename}")
    # Determine MIME type
    mime_type, _ = mimetypes.guess_type(filepath)
    if mime_type is None:
        mime_type = "application/octet-stream"
    return FileResponse(filepath, media_type=mime_type)
