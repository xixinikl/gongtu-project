"""JWT-owned learning records for the four-stage spatial reasoning path."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from auth import require_user
from database import get_db

router = APIRouter(prefix="/api/spatial-learning", tags=["spatial-learning"])
STAGES = {"foundation", "three-view", "free-cut", "csg"}
EXPERIMENT_KINDS = {"visit", "task"}
THREE_VIEW_BANK = Path(__file__).resolve().parents[1] / "data/three-view-cases/black-white-blocks-50.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_spatial_learning_schema() -> None:
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS spatial_learning_records (
          id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, stage_id TEXT NOT NULL,
          activity_kind TEXT NOT NULL, source_id TEXT, status TEXT NOT NULL,
          score INTEGER, total INTEGER, duration_ms INTEGER NOT NULL DEFAULT 0,
          last_position TEXT, detail_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_spatial_owner_stage
          ON spatial_learning_records(user_id, stage_id, updated_at DESC);
        """)
        conn.commit()


class SpatialRecordIn(BaseModel):
    stage_id: str
    activity_kind: Literal["visit", "task", "three_view_group"]
    source_id: str | None = Field(default=None, max_length=200)
    status: Literal["in_progress", "completed"] = "completed"
    score: int | None = Field(default=None, ge=0)
    total: int | None = Field(default=None, ge=1)
    duration_ms: int = Field(default=0, ge=0)
    last_position: str | None = Field(default=None, max_length=300)
    detail: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_semantics(self):
        if self.stage_id not in STAGES:
            raise ValueError("unsupported spatial stage")
        if self.activity_kind == "three_view_group":
            if self.stage_id != "three-view" or self.score is None or self.total is None:
                raise ValueError("three-view groups require score and total")
            if self.score > self.total:
                raise ValueError("score cannot exceed total")
        elif self.score is not None or self.total is not None:
            raise ValueError("experiments and visits cannot report a score")
        return self


def _record(row) -> dict[str, Any]:
    item = dict(row)
    try:
        item["detail"] = json.loads(item.pop("detail_json"))
    except (TypeError, json.JSONDecodeError):
        item["detail"] = {}
    return item


def _grade_three_view(body: SpatialRecordIn) -> tuple[int, int]:
    try:
        bank = json.loads(THREE_VIEW_BANK.read_text(encoding="utf-8"))
        answers = {item["id"]: item["answer"] for item in bank["cases"]}
        groups = {item["id"]: set(item["caseIds"]) for item in bank["groups"]}
        submitted = body.detail["answers"]
        expected_cases = groups[body.source_id]
        if (not isinstance(submitted, list) or len(submitted) != body.total
                or body.total != len(expected_cases)):
            raise ValueError
        seen: set[str] = set()
        score = 0
        for item in submitted:
            case_id, selected = item["caseId"], item["selected"]
            if case_id in seen or case_id not in answers:
                raise ValueError
            seen.add(case_id)
            score += selected == answers[case_id]
        if seen != expected_cases:
            raise ValueError
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=422, detail="Invalid three-view answer evidence")
    if score != body.score:
        raise HTTPException(status_code=422, detail="Three-view score does not match server grading")
    return score, len(submitted)


@router.post("/records", status_code=201)
def create_record(body: SpatialRecordIn, user: dict = Depends(require_user)):
    ensure_spatial_learning_schema()
    if body.activity_kind == "three_view_group":
        _grade_three_view(body)
    record_id, now = str(uuid.uuid4()), _now()
    summary: dict[str, Any] = {
        "stage_id": body.stage_id,
        "activity_kind": body.activity_kind,
        "last_position": body.last_position,
    }
    if body.activity_kind == "three_view_group":
        summary.update({"score": body.score, "total": body.total})
    with get_db() as conn:
        conn.execute(
            """INSERT INTO spatial_learning_records
               (id,user_id,stage_id,activity_kind,source_id,status,score,total,
                duration_ms,last_position,detail_json,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (record_id, user["user_id"], body.stage_id, body.activity_kind,
             body.source_id, body.status, body.score, body.total, body.duration_ms,
             body.last_position, json.dumps(body.detail, ensure_ascii=False), now, now),
        )
        activity_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO learning_activities_v2
               (id,user_id,module_id,activity_type,source_id,status,started_at,
                completed_at,duration_ms,summary_json,created_at,updated_at)
               VALUES(?,?,'reasoning.spatial',?,?,?,?,?,?,?,?,?)""",
            (activity_id, user["user_id"], body.activity_kind,
             body.source_id or record_id, body.status, now,
             now if body.status == "completed" else None, body.duration_ms,
             json.dumps(summary, ensure_ascii=False), now, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM spatial_learning_records WHERE id=? AND user_id=?",
            (record_id, user["user_id"]),
        ).fetchone()
    return _record(row)


@router.get("/records")
def list_records(user: dict = Depends(require_user)):
    ensure_spatial_learning_schema()
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM spatial_learning_records WHERE user_id=? ORDER BY updated_at DESC",
            (user["user_id"],),
        ).fetchall()
    return [_record(row) for row in rows]


@router.get("/overview")
def overview(user: dict = Depends(require_user)):
    records = list_records(user)
    latest: dict[str, dict[str, Any]] = {}
    for item in records:
        latest.setdefault(item["stage_id"], item)
    return {"completed_count": sum(v["status"] == "completed" for v in latest.values()),
            "stages": latest, "last": records[0] if records else None}
