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

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
import os
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse

from database import get_db, init_db, cleanup_old_events
from models import (
    CardOut,
    QuestionBankOut,
    QuizItemOut,
    SyncIn,
    SyncOut,
    VerbalAttemptIn,
    VerbalAttemptOut,
    VerbalQuestionOut,
    VocabOut,
    VocabStateOut,
    VocabStateUpdateIn,
)
from auth import router as auth_router, require_user, require_admin
from mindmap import router as mindmap_router
from shenlun import router as shenlun_router

# ── Logging ──
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("gontu.api")


# ── Lifespan ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
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


# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
            "SELECT word, meaning, category, examples, source, search_url FROM highfreq_vocab ORDER BY id"
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
            "SELECT word, meaning, category, examples, source, search_url FROM highfreq_vocab ORDER BY id LIMIT ?",
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
#  Vocab learning state — 词条内容与用户状态分离
# ═══════════════════════════════════════════════════

@app.get("/api/vocab/state", response_model=list[VocabStateOut])
async def get_vocab_state(
    user: dict = Depends(require_user),
    source: str = "builtin",
    words: str = "",
):
    """获取当前用户的词条学习状态。user_id 只从 JWT 取得。"""
    user_id = user["user_id"]
    word_list = [w.strip() for w in words.split(",") if w.strip()]
    with get_db() as conn:
        if word_list:
            placeholders = ",".join("?" for _ in word_list)
            rows = conn.execute(
                f"""
                SELECT word, vocab_source, study_count, forget_count, interval_idx,
                       mastered, favorite, last_study_date, next_review_date
                FROM vocab_learning_state
                WHERE user_id=? AND vocab_source=? AND word IN ({placeholders})
                """,  # nosec B608 - placeholders are generated from word_list length only.
                [user_id, source, *word_list],
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT word, vocab_source, study_count, forget_count, interval_idx,
                       mastered, favorite, last_study_date, next_review_date
                FROM vocab_learning_state
                WHERE user_id=? AND vocab_source=?
                ORDER BY updated_at DESC, word
                """,
                (user_id, source),
            ).fetchall()
    return [dict(r) for r in rows]


@app.put("/api/vocab/state", response_model=VocabStateOut)
async def save_vocab_state(payload: VocabStateUpdateIn, user: dict = Depends(require_user)):
    """Upsert 当前用户的单个词条状态，不相信前端传入 user_id。"""
    user_id = user["user_id"]
    source = payload.vocab_source.strip() or "builtin"
    word = payload.word.strip()
    with get_db() as conn:
        existing = conn.execute(
            """
            SELECT study_count, forget_count, interval_idx, mastered, favorite,
                   last_study_date, next_review_date
            FROM vocab_learning_state
            WHERE user_id=? AND vocab_source=? AND word=?
            """,
            (user_id, source, word),
        ).fetchone()
        current = dict(existing) if existing else {
            "study_count": 0,
            "forget_count": 0,
            "interval_idx": 0,
            "mastered": 0,
            "favorite": 0,
            "last_study_date": "",
            "next_review_date": "",
        }
        for api_name, db_name in [
            ("study_count", "study_count"),
            ("forget_count", "forget_count"),
            ("interval_idx", "interval_idx"),
            ("mastered", "mastered"),
            ("favorite", "favorite"),
            ("last_study_date", "last_study_date"),
            ("next_review_date", "next_review_date"),
        ]:
            value = getattr(payload, api_name)
            if value is not None:
                current[db_name] = value

        conn.execute(
            """
            INSERT INTO vocab_learning_state
                (user_id, vocab_source, word, study_count, forget_count, interval_idx,
                 mastered, favorite, last_study_date, next_review_date, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, vocab_source, word) DO UPDATE SET
                study_count=excluded.study_count,
                forget_count=excluded.forget_count,
                interval_idx=excluded.interval_idx,
                mastered=excluded.mastered,
                favorite=excluded.favorite,
                last_study_date=excluded.last_study_date,
                next_review_date=excluded.next_review_date,
                updated_at=datetime('now')
            """,
            (
                user_id,
                source,
                word,
                current["study_count"],
                current["forget_count"],
                current["interval_idx"],
                current["mastered"],
                current["favorite"],
                current["last_study_date"],
                current["next_review_date"],
            ),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT word, vocab_source, study_count, forget_count, interval_idx,
                   mastered, favorite, last_study_date, next_review_date
            FROM vocab_learning_state
            WHERE user_id=? AND vocab_source=? AND word=?
            """,
            (user_id, source, word),
        ).fetchone()
    return dict(row)


# ═══════════════════════════════════════════════════
#  Verbal question bank — 言语理解/逻辑填空
# ═══════════════════════════════════════════════════

@app.get("/api/verbal/banks", response_model=list[QuestionBankOut])
async def list_verbal_banks(user: dict = Depends(require_user)):
    """列出题库来源。题库入口也要求登录。"""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT b.id, b.name, b.version, b.description,
                   COUNT(q.id) AS question_count,
                   SUM(CASE WHEN q.question_type='logic_fill' THEN 1 ELSE 0 END) AS logic_fill_count,
                   SUM(CASE WHEN q.question_type='reading_comprehension' THEN 1 ELSE 0 END) AS reading_comprehension_count
            FROM question_banks b
            LEFT JOIN verbal_questions q ON q.bank_id = b.id
            GROUP BY b.id
            ORDER BY b.created_at, b.id
            """
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/verbal/questions", response_model=list[VerbalQuestionOut])
async def list_verbal_questions(
    user: dict = Depends(require_user),
    bank: str = "huasheng_haihai",
    question_type: str = "",
    source_module: str = "",
    limit: int = 20,
    offset: int = 0,
    include_answer: int = 0,
):
    """拉取题目。默认不返回答案；作答后再由 attempts 接口返回答案和解析。"""
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    clauses = ["bank_id=?"]
    params: list[object] = [bank]
    if question_type:
        clauses.append("question_type=?")
        params.append(question_type)
    if source_module:
        clauses.append("source_module=?")
        params.append(source_module)
    params.extend([limit, offset])
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT id, bank_id, question_type, source_module, module_sequence, stem,
                   options_json, correct_answer, explanation, related_terms_json
            FROM verbal_questions
            WHERE {' AND '.join(clauses)}
            ORDER BY source_module, module_sequence, id
            LIMIT ? OFFSET ?
            """,  # nosec B608 - clauses are fixed fragments controlled by server code.
            params,
        ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["options"] = json.loads(item.pop("options_json") or "{}")
        item["related_terms"] = json.loads(item.pop("related_terms_json") or "[]")
        item["answer"] = item.pop("correct_answer") if include_answer else None
        item["explanation"] = item["explanation"] if include_answer else None
        result.append(item)
    return result


@app.post("/api/verbal/attempts", response_model=VerbalAttemptOut)
async def submit_verbal_attempt(payload: VerbalAttemptIn, user: dict = Depends(require_user)):
    """提交作答记录，后端判分并写入当前用户。"""
    user_id = user["user_id"]
    with get_db() as conn:
        question = conn.execute(
            "SELECT id, correct_answer, explanation FROM verbal_questions WHERE id=?",
            (payload.question_id,),
        ).fetchone()
        if not question:
            raise HTTPException(404, "Question not found")
        is_correct = 1 if payload.selected_answer == question["correct_answer"] else 0
        cur = conn.execute(
            """
            INSERT INTO verbal_attempts
                (user_id, question_id, selected_answer, is_correct, time_spent_seconds, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            """,
            (user_id, payload.question_id, payload.selected_answer, is_correct, payload.time_spent_seconds),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT id, question_id, selected_answer, is_correct, created_at
            FROM verbal_attempts
            WHERE id=? AND user_id=?
            """,
            (cur.lastrowid, user_id),
        ).fetchone()
    result = dict(row)
    result["correct_answer"] = question["correct_answer"]
    result["explanation"] = question["explanation"] or ""
    return result


@app.get("/api/verbal/attempts")
async def list_verbal_attempts(
    user: dict = Depends(require_user),
    question_id: str = "",
    only_wrong: int = 0,
    limit: int = 50,
):
    """查看当前用户作答记录。"""
    user_id = user["user_id"]
    limit = max(1, min(limit, 200))
    clauses = ["a.user_id=?"]
    params: list[object] = [user_id]
    if question_id:
        clauses.append("a.question_id=?")
        params.append(question_id)
    if only_wrong:
        clauses.append("a.is_correct=0")
    params.append(limit)
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT a.id, a.question_id, a.selected_answer, a.is_correct, a.created_at,
                   q.correct_answer, q.question_type, q.source_module, q.module_sequence
            FROM verbal_attempts a
            JOIN verbal_questions q ON q.id = a.question_id
            WHERE {' AND '.join(clauses)}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT ?
            """,  # nosec B608 - clauses are fixed fragments controlled by server code.
            params,
        ).fetchall()
    return [dict(r) for r in rows]


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
    """首页"""
    path = os.path.join(PARENT_DIR, "index.html")
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


@app.get("/shenlun", response_class=HTMLResponse)
async def serve_shenlun():
    """申论批改"""
    path = os.path.join(PARENT_DIR, "shenlun.html")
    if not os.path.exists(path):
        raise HTTPException(404, "申论文件不存在")
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

@app.get("/api/admin/users")
async def admin_list_users(admin: dict = Depends(require_admin)):
    """列出所有用户（含统计信息）"""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT u.id, u.username, u.created_at, u.is_admin,
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
            # 统计牌组数量
            decks = conn.execute(
                "SELECT deck_type, cards_json FROM user_decks WHERE user_id=?",
                (r["id"],)
            ).fetchall()
            deck_info = {}
            for d in decks:
                try:
                    cards = json.loads(d["cards_json"] or "[]")
                    deck_info[d["deck_type"]] = len(cards)
                except Exception:
                    deck_info[d["deck_type"]] = 0
            users.append({
                "id": r["id"],
                "username": r["username"],
                "created_at": r["created_at"],
                "is_admin": r["is_admin"] or 0,
                "vocab_count": r["vocab_count"],
                "shenlun_count": r["shenlun_count"],
                "decks": deck_info,
            })
        return users


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
            conn.execute("DELETE FROM custom_vocab WHERE user_id=? AND source_name=?", (user_id, source))
            msg = f"已删除用户 {user_id} 的词库「{source}」"
        else:
            conn.execute("DELETE FROM custom_vocab WHERE user_id=?", (user_id,))
            msg = f"已删除用户 {user_id} 的全部自定义词库"
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
            conn.execute("DELETE FROM user_decks WHERE user_id=? AND deck_type=?", (user_id, deck))
            msg = f"已清空用户 {user_id} 的 {deck} 牌组"
        else:
            conn.execute("DELETE FROM user_decks WHERE user_id=?", (user_id,))
            msg = f"已清空用户 {user_id} 的全部牌组"
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
        conn.execute("DELETE FROM shenlun_history WHERE user_id=?", (user_id,))
        conn.commit()
        return {"msg": f"已清空用户 {user_id} 的申论批改历史"}


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: int, admin: dict = Depends(require_admin)):
    """删除整个用户（含所有关联数据）"""
    if user_id == admin["user_id"]:
        raise HTTPException(400, "不能删除自己的账号")
    with get_db() as conn:
        # 删除关联数据
        conn.execute("DELETE FROM custom_vocab WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM user_decks WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM user_meta WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM shenlun_history WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM shenlun_mistakes WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM learning_events WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM vocab_learning_state WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM verbal_attempts WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
        conn.commit()
        return {"msg": f"已删除用户 {user_id} 及其全部数据"}


# ── Catch-all static file server (for JS/CSS/images in parent dir) ──
import mimetypes  # noqa: E402


@app.get("/{filename:path}")
async def serve_static(filename: str):
    """Serve any static file from the parent directory (not under /api/ or named routes)."""
    # Skip API routes — FastAPI matches /api/* first, but just in case:
    if filename.startswith("api/"):
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
