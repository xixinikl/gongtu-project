"""Mind map / 图推错题 API — questions, reviews, quiz, image upload. All endpoints require JWT auth, per-user isolation."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from datetime import datetime, timezone
import json
import sqlite3
from pathlib import Path
import secrets
import uuid
from zoneinfo import ZoneInfo
from auth import require_user

router = APIRouter(prefix="/api/mindmap", tags=["mindmap"])


# ── Models (查询/结构体，仅用于 PUT 更新) ──────────────────────
class QuestionUpdate(BaseModel):
    node_path: str | None = None
    title: str | None = None
    notes: str | None = None
    option_a: str | None = None
    option_b: str | None = None
    option_c: str | None = None
    option_d: str | None = None
    correct_answer: str | None = None


class ReviewAttempt(BaseModel):
    question_id: int
    outcome: str


# ── Helpers ──
DB_PATH = __import__('database').DB_PATH
PROJECT_DIR = Path(__file__).resolve().parent.parent
LEGACY_IMAGES_DIR = PROJECT_DIR / "data" / "images"
PRIVATE_IMAGES_DIR = Path(__file__).resolve().parent / "data" / "mindmap-images"
MAX_IMAGE_BYTES = 10 * 1024 * 1024


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS mindmap_review_sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            review_date TEXT NOT NULL,
            queue_json TEXT NOT NULL,
            initial_total INTEGER NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            studied INTEGER NOT NULL DEFAULT 0,
            mastered INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'in_progress',
            started_at TEXT NOT NULL,
            completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_mindmap_review_owner
            ON mindmap_review_sessions(user_id, review_date, status);
        CREATE TABLE IF NOT EXISTS mindmap_review_attempts (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            outcome TEXT NOT NULL,
            attempted_at TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES mindmap_review_sessions(id) ON DELETE CASCADE
        );
    """)
    return conn


def _uid(user: dict) -> str:
    """Convert user dict to user_id string (matches questions.user_id format)."""
    return str(user["user_id"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()


def _write_activity(conn, *, activity_id: str, user_id: int, activity_type: str,
                    source_id: str, summary: dict) -> None:
    now = _now()
    conn.execute(
        """INSERT OR IGNORE INTO learning_activities_v2
           (id,user_id,module_id,activity_type,source_id,status,started_at,
            completed_at,duration_ms,summary_json,created_at,updated_at)
           VALUES(?,?,?,?,?,'completed',?,?,0,?,?,?)""",
        (activity_id, user_id, "reasoning.planar", activity_type, source_id,
         now, now, json.dumps(summary, ensure_ascii=False), now, now),
    )


def _question_image_file(row: sqlite3.Row, uid: str) -> Path | None:
    image_path = row["image_path"] or ""
    if not image_path:
        return None
    if image_path.startswith("private/"):
        parts = Path(image_path).parts
        if len(parts) != 4 or parts[1] != uid or parts[2] != str(row["id"]):
            return None
        candidate = PRIVATE_IMAGES_DIR.joinpath(*parts[1:]).resolve()
        if PRIVATE_IMAGES_DIR.resolve() not in candidate.parents:
            return None
        return candidate
    legacy_parts = Path(image_path).parts
    if len(legacy_parts) < 3 or legacy_parts[0] != "images" or legacy_parts[1] != str(row["id"]):
        return None
    candidate = (PROJECT_DIR / "data" / image_path).resolve()
    if LEGACY_IMAGES_DIR.resolve() not in candidate.parents:
        return None
    return candidate


async def _read_image(image: UploadFile) -> tuple[bytes, str]:
    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
    if image.content_type and image.content_type not in allowed_types:
        raise HTTPException(400, "仅支持 PNG/JPG/GIF/WebP 图片")
    content = await image.read(MAX_IMAGE_BYTES + 1)
    if not content or len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "图片为空或超过 10MB")
    signatures = {
        b"\x89PNG\r\n\x1a\n": ".png",
        b"\xff\xd8\xff": ".jpg",
        b"GIF87a": ".gif",
        b"GIF89a": ".gif",
        b"RIFF": ".webp",
    }
    ext = next((value for magic, value in signatures.items() if content.startswith(magic)), None)
    if ext == ".webp" and content[8:12] != b"WEBP":
        ext = None
    if not ext:
        raise HTTPException(400, "图片内容格式无效")
    return content, ext


# ── CRUD (all require auth, per-user isolation) ──
@router.get("/questions/stats")
def question_stats(user: dict = Depends(require_user)):
    """获取当前用户每个节点的错题数量"""
    uid = _uid(user)
    conn = get_conn()
    rows = conn.execute(
        "SELECT node_path, COUNT(*) as cnt FROM questions WHERE user_id=? GROUP BY node_path",
        (uid,)
    ).fetchall()
    conn.close()
    return {"stats": {r["node_path"]: r["cnt"] for r in rows}}


@router.get("/questions")
def list_questions(user: dict = Depends(require_user)):
    """获取当前用户所有错题"""
    uid = _uid(user)
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM questions WHERE user_id=? ORDER BY id DESC",
        (uid,)
    ).fetchall()
    conn.close()
    return {"questions": [dict(r) for r in rows]}


@router.get("/questions/{qid}")
def get_question(qid: int, user: dict = Depends(require_user)):
    """获取单题详情（仅限当前用户）"""
    uid = _uid(user)
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM questions WHERE id=? AND user_id=?", (qid, uid)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "题目不存在")
    return dict(row)


@router.post("/questions")
async def create_question_form(
    node_path: str = Form(...),
    title: str = Form(...),
    notes: str = Form(""),
    option_a: str = Form(""),
    option_b: str = Form(""),
    option_c: str = Form(""),
    option_d: str = Form(""),
    correct_answer: str = Form(""),
    image: UploadFile | None = File(None),
    user: dict = Depends(require_user),
):
    """创建错题（FormData 方式，支持图片上传）"""
    uid = _uid(user)
    conn = get_conn()

    saved_file: Path | None = None
    try:
        cursor = conn.execute(
            "INSERT INTO questions(node_path,title,notes,image_path,user_id,option_a,option_b,option_c,option_d,correct_answer) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)",
            (node_path, title, notes, "", uid, option_a, option_b, option_c, option_d, correct_answer)
        )
        qid = int(cursor.lastrowid)
        image_path = ""
        if image and image.filename:
            content, ext = await _read_image(image)
            img_dir = PRIVATE_IMAGES_DIR / uid / str(qid)
            img_dir.mkdir(parents=True, exist_ok=True)
            saved_file = img_dir / f"question{ext}"
            saved_file.write_bytes(content)
            image_path = f"private/{uid}/{qid}/{saved_file.name}"
            conn.execute("UPDATE questions SET image_path=? WHERE id=? AND user_id=?", (image_path, qid, uid))
        _write_activity(
            conn,
            activity_id=f"mindmap:question:{qid}",
            user_id=user["user_id"],
            activity_type="mistake_saved",
            source_id=str(qid),
            summary={"node_path": node_path, "title": title},
        )
        conn.commit()
    except Exception as db_err:
        conn.rollback()
        conn.close()
        if saved_file and saved_file.exists():
            saved_file.unlink()
        if isinstance(db_err, HTTPException):
            raise db_err
        raise HTTPException(status_code=500, detail=f"数据库写入失败: {db_err}")

    conn.close()
    return {"id": qid, "message": "创建成功", "image_path": image_path}


@router.put("/questions/{qid}")
def update_question(qid: int, body: QuestionUpdate, user: dict = Depends(require_user)):
    """更新错题（仅限当前用户）"""
    uid = _uid(user)
    conn = get_conn()
    existing = conn.execute(
        "SELECT * FROM questions WHERE id=? AND user_id=?", (qid, uid)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(404, "题目不存在")
    fields = []
    vals = []
    for field, val in body.model_dump(exclude_unset=True).items():
        if val is not None:
            fields.append(f"{field}=?")
            vals.append(val)
    if fields:
        vals.append(qid)
        vals.append(uid)
        conn.execute(f"UPDATE questions SET {','.join(fields)},updated_at=datetime('now') WHERE id=? AND user_id=?", vals)  # nosec B608
        conn.commit()
    conn.close()
    return {"message": "更新成功"}


@router.delete("/questions/{qid}")
def delete_question(qid: int, user: dict = Depends(require_user)):
    """删除错题（仅限当前用户）"""
    uid = _uid(user)
    conn = get_conn()
    existing = conn.execute(
        "SELECT * FROM questions WHERE id=? AND user_id=?", (qid, uid)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(404, "题目不存在")
    image_file = _question_image_file(existing, uid)
    conn.execute("DELETE FROM questions WHERE id=? AND user_id=?", (qid, uid))
    active_sessions = conn.execute(
        "SELECT * FROM mindmap_review_sessions WHERE user_id=? AND status='in_progress'", (user["user_id"],)
    ).fetchall()
    for session in active_sessions:
        queue = json.loads(session["queue_json"] or "[]")
        before = queue[:session["position"]]
        after = [item for item in queue[session["position"]:] if item != qid]
        conn.execute(
            "UPDATE mindmap_review_sessions SET queue_json=?,position=? WHERE id=? AND user_id=?",
            (json.dumps(before + after), len(before), session["id"], user["user_id"]),
        )
    conn.commit()
    conn.close()
    if image_file and image_file.exists() and image_file.is_relative_to(PRIVATE_IMAGES_DIR):
        image_file.unlink()
    return {"message": "删除成功"}


# ── Image upload ──
@router.post("/questions/{qid}/upload")
async def upload_question_image(qid: int, image: UploadFile = File(...), user: dict = Depends(require_user)):
    """上传题目图片（仅限当前用户自己的题目）"""
    uid = _uid(user)

    # 验证题目所有权
    conn = get_conn()
    existing = conn.execute(
        "SELECT * FROM questions WHERE id=? AND user_id=?", (qid, uid)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(404, "题目不存在")

    try:
        content, ext = await _read_image(image)
        img_dir = PRIVATE_IMAGES_DIR / uid / str(qid)
        img_dir.mkdir(parents=True, exist_ok=True)
        filepath = img_dir / f"question{ext}"
        filepath.write_bytes(content)
    except Exception as e:
        conn.close()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(500, f"保存图片失败: {e}")

    # 更新数据库
    image_path = f"private/{uid}/{qid}/{filepath.name}"
    conn.execute(
        "UPDATE questions SET image_path=? WHERE id=? AND user_id=?",
        (image_path, qid, uid)
    )
    conn.commit()
    conn.close()

    return {"message": "上传成功", "image_path": image_path}


@router.get("/questions/{qid}/image")
def get_question_image(qid: int, user: dict = Depends(require_user)):
    """鉴权读取本人错题图片；不暴露可枚举的静态上传目录。"""
    uid = _uid(user)
    conn = get_conn()
    row = conn.execute("SELECT * FROM questions WHERE id=? AND user_id=?", (qid, uid)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "题目不存在")
    filepath = _question_image_file(row, uid)
    if not filepath or not filepath.is_file():
        raise HTTPException(404, "图片不存在")
    return FileResponse(filepath)


def _session_payload(conn: sqlite3.Connection, row: sqlite3.Row | None) -> dict:
    if not row:
        return {"session": None, "questions": [], "stats": {"studied": 0, "mastered": 0, "remaining": 0, "percent": 0}}
    queue = json.loads(row["queue_json"] or "[]")
    remaining_ids = queue[row["position"]:]
    question_map = {}
    if remaining_ids:
        placeholders = ",".join("?" for _ in set(remaining_ids))
        rows = conn.execute(
            f"SELECT * FROM questions WHERE user_id=? AND id IN ({placeholders})",  # nosec B608
            (str(row["user_id"]), *set(remaining_ids)),
        ).fetchall()
        question_map = {item["id"]: dict(item) for item in rows}
    questions = [question_map[qid] for qid in remaining_ids if qid in question_map]
    initial_total = max(0, row["initial_total"])
    percent = min(100, round(row["mastered"] / initial_total * 100)) if initial_total else 0
    return {
        "session": {"id": row["id"], "date": row["review_date"], "status": row["status"]},
        "questions": questions,
        "stats": {
            "studied": row["studied"],
            "mastered": min(row["mastered"], initial_total),
            "remaining": len(questions),
            "percent": percent,
        },
    }


@router.get("/review-session")
def get_or_create_review_session(user: dict = Depends(require_user)):
    """恢复本人今日复习；没有活动会话时按本人错题建立新队列。"""
    uid = user["user_id"]
    conn = get_conn()
    row = conn.execute(
        """SELECT * FROM mindmap_review_sessions
           WHERE user_id=? AND review_date=? AND status='in_progress'
           ORDER BY started_at DESC LIMIT 1""",
        (uid, _today()),
    ).fetchone()
    if not row:
        qids = [item["id"] for item in conn.execute(
            "SELECT id FROM questions WHERE user_id=? ORDER BY id DESC", (str(uid),)
        ).fetchall()]
        if not qids:
            conn.close()
            return {"session": None, "questions": [], "stats": {"studied": 0, "mastered": 0, "remaining": 0, "percent": 0}}
        secrets.SystemRandom().shuffle(qids)
        sid = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO mindmap_review_sessions
               (id,user_id,review_date,queue_json,initial_total,started_at)
               VALUES(?,?,?,?,?,?)""",
            (sid, uid, _today(), json.dumps(qids), len(qids), _now()),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM mindmap_review_sessions WHERE id=? AND user_id=?", (sid, uid)).fetchone()
    payload = _session_payload(conn, row)
    conn.close()
    return payload


@router.post("/review-session/{session_id}/attempt")
def submit_review_attempt(session_id: str, body: ReviewAttempt, user: dict = Depends(require_user)):
    if body.outcome not in {"remembered", "forgotten"}:
        raise HTTPException(422, "outcome 必须是 remembered 或 forgotten")
    uid = user["user_id"]
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM mindmap_review_sessions WHERE id=? AND user_id=? AND status='in_progress'",
        (session_id, uid),
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "复习会话不存在")
    queue = json.loads(row["queue_json"] or "[]")
    position = row["position"]
    if position >= len(queue) or body.question_id not in queue[position:]:
        conn.close()
        raise HTTPException(409, "当前复习题已变化，请刷新后继续")
    selected_position = queue.index(body.question_id, position)
    if selected_position != position:
        queue[position], queue[selected_position] = queue[selected_position], queue[position]
    owner = conn.execute("SELECT id FROM questions WHERE id=? AND user_id=?", (body.question_id, str(uid))).fetchone()
    if not owner:
        conn.close()
        raise HTTPException(404, "题目不存在")
    if body.outcome == "forgotten" and body.question_id not in queue[position + 1:]:
        queue.append(body.question_id)
    new_position = position + 1
    studied = row["studied"] + 1
    mastered = min(row["initial_total"], row["mastered"] + (1 if body.outcome == "remembered" else 0))
    completed = new_position >= len(queue)
    completed_at = _now() if completed else None
    conn.execute(
        """INSERT INTO mindmap_review_attempts
           (id,session_id,user_id,question_id,outcome,attempted_at) VALUES(?,?,?,?,?,?)""",
        (str(uuid.uuid4()), session_id, uid, body.question_id, body.outcome, _now()),
    )
    conn.execute(
        """UPDATE mindmap_review_sessions
           SET queue_json=?,position=?,studied=?,mastered=?,status=?,completed_at=?
           WHERE id=? AND user_id=?""",
        (json.dumps(queue), new_position, studied, mastered,
         "completed" if completed else "in_progress", completed_at, session_id, uid),
    )
    if completed:
        _write_activity(
            conn,
            activity_id=f"mindmap:review:{session_id}",
            user_id=uid,
            activity_type="review_session",
            source_id=session_id,
            summary={"reviewed": studied, "mastered": mastered, "total": row["initial_total"]},
        )
    conn.commit()
    updated = conn.execute("SELECT * FROM mindmap_review_sessions WHERE id=? AND user_id=?", (session_id, uid)).fetchone()
    payload = _session_payload(conn, updated)
    conn.close()
    return payload


@router.delete("/review-session/{session_id}")
def reset_review_session(session_id: str, user: dict = Depends(require_user)):
    conn = get_conn()
    row = conn.execute("SELECT id FROM mindmap_review_sessions WHERE id=? AND user_id=?", (session_id, user["user_id"])).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "复习会话不存在")
    conn.execute("DELETE FROM mindmap_review_sessions WHERE id=? AND user_id=?", (session_id, user["user_id"]))
    conn.commit()
    conn.close()
    return {"message": "已重新开始"}


# ── Review Progress ──
class ReviewProgress(BaseModel):
    date: str
    studied: int
    mastered: int


@router.post("/review-progress")
def save_review_progress(body: ReviewProgress, user: dict = Depends(require_user)):
    """保存错题复习进度（累计今日已学 + 已掌握）"""
    import json
    uid = user["user_id"]
    conn = get_conn()
    row = conn.execute("SELECT mindmap_review_json FROM user_meta WHERE user_id=?", (uid,)).fetchone()
    data = {}
    if row and row["mindmap_review_json"]:
        try:
            data = json.loads(row["mindmap_review_json"])
        except (json.JSONDecodeError, TypeError):
            data = {}
    data["date"] = body.date
    data["studied"] = body.studied
    data["mastered"] = body.mastered
    j = json.dumps(data, ensure_ascii=False)
    if row:
        conn.execute("UPDATE user_meta SET mindmap_review_json=?, updated_at=datetime('now') WHERE user_id=?", (j, uid))
    else:
        conn.execute("INSERT INTO user_meta(user_id,mindmap_review_json) VALUES(?,?)", (uid, j))
    conn.commit()
    conn.close()
    return {"message": "ok"}


@router.get("/review-progress")
def get_review_progress(user: dict = Depends(require_user)):
    """获取错题复习进度"""
    import json
    uid = user["user_id"]
    conn = get_conn()
    row = conn.execute("SELECT mindmap_review_json FROM user_meta WHERE user_id=?", (uid,)).fetchone()
    conn.close()
    if row and row["mindmap_review_json"]:
        try:
            return {"progress": json.loads(row["mindmap_review_json"])}
        except (json.JSONDecodeError, TypeError):
            pass
    return {"progress": {"studied": 0, "mastered": 0, "date": ""}}
