"""申论批改 API — 接入真实 LLM 批改（DeepSeek）。"""

from __future__ import annotations

import json
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from database import get_db
from auth import require_user
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

    try:
        result = validate_grading_result(llm_grade(question_obj, req.studentAnswer))
    except Exception as exc:
        raise _safe_provider_failure(exc, operation="grade") from None

    # 转为 dict
    grading_result = (
        result.model_dump() if hasattr(result, "model_dump") else dict(result)
    )
    grading_result["runMetadata"] = _run_metadata()
    grading_result["recordType"] = "grading"

    # 保存到历史记录
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
               (user_id, question_id, question_title, question_type,
                student_answer, ai_reply, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                req.questionId,
                q["title"],
                q["type"],
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
        conn.commit()

    logger.info(f"Graded q={req.questionId}, user={user_id}, record={record_id}")

    return {
        "id": record_id,
        "questionId": req.questionId,
        "questionTitle": q["title"],
        "questionType": q["type"],
        "studentAnswer": req.studentAnswer,
        "wordCount": word_count,
        "gradingResult": grading_result,
        "runMetadata": grading_result["runMetadata"],
        "createdAt": now,
    }


@router.get("/history")
async def list_history(request: Request, limit: int = 50, offset: int = 0):
    """获取批改历史"""
    user = await _require_user(request)
    user_id = user["user_id"]

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
    """获取错题记录"""
    user = await _require_user(request)
    user_id = user["user_id"]

    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, question_id, question_title, question_type,
                      student_answer, ai_reply, created_at
               FROM shenlun_mistakes
               WHERE user_id = ?
               ORDER BY created_at DESC""",
            (user_id,),
        ).fetchall()

    return [
        {
            "id": r["id"],
            "questionId": r["question_id"],
            "questionTitle": r["question_title"],
            "questionType": r["question_type"],
            "studentAnswer": r["student_answer"],
            "aiReply": r["ai_reply"],
            "createdAt": r["created_at"],
        }
        for r in rows
    ]


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

        raw_response = call_llm_api(prompt, system_prompt=system_prompt)
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
        reply = llm_chat(q_obj, req.message)
        if not isinstance(reply, str) or not reply.strip():
            raise ProviderFailure("provider_invalid_output")
        reply = reply.strip()
    except Exception as exc:
        raise _safe_provider_failure(exc, operation="chat") from None

    mode = "chat" if not req.questionId else "question_context"
    run_metadata = _run_metadata()

    # ── 保存到历史记录（所有对话都存，包括纯聊天） ──
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
                    str(uuid.uuid4())[:8],
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

    return {"reply": reply, "mode": mode, "runMetadata": run_metadata}
