"""Authenticated adapter for the visually approved quantity question bank.

Only the versioned portable export ``data/quantity_bank/approved_seed.json`` is read. Answers and
analysis stay server-side until a session is submitted.  The adapter owns its
two additive tables so it can be integrated without coupling the approved bank
to the review pipeline or to another module's persistence schema.
"""

from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
import json
import logging
from pathlib import Path
import sqlite3
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator

from auth import require_user
from database import get_db

router = APIRouter(prefix="/api/quantity", tags=["quantity"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent
APPROVED_BANK_PATH = PROJECT_ROOT / "data/quantity_bank/approved_seed.json"
MAX_ITEM_ELAPSED_MS = 30 * 60 * 1000
MAX_SESSION_ELAPSED_MS = 6 * 60 * 60 * 1000
STUCK_STEPS = {
    "题型识别",
    "取舍判断",
    "设量建模",
    "列式关系",
    "计算速度",
    "审题遗漏",
}
DECISION_LABELS = {
    "must_do": "必做",
    "can_do": "可做",
    "skip_first": "先跳",
}

TOPIC_GROUPS = (
    ("工程问题", ("工程", "牛吃草")),
    ("经济利润", ("经济利润", "利润", "分段计费")),
    ("行程问题", ("行程", "钟表")),
    ("浓度与溶液", ("浓度", "溶液")),
    ("和差倍比", ("和差倍比", "平均数", "年龄")),
    ("不定方程", ("不定方程",)),
    ("数列问题", ("数列",)),
    ("日期与周期", ("日期", "星期", "周期循环")),
    ("排列组合", ("排列组合",)),
    ("概率问题", ("概率",)),
    ("几何问题", ("几何", "方阵", "植树")),
    ("容斥问题", ("容斥",)),
    ("最值问题", ("最值", "最不利")),
    ("统筹规划", ("统筹", "空瓶换酒", "天平称重")),
    ("数的特性", ("整除", "约数", "倍数", "余数", "数的特性", "平方数")),
    ("比赛问题", ("比赛",)),
)
logger = logging.getLogger("quantity")


class SessionCreateIn(BaseModel):
    set_no: int = Field(ge=1, le=60)


class AttemptSaveIn(BaseModel):
    question_id: str = Field(min_length=1, max_length=120)
    answer: str | None = Field(default=None, min_length=1, max_length=1)
    elapsed_ms: int = Field(default=0, ge=0, le=MAX_ITEM_ELAPSED_MS)
    skipped: bool = False
    stuck_step: str | None = None

    @model_validator(mode="after")
    def validate_attempt(self):
        if self.skipped and self.answer is not None:
            raise ValueError("A skipped attempt cannot include an answer")
        if not self.skipped and self.answer is None:
            raise ValueError("An answer is required unless the question is skipped")
        if self.stuck_step is not None and self.stuck_step not in STUCK_STEPS:
            raise ValueError("Unsupported stuck step")
        if self.answer is not None:
            self.answer = self.answer.upper()
        return self


class SessionSubmitIn(BaseModel):
    elapsed_ms: int = Field(default=0, ge=0, le=MAX_SESSION_ELAPSED_MS)


class SingleSessionCreateIn(BaseModel):
    topic: str | None = Field(default=None, min_length=1, max_length=80)


class SingleSessionSubmitIn(BaseModel):
    answer: str = Field(min_length=1, max_length=1)
    elapsed_ms: int = Field(default=0, ge=0, le=MAX_ITEM_ELAPSED_MS)
    stuck_step: str | None = None
    work_note: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def validate_single_attempt(self):
        self.answer = self.answer.upper()
        if self.stuck_step is not None and self.stuck_step not in STUCK_STEPS:
            raise ValueError("Unsupported stuck step")
        return self


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_tables(conn: sqlite3.Connection) -> None:
    """Create additive quantity tables; safe to call on every request."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS quantity_practice_sessions (
            id              TEXT PRIMARY KEY,
            user_id         INTEGER NOT NULL,
            set_no          INTEGER NOT NULL CHECK(set_no BETWEEN 1 AND 60),
            status          TEXT NOT NULL DEFAULT 'in_progress'
                            CHECK(status IN ('in_progress','submitted')),
            question_count  INTEGER NOT NULL DEFAULT 10,
            score           INTEGER,
            elapsed_ms      INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_ms >= 0),
            started_at      TEXT NOT NULL,
            submitted_at    TEXT,
            updated_at      TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_quantity_sessions_user_updated
            ON quantity_practice_sessions(user_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS quantity_single_sessions (
            id              TEXT PRIMARY KEY,
            user_id         INTEGER NOT NULL,
            question_id     TEXT NOT NULL,
            topic           TEXT NOT NULL,
            exam_decision   TEXT,
            status          TEXT NOT NULL DEFAULT 'in_progress'
                            CHECK(status IN ('in_progress','submitted')),
            final_answer    TEXT,
            correct_answer  TEXT,
            is_correct      INTEGER,
            elapsed_ms      INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_ms >= 0),
            stuck_step      TEXT,
            work_note       TEXT NOT NULL DEFAULT '',
            started_at      TEXT NOT NULL,
            submitted_at    TEXT,
            updated_at      TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_quantity_single_user_updated
            ON quantity_single_sessions(user_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS quantity_attempt_items (
            session_id      TEXT NOT NULL,
            question_id     TEXT NOT NULL,
            first_answer    TEXT,
            final_answer    TEXT,
            correct_answer  TEXT,
            is_correct      INTEGER,
            elapsed_ms      INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_ms >= 0),
            is_skipped      INTEGER NOT NULL DEFAULT 0 CHECK(is_skipped IN (0,1)),
            skip_count      INTEGER NOT NULL DEFAULT 0 CHECK(skip_count >= 0),
            change_count    INTEGER NOT NULL DEFAULT 0 CHECK(change_count >= 0),
            stuck_step      TEXT,
            answered_at     TEXT NOT NULL,
            PRIMARY KEY (session_id, question_id),
            FOREIGN KEY (session_id) REFERENCES quantity_practice_sessions(id)
                ON DELETE CASCADE
        );
        """)
    conn.commit()


def _absolute_media_path(asset: str) -> Path:
    path = Path(asset)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    resolved = path.resolve()
    approved_media_root = (PROJECT_ROOT / "data/quantity_bank/approved_media").resolve()
    if approved_media_root not in resolved.parents:
        raise RuntimeError("Quantity media escapes the approved output directory")
    return resolved


@lru_cache(maxsize=1)
def _load_bank() -> dict:
    if not APPROVED_BANK_PATH.is_file():
        raise RuntimeError("Versioned approved quantity bank is missing")
    questions = json.loads(APPROVED_BANK_PATH.read_text(encoding="utf-8"))
    if not isinstance(questions, list) or len(questions) != 600:
        raise RuntimeError("Approved quantity bank must contain exactly 600 questions")

    sets: dict[int, list[dict]] = {set_no: [] for set_no in range(1, 61)}
    by_id: dict[str, dict] = {}
    for question in questions:
        set_no = question.get("set_no")
        if set_no not in sets or question.get("id") in by_id:
            raise RuntimeError(
                "Approved quantity bank has an invalid set or duplicate id"
            )
        if question.get("tags", {}).get("answer_source") != "full_visual_set_audit":
            raise RuntimeError(
                "Every approved quantity answer must be visually audited"
            )
        option_keys = [option.get("key") for option in question.get("options", [])]
        expected_keys = [chr(ord("A") + index) for index in range(len(option_keys))]
        if option_keys != expected_keys or question.get("answer") not in option_keys:
            raise RuntimeError(f"Invalid options or answer for {question.get('id')}")
        for media in question.get("media", []):
            if media.get("type") != "question_figure_crop":
                raise RuntimeError("Pre-submit media must be a question_figure_crop")
            if not _absolute_media_path(media.get("asset", "")).is_file():
                raise RuntimeError(f"Missing quantity media for {question.get('id')}")
        sets[set_no].append(question)
        by_id[question["id"]] = question

    for set_no, items in sets.items():
        items.sort(key=lambda item: item["question_no"])
        if [item["question_no"] for item in items] != list(range(1, 11)):
            raise RuntimeError(f"Quantity set {set_no} must contain questions 1-10")
    if "".join(item["answer"] for item in sets[28]) != "DABDCCBCCB":
        raise RuntimeError("Set 28 answer evidence does not match the approved handoff")
    q8_7 = sets[8][6]
    if [item["key"] for item in q8_7["options"]] != list("ABCDEFGH") or q8_7[
        "answer"
    ] != "E":
        raise RuntimeError("Set 08 question 07 must remain A-H with answer E")
    return {"sets": sets, "by_id": by_id}


def _bank_or_unavailable() -> dict:
    """Map private bank loader failures to one stable, non-sensitive API contract."""
    try:
        return _load_bank()
    except (
        OSError,
        UnicodeError,
        ValueError,
        KeyError,
        TypeError,
        RuntimeError,
    ) as exc:
        logger.warning(
            "bank_unavailable module_id=quantity.exam error_type=%s",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail={
                "code": "bank_unavailable",
                "module_id": "quantity.exam",
                "message": "题库暂不可用，请稍后再试。",
                "retryable": True,
            },
        ) from None


def _question_for_practice(question: dict) -> dict:
    tags = question.get("tags", {})
    return {
        "id": question["id"],
        "set_no": question["set_no"],
        "question_no": question["question_no"],
        "stem": question["stem"],
        "options": question["options"],
        "media": [
            {
                "type": item["type"],
                "url": f"/api/quantity/media/{question['id']}/{index}",
            }
            for index, item in enumerate(question.get("media", []))
        ],
        "primary_topic": tags.get("primary_topic"),
        "secondary_topics": tags.get("secondary_topics", []),
        "methods": tags.get("methods", []),
        "exam_decision": tags.get("exam_decision"),
        "exam_decision_label": DECISION_LABELS.get(tags.get("exam_decision")),
        "decision_scope": "question_baseline",
        "estimated_seconds": tags.get("estimated_seconds"),
    }


def _canonical_topic(value: Any) -> str:
    raw = str(value or "其他题型").strip()
    for label, keywords in TOPIC_GROUPS:
        if any(keyword in raw for keyword in keywords):
            return label
    return "基础计算与其他"


def _topic_catalog() -> list[dict]:
    topics: dict[str, dict] = {}
    decision_weight = {"must_do": 3, "can_do": 2, "skip_first": 1}
    for set_no, items in _bank_or_unavailable()["sets"].items():
        for question in items:
            tags = question.get("tags", {})
            topic = _canonical_topic(tags.get("primary_topic"))
            item = topics.setdefault(
                topic,
                {
                    "topic": topic,
                    "question_count": 0,
                    "first_set": set_no,
                    "decision_counts": {key: 0 for key in decision_weight},
                    "estimated_seconds": [],
                    "methods": {},
                },
            )
            item["question_count"] += 1
            item["first_set"] = min(item["first_set"], set_no)
            decision = tags.get("exam_decision")
            if decision in item["decision_counts"]:
                item["decision_counts"][decision] += 1
            seconds = tags.get("estimated_seconds")
            if isinstance(seconds, int) and seconds > 0:
                item["estimated_seconds"].append(seconds)
            for method in tags.get("methods", []):
                label = str(method).strip()
                if label:
                    item["methods"][label] = item["methods"].get(label, 0) + 1
    result = []
    for item in topics.values():
        total = max(1, item["question_count"])
        score = sum(
            item["decision_counts"][key] * weight
            for key, weight in decision_weight.items()
        ) / total
        decision = "must_do" if score >= 2.5 else "can_do" if score >= 1.6 else "skip_first"
        seconds = sorted(item.pop("estimated_seconds"))
        methods = item.pop("methods")
        item.update(
            {
                "priority_score": round(score, 3),
                "decision": decision,
                "decision_label": DECISION_LABELS[decision],
                "recommended_seconds": seconds[len(seconds) // 2] if seconds else None,
                "methods": [
                    label
                    for label, _ in sorted(
                        methods.items(), key=lambda pair: (-pair[1], pair[0])
                    )[:3]
                ],
            }
        )
        result.append(item)
    return sorted(
        result,
        key=lambda item: (-item["priority_score"], -item["question_count"], item["topic"]),
    )


def _single_question_payload(question: dict, submitted: bool = False) -> dict:
    payload = _question_for_practice(question)
    if submitted:
        payload.update(
            {
                "answer": question["answer"],
                "analysis": question.get("analysis", ""),
            }
        )
    return payload


def _serialize_single_session(row, question: dict) -> dict:
    submitted = row["status"] == "submitted"
    payload = dict(row)
    payload["is_correct"] = (
        bool(payload["is_correct"]) if payload["is_correct"] is not None else None
    )
    if not submitted:
        payload.pop("correct_answer", None)
        payload.pop("is_correct", None)
    payload["question"] = _single_question_payload(question, submitted=submitted)
    return payload


def _get_set(set_no: int) -> list[dict]:
    items = _bank_or_unavailable()["sets"].get(set_no)
    if not items:
        raise HTTPException(status_code=404, detail="Quantity set not found")
    return items


def _owned_session(conn, session_id: str, user_id: int):
    row = conn.execute(
        "SELECT * FROM quantity_practice_sessions WHERE id=? AND user_id=?",
        (session_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Quantity session not found")
    return row


def _serialize_session(conn, session) -> dict:
    submitted = session["status"] == "submitted"
    rows = conn.execute(
        """
        SELECT question_id, first_answer, final_answer, correct_answer, is_correct,
               elapsed_ms, is_skipped, skip_count, change_count, stuck_step, answered_at
        FROM quantity_attempt_items WHERE session_id=? ORDER BY question_id
        """,
        (session["id"],),
    ).fetchall()
    attempts = []
    for row in rows:
        item = dict(row)
        item["is_skipped"] = bool(item["is_skipped"])
        if not submitted:
            item.pop("correct_answer", None)
            item.pop("is_correct", None)
        elif item["is_correct"] is not None:
            item["is_correct"] = bool(item["is_correct"])
        attempts.append(item)
    payload = {
        "id": session["id"],
        "set_no": session["set_no"],
        "status": session["status"],
        "question_count": session["question_count"],
        "answered_count": sum(not item["is_skipped"] for item in attempts),
        "attempted_count": len(attempts),
        "score": session["score"],
        "elapsed_ms": session["elapsed_ms"],
        "started_at": session["started_at"],
        "submitted_at": session["submitted_at"],
        "attempts": attempts,
    }
    if submitted:
        payload["review_questions"] = [
            {
                **_question_for_practice(question),
                "answer": question["answer"],
                "analysis": question.get("analysis", ""),
            }
            for question in _get_set(session["set_no"])
        ]
        payload["analysis_visual_audit"] = {
            "status": "incomplete",
            "known_visual_reference_questions": 42,
            "analysis_media_available": False,
        }
    return payload


@router.get("/sets")
def list_sets(user: dict = Depends(require_user)):
    del user
    return [
        {"set_no": set_no, "label": f"第{set_no:02d}套", "question_count": len(items)}
        for set_no, items in _bank_or_unavailable()["sets"].items()
    ]


@router.get("/topics")
def list_topics(user: dict = Depends(require_user)):
    """Return real-bank topic value, timing and method summaries."""
    del user
    return _topic_catalog()


@router.post("/single-sessions", status_code=201)
def create_single_session(
    body: SingleSessionCreateIn, user: dict = Depends(require_user)
):
    bank = _bank_or_unavailable()
    candidates = [
        question
        for question in bank["by_id"].values()
        if body.topic is None
        or _canonical_topic(question.get("tags", {}).get("primary_topic")) == body.topic
    ]
    if not candidates:
        raise HTTPException(status_code=404, detail="Quantity topic not found")
    rank = {"must_do": 0, "can_do": 1, "skip_first": 2}
    candidates.sort(
        key=lambda item: (
            rank.get(item.get("tags", {}).get("exam_decision"), 3),
            item["set_no"],
            item["question_no"],
        )
    )
    with get_db() as conn:
        _ensure_tables(conn)
        seen = {
            row["question_id"]
            for row in conn.execute(
                "SELECT question_id FROM quantity_single_sessions WHERE user_id=? AND status='submitted'",
                (user["user_id"],),
            ).fetchall()
        }
        question = next((item for item in candidates if item["id"] not in seen), candidates[0])
        tags = question.get("tags", {})
        now, session_id = _utc_now(), uuid.uuid4().hex
        conn.execute(
            """
            INSERT INTO quantity_single_sessions
                (id,user_id,question_id,topic,exam_decision,started_at,updated_at)
            VALUES (?,?,?,?,?,?,?)
            """,
            (
                session_id,
                user["user_id"],
                question["id"],
                _canonical_topic(tags.get("primary_topic")),
                tags.get("exam_decision"),
                now,
                now,
            ),
        )
        conn.execute(
            """INSERT INTO learning_activities_v2
                   (id,user_id,module_id,activity_type,source_id,status,started_at,
                    duration_ms,summary_json,created_at,updated_at)
               VALUES(?,?,?,?,?,'in_progress',?,0,?,?,?)""",
            (
                f"quantity-single:{session_id}",
                user["user_id"],
                "quantity.practice",
                "single_diagnosis",
                session_id,
                now,
                json.dumps(
                    {"topic": _canonical_topic(tags.get("primary_topic"))},
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                now,
                now,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM quantity_single_sessions WHERE id=?", (session_id,)
        ).fetchone()
        return _serialize_single_session(row, question)


@router.get("/single-sessions")
def list_single_sessions(user: dict = Depends(require_user)):
    with get_db() as conn:
        _ensure_tables(conn)
        rows = conn.execute(
            "SELECT * FROM quantity_single_sessions WHERE user_id=? ORDER BY updated_at DESC",
            (user["user_id"],),
        ).fetchall()
        bank = _bank_or_unavailable()["by_id"]
        return [_serialize_single_session(row, bank[row["question_id"]]) for row in rows]


@router.get("/single-sessions/{session_id}")
def get_single_session(session_id: str, user: dict = Depends(require_user)):
    with get_db() as conn:
        _ensure_tables(conn)
        row = conn.execute(
            "SELECT * FROM quantity_single_sessions WHERE id=? AND user_id=?",
            (session_id, user["user_id"]),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Quantity single session not found")
        return _serialize_single_session(row, _bank_or_unavailable()["by_id"][row["question_id"]])


@router.post("/single-sessions/{session_id}/submit")
def submit_single_session(
    session_id: str,
    body: SingleSessionSubmitIn,
    user: dict = Depends(require_user),
):
    with get_db() as conn:
        _ensure_tables(conn)
        row = conn.execute(
            "SELECT * FROM quantity_single_sessions WHERE id=? AND user_id=?",
            (session_id, user["user_id"]),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Quantity single session not found")
        question = _bank_or_unavailable()["by_id"][row["question_id"]]
        if body.answer not in {item["key"] for item in question["options"]}:
            raise HTTPException(status_code=422, detail="Answer is not an option for this question")
        if row["status"] != "submitted":
            now = _utc_now()
            correct = int(body.answer == question["answer"])
            conn.execute(
                """
                UPDATE quantity_single_sessions
                SET status='submitted',final_answer=?,correct_answer=?,is_correct=?,
                    elapsed_ms=?,stuck_step=?,work_note=?,submitted_at=?,updated_at=?
                WHERE id=? AND user_id=?
                """,
                (
                    body.answer,
                    question["answer"],
                    correct,
                    body.elapsed_ms,
                    body.stuck_step,
                    body.work_note.strip(),
                    now,
                    now,
                    session_id,
                    user["user_id"],
                ),
            )
            conn.execute(
                """UPDATE learning_activities_v2
                   SET status='completed',completed_at=?,duration_ms=?,summary_json=?,updated_at=?
                   WHERE id=? AND user_id=?""",
                (
                    now,
                    body.elapsed_ms,
                    json.dumps(
                        {
                            "topic": row["topic"],
                            "correct": bool(correct),
                            "stuck_step": body.stuck_step,
                        },
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                    now,
                    f"quantity-single:{session_id}",
                    user["user_id"],
                ),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM quantity_single_sessions WHERE id=?", (session_id,)
            ).fetchone()
        return _serialize_single_session(row, question)


@router.get("/review-summary")
def review_summary(user: dict = Depends(require_user)):
    with get_db() as conn:
        _ensure_tables(conn)
        singles = conn.execute(
            "SELECT * FROM quantity_single_sessions WHERE user_id=? AND status='submitted' ORDER BY updated_at DESC",
            (user["user_id"],),
        ).fetchall()
        sets = conn.execute(
            "SELECT * FROM quantity_practice_sessions WHERE user_id=? AND status='submitted' ORDER BY updated_at DESC",
            (user["user_id"],),
        ).fetchall()
    topics = _topic_catalog()
    by_topic: dict[str, dict] = {}
    for row in singles:
        item = by_topic.setdefault(
            row["topic"], {"topic": row["topic"], "attempted": 0, "correct": 0, "elapsed_ms": 0, "stuck_steps": {}}
        )
        item["attempted"] += 1
        item["correct"] += int(row["is_correct"] or 0)
        item["elapsed_ms"] += row["elapsed_ms"]
        if row["stuck_step"]:
            item["stuck_steps"][row["stuck_step"]] = item["stuck_steps"].get(row["stuck_step"], 0) + 1
    topic_reviews = []
    for item in by_topic.values():
        top_stuck = sorted(item.pop("stuck_steps").items(), key=lambda pair: (-pair[1], pair[0]))
        topic_reviews.append(
            {
                **item,
                "accuracy": round(item["correct"] / item["attempted"], 3),
                "average_seconds": round(item["elapsed_ms"] / item["attempted"] / 1000),
                "top_stuck_step": top_stuck[0][0] if top_stuck else None,
                "needed_for_stable": max(0, 5 - item["attempted"]),
            }
        )
    topic_reviews.sort(key=lambda item: (item["accuracy"], -item["attempted"], item["topic"]))
    if topic_reviews:
        target = topic_reviews[0]
        reason = f"现有 {target['attempted']} 题，正确 {target['correct']} 题"
        if target["top_stuck_step"]:
            reason += f"；最常卡在{target['top_stuck_step']}"
        if target["needed_for_stable"]:
            reason += f"。还不能判断是否稳定，先再做 {target['needed_for_stable']} 题"
        recommendation = {"topic": target["topic"], "reason": reason}
    else:
        target = topics[0]
        recommendation = {
            "topic": target["topic"],
            "reason": f"当前还没有单题证据，先从{target['decision_label']}题型建立记录",
        }
    bank = _bank_or_unavailable()["by_id"]
    timeline = [
        {
            "kind": "single",
            "id": row["id"],
            "title": f"{row['topic']} · 单题诊断",
            "result": "正确" if row["is_correct"] else "需复盘",
            "elapsed_ms": row["elapsed_ms"],
            "updated_at": row["updated_at"],
            "question_no": bank[row["question_id"]]["question_no"],
        }
        for row in singles[:12]
    ] + [
        {
            "kind": "set",
            "id": row["id"],
            "title": f"第 {row['set_no']:02d} 套",
            "result": f"{row['score']} / {row['question_count']}",
            "elapsed_ms": row["elapsed_ms"],
            "updated_at": row["updated_at"],
        }
        for row in sets[:8]
    ]
    timeline.sort(key=lambda item: item["updated_at"], reverse=True)
    return {
        "evidence_count": len(singles) + len(sets),
        "single_count": len(singles),
        "set_count": len(sets),
        "topic_reviews": topic_reviews,
        "recommendation": recommendation,
        "timeline": timeline[:16],
    }


@router.get("/sets/{set_no}/questions")
def get_questions(set_no: int, user: dict = Depends(require_user)):
    del user
    return [_question_for_practice(item) for item in _get_set(set_no)]


@router.get("/media/{question_id}/{media_index}")
def get_question_media(
    question_id: str, media_index: int, user: dict = Depends(require_user)
):
    del user
    question = _bank_or_unavailable()["by_id"].get(question_id)
    if not question or media_index < 0 or media_index >= len(question.get("media", [])):
        raise HTTPException(status_code=404, detail="Quantity media not found")
    path = _absolute_media_path(question["media"][media_index]["asset"])
    return FileResponse(path)


@router.post("/sessions", status_code=201)
def create_session(body: SessionCreateIn, user: dict = Depends(require_user)):
    questions = _get_set(body.set_no)
    now = _utc_now()
    session_id = uuid.uuid4().hex
    with get_db() as conn:
        _ensure_tables(conn)
        conn.execute(
            """
            INSERT INTO quantity_practice_sessions
                (id, user_id, set_no, question_count, started_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (session_id, user["user_id"], body.set_no, len(questions), now, now),
        )
        conn.execute(
            """INSERT INTO learning_activities_v2
                   (id,user_id,module_id,activity_type,source_id,status,started_at,
                    duration_ms,summary_json,created_at,updated_at)
               VALUES(?,?,?,?,?,'in_progress',?,0,?,?,?)""",
            (
                f"quantity:{session_id}",
                user["user_id"],
                "quantity.exam",
                "practice_set",
                session_id,
                now,
                json.dumps({"set_no": body.set_no, "total": len(questions)}),
                now,
                now,
            ),
        )
        conn.commit()
        return _serialize_session(
            conn, _owned_session(conn, session_id, user["user_id"])
        )


@router.get("/sessions")
def list_sessions(user: dict = Depends(require_user)):
    with get_db() as conn:
        _ensure_tables(conn)
        rows = conn.execute(
            "SELECT * FROM quantity_practice_sessions WHERE user_id=? ORDER BY updated_at DESC",
            (user["user_id"],),
        ).fetchall()
        return [_serialize_session(conn, row) for row in rows]


@router.get("/sessions/{session_id}")
def get_session(session_id: str, user: dict = Depends(require_user)):
    with get_db() as conn:
        _ensure_tables(conn)
        return _serialize_session(
            conn, _owned_session(conn, session_id, user["user_id"])
        )


@router.put("/sessions/{session_id}/attempts")
def save_attempt(
    session_id: str, body: AttemptSaveIn, user: dict = Depends(require_user)
):
    with get_db() as conn:
        _ensure_tables(conn)
        session = _owned_session(conn, session_id, user["user_id"])
        if session["status"] != "in_progress":
            raise HTTPException(
                status_code=409, detail="Quantity session already submitted"
            )
        question = _bank_or_unavailable()["by_id"].get(body.question_id)
        if not question or question["set_no"] != session["set_no"]:
            raise HTTPException(
                status_code=422, detail="Question does not belong to this set"
            )
        allowed_answers = {option["key"] for option in question["options"]}
        if body.answer is not None and body.answer not in allowed_answers:
            raise HTTPException(
                status_code=422, detail="Answer is not an option for this question"
            )
        existing = conn.execute(
            "SELECT * FROM quantity_attempt_items WHERE session_id=? AND question_id=?",
            (session_id, body.question_id),
        ).fetchone()
        now = _utc_now()
        if existing:
            changed = int(
                existing["final_answer"] is not None
                and body.answer is not None
                and existing["final_answer"] != body.answer
            )
            newly_skipped = int(body.skipped and not existing["is_skipped"])
            conn.execute(
                """
                UPDATE quantity_attempt_items
                SET final_answer=?, elapsed_ms=?, is_skipped=?,
                    skip_count=skip_count+?, change_count=change_count+?,
                    stuck_step=?, answered_at=?
                WHERE session_id=? AND question_id=?
                """,
                (
                    body.answer,
                    body.elapsed_ms,
                    int(body.skipped),
                    newly_skipped,
                    changed,
                    body.stuck_step,
                    now,
                    session_id,
                    body.question_id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO quantity_attempt_items
                    (session_id, question_id, first_answer, final_answer, elapsed_ms,
                     is_skipped, skip_count, change_count, stuck_step, answered_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                """,
                (
                    session_id,
                    body.question_id,
                    body.answer,
                    body.answer,
                    body.elapsed_ms,
                    int(body.skipped),
                    int(body.skipped),
                    body.stuck_step,
                    now,
                ),
            )
        conn.execute(
            "UPDATE quantity_practice_sessions SET updated_at=? WHERE id=? AND user_id=?",
            (now, session_id, user["user_id"]),
        )
        conn.commit()
        return _serialize_session(
            conn, _owned_session(conn, session_id, user["user_id"])
        )


@router.post("/sessions/{session_id}/submit")
def submit_session(
    session_id: str,
    body: SessionSubmitIn,
    user: dict = Depends(require_user),
):
    with get_db() as conn:
        _ensure_tables(conn)
        session = _owned_session(conn, session_id, user["user_id"])
        if session["status"] == "submitted":
            return _serialize_session(conn, session)
        attempts = conn.execute(
            "SELECT * FROM quantity_attempt_items WHERE session_id=?",
            (session_id,),
        ).fetchall()
        if not attempts:
            raise HTTPException(
                status_code=422, detail="Record at least one attempt before submitting"
            )
        score = 0
        for attempt in attempts:
            question = _bank_or_unavailable()["by_id"][attempt["question_id"]]
            is_correct = int(
                not attempt["is_skipped"]
                and attempt["final_answer"] == question["answer"]
            )
            score += is_correct
            conn.execute(
                """
                UPDATE quantity_attempt_items SET correct_answer=?, is_correct=?
                WHERE session_id=? AND question_id=?
                """,
                (question["answer"], is_correct, session_id, attempt["question_id"]),
            )
        now = _utc_now()
        conn.execute(
            """
            UPDATE quantity_practice_sessions
            SET status='submitted', score=?, elapsed_ms=?, submitted_at=?, updated_at=?
            WHERE id=? AND user_id=?
            """,
            (score, body.elapsed_ms, now, now, session_id, user["user_id"]),
        )
        conn.execute(
            """UPDATE learning_activities_v2
               SET status='completed',completed_at=?,duration_ms=?,summary_json=?,updated_at=?
               WHERE id=? AND user_id=?""",
            (
                now,
                body.elapsed_ms,
                json.dumps(
                    {
                        "set_no": session["set_no"],
                        "score": score,
                        "total": session["question_count"],
                        "skipped": sum(int(item["is_skipped"]) for item in attempts),
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                now,
                f"quantity:{session_id}",
                user["user_id"],
            ),
        )
        conn.commit()
        return _serialize_session(
            conn, _owned_session(conn, session_id, user["user_id"])
        )
