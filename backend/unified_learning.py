"""Unified cross-module learning activity, issue, task, and timeline APIs.

Vertical modules remain the source of truth for answers, grading, vocabulary,
and geometry. This router provides a user-owned index for review and planning.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import require_user
from database import get_db


router = APIRouter(prefix="/api/learning", tags=["learning"])

MODULE_IDS = {
    "verbal.vocab",
    "verbal.logic_fill",
    "verbal.reading",
    "verbal.exam",
    "quantity.practice",
    "quantity.exam",
    "reasoning.planar",
    "reasoning.spatial",
    "shenlun.review",
    "planning.global",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json(value: dict[str, Any] | None) -> str:
    return json.dumps(value or {}, ensure_ascii=False, separators=(",", ":"))


def _parsed(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _module(module_id: str) -> str:
    if module_id not in MODULE_IDS:
        raise HTTPException(status_code=422, detail="Unsupported module_id")
    return module_id


def _owned(conn: sqlite3.Connection, table: str, row_id: str, user_id: int):
    allowed = {
        "learning_activities_v2",
        "learning_issues_v2",
        "learning_tasks_v2",
    }
    if table not in allowed:
        raise RuntimeError("invalid ownership table")
    row = conn.execute(
        f"SELECT * FROM {table} WHERE id=? AND user_id=?",  # nosec B608: allowlist above
        (row_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")
    return row


class ActivityCreate(BaseModel):
    module_id: str
    activity_type: str = Field(min_length=1, max_length=80)
    source_id: str | None = Field(default=None, max_length=200)
    started_at: str | None = None
    summary: dict[str, Any] = Field(default_factory=dict)


class ActivityUpdate(BaseModel):
    status: Literal["in_progress", "completed", "abandoned"] | None = None
    duration_ms: int | None = Field(default=None, ge=0)
    summary: dict[str, Any] | None = None


class IssueEvidenceIn(BaseModel):
    activity_id: str | None = None
    item_id: str | None = Field(default=None, max_length=200)
    evidence_type: str = Field(min_length=1, max_length=80)
    evidence: dict[str, Any] = Field(default_factory=dict)


class IssueUpsert(BaseModel):
    module_id: str
    issue_key: str = Field(min_length=1, max_length=120)
    user_facing_title: str = Field(min_length=1, max_length=200)
    internal_confidence: float | None = Field(default=None, ge=0, le=1)
    status: Literal["observing", "training", "improved", "archived"] = "observing"
    evidence: list[IssueEvidenceIn] = Field(default_factory=list, max_length=50)


class TaskCreate(BaseModel):
    module_id: str
    issue_id: str | None = None
    task_type: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=200)
    target_count: int = Field(default=0, ge=0, le=10000)


class TaskUpdate(BaseModel):
    status: Literal["pending", "in_progress", "completed", "dismissed"] | None = None
    result: dict[str, Any] | None = None


def _activity(row) -> dict[str, Any]:
    data = dict(row)
    data["summary"] = _parsed(data.pop("summary_json", None))
    return data


def _issue(row) -> dict[str, Any]:
    data = dict(row)
    data.pop("internal_confidence", None)
    return data


def _task(row) -> dict[str, Any]:
    data = dict(row)
    data["result"] = _parsed(data.pop("result_json", None))
    return data


@router.post("/activities", status_code=201)
def create_activity(body: ActivityCreate, user: dict = Depends(require_user)):
    activity_id = str(uuid.uuid4())
    now = _now()
    module_id = _module(body.module_id)
    with get_db() as conn:
        conn.execute(
            """INSERT INTO learning_activities_v2
               (id,user_id,module_id,activity_type,source_id,status,started_at,
                duration_ms,summary_json,created_at,updated_at)
               VALUES(?,?,?,?,?,'in_progress',?,0,?,?,?)""",
            (
                activity_id,
                user["user_id"],
                module_id,
                body.activity_type,
                body.source_id,
                body.started_at or now,
                _json(body.summary),
                now,
                now,
            ),
        )
        conn.commit()
        row = _owned(conn, "learning_activities_v2", activity_id, user["user_id"])
    return _activity(row)


@router.patch("/activities/{activity_id}")
def update_activity(
    activity_id: str, body: ActivityUpdate, user: dict = Depends(require_user)
):
    now = _now()
    with get_db() as conn:
        current = _owned(conn, "learning_activities_v2", activity_id, user["user_id"])
        status = body.status or current["status"]
        duration = body.duration_ms if body.duration_ms is not None else current["duration_ms"]
        summary = _json(body.summary) if body.summary is not None else current["summary_json"]
        completed_at = current["completed_at"]
        if status == "completed" and not completed_at:
            completed_at = now
        conn.execute(
            """UPDATE learning_activities_v2
               SET status=?,duration_ms=?,summary_json=?,completed_at=?,updated_at=?
               WHERE id=? AND user_id=?""",
            (status, duration, summary, completed_at, now, activity_id, user["user_id"]),
        )
        conn.commit()
        row = _owned(conn, "learning_activities_v2", activity_id, user["user_id"])
    return _activity(row)


@router.get("/activities")
def list_activities(
    module_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(require_user),
):
    query = "SELECT * FROM learning_activities_v2 WHERE user_id=?"
    params: list[Any] = [user["user_id"]]
    if module_id:
        query += " AND module_id=?"
        params.append(_module(module_id))
    query += " ORDER BY started_at DESC LIMIT ?"
    params.append(limit)
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [_activity(row) for row in rows]


@router.post("/issues", status_code=201)
def upsert_issue(body: IssueUpsert, user: dict = Depends(require_user)):
    module_id = _module(body.module_id)
    now = _now()
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM learning_issues_v2 WHERE user_id=? AND module_id=? AND issue_key=?",
            (user["user_id"], module_id, body.issue_key),
        ).fetchone()
        issue_id = existing["id"] if existing else str(uuid.uuid4())
        if existing:
            conn.execute(
                """UPDATE learning_issues_v2 SET user_facing_title=?,
                   internal_confidence=?,status=?,last_seen_at=?,updated_at=?
                   WHERE id=? AND user_id=?""",
                (
                    body.user_facing_title,
                    body.internal_confidence,
                    body.status,
                    now,
                    now,
                    issue_id,
                    user["user_id"],
                ),
            )
        else:
            conn.execute(
                """INSERT INTO learning_issues_v2
                   (id,user_id,module_id,issue_key,user_facing_title,internal_confidence,
                    evidence_count,status,first_seen_at,last_seen_at,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,0,?,?,?,?,?)""",
                (
                    issue_id,
                    user["user_id"],
                    module_id,
                    body.issue_key,
                    body.user_facing_title,
                    body.internal_confidence,
                    body.status,
                    now,
                    now,
                    now,
                    now,
                ),
            )
        for evidence in body.evidence:
            if evidence.activity_id:
                _owned(
                    conn,
                    "learning_activities_v2",
                    evidence.activity_id,
                    user["user_id"],
                )
            conn.execute(
                """INSERT INTO learning_issue_evidence_v2
                   (issue_id,user_id,activity_id,item_id,evidence_type,evidence_json)
                   VALUES(?,?,?,?,?,?)""",
                (
                    issue_id,
                    user["user_id"],
                    evidence.activity_id,
                    evidence.item_id,
                    evidence.evidence_type,
                    _json(evidence.evidence),
                ),
            )
        conn.execute(
            """UPDATE learning_issues_v2 SET evidence_count=(
                   SELECT COUNT(*) FROM learning_issue_evidence_v2
                   WHERE issue_id=? AND user_id=?
               ),last_seen_at=?,updated_at=? WHERE id=? AND user_id=?""",
            (issue_id, user["user_id"], now, now, issue_id, user["user_id"]),
        )
        conn.commit()
        row = _owned(conn, "learning_issues_v2", issue_id, user["user_id"])
    return _issue(row)


@router.get("/issues")
def list_issues(
    module_id: str | None = None,
    status: str | None = None,
    user: dict = Depends(require_user),
):
    query = "SELECT * FROM learning_issues_v2 WHERE user_id=?"
    params: list[Any] = [user["user_id"]]
    if module_id:
        query += " AND module_id=?"
        params.append(_module(module_id))
    if status:
        if status not in {"observing", "training", "improved", "archived"}:
            raise HTTPException(status_code=422, detail="Unsupported issue status")
        query += " AND status=?"
        params.append(status)
    query += " ORDER BY last_seen_at DESC"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [_issue(row) for row in rows]


@router.post("/tasks", status_code=201)
def create_task(body: TaskCreate, user: dict = Depends(require_user)):
    task_id = str(uuid.uuid4())
    module_id = _module(body.module_id)
    now = _now()
    with get_db() as conn:
        if body.issue_id:
            issue = _owned(conn, "learning_issues_v2", body.issue_id, user["user_id"])
            if issue["module_id"] != module_id:
                raise HTTPException(status_code=422, detail="Issue belongs to another module")
        conn.execute(
            """INSERT INTO learning_tasks_v2
               (id,user_id,module_id,issue_id,task_type,title,target_count,status,
                result_json,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,'pending','{}',?,?)""",
            (
                task_id,
                user["user_id"],
                module_id,
                body.issue_id,
                body.task_type,
                body.title,
                body.target_count,
                now,
                now,
            ),
        )
        conn.commit()
        row = _owned(conn, "learning_tasks_v2", task_id, user["user_id"])
    return _task(row)


@router.patch("/tasks/{task_id}")
def update_task(task_id: str, body: TaskUpdate, user: dict = Depends(require_user)):
    now = _now()
    with get_db() as conn:
        current = _owned(conn, "learning_tasks_v2", task_id, user["user_id"])
        status = body.status or current["status"]
        result = _json(body.result) if body.result is not None else current["result_json"]
        completed_at = current["completed_at"]
        if status == "completed" and not completed_at:
            completed_at = now
        conn.execute(
            """UPDATE learning_tasks_v2 SET status=?,result_json=?,completed_at=?,updated_at=?
               WHERE id=? AND user_id=?""",
            (status, result, completed_at, now, task_id, user["user_id"]),
        )
        conn.commit()
        row = _owned(conn, "learning_tasks_v2", task_id, user["user_id"])
    return _task(row)


@router.get("/tasks")
def list_tasks(
    module_id: str | None = None,
    status: str | None = None,
    user: dict = Depends(require_user),
):
    query = "SELECT * FROM learning_tasks_v2 WHERE user_id=?"
    params: list[Any] = [user["user_id"]]
    if module_id:
        query += " AND module_id=?"
        params.append(_module(module_id))
    if status:
        if status not in {"pending", "in_progress", "completed", "dismissed"}:
            raise HTTPException(status_code=422, detail="Unsupported task status")
        query += " AND status=?"
        params.append(status)
    query += " ORDER BY updated_at DESC"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [_task(row) for row in rows]


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


@router.get("/timeline")
def timeline(
    module_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(require_user),
):
    """Return unified activities plus readonly summaries from legacy vertical tables."""
    if module_id:
        _module(module_id)
    entries: list[dict[str, Any]] = []
    uid = user["user_id"]
    with get_db() as conn:
        activity_query = "SELECT * FROM learning_activities_v2 WHERE user_id=?"
        activity_params: list[Any] = [uid]
        if module_id:
            activity_query += " AND module_id=?"
            activity_params.append(module_id)
        activity_query += " ORDER BY started_at DESC LIMIT ?"
        activity_params.append(limit)
        rows = conn.execute(activity_query, activity_params).fetchall()
        for row in rows:
            item = _activity(row)
            item["source"] = "unified"
            entries.append(item)
        unified_sources = {
            (item["module_id"], str(item.get("source_id") or ""))
            for item in entries
            if item.get("source_id") is not None
        }

        if (not module_id or module_id == "verbal.reading") and _table_exists(
            conn, "verbal_practice_sessions"
        ):
            for row in conn.execute(
                """SELECT id,set_id,status,started_at,submitted_at,elapsed_ms,score,question_count
                   FROM verbal_practice_sessions WHERE user_id=? ORDER BY started_at DESC LIMIT ?""",
                (uid, limit),
            ).fetchall():
                if ("verbal.reading", str(row["set_id"])) in unified_sources:
                    continue
                entries.append(
                    {
                        "id": row["id"],
                        "module_id": "verbal.reading",
                        "activity_type": "practice_set",
                        "source_id": row["set_id"],
                        "status": "completed" if row["status"] == "submitted" else "in_progress",
                        "started_at": row["started_at"],
                        "completed_at": row["submitted_at"],
                        "duration_ms": row["elapsed_ms"],
                        "summary": {"score": row["score"], "total": row["question_count"]},
                        "source": "verbal_practice_sessions",
                    }
                )

        if (not module_id or module_id == "shenlun.review") and _table_exists(
            conn, "shenlun_history"
        ):
            for row in conn.execute(
                """SELECT id,question_id,question_title,question_type,word_count,
                          grading_result,created_at
                   FROM shenlun_history WHERE user_id=? ORDER BY created_at DESC LIMIT ?""",
                (uid, limit),
            ).fetchall():
                if ("shenlun.review", str(row["id"])) in unified_sources:
                    continue
                grading_payload = _parsed(row["grading_result"])
                # The historical table also contains ordinary teacher chat.
                # Only real grading attempts belong in learning evidence.
                if grading_payload.get("recordType") != "grading" and not grading_payload.get("dimensions"):
                    continue
                entries.append(
                    {
                        "id": row["id"],
                        "module_id": "shenlun.review",
                        "activity_type": "grading",
                        "source_id": row["question_id"],
                        "status": "completed",
                        "started_at": row["created_at"],
                        "completed_at": row["created_at"],
                        "duration_ms": 0,
                        "summary": {
                            "title": row["question_title"],
                            "type": row["question_type"],
                            "word_count": row["word_count"],
                            "dimensions": grading_payload.get("dimensions", {}),
                            "run_metadata": grading_payload.get("runMetadata", {}),
                        },
                        "source": "shenlun_history",
                    }
                )

        if (not module_id or module_id == "reasoning.planar") and _table_exists(
            conn, "questions"
        ):
            for row in conn.execute(
                """SELECT id,node_path,title,created_at FROM questions
                   WHERE user_id=? ORDER BY created_at DESC LIMIT ?""",
                (str(uid), limit),
            ).fetchall():
                if ("reasoning.planar", str(row["id"])) in unified_sources:
                    continue
                entries.append(
                    {
                        "id": str(row["id"]),
                        "module_id": "reasoning.planar",
                        "activity_type": "mistake_saved",
                        "source_id": str(row["id"]),
                        "status": "completed",
                        "started_at": row["created_at"],
                        "completed_at": row["created_at"],
                        "duration_ms": 0,
                        "summary": {"node_path": row["node_path"], "title": row["title"]},
                        "source": "questions",
                    }
                )

    entries.sort(key=lambda entry: entry.get("started_at") or "", reverse=True)
    return entries[:limit]
