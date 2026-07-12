"""Authenticated adapters for the 801-word catalog and 231 logic-fill bank."""
from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
import json
from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import require_user
from database import get_db


router = APIRouter(prefix="/api/verbal-catalog", tags=["verbal-catalog"])
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "verbal_catalog"
ALLOWED_ANSWERS = {"A", "B", "C", "D"}


class VocabStateIn(BaseModel):
    word: str = Field(min_length=1, max_length=80)
    study_count: int = Field(default=0, ge=0)
    forget_count: int = Field(default=0, ge=0)
    interval_idx: int = Field(default=0, ge=0)
    mastered: bool = False
    favorite: bool = False
    last_study_date: str = Field(default="", max_length=30)
    next_review_date: str = Field(default="", max_length=30)
    user_id: int | None = None  # accepted only to prove it is ignored


class LogicAttemptIn(BaseModel):
    question_id: str = Field(min_length=1, max_length=80)
    selected_answer: str = Field(min_length=1, max_length=1)
    elapsed_ms: int = Field(default=0, ge=0, le=30 * 60 * 1000)
    user_id: int | None = None  # ownership always comes from JWT


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@lru_cache(maxsize=1)
def _vocab_data() -> dict:
    data = json.loads((DATA_DIR / "vocab_801.json").read_text(encoding="utf-8"))
    if data.get("count") != 801 or len(data.get("items", [])) != 801:
        raise RuntimeError("The 801-word catalog failed its count gate")
    return data


@lru_cache(maxsize=1)
def _logic_data() -> dict:
    data = json.loads((DATA_DIR / "logic_fill_231.json").read_text(encoding="utf-8"))
    if data.get("count") != 231 or len(data.get("items", [])) != 231:
        raise RuntimeError("The 231-question logic-fill bank failed its count gate")
    return data


@lru_cache(maxsize=1)
def _logic_by_id() -> dict[str, dict]:
    return {item["id"]: item for item in _logic_data()["items"]}


def ensure_verbal_catalog_schema() -> None:
    """Idempotent schema hook to call from database.init_db during integration."""
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS verbal_vocab_state_v2 (
                user_id          INTEGER NOT NULL,
                word             TEXT NOT NULL,
                study_count      INTEGER NOT NULL DEFAULT 0,
                forget_count     INTEGER NOT NULL DEFAULT 0,
                interval_idx     INTEGER NOT NULL DEFAULT 0,
                mastered         INTEGER NOT NULL DEFAULT 0,
                favorite         INTEGER NOT NULL DEFAULT 0,
                last_study_date  TEXT NOT NULL DEFAULT '',
                next_review_date TEXT NOT NULL DEFAULT '',
                updated_at       TEXT NOT NULL,
                PRIMARY KEY(user_id, word),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_verbal_vocab_state_due_v2
                ON verbal_vocab_state_v2(user_id, next_review_date);

            CREATE TABLE IF NOT EXISTS verbal_logic_attempts_v2 (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL,
                question_id     TEXT NOT NULL,
                selected_answer TEXT NOT NULL,
                correct_answer  TEXT NOT NULL,
                is_correct      INTEGER NOT NULL,
                elapsed_ms      INTEGER NOT NULL DEFAULT 0,
                created_at      TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_verbal_logic_attempts_user_v2
                ON verbal_logic_attempts_v2(user_id, created_at DESC);
            """
        )
        conn.commit()


def _safe_question(item: dict) -> dict:
    return {
        "id": item["id"],
        "source_module": item["source_module"],
        "module_sequence": item["module_sequence"],
        "stem": item["stem"],
        "options": item["options"],
        "related_terms": item["related_terms"],
        "official_analysis_available": False,
    }


@router.get("/vocab")
def list_vocab(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=801),
    search: str = Query(default="", max_length=80),
    user: dict = Depends(require_user),
):
    del user
    items = _vocab_data()["items"]
    if search.strip():
        needle = search.strip()
        items = [item for item in items if needle in item["word"] or needle in item["meaning"]]
    return {"total": len(items), "items": items[offset : offset + limit]}


@router.get("/vocab/state")
def list_vocab_state(user: dict = Depends(require_user)):
    ensure_verbal_catalog_schema()
    with get_db() as conn:
        rows = conn.execute(
            """SELECT word, study_count, forget_count, interval_idx, mastered,
                      favorite, last_study_date, next_review_date, updated_at
               FROM verbal_vocab_state_v2 WHERE user_id=? ORDER BY updated_at DESC, word""",
            (user["user_id"],),
        ).fetchall()
    return [dict(row) for row in rows]


@router.put("/vocab/state")
def save_vocab_state(body: VocabStateIn, user: dict = Depends(require_user)):
    ensure_verbal_catalog_schema()
    if body.word not in {item["word"] for item in _vocab_data()["items"]}:
        raise HTTPException(status_code=404, detail="Vocabulary item not found")
    now = _utc_now()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO verbal_vocab_state_v2
                   (user_id,word,study_count,forget_count,interval_idx,mastered,favorite,
                    last_study_date,next_review_date,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(user_id,word) DO UPDATE SET
                   study_count=excluded.study_count,
                   forget_count=excluded.forget_count,
                   interval_idx=excluded.interval_idx,
                   mastered=excluded.mastered,
                   favorite=excluded.favorite,
                   last_study_date=excluded.last_study_date,
                   next_review_date=excluded.next_review_date,
                   updated_at=excluded.updated_at""",
            (
                user["user_id"], body.word, body.study_count, body.forget_count,
                body.interval_idx, int(body.mastered), int(body.favorite),
                body.last_study_date, body.next_review_date, now,
            ),
        )
        conn.commit()
    return {**body.model_dump(exclude={"user_id"}), "updated_at": now}


@router.get("/logic-fill/questions")
def list_logic_questions(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=231),
    source_module: str = Query(default="", max_length=80),
    user: dict = Depends(require_user),
):
    del user
    items = _logic_data()["items"]
    if source_module:
        items = [item for item in items if item["source_module"] == source_module]
    return {"total": len(items), "items": [_safe_question(item) for item in items[offset : offset + limit]]}


@router.post("/logic-fill/attempts", status_code=201)
def grade_logic_attempt(body: LogicAttemptIn, user: dict = Depends(require_user)):
    ensure_verbal_catalog_schema()
    question = _logic_by_id().get(body.question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Logic-fill question not found")
    selected = body.selected_answer.upper()
    if selected not in ALLOWED_ANSWERS:
        raise HTTPException(status_code=422, detail="Answer must be A, B, C, or D")
    correct = question["correct_answer"]
    now = _utc_now()
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO verbal_logic_attempts_v2
                   (user_id,question_id,selected_answer,correct_answer,is_correct,elapsed_ms,created_at)
               VALUES(?,?,?,?,?,?,?)""",
            (user["user_id"], question["id"], selected, correct, int(selected == correct), body.elapsed_ms, now),
        )
        conn.execute(
            """INSERT INTO learning_activities_v2
                   (id,user_id,module_id,activity_type,source_id,status,started_at,
                    completed_at,duration_ms,summary_json,created_at,updated_at)
               VALUES(?,?,?,?,?,'completed',?,?,?,?,?,?)""",
            (
                str(uuid.uuid4()),
                user["user_id"],
                "verbal.logic_fill",
                "question_attempt",
                question["id"],
                now,
                now,
                body.elapsed_ms,
                json.dumps(
                    {
                        "selected_answer": selected,
                        "correct_answer": correct,
                        "is_correct": selected == correct,
                        "official_analysis_available": False,
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                now,
                now,
            ),
        )
        conn.commit()
        attempt_id = cursor.lastrowid
    return {
        "id": attempt_id,
        "question_id": question["id"],
        "selected_answer": selected,
        "correct_answer": correct,
        "is_correct": selected == correct,
        "elapsed_ms": body.elapsed_ms,
        "official_analysis": {
            "status": "missing",
            "label": "本题暂无原书解析",
            "content": None,
        },
        "ai_explanation": {
            "status": "not_generated",
            "label": "AI讲解",
            "content": None,
        },
        "ai_context": {
            "question_id": question["id"],
            "stem": question["stem"],
            "options": question["options"],
            "user_answer": selected,
            "correct_answer": correct,
            "related_terms": question["related_terms"],
            "skill": "言语理解/逻辑填空",
        },
        "created_at": now,
    }


@router.get("/logic-fill/attempts")
def list_logic_attempts(
    limit: int = Query(default=50, ge=1, le=200),
    only_wrong: bool = False,
    user: dict = Depends(require_user),
):
    ensure_verbal_catalog_schema()
    clause = "AND is_correct=0" if only_wrong else ""
    with get_db() as conn:
        rows = conn.execute(
            f"""SELECT id,question_id,selected_answer,correct_answer,is_correct,elapsed_ms,created_at
                 FROM verbal_logic_attempts_v2 WHERE user_id=? {clause}
                 ORDER BY id DESC LIMIT ?""",  # nosec B608: clause is a server-owned constant.
            (user["user_id"], limit),
        ).fetchall()
    return [dict(row) for row in rows]
