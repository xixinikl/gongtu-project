"""Authenticated verbal-reading practice session API.

Phase 1 deliberately contains no model call. It persists real user attempts and
computes results from the manifest-approved question bank on the server.
"""
from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
import json
from pathlib import Path
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from jsonschema import ValidationError
from pydantic import BaseModel, Field

from auth import require_user
from database import get_db
from verbal_reading_ai_config import load_verbal_ai_settings
from verbal_reading_diagnosis import normalize_diagnosis_shape, validate_diagnosis
from verbal_reading_prompt import build_diagnosis_prompt, build_followup_prompt
from verbal_reading_provider import ProviderError, call_deepseek_json, call_deepseek_text
from verbal_reading_recommender import recommend_original_questions


router = APIRouter(prefix="/api/verbal-reading", tags=["verbal-reading"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = PROJECT_ROOT / "data" / "verbal_reading" / "sets_manifest.json"
ALLOWED_ANSWERS = {"A", "B", "C", "D"}
MAX_ITEM_ELAPSED_MS = 30 * 60 * 1000
MAX_SESSION_ELAPSED_MS = 6 * 60 * 60 * 1000


class SessionCreateIn(BaseModel):
    set_id: str = Field(min_length=1, max_length=80)


class AnswerSaveIn(BaseModel):
    question_id: str = Field(min_length=1, max_length=120)
    answer: str = Field(min_length=1, max_length=1)
    elapsed_ms: int = Field(default=0, ge=0, le=MAX_ITEM_ELAPSED_MS)


class SessionSubmitIn(BaseModel):
    elapsed_ms: int = Field(default=0, ge=0, le=MAX_SESSION_ELAPSED_MS)


class MessageCreateIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    question_id: str | None = Field(default=None, max_length=120)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@lru_cache(maxsize=1)
def _load_bank() -> dict[str, dict]:
    if not MANIFEST_PATH.is_file():
        raise RuntimeError("Verbal-reading manifest is missing")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    result: dict[str, dict] = {}
    for set_meta in manifest.get("sets", []):
        questions: list[dict] = []
        for relative_file in set_meta.get("files", []):
            package_path = PROJECT_ROOT / relative_file
            package = json.loads(package_path.read_text(encoding="utf-8"))
            questions.extend(package.get("questions", []))
        questions.sort(key=lambda item: item["question_no"])
        if len(questions) != set_meta.get("question_count"):
            raise RuntimeError(f"Question count mismatch for {set_meta.get('set_id')}")
        result[set_meta["set_id"]] = {
            "meta": set_meta,
            "questions": questions,
            "by_id": {item["id"]: item for item in questions},
        }
    return result


def _get_set(set_id: str) -> dict:
    set_data = _load_bank().get(set_id)
    if not set_data:
        raise HTTPException(status_code=404, detail="Practice set not found")
    return set_data


def _owned_session(conn, session_id: str, user_id: int):
    row = conn.execute(
        "SELECT * FROM verbal_practice_sessions WHERE id=? AND user_id=?",
        (session_id, user_id),
    ).fetchone()
    if not row:
        # Do not reveal whether another user owns this id.
        raise HTTPException(status_code=404, detail="Practice session not found")
    return row


def _serialize_session(conn, row) -> dict:
    attempts = conn.execute(
        """
        SELECT question_id, first_answer, final_answer, correct_answer,
               is_correct, elapsed_ms, change_count, answered_at
        FROM verbal_attempt_items
        WHERE session_id=?
        ORDER BY question_id
        """,
        (row["id"],),
    ).fetchall()
    submitted = row["status"] == "submitted"
    serialized_attempts = []
    for item in attempts:
        attempt = dict(item)
        if not submitted:
            attempt.pop("correct_answer", None)
            attempt.pop("is_correct", None)
        serialized_attempts.append(attempt)
    ai_run = conn.execute(
        """
        SELECT id, provider, model, skill_version, skill_hash, status,
               latency_ms, usage_json, error_code, output_json, created_at
        FROM verbal_ai_runs
        WHERE session_id=? AND user_id=? AND kind='diagnosis'
        ORDER BY created_at DESC LIMIT 1
        """,
        (row["id"], row["user_id"]),
    ).fetchone()
    ai_status = ai_run["status"] if ai_run else "not_started"
    payload = {
        "id": row["id"],
        "set_id": row["set_id"],
        "status": row["status"],
        "started_at": row["started_at"],
        "submitted_at": row["submitted_at"],
        "elapsed_ms": row["elapsed_ms"],
        "score": row["score"],
        "question_count": row["question_count"],
        "answered_count": len(attempts),
        "attempts": serialized_attempts,
        "ai_status": ai_status,
    }
    if ai_run:
        payload["ai_run"] = {
            "id": ai_run["id"],
            "provider": ai_run["provider"],
            "model": ai_run["model"],
            "skill_version": ai_run["skill_version"],
            "skill_hash": ai_run["skill_hash"],
            "status": ai_run["status"],
            "latency_ms": ai_run["latency_ms"],
            "usage": json.loads(ai_run["usage_json"]) if ai_run["usage_json"] else None,
            "error_code": ai_run["error_code"],
            "diagnosis": json.loads(ai_run["output_json"]) if ai_run["output_json"] else None,
            "created_at": ai_run["created_at"],
        }
    message_rows = conn.execute(
        """
        SELECT id, question_id, role, content, run_id, created_at
        FROM verbal_ai_messages
        WHERE session_id=? AND user_id=? ORDER BY created_at, rowid
        """,
        (row["id"], row["user_id"]),
    ).fetchall()
    payload["messages"] = [dict(message) for message in message_rows]
    if submitted:
        payload["review_questions"] = _get_set(row["set_id"])["questions"]
    return payload


def _practice_question(question: dict) -> dict:
    """Return only fields that are safe before submission."""
    learning_tags = question.get("learning_tags") or {}
    return {
        "id": question["id"],
        "question_no": question["question_no"],
        "content": question["content"],
        "learning_tags": {
            "question_type": learning_tags.get("question_type", "未标注"),
            "estimated_seconds": learning_tags.get("estimated_seconds"),
        },
    }


@router.get("/sets")
def list_practice_sets(user: dict = Depends(require_user)):
    del user
    return [
        {
            "set_id": set_id,
            "label": data["meta"].get("label", set_id),
            "question_count": data["meta"]["question_count"],
        }
        for set_id, data in _load_bank().items()
    ]


@router.get("/sets/{set_id}/questions")
def get_practice_questions(set_id: str, user: dict = Depends(require_user)):
    del user
    return [_practice_question(question) for question in _get_set(set_id)["questions"]]


@router.post("/sessions", status_code=201)
def create_session(body: SessionCreateIn, user: dict = Depends(require_user)):
    set_data = _get_set(body.set_id)
    session_id = uuid.uuid4().hex
    now = _utc_now()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO verbal_practice_sessions
                (id, user_id, set_id, status, started_at, question_count, updated_at)
            VALUES (?, ?, ?, 'in_progress', ?, ?, ?)
            """,
            (
                session_id,
                user["user_id"],
                body.set_id,
                now,
                set_data["meta"]["question_count"],
                now,
            ),
        )
        conn.commit()
        row = _owned_session(conn, session_id, user["user_id"])
        return _serialize_session(conn, row)


@router.get("/sessions")
def list_sessions(user: dict = Depends(require_user)):
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT * FROM verbal_practice_sessions
            WHERE user_id=?
            ORDER BY updated_at DESC, created_at DESC
            """,
            (user["user_id"],),
        ).fetchall()
        return [_serialize_session(conn, row) for row in rows]


@router.get("/sessions/{session_id}")
def get_session(session_id: str, user: dict = Depends(require_user)):
    with get_db() as conn:
        row = _owned_session(conn, session_id, user["user_id"])
        return _serialize_session(conn, row)


@router.put("/sessions/{session_id}/answers")
def save_answer(
    session_id: str,
    body: AnswerSaveIn,
    user: dict = Depends(require_user),
):
    answer = body.answer.upper()
    if answer not in ALLOWED_ANSWERS:
        raise HTTPException(status_code=422, detail="Answer must be A, B, C, or D")
    with get_db() as conn:
        session = _owned_session(conn, session_id, user["user_id"])
        if session["status"] != "in_progress":
            raise HTTPException(status_code=409, detail="Practice session already submitted")
        set_data = _get_set(session["set_id"])
        question = set_data["by_id"].get(body.question_id)
        if not question:
            raise HTTPException(status_code=422, detail="Question does not belong to this set")
        existing = conn.execute(
            "SELECT * FROM verbal_attempt_items WHERE session_id=? AND question_id=?",
            (session_id, body.question_id),
        ).fetchone()
        correct_answer = question["answer"]
        now = _utc_now()
        if existing:
            changed = int(existing["final_answer"] != answer)
            conn.execute(
                """
                UPDATE verbal_attempt_items
                SET final_answer=?, correct_answer=?, is_correct=?, elapsed_ms=?,
                    change_count=change_count+?, answered_at=?
                WHERE session_id=? AND question_id=?
                """,
                (
                    answer,
                    correct_answer,
                    int(answer == correct_answer),
                    body.elapsed_ms,
                    changed,
                    now,
                    session_id,
                    body.question_id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO verbal_attempt_items
                    (session_id, question_id, first_answer, final_answer,
                     correct_answer, is_correct, elapsed_ms, change_count, answered_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (
                    session_id,
                    body.question_id,
                    answer,
                    answer,
                    correct_answer,
                    int(answer == correct_answer),
                    body.elapsed_ms,
                    now,
                ),
            )
        conn.execute(
            "UPDATE verbal_practice_sessions SET updated_at=? WHERE id=?",
            (now, session_id),
        )
        conn.commit()
        row = _owned_session(conn, session_id, user["user_id"])
        return _serialize_session(conn, row)


@router.post("/sessions/{session_id}/submit")
def submit_session(
    session_id: str,
    body: SessionSubmitIn,
    user: dict = Depends(require_user),
):
    with get_db() as conn:
        session = _owned_session(conn, session_id, user["user_id"])
        if session["status"] == "submitted":
            # Idempotent replay returns the original result.
            return _serialize_session(conn, session)
        attempts = conn.execute(
            "SELECT is_correct FROM verbal_attempt_items WHERE session_id=?",
            (session_id,),
        ).fetchall()
        if not attempts:
            raise HTTPException(status_code=422, detail="Answer at least one question before submitting")
        score = sum(int(item["is_correct"]) for item in attempts)
        now = _utc_now()
        conn.execute(
            """
            UPDATE verbal_practice_sessions
            SET status='submitted', submitted_at=?, elapsed_ms=?, score=?, updated_at=?
            WHERE id=? AND user_id=?
            """,
            (now, body.elapsed_ms, score, now, session_id, user["user_id"]),
        )
        conn.commit()
        row = _owned_session(conn, session_id, user["user_id"])
        return _serialize_session(conn, row)


def _diagnosis_context(conn, session, set_data: dict) -> tuple[dict, dict[str, dict]]:
    attempt_rows = conn.execute(
        """
        SELECT question_id, first_answer, final_answer, correct_answer,
               is_correct, elapsed_ms, change_count
        FROM verbal_attempt_items WHERE session_id=? ORDER BY question_id
        """,
        (session["id"],),
    ).fetchall()
    attempts = {row["question_id"]: dict(row) for row in attempt_rows}
    wrong_questions = []
    for question in set_data["questions"]:
        attempt = attempts.get(question["id"])
        if not attempt or attempt["is_correct"]:
            continue
        wrong_questions.append(
            {
                "question_id": question["id"],
                "question_no": question["question_no"],
                "question_type": question.get("learning_tags", {}).get("question_type"),
                "stem": question["content"]["stem"],
                "prompt": question["content"]["prompt"],
                "options": question["content"]["options"],
                "user_answer": attempt["final_answer"],
                "correct_answer": attempt["correct_answer"],
                "elapsed_ms": attempt["elapsed_ms"],
                "change_count": attempt["change_count"],
                "official_analysis": question.get("official_analysis", ""),
                "peanut_notes": question.get("peanut_notes", []),
                "learning_tags": question.get("learning_tags", {}),
            }
        )
    return (
        {
            "session_id": session["id"],
            "set_id": session["set_id"],
            "objective_stats": {
                "score": session["score"],
                "question_count": session["question_count"],
                "elapsed_ms": session["elapsed_ms"],
                "wrong_count": len(wrong_questions),
                "answered_count": len(attempts),
            },
            "allowed_evidence_question_ids": list(attempts),
            "allowed_recommendation_question_ids": [],
            "wrong_questions": wrong_questions,
        },
        attempts,
    )


@router.post("/sessions/{session_id}/diagnosis")
def generate_diagnosis(session_id: str, user: dict = Depends(require_user)):
    settings = load_verbal_ai_settings()
    if not settings.configured:
        raise HTTPException(status_code=503, detail="provider_not_configured")

    with get_db() as conn:
        session = _owned_session(conn, session_id, user["user_id"])
        if session["status"] != "submitted":
            raise HTTPException(status_code=409, detail="Submit the practice session first")
        completed = conn.execute(
            """
            SELECT id FROM verbal_ai_runs
            WHERE session_id=? AND user_id=? AND kind='diagnosis' AND status='completed'
            ORDER BY created_at DESC LIMIT 1
            """,
            (session_id, user["user_id"]),
        ).fetchone()
        if completed:
            return _serialize_session(conn, session)

        context, attempts = _diagnosis_context(conn, session, _get_set(session["set_id"]))
        prompt = build_diagnosis_prompt(context)
        run_id = uuid.uuid4().hex
        started_at = _utc_now()
        conn.execute(
            """
            INSERT INTO verbal_ai_runs
                (id, session_id, user_id, kind, provider, model, skill_version,
                 skill_hash, status, started_at)
            VALUES (?, ?, ?, 'diagnosis', 'deepseek', ?, ?, ?, 'running', ?)
            """,
            (
                run_id,
                session_id,
                user["user_id"],
                settings.model,
                prompt.skill_version,
                prompt.skill_hash,
                started_at,
            ),
        )
        conn.commit()

    wall_started = time.perf_counter()
    try:
        result = call_deepseek_json(
            settings,
            system_prompt=prompt.system_prompt,
            user_prompt=prompt.user_prompt,
        )
        normalized_output = normalize_diagnosis_shape(result.output)
        validate_diagnosis(normalized_output, attempts=attempts)
    except ProviderError as error:
        latency_ms = round((time.perf_counter() - wall_started) * 1000)
        with get_db() as conn:
            conn.execute(
                """
                UPDATE verbal_ai_runs
                SET status=?, finished_at=?, latency_ms=?, error_code=?
                WHERE id=? AND user_id=?
                """,
                (error.status, _utc_now(), latency_ms, error.code, run_id, user["user_id"]),
            )
            conn.commit()
        status_code = 504 if error.status == "timed_out" else 503
        if error.status == "invalid_output":
            status_code = 422
        raise HTTPException(status_code=status_code, detail=error.code) from None
    except (ValidationError, ValueError) as error:
        del error
        latency_ms = round((time.perf_counter() - wall_started) * 1000)
        with get_db() as conn:
            conn.execute(
                """
                UPDATE verbal_ai_runs
                SET status='invalid_output', finished_at=?, latency_ms=?, error_code='diagnosis_validation'
                WHERE id=? AND user_id=?
                """,
                (_utc_now(), latency_ms, run_id, user["user_id"]),
            )
            conn.commit()
        raise HTTPException(status_code=422, detail="diagnosis_validation") from None

    with get_db() as conn:
        conn.execute(
            """
            UPDATE verbal_ai_runs
            SET status='completed', finished_at=?, latency_ms=?, usage_json=?, output_json=?
            WHERE id=? AND user_id=?
            """,
            (
                _utc_now(),
                result.latency_ms,
                json.dumps(result.usage, ensure_ascii=False),
                json.dumps(normalized_output, ensure_ascii=False),
                run_id,
                user["user_id"],
            ),
        )
        conn.commit()
        session = _owned_session(conn, session_id, user["user_id"])
        return _serialize_session(conn, session)


@router.post("/sessions/{session_id}/messages")
def create_message(
    session_id: str,
    body: MessageCreateIn,
    user: dict = Depends(require_user),
):
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Message cannot be empty")
    settings = load_verbal_ai_settings()
    if not settings.configured:
        raise HTTPException(status_code=503, detail="provider_not_configured")

    with get_db() as conn:
        session = _owned_session(conn, session_id, user["user_id"])
        if session["status"] != "submitted":
            raise HTTPException(status_code=409, detail="Submit the practice session first")
        set_data = _get_set(session["set_id"])
        selected_question = None
        if body.question_id:
            selected_question = set_data["by_id"].get(body.question_id)
            if not selected_question:
                raise HTTPException(status_code=422, detail="Question does not belong to this session")

        attempt_rows = conn.execute(
            """
            SELECT question_id, final_answer, correct_answer, elapsed_ms, change_count
            FROM verbal_attempt_items WHERE session_id=?
            """,
            (session_id,),
        ).fetchall()
        attempts = {row["question_id"]: dict(row) for row in attempt_rows}
        diagnosis_row = conn.execute(
            """
            SELECT output_json FROM verbal_ai_runs
            WHERE session_id=? AND user_id=? AND kind='diagnosis' AND status='completed'
            ORDER BY created_at DESC LIMIT 1
            """,
            (session_id, user["user_id"]),
        ).fetchone()
        recent_messages = conn.execute(
            """
            SELECT role, content, question_id FROM verbal_ai_messages
            WHERE session_id=? AND user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 8
            """,
            (session_id, user["user_id"]),
        ).fetchall()

        question_context = None
        if selected_question:
            attempt = attempts.get(selected_question["id"])
            question_context = {
                "question_id": selected_question["id"],
                "question_no": selected_question["question_no"],
                "stem": selected_question["content"]["stem"],
                "prompt": selected_question["content"]["prompt"],
                "options": selected_question["content"]["options"],
                "user_answer": attempt["final_answer"] if attempt else None,
                "correct_answer": selected_question["answer"],
                "official_analysis": selected_question.get("official_analysis", ""),
                "peanut_notes": selected_question.get("peanut_notes", []),
                "learning_tags": selected_question.get("learning_tags", {}),
            }
        context = {
            "session": {
                "id": session_id,
                "set_id": session["set_id"],
                "score": session["score"],
                "question_count": session["question_count"],
            },
            "selected_question": question_context,
            "diagnosis": json.loads(diagnosis_row["output_json"]) if diagnosis_row else None,
            "recent_messages": [dict(message) for message in reversed(recent_messages)],
        }
        prompt = build_followup_prompt(context, content)
        run_id = uuid.uuid4().hex
        user_message_id = uuid.uuid4().hex
        now = _utc_now()
        conn.execute(
            """
            INSERT INTO verbal_ai_runs
                (id, session_id, user_id, kind, provider, model, skill_version,
                 skill_hash, status, started_at)
            VALUES (?, ?, ?, 'follow_up', 'deepseek', ?, ?, ?, 'running', ?)
            """,
            (run_id, session_id, user["user_id"], settings.model,
             prompt.skill_version, prompt.skill_hash, now),
        )
        conn.execute(
            """
            INSERT INTO verbal_ai_messages
                (id, session_id, user_id, question_id, role, content, run_id, created_at)
            VALUES (?, ?, ?, ?, 'user', ?, ?, ?)
            """,
            (user_message_id, session_id, user["user_id"], body.question_id, content, run_id, now),
        )
        conn.commit()

    wall_started = time.perf_counter()
    try:
        result = call_deepseek_text(
            settings,
            system_prompt=prompt.system_prompt,
            user_prompt=prompt.user_prompt,
        )
    except ProviderError as error:
        latency_ms = round((time.perf_counter() - wall_started) * 1000)
        with get_db() as conn:
            conn.execute(
                """UPDATE verbal_ai_runs SET status=?, finished_at=?, latency_ms=?, error_code=?
                   WHERE id=? AND user_id=?""",
                (error.status, _utc_now(), latency_ms, error.code, run_id, user["user_id"]),
            )
            conn.commit()
        raise HTTPException(
            status_code=504 if error.status == "timed_out" else 503,
            detail=error.code,
        ) from None

    assistant_message_id = uuid.uuid4().hex
    finished = _utc_now()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO verbal_ai_messages
                (id, session_id, user_id, question_id, role, content, run_id, created_at)
            VALUES (?, ?, ?, ?, 'assistant', ?, ?, ?)
            """,
            (assistant_message_id, session_id, user["user_id"], body.question_id,
             result.content, run_id, finished),
        )
        conn.execute(
            """
            UPDATE verbal_ai_runs SET status='completed', finished_at=?, latency_ms=?, usage_json=?
            WHERE id=? AND user_id=?
            """,
            (finished, result.latency_ms, json.dumps(result.usage, ensure_ascii=False),
             run_id, user["user_id"]),
        )
        conn.commit()
        session = _owned_session(conn, session_id, user["user_id"])
        return _serialize_session(conn, session)


@router.get("/sessions/{session_id}/recommendations")
def get_recommendations(session_id: str, user: dict = Depends(require_user)):
    with get_db() as conn:
        session = _owned_session(conn, session_id, user["user_id"])
        if session["status"] != "submitted":
            raise HTTPException(status_code=409, detail="Submit the practice session first")
        diagnosis_row = conn.execute(
            """
            SELECT output_json FROM verbal_ai_runs
            WHERE session_id=? AND user_id=? AND kind='diagnosis' AND status='completed'
            ORDER BY created_at DESC LIMIT 1
            """,
            (session_id, user["user_id"]),
        ).fetchone()
        if not diagnosis_row:
            raise HTTPException(status_code=409, detail="Generate diagnosis first")

        rows = conn.execute(
            """
            SELECT question_id, reason_tags_json, rank, score, status
            FROM verbal_training_recommendations
            WHERE session_id=? AND user_id=? ORDER BY rank
            """,
            (session_id, user["user_id"]),
        ).fetchall()
        if not rows:
            diagnosis = json.loads(diagnosis_row["output_json"])
            weakness = diagnosis.get("primary_weakness") or {}
            evidence_ids = weakness.get("evidence_question_ids") or [
                item["question_id"] for item in diagnosis.get("question_feedback", [])
            ]
            recommendations = recommend_original_questions(
                _load_bank(),
                current_set_id=session["set_id"],
                evidence_question_ids=evidence_ids,
                limit=5,
            )
            now = _utc_now()
            for rank, item in enumerate(recommendations, start=1):
                conn.execute(
                    """
                    INSERT OR IGNORE INTO verbal_training_recommendations
                        (session_id, user_id, question_id, reason_tags_json, rank, score, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (session_id, user["user_id"], item["question_id"],
                     json.dumps(item["reason_tags"], ensure_ascii=False), rank,
                     item["score"], now),
                )
            conn.commit()
            rows = conn.execute(
                """
                SELECT question_id, reason_tags_json, rank, score, status
                FROM verbal_training_recommendations
                WHERE session_id=? AND user_id=? ORDER BY rank
                """,
                (session_id, user["user_id"]),
            ).fetchall()

        question_index = {
            question["id"]: (set_id, question)
            for set_id, set_data in _load_bank().items()
            for question in set_data["questions"]
        }
        response = []
        for row in rows:
            match = question_index.get(row["question_id"])
            if not match:
                continue
            set_id, question = match
            reason_tags = json.loads(row["reason_tags_json"])
            response.append(
                {
                    "question_id": question["id"],
                    "set_id": set_id,
                    "set_label": _load_bank()[set_id]["meta"].get("label", set_id),
                    "question_no": question["question_no"],
                    "question_type": question.get("learning_tags", {}).get("question_type"),
                    "content": question["content"],
                    "reason_tags": reason_tags,
                    "reason": "同时匹配" + "、".join(reason_tags),
                    "rank": row["rank"],
                    "status": row["status"],
                }
            )
        return response
