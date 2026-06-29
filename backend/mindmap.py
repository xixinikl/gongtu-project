"""Mind map / 图推错题 API — questions, reviews, quiz, image upload. All endpoints require JWT auth, per-user isolation."""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
import sqlite3
import os
from auth import require_user

router = APIRouter(prefix="/api/mindmap", tags=["mindmap"])


# ── Models (查询/结构体，仅用于 PUT 更新) ──────────────────────
class QuestionUpdate(BaseModel):
    node_path: str | None = None
    title: str | None = None
    notes: str | None = None
    image_path: str | None = None
    option_a: str | None = None
    option_b: str | None = None
    option_c: str | None = None
    option_d: str | None = None
    correct_answer: str | None = None


# ── Helpers ──
DB_PATH = __import__('database').DB_PATH
IMAGES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "images")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _uid(user: dict) -> str:
    """Convert user dict to user_id string (matches questions.user_id format)."""
    return str(user["user_id"])


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

    # 1. 先插入题目（不含 image_path）
    try:
        conn.execute(
            "INSERT INTO questions(node_path,title,notes,image_path,user_id,option_a,option_b,option_c,option_d,correct_answer) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)",
            (node_path, title, notes, "", uid, option_a, option_b, option_c, option_d, correct_answer)
        )
        conn.commit()
        qid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    except Exception as db_err:
        conn.close()
        raise HTTPException(status_code=500, detail=f"数据库写入失败: {db_err}")

    # 2. 如果有图片，保存并更新 image_path
    image_path = ""
    if image and image.filename:
        ext = os.path.splitext(image.filename or "image.png")[1] or ".png"
        if ext.lower() not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
            ext = ".png"
        filename = f"q{qid}{ext}"
        img_dir = os.path.join(IMAGES_DIR, str(qid))
        try:
            os.makedirs(img_dir, exist_ok=True)
        except Exception as mkdir_err:
            conn.close()
            raise HTTPException(status_code=500, detail=f"创建图片目录失败: {mkdir_err}")
        filepath = os.path.join(img_dir, filename)
        try:
            content = await image.read()
            with open(filepath, "wb") as f:
                f.write(content)
            image_path = f"images/{qid}/{filename}"
            conn.execute(
                "UPDATE questions SET image_path=? WHERE id=?",
                (image_path, qid)
            )
            conn.commit()
        except Exception as img_err:
            conn.close()
            raise HTTPException(status_code=500, detail=f"保存图片失败: {img_err}")

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
        conn.execute(f"UPDATE questions SET {','.join(fields)} WHERE id=? AND user_id=?", vals)  # nosec B608
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
    conn.execute("DELETE FROM questions WHERE id=? AND user_id=?", (qid, uid))
    conn.commit()
    conn.close()
    return {"message": "删除成功"}


# ── Image upload ──
@router.post("/questions/{qid}/upload")
async def upload_question_image(qid: int, image: UploadFile = File(...), user: dict = Depends(require_user)):
    """上传题目图片（仅限当前用户自己的题目）"""
    uid = _uid(user)

    # 验证题目所有权
    conn = get_conn()
    existing = conn.execute(
        "SELECT id FROM questions WHERE id=? AND user_id=?", (qid, uid)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(404, "题目不存在")

    # 验证文件类型
    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
    if image.content_type and image.content_type not in allowed_types:
        conn.close()
        raise HTTPException(400, f"不支持的图片类型: {image.content_type}，仅支持 PNG/JPG/GIF/WebP")

    # 生成文件名并保存
    ext = os.path.splitext(image.filename or "image.png")[1] or ".png"
    if ext.lower() not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        ext = ".png"
    filename = f"q{qid}{ext}"
    img_dir = os.path.join(IMAGES_DIR, str(qid))
    os.makedirs(img_dir, exist_ok=True)
    filepath = os.path.join(img_dir, filename)

    try:
        with open(filepath, "wb") as f:
            content = await image.read()
            f.write(content)
    except Exception as e:
        conn.close()
        raise HTTPException(500, f"保存图片失败: {e}")

    # 更新数据库
    image_path = f"images/{qid}/{filename}"
    conn.execute(
        "UPDATE questions SET image_path=? WHERE id=? AND user_id=?",
        (image_path, qid, uid)
    )
    conn.commit()
    conn.close()

    return {"message": "上传成功", "image_path": image_path}


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
