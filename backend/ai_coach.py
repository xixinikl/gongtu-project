"""Persistent, user-owned AI coach with server-resolved learning evidence."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from auth import require_user
from ai_skill_registry import SkillRegistryError, registry_status, resolve_skill
from database import get_db
from quantity import _bank_or_unavailable as _quantity_bank_or_unavailable
from verbal_catalog import _logic_by_id
from verbal_reading import _bank_or_unavailable as _verbal_reading_bank_or_unavailable
from verbal_reading_ai_config import load_verbal_ai_settings
from verbal_reading_provider import ProviderError, call_deepseek_json

router = APIRouter(prefix="/api/ai-coach", tags=["ai-coach"])
MODULES = {
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
SKILL_ROUTE = {
    "verbal.reading": ("verbal.reading", "follow_up"),
    "verbal.logic_fill": ("verbal.logic_fill", "method_chat"),
    "quantity.practice": ("quantity.practice", "method_chat"),
    "quantity.exam": ("quantity.practice", "method_chat"),
    "reasoning.planar": ("reasoning.planar", "method_chat"),
    "reasoning.spatial": ("reasoning.spatial", "method_chat"),
    "shenlun.review": ("shenlun.review", "method_chat"),
    "planning.global": ("planning.global", "planning"),
}
MODULE_LABELS = {
    "verbal.reading": ("片段阅读", "结合真实作答证据讲题与复盘"),
    "verbal.logic_fill": ("逻辑填空", "分析语境、词义和选项关系"),
    "quantity.practice": ("数量关系", "分析题型、步骤卡点和用时"),
    "quantity.exam": ("数量套题", "复盘套题策略和步骤卡点"),
    "reasoning.planar": ("平面图推", "围绕规律节点复习错题"),
    "reasoning.spatial": ("立体图推", "结合空间模型与训练记录解释"),
    "shenlun.review": ("申论批改", "区分原答事实与AI批改建议"),
    "planning.global": ("综合规划", "按跨模块证据安排下一步"),
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _parsed(value: str | None) -> Any:
    try:
        return json.loads(value or "{}")
    except json.JSONDecodeError:
        return {}


def ensure_ai_coach_schema() -> None:
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS ai_coach_threads (
          id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, module_id TEXT NOT NULL,
          activity_id TEXT, title TEXT NOT NULL, context_json TEXT NOT NULL,
          return_url TEXT NOT NULL DEFAULT '/app', client_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ai_threads_owner ON ai_coach_threads(user_id,updated_at DESC);
        CREATE TABLE IF NOT EXISTS ai_coach_messages (
          id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, user_id INTEGER NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
          run_id TEXT, client_message_id TEXT, finalized_at TEXT, created_at TEXT NOT NULL,
          FOREIGN KEY(thread_id) REFERENCES ai_coach_threads(id) ON DELETE CASCADE,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ai_messages_thread ON ai_coach_messages(user_id,thread_id,created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_messages_client_id
          ON ai_coach_messages(user_id,thread_id,client_message_id) WHERE client_message_id IS NOT NULL;
        CREATE TABLE IF NOT EXISTS ai_coach_runs (
          id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, user_id INTEGER NOT NULL,
          provider TEXT NOT NULL, model TEXT NOT NULL, skill_version TEXT NOT NULL,
          skill_hash TEXT NOT NULL, status TEXT NOT NULL, error_code TEXT,
          skill_id TEXT,package_hash TEXT,bundle_hash TEXT,context_hash TEXT,
          registry_version TEXT,user_message_id TEXT,output_json TEXT,
          usage_json TEXT, latency_ms INTEGER, created_at TEXT NOT NULL, finished_at TEXT,
          FOREIGN KEY(thread_id) REFERENCES ai_coach_threads(id) ON DELETE CASCADE,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS ai_coach_issue_proposals (
          id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,user_id INTEGER NOT NULL,module_id TEXT NOT NULL,
          assistant_message_id TEXT NOT NULL,issue_key TEXT NOT NULL,title TEXT NOT NULL,summary TEXT NOT NULL,
          evidence_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'proposed',saved_issue_id TEXT,
          created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
          FOREIGN KEY(thread_id) REFERENCES ai_coach_threads(id) ON DELETE CASCADE,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)
        for table, columns in {
            "ai_coach_runs": (
                "skill_id",
                "package_hash",
                "bundle_hash",
                "context_hash",
                "registry_version",
                "user_message_id",
                "output_json",
            ),
            "ai_coach_messages": ("client_message_id",),
            "ai_coach_threads": ("return_url", "client_json"),
        }.items():
            existing = {
                row["name"] for row in conn.execute(f"PRAGMA table_info({table})")
            }  # nosec B608
            for name in columns:
                if name in existing:
                    continue
                definition = (
                    "TEXT NOT NULL DEFAULT '/app'"
                    if name == "return_url"
                    else (
                        "TEXT NOT NULL DEFAULT '{}'"
                        if name == "client_json"
                        else "TEXT"
                    )
                )
                conn.execute(
                    f"ALTER TABLE {table} ADD COLUMN {name} {definition}"
                )  # nosec B608: constants
        conn.execute("""CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_messages_client_id
                        ON ai_coach_messages(user_id,thread_id,client_message_id)
                        WHERE client_message_id IS NOT NULL""")
        conn.commit()


def _owned(conn, table: str, row_id: str, uid: int):
    if table not in {
        "ai_coach_threads",
        "ai_coach_messages",
        "ai_coach_runs",
        "ai_coach_issue_proposals",
    }:
        raise RuntimeError("invalid ownership table")
    row = conn.execute(
        f"SELECT * FROM {table} WHERE id=? AND user_id=?",  # nosec B608 -- table is allowlisted above
        (row_id, uid),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")
    return row


def _activity(conn, activity_id: str, uid: int):
    return conn.execute(
        "SELECT * FROM learning_activities_v2 WHERE id=? AND user_id=?",
        (activity_id, uid),
    ).fetchone()


def _table_exists(conn, table: str) -> bool:
    return (
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
        is not None
    )


def _planning_context(conn, uid: int) -> dict:
    """Build cross-module facts from JWT-owned vertical tables, not client summaries."""
    evidence: list[dict[str, Any]] = []
    queries = (
        (
            "verbal.reading",
            "verbal_practice_sessions",
            "SELECT COUNT(*) total, COALESCE(SUM(score),0) score, COALESCE(SUM(question_count),0) items, COALESCE(SUM(elapsed_ms),0) duration_ms FROM verbal_practice_sessions WHERE user_id=? AND status='submitted'",
        ),
        (
            "verbal.logic_fill",
            "verbal_logic_attempts_v2",
            "SELECT COUNT(*) total, COALESCE(SUM(is_correct),0) score, COUNT(*) items, COALESCE(SUM(elapsed_ms),0) duration_ms FROM verbal_logic_attempts_v2 WHERE user_id=?",
        ),
        (
            "quantity.practice",
            "quantity_practice_sessions",
            "SELECT COUNT(*) total, COALESCE(SUM(score),0) score, COALESCE(SUM(question_count),0) items, COALESCE(SUM(elapsed_ms),0) duration_ms FROM quantity_practice_sessions WHERE user_id=? AND status='submitted'",
        ),
        (
            "reasoning.spatial",
            "spatial_learning_records",
            "SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN activity_kind='three_view_group' THEN score ELSE 0 END),0) score, COALESCE(SUM(CASE WHEN activity_kind='three_view_group' THEN total ELSE 0 END),0) items, COALESCE(SUM(duration_ms),0) duration_ms FROM spatial_learning_records WHERE user_id=? AND status='completed'",
        ),
    )
    for module_id, table, query in queries:
        if not _table_exists(conn, table):
            continue
        row = conn.execute(query, (uid,)).fetchone()
        if row and row["total"]:
            evidence.append(
                {
                    "module_id": module_id,
                    "completed_activities": row["total"],
                    "correct_or_score": row["score"],
                    "scored_items": row["items"],
                    "duration_ms": row["duration_ms"],
                    "source_table": table,
                    "owner_verified": True,
                }
            )
    if _table_exists(conn, "shenlun_history"):
        rows = conn.execute(
            "SELECT grading_result FROM shenlun_history WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
            (uid,),
        ).fetchall()
        grading_count = sum(
            1
            for row in rows
            if _parsed(row["grading_result"]).get("recordType") == "grading"
        )
        if grading_count:
            evidence.append(
                {
                    "module_id": "shenlun.review",
                    "completed_activities": grading_count,
                    "source_table": "shenlun_history",
                    "owner_verified": True,
                    "assessment_provenance": "ai_grading",
                }
            )
    return {
        "schema_version": 1,
        "module_id": "planning.global",
        "evidence": evidence,
        "provenance": [
            {"table": item["source_table"], "owner_verified": True} for item in evidence
        ],
        "insufficient_evidence": not bool(evidence),
    }


def _resolve_context(
    conn, *, uid: int, activity_id: str | None, requested_module: str
) -> dict:
    """Resolve facts from owned vertical rows; never trust client-provided facts."""
    if requested_module not in MODULES:
        raise HTTPException(status_code=422, detail="Unsupported module")
    if not activity_id:
        if requested_module == "planning.global":
            return _planning_context(conn, uid)
        # Standalone questions are a first-class entry. They may receive method
        # guidance, but cannot create objective weakness evidence.
        return {
            "schema_version": 1,
            "module_id": requested_module,
            "scope": "standalone_method_question",
            "evidence": [],
            "provenance": [],
            "insufficient_evidence": True,
        }

    if requested_module == "verbal.logic_fill" and activity_id.startswith(
        "logic-question:"
    ):
        question_id = activity_id.removeprefix("logic-question:")
        question = _logic_by_id().get(question_id)
        if not question:
            raise HTTPException(status_code=404, detail="Logic question not found")
        attempt = conn.execute(
            """SELECT * FROM verbal_logic_attempts_v2
                 WHERE user_id=? AND question_id=?
                 ORDER BY created_at DESC,id DESC LIMIT 1""",
            (uid, question_id),
        ).fetchone()
        evidence = {
            "item_id": question_id,
            "question_stem": question["stem"],
            "options": question["options"],
            "related_terms": question.get("related_terms", []),
        }
        provenance = [
            {
                "table": "data/verbal_catalog/logic_fill_231.json",
                "row_id": question_id,
                "owner_verified": True,
            }
        ]
        if attempt:
            evidence.update(
                {
                    "user_answer": attempt["selected_answer"],
                    "correct_answer": attempt["correct_answer"],
                    "is_correct": bool(attempt["is_correct"]),
                    "elapsed_ms": attempt["elapsed_ms"],
                }
            )
            provenance.append(
                {
                    "table": "verbal_logic_attempts_v2",
                    "row_id": attempt["id"],
                    "owner_verified": True,
                }
            )
        return {
            "schema_version": 1,
            "activity_id": activity_id,
            "module_id": requested_module,
            "scope": "server_resolved_question",
            "activity": {"type": "question_view", "status": "in_progress"},
            "evidence": [evidence],
            "answers_revealed": bool(attempt),
            "provenance": provenance,
        }

    if requested_module == "verbal.reading" and activity_id.startswith(
        "reading-question:"
    ):
        ref = activity_id.removeprefix("reading-question:")
        session_id, separator, question_id = ref.partition(":")
        if not separator or not session_id or not question_id:
            raise HTTPException(status_code=422, detail="Invalid reading question context")
        session = conn.execute(
            "SELECT * FROM verbal_practice_sessions WHERE id=? AND user_id=?",
            (session_id, uid),
        ).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Reading session not found")
        set_data = _verbal_reading_bank_or_unavailable().get(session["set_id"])
        question = set_data and set_data["by_id"].get(question_id)
        if not question:
            raise HTTPException(status_code=404, detail="Reading question not found")
        attempt = conn.execute(
            "SELECT * FROM verbal_attempt_items WHERE session_id=? AND question_id=?",
            (session_id, question_id),
        ).fetchone()
        submitted = session["status"] == "submitted"
        content = question.get("content") or {}
        evidence = {
            "item_id": question_id,
            "question_stem": content.get("stem", ""),
            "question_prompt": content.get("prompt", ""),
            "options": content.get("options", []),
            "question_type": question.get("learning_tags", {}).get("question_type"),
            "method_tags": question.get("learning_tags", {}).get("method_tags", []),
            "peanut_notes": question.get("peanut_notes", []),
        }
        provenance = [
            {
                "table": "data/verbal_reading",
                "row_id": question_id,
                "owner_verified": True,
            }
        ]
        if attempt:
            evidence.update(
                {
                    "user_answer": attempt["final_answer"],
                    "elapsed_ms": attempt["elapsed_ms"],
                    "change_count": attempt["change_count"],
                }
            )
            provenance.append(
                {
                    "table": "verbal_attempt_items",
                    "row_id": f"{session_id}:{question_id}",
                    "owner_verified": True,
                }
            )
        if submitted:
            evidence.update(
                {
                    "correct_answer": question["answer"],
                    "is_correct": bool(attempt and attempt["is_correct"]),
                    "official_analysis": question.get("official_analysis", ""),
                }
            )
        return {
            "schema_version": 1,
            "activity_id": activity_id,
            "module_id": requested_module,
            "scope": "server_resolved_question",
            "activity": {"type": "question_view", "status": session["status"]},
            "evidence": [evidence],
            "answers_revealed": submitted,
            "provenance": provenance,
        }

    if requested_module == "quantity.exam" and activity_id.startswith(
        "quantity-question:"
    ):
        ref = activity_id.removeprefix("quantity-question:")
        session_id, separator, question_id = ref.partition(":")
        if not separator or not session_id or not question_id:
            raise HTTPException(status_code=422, detail="Invalid quantity question context")
        session = conn.execute(
            "SELECT * FROM quantity_practice_sessions WHERE id=? AND user_id=?",
            (session_id, uid),
        ).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Quantity session not found")
        question = _quantity_bank_or_unavailable()["by_id"].get(question_id)
        if not question or question["set_no"] != session["set_no"]:
            raise HTTPException(status_code=404, detail="Quantity question not found")
        attempt = conn.execute(
            "SELECT * FROM quantity_attempt_items WHERE session_id=? AND question_id=?",
            (session_id, question_id),
        ).fetchone()
        submitted = session["status"] == "submitted"
        tags = question.get("tags", {})
        evidence = {
            "item_id": question_id,
            "question_stem": question["stem"],
            "options": question["options"],
            "topic": tags.get("primary_topic"),
            "methods": tags.get("methods", []),
            "decision_label": tags.get("exam_decision"),
            "weak_steps": tags.get("weak_steps", []),
        }
        provenance = [
            {
                "table": "data/quantity_bank/approved_seed.json",
                "row_id": question_id,
                "owner_verified": True,
            }
        ]
        if attempt:
            evidence.update(
                {
                    "user_answer": attempt["final_answer"],
                    "elapsed_ms": attempt["elapsed_ms"],
                    "skipped": bool(attempt["is_skipped"]),
                    "change_count": attempt["change_count"],
                    "stuck_step": attempt["stuck_step"],
                }
            )
            provenance.append(
                {
                    "table": "quantity_attempt_items",
                    "row_id": f"{session_id}:{question_id}",
                    "owner_verified": True,
                }
            )
        if submitted:
            evidence.update(
                {
                    "correct_answer": question["answer"],
                    "is_correct": bool(attempt and attempt["is_correct"]),
                    "official_analysis": question.get("analysis", ""),
                }
            )
        return {
            "schema_version": 1,
            "activity_id": activity_id,
            "module_id": requested_module,
            "scope": "server_resolved_question",
            "activity": {"type": "question_view", "status": session["status"]},
            "evidence": [evidence],
            "answers_revealed": submitted,
            "provenance": provenance,
        }

    activity = _activity(conn, activity_id, uid)
    # Reading sessions predate unified activity writes; their server-owned session id is canonical.
    if not activity and requested_module == "verbal.reading":
        session = conn.execute(
            "SELECT * FROM verbal_practice_sessions WHERE id=? AND user_id=?",
            (activity_id, uid),
        ).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Activity not found")
        return _reading_context(conn, session, uid)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    module = activity["module_id"]
    if module != requested_module:
        raise HTTPException(status_code=422, detail="Activity module mismatch")
    source = str(activity["source_id"] or "")
    base = {
        "schema_version": 1,
        "activity_id": activity["id"],
        "module_id": module,
        "activity": {
            "type": activity["activity_type"],
            "status": activity["status"],
            "duration_ms": activity["duration_ms"],
            "started_at": activity["started_at"],
        },
    }
    if module in {"quantity.practice", "quantity.exam"}:
        if activity["activity_type"] == "single_diagnosis":
            single = conn.execute(
                "SELECT * FROM quantity_single_sessions WHERE id=? AND user_id=?",
                (source, uid),
            ).fetchone()
            if not single:
                raise HTTPException(409, detail="Stale quantity single reference")
            question = _quantity_bank_or_unavailable()["by_id"].get(
                single["question_id"]
            )
            if not question:
                raise HTTPException(409, detail="Stale quantity question reference")
            submitted = single["status"] == "submitted"
            item = {
                "item_id": single["question_id"],
                "question_stem": question["stem"],
                "options": question["options"],
                "topic": single["topic"],
                "methods": question.get("tags", {}).get("methods", []),
                "user_answer": single["final_answer"],
                "elapsed_ms": single["elapsed_ms"],
                "stuck_step": single["stuck_step"],
                "work_note": single["work_note"],
            }
            if submitted:
                item.update(
                    {
                        "correct_answer": question["answer"],
                        "is_correct": bool(single["is_correct"]),
                        "official_analysis": question.get("analysis", ""),
                    }
                )
            base.update(
                {
                    "scope": "server_resolved_question",
                    "evidence": [item],
                    "provenance": [
                        {
                            "table": "quantity_single_sessions",
                            "row_id": source,
                            "owner_verified": True,
                        }
                    ],
                    "answers_revealed": submitted,
                }
            )
            return base
        session = conn.execute(
            "SELECT * FROM quantity_practice_sessions WHERE id=? AND user_id=?",
            (source, uid),
        ).fetchone()
        if not session:
            raise HTTPException(409, detail="Stale activity reference")
        attempts = conn.execute(
            "SELECT * FROM quantity_attempt_items WHERE session_id=? ORDER BY question_id",
            (source,),
        ).fetchall()
        submitted = session["status"] == "submitted"
        evidence = []
        for row in attempts:
            item = {
                "item_id": row["question_id"],
                "user_answer": row["final_answer"],
                "elapsed_ms": row["elapsed_ms"],
                "skipped": bool(row["is_skipped"]),
                "change_count": row["change_count"],
                "stuck_step": row["stuck_step"],
            }
            if submitted:
                item.update(
                    {
                        "correct_answer": row["correct_answer"],
                        "is_correct": bool(row["is_correct"]),
                    }
                )
            evidence.append(item)
        base.update(
            {
                "evidence": evidence,
                "provenance": [
                    {
                        "table": "quantity_practice_sessions",
                        "row_id": source,
                        "owner_verified": True,
                    }
                ],
                "answers_revealed": submitted,
            }
        )
    elif module == "verbal.logic_fill":
        row = conn.execute(
            """SELECT * FROM verbal_logic_attempts_v2 WHERE user_id=? AND question_id=? AND created_at=?""",
            (uid, source, activity["started_at"]),
        ).fetchone()
        if not row:
            raise HTTPException(
                409, detail="Ambiguous or stale logic attempt reference"
            )
        base.update(
            {
                "evidence": [
                    {
                        "item_id": row["question_id"],
                        "user_answer": row["selected_answer"],
                        "correct_answer": row["correct_answer"],
                        "is_correct": bool(row["is_correct"]),
                        "elapsed_ms": row["elapsed_ms"],
                        "official_analysis": "missing",
                    }
                ],
                "provenance": [
                    {
                        "table": "verbal_logic_attempts_v2",
                        "row_id": row["id"],
                        "owner_verified": True,
                    }
                ],
            }
        )
    elif module == "reasoning.planar":
        row = conn.execute(
            "SELECT * FROM questions WHERE id=? AND user_id=?", (source, str(uid))
        ).fetchone()
        if not row:
            raise HTTPException(409, detail="Stale planar reference")
        base.update(
            {
                "evidence": [
                    {
                        "item_id": str(row["id"]),
                        "node_path": row["node_path"],
                        "title": row["title"],
                        "notes": row["notes"],
                        "correct_answer": row["correct_answer"],
                        "answer_provenance": "user_supplied",
                    }
                ],
                "provenance": [
                    {
                        "table": "questions",
                        "row_id": str(row["id"]),
                        "owner_verified": True,
                    }
                ],
            }
        )
    elif module == "reasoning.spatial":
        row = conn.execute(
            """SELECT * FROM spatial_learning_records WHERE user_id=? AND source_id=? AND created_at=?""",
            (uid, source, activity["started_at"]),
        ).fetchone()
        if not row:
            raise HTTPException(409, detail="Ambiguous or stale spatial reference")
        item = {
            "stage_id": row["stage_id"],
            "activity_kind": row["activity_kind"],
            "duration_ms": row["duration_ms"],
            "last_position": row["last_position"],
        }
        if row["activity_kind"] == "three_view_group":
            item.update(
                {
                    "score": row["score"],
                    "total": row["total"],
                    "detail": _parsed(row["detail_json"]),
                }
            )
        base.update(
            {
                "evidence": [item],
                "provenance": [
                    {
                        "table": "spatial_learning_records",
                        "row_id": row["id"],
                        "owner_verified": True,
                    }
                ],
            }
        )
    elif module == "shenlun.review":
        row = conn.execute(
            "SELECT * FROM shenlun_history WHERE id=? AND user_id=?", (source, uid)
        ).fetchone()
        if not row:
            raise HTTPException(409, detail="Stale shenlun reference")
        grading = _parsed(row["grading_result"])
        if grading.get("recordType") != "grading":
            raise HTTPException(422, detail="Chat history is not grading evidence")
        base.update(
            {
                "evidence": [
                    {
                        "item_id": row["question_id"],
                        "question_type": row["question_type"],
                        "student_answer": row["student_answer"],
                        "word_count": row["word_count"],
                        "dimensions": grading.get("dimensions", {}),
                        "run_metadata": grading.get("runMetadata", {}),
                        "assessment_provenance": "ai_grading",
                    }
                ],
                "provenance": [
                    {
                        "table": "shenlun_history",
                        "row_id": source,
                        "owner_verified": True,
                    }
                ],
            }
        )
    else:
        raise HTTPException(
            status_code=422, detail="Module context resolver is not available"
        )
    return base


def _reading_context(conn, session, uid: int) -> dict:
    attempts = conn.execute(
        "SELECT * FROM verbal_attempt_items WHERE session_id=? ORDER BY question_id",
        (session["id"],),
    ).fetchall()
    submitted = session["status"] == "submitted"
    evidence = []
    for row in attempts:
        item = {
            "item_id": row["question_id"],
            "user_answer": row["final_answer"],
            "elapsed_ms": row["elapsed_ms"],
            "change_count": row["change_count"],
        }
        if submitted:
            item.update(
                {
                    "correct_answer": row["correct_answer"],
                    "is_correct": bool(row["is_correct"]),
                }
            )
        evidence.append(item)
    return {
        "schema_version": 1,
        "activity_id": session["id"],
        "module_id": "verbal.reading",
        "activity": {
            "type": "practice_set",
            "status": session["status"],
            "duration_ms": session["elapsed_ms"],
        },
        "evidence": evidence,
        "answers_revealed": submitted,
        "provenance": [
            {
                "table": "verbal_practice_sessions",
                "row_id": session["id"],
                "owner_verified": True,
            }
        ],
    }


class ContextRef(BaseModel):
    kind: Literal["activity", "session"]
    id: str = Field(min_length=1, max_length=200, pattern=r"^[A-Za-z0-9:_-]+$")


class ThreadIn(BaseModel):
    module_id: str
    activity_id: str | None = Field(default=None, max_length=200)
    context_ref: ContextRef | None = None
    return_url: str = "/app"
    client: dict[str, Any] = Field(default_factory=dict)
    title: str = Field(default="新对话", min_length=1, max_length=120)

    @field_validator("return_url")
    @classmethod
    def safe_return(cls, value: str) -> str:
        return value if value.startswith("/") and not value.startswith("//") else "/app"


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=6000)
    client_message_id: str = Field(
        min_length=8, max_length=100, pattern=r"^[A-Za-z0-9:_-]+$"
    )


class FinalizeIn(BaseModel):
    assistant_message_id: str
    task_title: str = Field(min_length=1, max_length=200)
    target_count: int = Field(default=0, ge=0, le=1000)


def _bundle(module: str):
    route = SKILL_ROUTE.get(module)
    if not route:
        raise HTTPException(
            status_code=422, detail="Skill is not available for this module"
        )
    try:
        return resolve_skill(*route)
    except SkillRegistryError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


def _valid_schema_value(value: Any, schema: dict[str, Any]) -> bool:
    expected = schema.get("type")
    allowed = expected if isinstance(expected, list) else [expected] if expected else []
    if allowed:
        checks = {
            "object": isinstance(value, dict),
            "array": isinstance(value, list),
            "string": isinstance(value, str),
            "integer": isinstance(value, int) and not isinstance(value, bool),
            "number": isinstance(value, (int, float)) and not isinstance(value, bool),
            "boolean": isinstance(value, bool),
            "null": value is None,
        }
        if not any(checks.get(kind, False) for kind in allowed):
            return False
    if "enum" in schema and value not in schema["enum"]:
        return False
    if isinstance(value, str):
        minimum = schema.get("minLength")
        if isinstance(minimum, int) and len(value.strip()) < minimum:
            return False
    if isinstance(value, dict):
        required = schema.get("required", [])
        if any(key not in value for key in required):
            return False
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False and any(
            key not in properties for key in value
        ):
            return False
        return all(
            key not in properties or _valid_schema_value(item, properties[key])
            for key, item in value.items()
        )
    if isinstance(value, list) and isinstance(schema.get("items"), dict):
        return all(_valid_schema_value(item, schema["items"]) for item in value)
    return True


def _display_output(output: dict[str, Any]) -> str:
    if isinstance(output.get("answer"), str) and output["answer"].strip():
        return output["answer"].strip()
    if output.get("status") == "insufficient_evidence":
        limitations = output.get("limitations") or []
        return "当前学习证据还不足，暂时不能判断稳定弱项。" + (
            "\n" + "\n".join(f"- {item}" for item in limitations) if limitations else ""
        )
    parts = []
    if output.get("evidence_summary"):
        parts.append(
            "学习证据：\n"
            + "\n".join(f"- {item}" for item in output["evidence_summary"])
        )
    for label, key in (("优先任务", "primary_task"), ("验证任务", "verification_task")):
        if output.get(key):
            parts.append(f"{label}：{_json(output[key])}")
    if output.get("limitations"):
        parts.append(
            "边界：\n" + "\n".join(f"- {item}" for item in output["limitations"])
        )
    return "\n\n".join(parts) or "AI 已返回结构化结果，但没有可展示的建议。"


def _call_provider(
    bundle, context: dict, messages: list[dict]
) -> tuple[str, dict, int, str, dict]:
    settings = load_verbal_ai_settings()
    system = (
        "只能依据服务端JSON事实回答；证据不足必须直说，不得改写官方答案。"
        "只输出一个JSON对象，不要使用Markdown代码块。输出必须严格符合下方JSON Schema，"
        "不得增加、删除或改名字段：\n"
        + _json(bundle.response_schema)
        + "\n\n"
        + bundle.content
    )
    if context.get("scope") == "standalone_method_question":
        system += (
            "\n\n当前是自由方法咨询。即使没有用户作答证据，也必须依据本 Skill "
            "直接回答用户询问的通用判断步骤和方法，并将 status 设为 completed；"
            "不得据此诊断用户个人弱项，不得声称引用了用户作答证据；"
            "evidence_refs 必须为空，answer 必须是具体且可执行的非空回答。"
        )
    elif context.get("scope") == "server_resolved_question":
        system += (
            "\n\n当前上下文包含服务端核验过的真实题干与选项。用户可以在作答前询问"
            "题干结构、语境关系和解题步骤；这类方法问题不需要官方答案也能回答。"
            "必须紧扣 context.evidence 中的当前题目，将 status 设为 completed，"
            "answer 返回具体且非空的方法提示，evidence_refs 填入引用到的 item_id。"
            "不得提前透露正确选项，也不得在没有作答记录时诊断用户个人弱项。"
            "先阅读 messages 中用户最新一句，逐字回答他现在问的点，不能复用上一题的回答模板。"
            "如果用户说没思路、没听懂或问第一步，只给当前题最关键的观察、一个下一步动作，"
            "再用一个简短问题确认他是否跟上，不要一上来完整抄解法。"
            "如果 evidence 已含 official_analysis，必须以该官方解析为事实主线，结合当前 Skill"
            "解释为什么这样识别、为什么这样取舍或哪一步算错；不得与解析冲突，也不要只是照抄解析。"
            "如果 evidence 已含 user_answer 和 correct_answer，要明确比较用户所选与正确项，"
            "指出差异发生在识别、建模、计算或选项排除的哪一步。"
            "每次回答必须只引用当前 evidence[0].item_id 对应的题目；题目 ID 改变时视为全新问题。"
        )
    result = None
    for schema_attempt in range(2):
        result = call_deepseek_json(
            settings,
            system_prompt=system + (
                "\n\n上一次输出未通过结构校验。请重新生成：只保留 Schema 中定义的字段，"
                "补齐全部 required 字段，并严格使用规定的数据类型与枚举值。"
                if schema_attempt else ""
            ),
            user_prompt=_json({"context": context, "messages": messages[-12:]}),
        )
        if _valid_schema_value(result.output, bundle.response_schema):
            break
    if result is None or not _valid_schema_value(result.output, bundle.response_schema):
        raise ProviderError("provider_invalid_schema", status="invalid_output")
    return (
        _display_output(result.output),
        result.usage,
        result.latency_ms,
        settings.model,
        result.output,
    )


def _latest_run(conn, thread_id: str, uid: int):
    row = conn.execute(
        "SELECT * FROM ai_coach_runs WHERE thread_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 1",
        (thread_id, uid),
    ).fetchone()
    if not row:
        return None
    item = dict(row)
    item["usage"] = _parsed(item.pop("usage_json"))
    return item


def _thread_payload(conn, row, uid: int) -> dict:
    messages = conn.execute(
        "SELECT id,role,content,run_id,client_message_id,finalized_at,created_at FROM ai_coach_messages WHERE thread_id=? AND user_id=? ORDER BY created_at,id",
        (row["id"], uid),
    ).fetchall()
    proposals = conn.execute(
        "SELECT id,title,summary,evidence_json,status,saved_issue_id FROM ai_coach_issue_proposals WHERE thread_id=? AND user_id=? ORDER BY created_at",
        (row["id"], uid),
    ).fetchall()
    label = MODULE_LABELS.get(row["module_id"], (row["module_id"], ""))
    return {
        "id": row["id"],
        "module_id": row["module_id"],
        "activity_id": row["activity_id"],
        "title": row["title"],
        "return_url": row["return_url"],
        "context": _parsed(row["context_json"]),
        "context_label": label[1],
        "skill_label": label[0],
        "messages": [dict(m) for m in messages],
        "latest_run": _latest_run(conn, row["id"], uid),
        "issue_proposals": [
            {
                **dict(p),
                "evidence": _parsed(p["evidence_json"]),
                "saved": p["status"] == "saved",
            }
            for p in proposals
        ],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@router.get("/modules")
def modules(user: dict = Depends(require_user)):
    del user
    enabled = {
        item["module_id"]: item
        for item in registry_status()
        if item["status"] == "enabled"
    }
    result = []
    for module in SKILL_ROUTE:
        registry_module = SKILL_ROUTE[module][0]
        if registry_module not in enabled:
            continue
        label, description = MODULE_LABELS[module]
        result.append(
            {
                "id": module,
                "label": label,
                "description": description,
                "skill_id": enabled[registry_module]["skill_id"],
                "skill_version": enabled[registry_module]["version"],
            }
        )
    return {
        "modules": result,
        "provider": load_verbal_ai_settings().safe_summary(),
    }


@router.post("/threads", status_code=201)
def create_thread(body: ThreadIn, user: dict = Depends(require_user)):
    ensure_ai_coach_schema()
    _bundle(body.module_id)
    activity_id = body.activity_id or (
        body.context_ref.id if body.context_ref else None
    )
    now, thread_id = _now(), str(uuid.uuid4())
    safe_client = {
        k: str(v)[:120] for k, v in body.client.items() if k in {"surface", "version"}
    }
    with get_db() as conn:
        context = _resolve_context(
            conn,
            uid=user["user_id"],
            activity_id=activity_id,
            requested_module=body.module_id,
        )
        conn.execute(
            """INSERT INTO ai_coach_threads(id,user_id,module_id,activity_id,title,context_json,return_url,client_json,created_at,updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (
                thread_id,
                user["user_id"],
                body.module_id,
                activity_id,
                body.title,
                _json(context),
                body.return_url,
                _json(safe_client),
                now,
                now,
            ),
        )
        conn.commit()
        row = _owned(conn, "ai_coach_threads", thread_id, user["user_id"])
        payload = _thread_payload(conn, row, user["user_id"])
    return payload


@router.get("/threads")
def list_threads(module_id: str | None = None, user: dict = Depends(require_user)):
    ensure_ai_coach_schema()
    params: list[Any] = [user["user_id"]]
    query = "SELECT * FROM ai_coach_threads WHERE user_id=?"
    if module_id:
        query += " AND module_id=?"
        params.append(module_id)
    query += " ORDER BY updated_at DESC"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [
        {
            k: row[k]
            for k in (
                "id",
                "module_id",
                "activity_id",
                "title",
                "created_at",
                "updated_at",
            )
        }
        for row in rows
    ]


@router.get("/threads/{thread_id}")
def get_thread(thread_id: str, user: dict = Depends(require_user)):
    ensure_ai_coach_schema()
    with get_db() as conn:
        return _thread_payload(
            conn,
            _owned(conn, "ai_coach_threads", thread_id, user["user_id"]),
            user["user_id"],
        )


@router.get("/threads/{thread_id}/runs")
def list_runs(thread_id: str, user: dict = Depends(require_user)):
    ensure_ai_coach_schema()
    with get_db() as conn:
        _owned(conn, "ai_coach_threads", thread_id, user["user_id"])
        rows = conn.execute(
            "SELECT * FROM ai_coach_runs WHERE thread_id=? AND user_id=? ORDER BY created_at,id",
            (thread_id, user["user_id"]),
        ).fetchall()
    return [{**dict(r), "usage": _parsed(r["usage_json"])} for r in rows]


def _proposal_evidence(context: dict) -> list[dict]:
    raw_evidence = context.get("evidence")
    evidence: list[dict[str, Any]] = (
        [item for item in raw_evidence if isinstance(item, dict)]
        if isinstance(raw_evidence, list)
        else []
    )
    wrong = [item for item in evidence if item.get("is_correct") is False]
    if len(wrong) >= 2:
        return [
            {"item_id": x.get("item_id"), "evidence_type": "wrong_answer"}
            for x in wrong[:8]
        ]
    for item in evidence:
        raw_dimensions = item.get("dimensions")
        dimensions: dict[str, Any] = (
            raw_dimensions if isinstance(raw_dimensions, dict) else {}
        )
        weak = [k for k, v in dimensions.items() if "较差" in str(v)]
        if weak:
            return [
                {
                    "item_id": item.get("item_id"),
                    "evidence_type": "ai_grading_dimension",
                    "dimensions": weak,
                }
            ]
        if (
            item.get("activity_kind") == "three_view_group"
            and (item.get("total") or 0) >= 5
            and (item.get("score") or 0) / (item["total"]) < 0.6
        ):
            return [
                {
                    "item_id": item.get("stage_id"),
                    "evidence_type": "server_graded_group",
                }
            ]
    return []


def _maybe_propose(conn, thread, assistant_mid, user_text, uid):
    if not any(
        word in user_text
        for word in ("分析", "复盘", "弱项", "问题", "错", "改进", "下一步", "为什么")
    ):
        return
    evidence = _proposal_evidence(_parsed(thread["context_json"]))
    if not evidence:
        return
    pid, now = str(uuid.uuid4()), _now()
    module = thread["module_id"]
    conn.execute(
        """INSERT INTO ai_coach_issue_proposals(id,thread_id,user_id,module_id,assistant_message_id,issue_key,title,summary,evidence_json,created_at,updated_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (
            pid,
            thread["id"],
            uid,
            module,
            assistant_mid,
            f"coach-evidence:{module}",
            "这组证据显示仍需巩固",
            "仅在保存后进入问题本；结论来自当前活动证据。",
            _json(evidence),
            now,
            now,
        ),
    )


def _execute_run(thread_id, user_mid, user_text, uid):
    run_id, now = str(uuid.uuid4()), _now()
    with get_db() as conn:
        thread = _owned(conn, "ai_coach_threads", thread_id, uid)
        bundle = _bundle(thread["module_id"])
        settings = load_verbal_ai_settings()
        context = _resolve_context(
            conn,
            uid=uid,
            activity_id=thread["activity_id"],
            requested_module=thread["module_id"],
        )
        context_json = _json(context)
        if context_json != thread["context_json"]:
            conn.execute(
                "UPDATE ai_coach_threads SET context_json=?,updated_at=? WHERE id=? AND user_id=?",
                (context_json, now, thread_id, uid),
            )
        context_hash = hashlib.sha256(context_json.encode()).hexdigest()
        conn.execute(
            """INSERT INTO ai_coach_runs(id,thread_id,user_id,provider,model,skill_version,skill_hash,status,skill_id,package_hash,bundle_hash,context_hash,registry_version,user_message_id,created_at)
                        VALUES(?,?,?,'deepseek',?,?,?,'running',?,?,?,?, '1',?,?)""",
            (
                run_id,
                thread_id,
                uid,
                settings.model,
                bundle.version,
                bundle.bundle_hash,
                bundle.skill_id,
                bundle.package_hash,
                bundle.bundle_hash,
                context_hash,
                user_mid,
                now,
            ),
        )
        conn.commit()
        history = [
            dict(r)
            for r in conn.execute(
                "SELECT role,content FROM ai_coach_messages WHERE thread_id=? AND user_id=? ORDER BY created_at,id",
                (thread_id, uid),
            ).fetchall()
        ]
    try:
        provider_result = _call_provider(bundle, context, history)
        if len(provider_result) == 4:  # compatibility for deterministic test providers
            content, usage, latency, model = provider_result
            output = {
                "answer": content,
                "status": "completed",
                "evidence_refs": [],
                "limitations": [],
            }
        else:
            content, usage, latency, model, output = provider_result
    except ProviderError as exc:
        status, error = exc.status, exc.code
    except Exception:
        status, error = "failed", "provider_internal"
    else:
        assistant_mid, finished = str(uuid.uuid4()), _now()
        with get_db() as conn:
            conn.execute(
                "INSERT INTO ai_coach_messages(id,thread_id,user_id,role,content,run_id,created_at) VALUES(?,?,?,'assistant',?,?,?)",
                (assistant_mid, thread_id, uid, content, run_id, finished),
            )
            conn.execute(
                "UPDATE ai_coach_runs SET model=?,status='completed',usage_json=?,output_json=?,latency_ms=?,finished_at=? WHERE id=? AND user_id=?",
                (model, _json(usage), _json(output), latency, finished, run_id, uid),
            )
            conn.execute(
                "UPDATE ai_coach_threads SET updated_at=? WHERE id=? AND user_id=?",
                (finished, thread_id, uid),
            )
            _maybe_propose(conn, thread, assistant_mid, user_text, uid)
            conn.commit()
            return _thread_payload(
                conn, _owned(conn, "ai_coach_threads", thread_id, uid), uid
            )
    with get_db() as conn:
        conn.execute(
            "UPDATE ai_coach_runs SET status=?,error_code=?,finished_at=? WHERE id=? AND user_id=?",
            (status, error, _now(), run_id, uid),
        )
        conn.commit()
    return JSONResponse(
        status_code=503,
        content={
            "detail": "AI暂时不可用，已保留你的问题和原始学习事实。",
            "run_id": run_id,
        },
    )


@router.post("/threads/{thread_id}/messages", status_code=201)
def send_message(thread_id: str, body: MessageIn, user: dict = Depends(require_user)):
    ensure_ai_coach_schema()
    uid = user["user_id"]
    with get_db() as conn:
        _owned(conn, "ai_coach_threads", thread_id, uid)
        existing = conn.execute(
            "SELECT id FROM ai_coach_messages WHERE thread_id=? AND user_id=? AND client_message_id=?",
            (thread_id, uid, body.client_message_id),
        ).fetchone()
        if existing:
            return _thread_payload(
                conn, _owned(conn, "ai_coach_threads", thread_id, uid), uid
            )
        mid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO ai_coach_messages(id,thread_id,user_id,role,content,client_message_id,created_at) VALUES(?,?,?,'user',?,?,?)",
            (mid, thread_id, uid, body.content, body.client_message_id, _now()),
        )
        conn.commit()
    return _execute_run(thread_id, mid, body.content, uid)


@router.post("/threads/{thread_id}/runs/{run_id}/retry")
def retry_run(thread_id: str, run_id: str, user: dict = Depends(require_user)):
    ensure_ai_coach_schema()
    uid = user["user_id"]
    with get_db() as conn:
        _owned(conn, "ai_coach_threads", thread_id, uid)
        run = _owned(conn, "ai_coach_runs", run_id, uid)
        if run["thread_id"] != thread_id or run["status"] not in {
            "failed",
            "timed_out",
            "invalid_output",
        }:
            raise HTTPException(409, "Run is not retryable")
        message = _owned(conn, "ai_coach_messages", run["user_message_id"], uid)
    return _execute_run(thread_id, message["id"], message["content"], uid)


@router.post("/issue-proposals/{proposal_id}/save")
def save_proposal(proposal_id: str, user: dict = Depends(require_user)):
    ensure_ai_coach_schema()
    uid = user["user_id"]
    now = _now()
    with get_db() as conn:
        proposal = _owned(conn, "ai_coach_issue_proposals", proposal_id, uid)
        if proposal["status"] == "saved":
            return {"saved": True, "issue_id": proposal["saved_issue_id"]}
        evidence = _parsed(proposal["evidence_json"])
        if not evidence:
            raise HTTPException(422, "Proposal has no verified evidence")
        thread = _owned(conn, "ai_coach_threads", proposal["thread_id"], uid)
        activity_ref = (
            thread["activity_id"]
            if (thread["activity_id"] and _activity(conn, thread["activity_id"], uid))
            else None
        )
        existing = conn.execute(
            "SELECT id,evidence_count FROM learning_issues_v2 WHERE user_id=? AND module_id=? AND issue_key=?",
            (uid, proposal["module_id"], proposal["issue_key"]),
        ).fetchone()
        issue_id = existing["id"] if existing else str(uuid.uuid4())
        if existing:
            conn.execute(
                "UPDATE learning_issues_v2 SET user_facing_title=?,evidence_count=?,last_seen_at=?,updated_at=? WHERE id=? AND user_id=?",
                (
                    proposal["title"],
                    existing["evidence_count"] + len(evidence),
                    now,
                    now,
                    issue_id,
                    uid,
                ),
            )
        else:
            conn.execute(
                """INSERT INTO learning_issues_v2(id,user_id,module_id,issue_key,user_facing_title,status,evidence_count,first_seen_at,last_seen_at,created_at,updated_at)
                VALUES(?,?,?,?,?,'observing',?,?,?,?,?)""",
                (
                    issue_id,
                    uid,
                    proposal["module_id"],
                    proposal["issue_key"],
                    proposal["title"],
                    len(evidence),
                    now,
                    now,
                    now,
                    now,
                ),
            )
        for item in evidence:
            conn.execute(
                "INSERT INTO learning_issue_evidence_v2(issue_id,user_id,activity_id,item_id,evidence_type,evidence_json,created_at) VALUES(?,?,?,?,?,?,?)",
                (
                    issue_id,
                    uid,
                    activity_ref,
                    str(item.get("item_id") or ""),
                    item["evidence_type"],
                    _json(item),
                    now,
                ),
            )
        conn.execute(
            "UPDATE ai_coach_issue_proposals SET status='saved',saved_issue_id=?,updated_at=? WHERE id=? AND user_id=?",
            (issue_id, now, proposal_id, uid),
        )
        conn.commit()
    return {"saved": True, "issue_id": issue_id}


@router.post("/threads/{thread_id}/finalize")
def finalize_message(
    thread_id: str, body: FinalizeIn, user: dict = Depends(require_user)
):
    """Save a user-approved coach note task; issue creation only uses verified proposals."""
    ensure_ai_coach_schema()
    uid = user["user_id"]
    now = _now()
    with get_db() as conn:
        thread = _owned(conn, "ai_coach_threads", thread_id, uid)
        message = _owned(conn, "ai_coach_messages", body.assistant_message_id, uid)
        if message["thread_id"] != thread_id or message["role"] != "assistant":
            raise HTTPException(422, "Invalid assistant message")
        if message["finalized_at"]:
            raise HTTPException(409, "Message already finalized")
        task_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO learning_tasks_v2(id,user_id,module_id,task_type,title,target_count,status,result_json,created_at,updated_at)
            VALUES(?,?,?,'coach_note',?,?,'pending','{}',?,?)""",
            (
                task_id,
                uid,
                thread["module_id"],
                body.task_title,
                body.target_count,
                now,
                now,
            ),
        )
        conn.execute(
            "UPDATE ai_coach_messages SET finalized_at=? WHERE id=? AND user_id=?",
            (now, message["id"], uid),
        )
        conn.commit()
    return {"finalized": True, "task_id": task_id, "issue_id": None}
