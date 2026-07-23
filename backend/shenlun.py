"""申论批改 API — 接入真实 LLM 批改（DeepSeek）。"""

from __future__ import annotations

import asyncio
import json
import hashlib
import os
import re
import uuid
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from database import get_db
from auth import require_user
from demo_limits import enforce_ai_limit
from dotenv import load_dotenv

# 🔧 加载环境变量（LLM_API_KEY 等）
load_dotenv()

# ── 导入真实 LLM 批改模块 ──
from src.grader import (  # noqa: E402
    GRADING_DIMENSIONS,
    ProviderFailure,
    chat as llm_chat,
    grade as llm_grade,
    validate_grading_result,
)
from src.models import Question  # noqa: E402
from src.prompt_builder import get_skill_metadata  # noqa: E402
from src.grader import BASE_URL as LLM_BASE_URL, MODEL as LLM_MODEL  # noqa: E402

router = APIRouter(prefix="/api/shenlun", tags=["shenlun"])

# ── Logging ─────────────────────────────────────────────────────────────────────
LOG_DIR = Path(os.environ.get("GONTU_LOG_DIR", str(Path(__file__).parent / "logs")))
LOG_DIR.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger("shenlun")

PROVIDER_FAILURE_MESSAGES = {
    "provider_timeout": "AI服务响应超时，请稍后重试。",
    "provider_invalid_output": "AI返回格式异常，请重新提交。",
    "provider_unavailable": "AI服务暂不可用，请稍后重试。",
}
IDEMPOTENCY_KEY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")

# ── Questions data ──────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / "data"
QUESTIONS_FILE = DATA_DIR / "questions.json"


def _load_questions_data():
    if not QUESTIONS_FILE.is_file():
        raise RuntimeError("Shenlun question source is missing")
    with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or not isinstance(data.get("questions"), list):
        raise RuntimeError("Shenlun question source has an invalid shape")
    return data


def _questions_or_unavailable() -> dict:
    try:
        return _load_questions_data()
    except (
        OSError,
        UnicodeError,
        ValueError,
        KeyError,
        TypeError,
        RuntimeError,
    ) as exc:
        logger.warning(
            "question_source_unavailable module_id=shenlun.review error_type=%s",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail={
                "code": "question_source_unavailable",
                "module_id": "shenlun.review",
                "content_status": "not_provided",
                "message": "申论题源暂未提供，请稍后再试。",
                "retryable": True,
            },
        ) from None


def _get_question(qid: str):
    data = _questions_or_unavailable()
    for q in data.get("questions", []):
        if q["id"] == qid:
            return q
    raise HTTPException(
        status_code=404,
        detail={
            "code": "question_not_provided",
            "content_status": "not_provided",
            "message": "当前题库未提供这道题。",
            "retryable": False,
        },
    )


# ── Auth helper ────────────────────────────────────────────────────────────────
async def _require_user(request: Request):
    """Use the shared auth gate, including checking that the account still exists."""
    return await require_user(request)


def _safe_provider_failure(exc: Exception, *, operation: str) -> HTTPException:
    """Map all provider failures to a stable response without raw details."""
    if isinstance(exc, ProviderFailure):
        code = exc.code
    elif isinstance(exc, TimeoutError):
        code = "provider_timeout"
    else:
        code = "provider_unavailable"
    logger.warning(
        "provider_failure module_id=shenlun.review operation=%s code=%s error_type=%s",
        operation,
        code,
        type(exc).__name__,
    )
    return HTTPException(
        status_code=504 if code == "provider_timeout" else 503,
        detail={
            "code": code,
            "module_id": "shenlun.review",
            "message": PROVIDER_FAILURE_MESSAGES[code],
            "retryable": True,
        },
    )


def _validate_analysis_payload(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ProviderFailure("provider_invalid_output")
    weak_dimensions = payload.get("weakDimensions")
    summary = payload.get("summary")
    recommendations = payload.get("recommendations")
    if (
        not isinstance(weak_dimensions, list)
        or any(item not in GRADING_DIMENSIONS for item in weak_dimensions)
        or len(set(weak_dimensions)) != len(weak_dimensions)
        or not isinstance(summary, str)
        or not summary.strip()
        or not isinstance(recommendations, list)
        or not 3 <= len(recommendations) <= 5
        or any(
            not isinstance(item, str) or not item.strip() for item in recommendations
        )
    ):
        raise ProviderFailure("provider_invalid_output")
    return {
        "status": "completed",
        "weakDimensions": weak_dimensions,
        "summary": summary.strip(),
        "recommendations": [item.strip() for item in recommendations],
    }


def _analysis_unavailable(
    *, code: str, records_reviewed: int, run_metadata: dict
) -> dict:
    safe_code = code if code in PROVIDER_FAILURE_MESSAGES else "provider_unavailable"
    return {
        "status": "unavailable",
        "errorCode": safe_code,
        "recordsReviewed": records_reviewed,
        "summary": PROVIDER_FAILURE_MESSAGES[safe_code],
        "weakDimensions": [],
        "recommendations": [],
        "runMetadata": run_metadata,
    }


def _idempotency_error(
    *, status_code: int, code: str, message: str, retryable: bool
) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "code": code,
            "module_id": "shenlun.review",
            "message": message,
            "retryable": retryable,
        },
    )


def _require_idempotency_key(request: Request) -> str:
    value = request.headers.get("Idempotency-Key", "").strip()
    if not IDEMPOTENCY_KEY_PATTERN.fullmatch(value):
        raise _idempotency_error(
            status_code=400,
            code="idempotency_key_invalid",
            message="提交标识缺失或格式无效，请重新提交。",
            retryable=False,
        )
    return value


def _grade_request_hash(*, question_id: str, student_answer: str) -> str:
    canonical = json.dumps(
        {"questionId": question_id, "studentAnswer": student_answer},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _reserve_grade_request(
    *, user_id: int, key: str, request_hash: str, now: str
) -> dict | None:
    """Reserve a provider call, or replay the one authoritative outcome."""
    with get_db() as conn:
        inserted = conn.execute(
            """INSERT OR IGNORE INTO shenlun_grade_requests
               (user_id,idempotency_key,request_hash,status,created_at,updated_at)
               VALUES(?,?,?,'pending',?,?)""",
            (user_id, key, request_hash, now, now),
        ).rowcount
        if inserted == 1:
            conn.commit()
            return None
        row = conn.execute(
            """SELECT request_hash,status,response_json,error_code,http_status
               FROM shenlun_grade_requests
               WHERE user_id=? AND idempotency_key=?""",
            (user_id, key),
        ).fetchone()

    if row is None:
        raise _idempotency_error(
            status_code=503,
            code="idempotency_unavailable",
            message="提交状态暂时不可用，请稍后重试。",
            retryable=True,
        )
    if row["request_hash"] != request_hash:
        raise _idempotency_error(
            status_code=409,
            code="idempotency_conflict",
            message="同一提交标识不能用于不同作答。",
            retryable=False,
        )
    if row["status"] == "pending":
        raise _idempotency_error(
            status_code=409,
            code="idempotency_in_progress",
            message="这次批改仍在处理中，请稍后查看结果。",
            retryable=True,
        )

    try:
        stored = json.loads(row["response_json"] or "")
        if not isinstance(stored, dict):
            raise ValueError("invalid stored response")
    except (json.JSONDecodeError, TypeError, ValueError):
        logger.warning(
            "idempotency_response_unavailable module_id=shenlun.review status=%s",
            row["status"],
        )
        raise _idempotency_error(
            status_code=503,
            code="idempotency_unavailable",
            message="提交结果暂时不可用，请使用新的提交重新批改。",
            retryable=False,
        ) from None

    if row["status"] == "completed":
        return stored
    status_code = row["http_status"]
    if not isinstance(status_code, int) or not 400 <= status_code <= 599:
        status_code = 503
    raise HTTPException(status_code=status_code, detail=stored)


def _mark_grade_request_failed(
    *, user_id: int, key: str, request_hash: str, error: HTTPException, now: str
) -> None:
    detail = (
        error.detail
        if isinstance(error.detail, dict)
        else {
            "code": "provider_unavailable",
            "module_id": "shenlun.review",
            "message": PROVIDER_FAILURE_MESSAGES["provider_unavailable"],
            "retryable": True,
        }
    )
    with get_db() as conn:
        conn.execute(
            """UPDATE shenlun_grade_requests
               SET status='failed',response_json=?,error_code=?,http_status=?,
                   updated_at=?,finished_at=?
               WHERE user_id=? AND idempotency_key=? AND request_hash=?
                 AND status='pending'""",
            (
                json.dumps(detail, ensure_ascii=False, separators=(",", ":")),
                detail.get("code", "provider_unavailable"),
                error.status_code,
                now,
                now,
                user_id,
                key,
                request_hash,
            ),
        )
        conn.commit()


def _question_public(q: dict) -> dict:
    """Return training content without answer/scoring fields."""
    return {
        key: value
        for key, value in q.items()
        if key not in {"referenceAnswer", "scoringPoints"}
    } | {
        "contentStatus": "summary-only",
        "isComplete": False,
        "contentNotice": "当前仅有材料摘要，尚未补齐原题全文；可用于方法练习，不作为完整真题。",
    }


def _run_metadata() -> dict[str, str]:
    skill = get_skill_metadata()
    provider = "deepseek" if "deepseek" in LLM_BASE_URL.lower() else "openai-compatible"
    return {
        "provider": provider,
        "model": LLM_MODEL,
        "skillVersion": skill["version"],
        "skillHash": skill["hash"],
    }


def _record_unified_grade(
    conn,
    *,
    record_id: str,
    user_id: int,
    question: dict,
    student_answer: str,
    grading_result: dict,
    word_count: int,
    now: str,
) -> None:
    """Index one successful grade for cross-module review in the same transaction."""
    activity_id = f"shenlun-grade:{record_id}"
    dimensions = grading_result.get("dimensions") or {}
    if not isinstance(dimensions, dict):
        dimensions = {}
    summary = {
        "question_title": question["title"],
        "question_type": question["type"],
        "word_count": word_count,
        "dimensions": dimensions,
        "run_metadata": grading_result.get("runMetadata", {}),
    }
    conn.execute(
        """INSERT INTO learning_activities_v2
           (id,user_id,module_id,activity_type,source_id,status,started_at,
            completed_at,duration_ms,summary_json,created_at,updated_at)
           VALUES(?,?,'shenlun.review','grading',?,'completed',?,?,0,?,?,?)""",
        (
            activity_id,
            user_id,
            record_id,
            now,
            now,
            json.dumps(summary, ensure_ascii=False, separators=(",", ":")),
            now,
            now,
        ),
    )

    for dimension, raw_rating in dimensions.items():
        rating = str(raw_rating).strip()
        if "较差" in rating:
            rating_level = "较差"
        elif "一般" in rating:
            rating_level = "一般"
        else:
            continue
        issue_key = f"dimension:{dimension}"
        issue_title = f"{dimension}需要加强"
        existing = conn.execute(
            """SELECT id FROM learning_issues_v2
               WHERE user_id=? AND module_id='shenlun.review' AND issue_key=?""",
            (user_id, issue_key),
        ).fetchone()
        issue_id = existing["id"] if existing else str(uuid.uuid4())
        confidence = 0.9 if rating_level == "较差" else 0.7
        if existing:
            conn.execute(
                """UPDATE learning_issues_v2
                   SET user_facing_title=?,internal_confidence=?,status='training',
                       last_seen_at=?,updated_at=?
                   WHERE id=? AND user_id=?""",
                (issue_title, confidence, now, now, issue_id, user_id),
            )
        else:
            conn.execute(
                """INSERT INTO learning_issues_v2
                   (id,user_id,module_id,issue_key,user_facing_title,internal_confidence,
                    evidence_count,status,first_seen_at,last_seen_at,created_at,updated_at)
                   VALUES(?,?,'shenlun.review',?,?,?,0,'training',?,?,?,?)""",
                (
                    issue_id,
                    user_id,
                    issue_key,
                    issue_title,
                    confidence,
                    now,
                    now,
                    now,
                    now,
                ),
            )
        conn.execute(
            """INSERT INTO learning_issue_evidence_v2
               (issue_id,user_id,activity_id,item_id,evidence_type,evidence_json,created_at)
               VALUES(?,?,?,?,?,?,?)""",
            (
                issue_id,
                user_id,
                activity_id,
                question["id"],
                "dimension_rating",
                json.dumps(
                    {
                        "record_id": record_id,
                        "rating": rating_level,
                        "raw_rating": rating,
                        "answer": student_answer,
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                now,
            ),
        )
        conn.execute(
            """UPDATE learning_issues_v2 SET evidence_count=(
                   SELECT COUNT(*) FROM learning_issue_evidence_v2
                   WHERE issue_id=? AND user_id=?
               ),last_seen_at=?,updated_at=? WHERE id=? AND user_id=?""",
            (issue_id, user_id, now, now, issue_id, user_id),
        )
        active_task = conn.execute(
            """SELECT id FROM learning_tasks_v2
               WHERE user_id=? AND module_id='shenlun.review' AND issue_id=?
                 AND task_type='dimension_practice' AND status IN ('pending','in_progress')
               LIMIT 1""",
            (user_id, issue_id),
        ).fetchone()
        if not active_task:
            conn.execute(
                """INSERT INTO learning_tasks_v2
                   (id,user_id,module_id,issue_id,task_type,title,target_count,status,
                    result_json,created_at,updated_at)
                   VALUES(?,?,'shenlun.review',?,'dimension_practice',?,3,'pending','{}',?,?)""",
                (
                    str(uuid.uuid4()),
                    user_id,
                    issue_id,
                    f"完成3次{dimension}专项练习",
                    now,
                    now,
                ),
            )


# ── Pydantic models ────────────────────────────────────────────────────────────
class GradingRequest(BaseModel):
    questionId: str
    studentAnswer: str


class ChatRequest(BaseModel):
    message: str
    questionId: str | None = None


class TrackHistoryRequest(BaseModel):
    historyId: str


# ── API Endpoints ──────────────────────────────────────────────────────────────


@router.get("/catalog")
async def get_catalog(request: Request):
    """Return the authoritative completeness statement for the current source."""
    await _require_user(request)
    data = _questions_or_unavailable()
    return {
        "catalogStatus": data.get("catalogStatus", "summary-only"),
        "isComplete": bool(data.get("isComplete", False)),
        "contentNotice": data.get(
            "contentNotice",
            "当前仅提供材料摘要，不作为完整真题库。",
        ),
        "questionCount": len(data["questions"]),
    }


@router.get("/questions")
async def list_questions(request: Request):
    """获取题目列表（轻量，不含材料和参考答案全文）"""
    await _require_user(request)
    data = _questions_or_unavailable()
    items = []
    for q in data.get("questions", []):
        items.append(
            {
                "id": q["id"],
                "setName": q["setName"],
                "number": q["number"],
                "title": q["title"],
                "type": q["type"],
                "wordLimit": q["wordLimit"],
                "score": q["score"],
                "questionText": q["questionText"],
                "questionRequirement": q["questionRequirement"],
                "contentStatus": "summary-only",
                "isComplete": False,
                "contentNotice": "当前仅有材料摘要，尚未补齐原题全文。",
            }
        )
    return items


@router.get("/questions/{qid}")
async def get_question_detail(qid: str, request: Request):
    """获取练习详情；作答前永不返回参考答案或评分点。"""
    await _require_user(request)
    q = _get_question(qid)
    return _question_public(q)


@router.post("/grade")
async def grade_answer(req: GradingRequest, request: Request):
    """提交作答进行 AI 批改（真实 LLM 5维度诊断）。"""
    user = await _require_user(request)
    user_id = user["user_id"]
    enforce_ai_limit(request, user_id)

    idempotency_key = _require_idempotency_key(request)
    request_hash = _grade_request_hash(
        question_id=req.questionId,
        student_answer=req.studentAnswer,
    )

    q = _get_question(req.questionId)
    if not req.studentAnswer.strip():
        raise HTTPException(status_code=400, detail="作答不能为空")

    # ── 构造 Question 模型 ──
    q_copy = dict(q)
    scoring_points = q_copy.pop("scoringPoints", [])
    q_copy["referenceAnswer"] = {
        "fullText": q_copy.pop("referenceAnswer", ""),
        "scoringPoints": scoring_points,
    }
    question_obj = Question(**q_copy)

    # ── 调用真实 LLM 批改 ──
    word_count = len(req.studentAnswer.replace("\n", "").replace(" ", ""))
    now = datetime.now(timezone(timedelta(hours=8))).isoformat()
    record_id = str(uuid.uuid4())[:8]

    replay = _reserve_grade_request(
        user_id=user_id,
        key=idempotency_key,
        request_hash=request_hash,
        now=now,
    )
    if replay is not None:
        return replay

    try:
        result = validate_grading_result(
            await asyncio.to_thread(llm_grade, question_obj, req.studentAnswer)
        )
        grading_result = result.model_dump()
        grading_result["runMetadata"] = _run_metadata()
        grading_result["recordType"] = "grading"
    except Exception as exc:
        safe_error = _safe_provider_failure(exc, operation="grade")
        try:
            _mark_grade_request_failed(
                user_id=user_id,
                key=idempotency_key,
                request_hash=request_hash,
                error=safe_error,
                now=datetime.now(timezone(timedelta(hours=8))).isoformat(),
            )
        except Exception as persist_exc:
            logger.warning(
                "idempotency_failure_save_failed error_type=%s",
                type(persist_exc).__name__,
            )
        raise safe_error from None

    response_payload = {
        "id": record_id,
        "activityId": f"shenlun-grade:{record_id}",
        "questionId": req.questionId,
        "questionTitle": q["title"],
        "questionType": q["type"],
        "studentAnswer": req.studentAnswer,
        "wordCount": word_count,
        "gradingResult": grading_result,
        "runMetadata": grading_result["runMetadata"],
        "createdAt": now,
    }

    # 保存到历史记录
    try:
        with get_db() as conn:
            conn.execute(
                """INSERT INTO shenlun_history
                   (id, user_id, question_id, question_title, question_type,
                    student_answer, word_count, grading_result, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    record_id,
                    user_id,
                    req.questionId,
                    q["title"],
                    q["type"],
                    req.studentAnswer,
                    word_count,
                    json.dumps(grading_result, ensure_ascii=False),
                    now,
                ),
            )
            # 问题本按“用户 + 题目”聚合；完整重做历史仍保留在 shenlun_history。
            conn.execute(
                "DELETE FROM shenlun_mistakes WHERE user_id = ? AND question_id = ?",
                (user_id, req.questionId),
            )
            conn.execute(
                """INSERT INTO shenlun_mistakes
                   (user_id, question_id, source_history_id, record_type,
                    question_title, question_type, question_text,
                    question_requirement, material, student_answer, ai_reply, created_at)
                   VALUES (?, ?, ?, 'grading', ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_id,
                    req.questionId,
                    record_id,
                    q["title"],
                    q["type"],
                    q.get("questionText", ""),
                    q.get("questionRequirement", ""),
                    q.get("material", ""),
                    req.studentAnswer,
                    json.dumps(grading_result, ensure_ascii=False),
                    now,
                ),
            )
            _record_unified_grade(
                conn,
                record_id=record_id,
                user_id=user_id,
                question=q,
                student_answer=req.studentAnswer,
                grading_result=grading_result,
                word_count=word_count,
                now=now,
            )
            completed = conn.execute(
                """UPDATE shenlun_grade_requests
                   SET status='completed',record_id=?,response_json=?,http_status=200,
                       error_code=NULL,updated_at=?,finished_at=?
                   WHERE user_id=? AND idempotency_key=? AND request_hash=?
                     AND status='pending'""",
                (
                    record_id,
                    json.dumps(
                        response_payload,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                    now,
                    now,
                    user_id,
                    idempotency_key,
                    request_hash,
                ),
            ).rowcount
            if completed != 1:
                raise RuntimeError("idempotency completion lost")
            conn.commit()
    except Exception as exc:
        logger.warning("grade_persistence_failed error_type=%s", type(exc).__name__)
        persistence_error = _idempotency_error(
            status_code=503,
            code="persistence_unavailable",
            message="批改结果暂时无法保存，请使用新的提交重新批改。",
            retryable=False,
        )
        try:
            _mark_grade_request_failed(
                user_id=user_id,
                key=idempotency_key,
                request_hash=request_hash,
                error=persistence_error,
                now=datetime.now(timezone(timedelta(hours=8))).isoformat(),
            )
        except Exception as persist_exc:
            logger.warning(
                "idempotency_failure_save_failed error_type=%s",
                type(persist_exc).__name__,
            )
        raise persistence_error from None

    logger.info(f"Graded q={req.questionId}, user={user_id}, record={record_id}")

    return response_payload


@router.get("/history")
async def list_history(request: Request, limit: int = 50, offset: int = 0):
    """获取批改历史"""
    user = await _require_user(request)
    user_id = user["user_id"]
    enforce_ai_limit(request, user_id)

    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, question_id, question_title, question_type,
                      student_answer, word_count, grading_result, created_at
               FROM shenlun_history
               WHERE user_id = ?
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?""",
            (user_id, limit, offset),
        ).fetchall()

    return [
        {
            "id": r["id"],
            "questionId": r["question_id"],
            "questionTitle": r["question_title"],
            "questionType": r["question_type"],
            "studentAnswer": r["student_answer"],
            "wordCount": r["word_count"],
            "gradingResult": (
                json.loads(r["grading_result"]) if r["grading_result"] else None
            ),
            "createdAt": r["created_at"],
        }
        for r in rows
    ]


@router.get("/history/{record_id}")
async def get_history_record(record_id: str, request: Request):
    """获取单条批改记录详情"""
    user = await _require_user(request)
    enforce_ai_limit(request, user["user_id"])
    user_id = user["user_id"]

    with get_db() as conn:
        r = conn.execute(
            """SELECT * FROM shenlun_history
               WHERE id = ? AND user_id = ?""",
            (record_id, user_id),
        ).fetchone()

    if not r:
        raise HTTPException(status_code=404, detail="记录不存在")

    return {
        "id": r["id"],
        "questionId": r["question_id"],
        "questionTitle": r["question_title"],
        "questionType": r["question_type"],
        "studentAnswer": r["student_answer"],
        "wordCount": r["word_count"],
        "gradingResult": (
            json.loads(r["grading_result"]) if r["grading_result"] else None
        ),
        "createdAt": r["created_at"],
    }


@router.delete("/history/{record_id}")
async def delete_history_record(record_id: str, request: Request):
    """删除批改记录"""
    user = await _require_user(request)
    user_id = user["user_id"]

    with get_db() as conn:
        cur = conn.execute(
            "DELETE FROM shenlun_history WHERE id = ? AND user_id = ?",
            (record_id, user_id),
        )
        conn.commit()

    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"ok": True}


@router.post("/history/clear")
async def clear_all_history(request: Request):
    """清空所有批改/对话历史"""
    user = await _require_user(request)
    user_id = user["user_id"]

    with get_db() as conn:
        conn.execute(
            "DELETE FROM shenlun_history WHERE user_id = ?",
            (user_id,),
        )
        conn.commit()

    return {"ok": True}


@router.get("/mistakes")
async def list_mistakes(request: Request):
    """获取问题追踪记录，包含导出和重做所需的完整题目快照。"""
    user = await _require_user(request)
    user_id = user["user_id"]

    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, question_id, source_history_id, record_type,
                      question_title, question_type, question_text,
                      question_requirement, material, student_answer,
                      ai_reply, created_at
               FROM shenlun_mistakes
               WHERE user_id = ?
               ORDER BY created_at DESC""",
            (user_id,),
        ).fetchall()

    items = []
    for r in rows:
        question_text = r["question_text"] or ""
        question_requirement = r["question_requirement"] or ""
        material = r["material"] or ""
        # 兼容旧数据库中的追踪记录：题源可用时补齐展示，但题源故障不应
        # 让用户已经保存的问题本整体不可访问。
        if not question_text and r["question_id"] != "chat":
            try:
                question = _get_question(r["question_id"])
            except HTTPException:
                question = None
            if question:
                question_text = question.get("questionText", "")
                question_requirement = question.get("questionRequirement", "")
                material = question.get("material", "")
        items.append({
            "id": r["id"],
            "questionId": r["question_id"],
            "sourceHistoryId": r["source_history_id"],
            "recordType": r["record_type"] or "grading",
            "questionTitle": r["question_title"],
            "questionType": r["question_type"],
            "questionText": question_text,
            "questionRequirement": question_requirement,
            "material": material,
            "studentAnswer": r["student_answer"],
            "aiReply": r["ai_reply"],
            "createdAt": r["created_at"],
        })
    return items


@router.post("/mistakes")
async def track_history_record(req: TrackHistoryRequest, request: Request):
    """把本人一条普通问答或批改历史手动加入问题追踪。"""
    user = await _require_user(request)
    user_id = user["user_id"]
    history_id = req.historyId.strip()
    if not history_id:
        raise HTTPException(status_code=400, detail="历史记录标识不能为空")

    with get_db() as conn:
        row = conn.execute(
            """SELECT id,question_id,question_title,question_type,
                      student_answer,grading_result,created_at
               FROM shenlun_history WHERE id=? AND user_id=?""",
            (history_id, user_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="历史记录不存在")

    try:
        result = json.loads(row["grading_result"] or "{}")
    except (json.JSONDecodeError, TypeError):
        result = {}
    record_type = result.get("recordType")
    if record_type not in {"chat", "grading"}:
        raise HTTPException(status_code=422, detail="这条记录不能加入问题追踪")

    question = None
    if row["question_id"] != "chat":
        question = _get_question(row["question_id"])
    question_title = question.get("title", "") if question else row["question_title"]
    question_type = question.get("type", "") if question else row["question_type"]
    question_text = (
        question.get("questionText", "") if question else row["student_answer"]
    )
    question_requirement = (
        question.get("questionRequirement", "") if question else "普通问答"
    )
    material = question.get("material", "") if question else ""
    ai_reply = (
        json.dumps(result, ensure_ascii=False)
        if record_type == "grading"
        else str(result.get("reply") or "")
    )
    now = datetime.now(timezone(timedelta(hours=8))).isoformat()

    with get_db() as conn:
        conn.execute(
            "DELETE FROM shenlun_mistakes WHERE user_id=? AND source_history_id=?",
            (user_id, history_id),
        )
        cursor = conn.execute(
            """INSERT INTO shenlun_mistakes
               (user_id,question_id,source_history_id,record_type,
                question_title,question_type,question_text,question_requirement,
                material,student_answer,ai_reply,created_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                user_id,
                row["question_id"],
                history_id,
                record_type,
                question_title,
                question_type,
                question_text,
                question_requirement,
                material,
                row["student_answer"],
                ai_reply,
                now,
            ),
        )
        mistake_id = cursor.lastrowid
        conn.commit()
    return {"ok": True, "id": mistake_id, "sourceHistoryId": history_id}


@router.delete("/mistakes/{mistake_id}")
async def delete_mistake(mistake_id: int, request: Request):
    """删除错题记录"""
    user = await _require_user(request)
    user_id = user["user_id"]

    with get_db() as conn:
        cur = conn.execute(
            "DELETE FROM shenlun_mistakes WHERE id = ? AND user_id = ?",
            (mistake_id, user_id),
        )
        conn.commit()

    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"ok": True}


@router.delete("/mistakes")
async def clear_mistakes(request: Request):
    """清空所有错题记录"""
    user = await _require_user(request)
    user_id = user["user_id"]

    with get_db() as conn:
        conn.execute(
            "DELETE FROM shenlun_mistakes WHERE user_id = ?",
            (user_id,),
        )
        conn.commit()

    return {"ok": True}


# ═══════════════════════════════════════════════════
#  POST /mistakes/analyze  — AI 薄弱点分析
# ═══════════════════════════════════════════════════
@router.post("/mistakes/analyze")
async def analyze_weakness(request: Request):
    """基于错题本记录，调用 LLM 分析薄弱维度"""
    user = await _require_user(request)
    user_id = user["user_id"]

    # 只读取正式批改历史；问题本是聚合视图，不能重复作为分析证据。
    with get_db() as conn:
        h_rows = conn.execute(
            """SELECT question_title, question_type, student_answer, grading_result
               FROM shenlun_history
               WHERE user_id = ?
               ORDER BY created_at DESC""",
            (user_id,),
        ).fetchall()

    if not h_rows:
        return {
            "status": "insufficient_evidence",
            "recordsReviewed": 0,
            "summary": "暂无足够的学习记录进行分析。请先完成几道申论题目的批改或对话。",
            "weakDimensions": [],
            "recommendations": ["继续练习申论题目，积累记录后即可进行AI分析。"],
        }

    # 构建分析文本
    texts = []
    for r in h_rows:
        gr = r["grading_result"] or "{}"
        try:
            gd = json.loads(gr) if isinstance(gr, str) else gr
            if not isinstance(gd, dict) or gd.get("recordType") != "grading":
                continue
            reply_text = gd.get("overallComment", "")[:200]
        except Exception:
            continue
        texts.append(
            f"题目: {r['question_title']} ({r['question_type']})\n作答: {r['student_answer']}\n结果: {reply_text}"
        )

    if not texts:
        return {
            "status": "insufficient_evidence",
            "recordsReviewed": 0,
            "summary": "暂无有效批改记录。普通提问不会计入薄弱点分析。",
            "weakDimensions": [],
            "recommendations": ["请选择题目并使用“提交批改”完成一次正式作答。"],
        }

    analysis_text = "\n\n---\n\n".join(texts)

    # 调用 LLM 分析
    try:
        from src.grader import call_llm_api

        skill_meta = _run_metadata()
        from src.prompt_builder import build_system_prompt

        system_prompt = build_system_prompt("申论批改记录薄弱点分析")
        prompt = f"""以下是一位考公学生的最近{len(texts)}条有效申论批改记录。

请分析：
1. 该学生在哪些维度最薄弱？（如：内容完整性、逻辑结构、语言表达、对策可行性、格式规范）
2. 给出3-5条具体可执行的改进建议（针对该学生的问题）

学习记录：
{analysis_text}

请用JSON格式返回（确保是合法JSON）：
{{"weakDimensions":["维度1","维度2"],"summary":"综合评价（2-3句话）","recommendations":["建议1","建议2","建议3"]}}"""

        raw_response = await asyncio.to_thread(
            call_llm_api, prompt, system_prompt=system_prompt
        )
        import re

        json_match = re.search(r"\{.*\}", raw_response, re.DOTALL)
        if json_match:
            result = _validate_analysis_payload(json.loads(json_match.group()))
        else:
            raise ProviderFailure("provider_invalid_output")
    except Exception as exc:
        if isinstance(exc, json.JSONDecodeError):
            failure = ProviderFailure("provider_invalid_output")
        elif isinstance(exc, ProviderFailure):
            failure = exc
        elif isinstance(exc, TimeoutError):
            failure = ProviderFailure("provider_timeout")
        else:
            failure = ProviderFailure("provider_unavailable")
        logger.warning(
            "provider_failure module_id=shenlun.review operation=analyze code=%s error_type=%s",
            failure.code,
            type(exc).__name__,
        )
        return _analysis_unavailable(
            code=failure.code,
            records_reviewed=len(texts),
            run_metadata=locals().get("skill_meta") or _run_metadata(),
        )

    result["recordsReviewed"] = len(texts)
    result["runMetadata"] = locals().get("skill_meta") or _run_metadata()
    return result


@router.post("/chat")
async def chat_with_teacher(req: ChatRequest, request: Request):
    """与飞扬老师 AI 对话（真实 LLM）。"""
    user = await _require_user(request)

    q_obj = None
    if req.questionId:
        q = _get_question(req.questionId)
        # 构造 Question 模型
        q_copy = dict(q)
        scoring_points = q_copy.pop("scoringPoints", [])
        q_copy["referenceAnswer"] = {
            "fullText": q_copy.pop("referenceAnswer", ""),
            "scoringPoints": scoring_points,
        }
        q_obj = Question(**q_copy)

    # 调用真实 LLM 对话
    try:
        reply = await asyncio.to_thread(llm_chat, q_obj, req.message)
        if not isinstance(reply, str) or not reply.strip():
            raise ProviderFailure("provider_invalid_output")
        reply = reply.strip()
    except Exception as exc:
        raise _safe_provider_failure(exc, operation="chat") from None

    mode = "chat" if not req.questionId else "question_context"
    run_metadata = _run_metadata()

    # ── 保存到历史记录（所有对话都存，包括纯聊天） ──
    history_id: str | None = str(uuid.uuid4())[:8]
    try:
        q_title = q_obj.title if q_obj else (None)
        q_type = q_obj.type if q_obj else ("对话")
        with get_db() as conn:
            conn.execute(
                """INSERT INTO shenlun_history
                   (id, user_id, question_id, question_title, question_type,
                    student_answer, word_count, grading_result, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    history_id,
                    user["user_id"],
                    req.questionId or "chat",
                    q_title or "自由对话",
                    q_type,
                    req.message,
                    len(req.message),
                    json.dumps(
                        {
                            "reply": reply,
                            "mode": mode,
                            "recordType": "chat",
                            "runMetadata": run_metadata,
                        },
                        ensure_ascii=False,
                    ),
                    datetime.now(timezone(timedelta(hours=8))).isoformat(),
                ),
            )
            conn.commit()
    except Exception as exc:
        logger.warning("chat_history_save_failed error_type=%s", type(exc).__name__)
        history_id = None

    return {
        "reply": reply,
        "mode": mode,
        "historyId": history_id,
        "runMetadata": run_metadata,
    }
