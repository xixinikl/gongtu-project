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
from dotenv import load_dotenv

# 🔧 加载环境变量（LLM_API_KEY 等）
load_dotenv()

# ── 导入真实 LLM 批改模块 ──
from src.grader import grade as llm_grade, chat as llm_chat  # noqa: E402
from src.models import Question  # noqa: E402

router = APIRouter(prefix="/api/shenlun", tags=["shenlun"])

# ── Logging ─────────────────────────────────────────────────────────────────────
LOG_DIR = Path(os.environ.get("GONTU_LOG_DIR", str(Path(__file__).parent / "logs")))
LOG_DIR.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger("shenlun")

# ── Questions data ──────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / "data"
QUESTIONS_FILE = DATA_DIR / "questions.json"


def _load_questions_data():
    if not QUESTIONS_FILE.exists():
        return {"questions": []}
    with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _get_question(qid: str):
    data = _load_questions_data()
    for q in data.get("questions", []):
        if q["id"] == qid:
            return q
    return None


# ── Auth helper ────────────────────────────────────────────────────────────────
async def _require_user(request: Request):
    """Require valid JWT; return user dict or raise 401."""
    from auth import get_current_user as _auth_get_user
    user = await _auth_get_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="未登录")
    return user


# ── Pydantic models ────────────────────────────────────────────────────────────
class GradingRequest(BaseModel):
    questionId: str
    studentAnswer: str


class ChatRequest(BaseModel):
    message: str
    questionId: str | None = None


# ── API Endpoints ──────────────────────────────────────────────────────────────

@router.get("/questions")
def list_questions():
    """获取题目列表（轻量，不含材料和参考答案全文）"""
    data = _load_questions_data()
    items = []
    for q in data.get("questions", []):
        items.append({
            "id": q["id"],
            "setName": q["setName"],
            "number": q["number"],
            "title": q["title"],
            "type": q["type"],
            "wordLimit": q["wordLimit"],
            "score": q["score"],
            "questionText": q["questionText"],
            "questionRequirement": q["questionRequirement"],
        })
    return items


@router.get("/questions/{qid}")
def get_question_detail(qid: str):
    """获取题目详情（含材料和参考答案）"""
    q = _get_question(qid)
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    return q


@router.post("/grade")
async def grade_answer(req: GradingRequest, request: Request):
    """提交作答进行 AI 批改（真实 LLM 5维度诊断）。"""
    user = await _require_user(request)
    user_id = user["user_id"]

    q = _get_question(req.questionId)
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
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
        result = llm_grade(question_obj, req.studentAnswer)
    except TimeoutError as e:
        logger.error(f"Grading timeout for q={req.questionId}")
        raise HTTPException(status_code=504, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Grading failed for q={req.questionId}: {e}")
        raise HTTPException(status_code=503, detail=str(e))

    # 转为 dict
    grading_result = result.model_dump() if hasattr(result, "model_dump") else dict(result)

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
            "gradingResult": json.loads(r["grading_result"]) if r["grading_result"] else None,
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
        "gradingResult": json.loads(r["grading_result"]) if r["grading_result"] else None,
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

    # 收集所有错题记录
    with get_db() as conn:
        rows = conn.execute(
            """SELECT question_title, question_type, student_answer, ai_reply
               FROM shenlun_mistakes
               WHERE user_id = ?
               ORDER BY created_at DESC""",
            (user_id,),
        ).fetchall()
        # 也从历史记录中收集
        h_rows = conn.execute(
            """SELECT question_title, question_type, student_answer, grading_result
               FROM shenlun_history
               WHERE user_id = ?
               ORDER BY created_at DESC""",
            (user_id,),
        ).fetchall()

    if not rows and not h_rows:
        return {
            "recordsReviewed": 0,
            "summary": "暂无足够的学习记录进行分析。请先完成几道申论题目的批改或对话。",
            "weakDimensions": [],
            "recommendations": ["继续练习申论题目，积累记录后即可进行AI分析。"],
        }

    # 构建分析文本
    texts = []
    for r in rows:
        texts.append(f"题目: {r['question_title']} ({r['question_type']})\n作答: {r['student_answer']}\n批改: {r['ai_reply'][:200]}")
    for r in h_rows:
        gr = r["grading_result"] or "{}"
        try:
            gd = json.loads(gr) if isinstance(gr, str) else gr
            reply_text = gd.get("reply", "")[:200] if isinstance(gd, dict) else str(gd)[:200]
        except Exception:
            reply_text = str(gr)[:200]
        texts.append(f"题目: {r['question_title']} ({r['question_type']})\n作答: {r['student_answer']}\n结果: {reply_text}")

    analysis_text = "\n\n---\n\n".join(texts)

    # 调用 LLM 分析
    try:
        from src.grader import call_llm_api
        prompt = f"""你是一位专业的申论备考教练。以下是一位考公学生的最近{len(texts)}条申论学习记录。

请分析：
1. 该学生在哪些维度最薄弱？（如：内容完整性、逻辑结构、语言表达、对策可行性、格式规范）
2. 给出3-5条具体可执行的改进建议（针对该学生的问题）

学习记录：
{analysis_text}

请用JSON格式返回（确保是合法JSON）：
{{"weakDimensions":["维度1","维度2"],"summary":"综合评价（2-3句话）","recommendations":["建议1","建议2","建议3"]}}"""

        raw_response = call_llm_api(prompt)
        import re
        json_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            raise RuntimeError("LLM未返回有效JSON")
    except TimeoutError:
        logger.warning("Analyze timeout")
        result = {
            "recordsReviewed": len(texts),
            "summary": f"AI分析超时。已收集{len(texts)}条学习记录，建议稍后重试。",
            "weakDimensions": [],
            "recommendations": [f"当前有{len(texts)}条记录可供分析，请重试获取详细诊断。"],
        }
    except Exception as e:
        logger.warning(f"Analyze failed: {e}")
        result = {
            "recordsReviewed": len(texts),
            "summary": f"AI暂时不可用，但已收集{len(texts)}条学习记录。建议继续练习后再分析。",
            "weakDimensions": [],
            "recommendations": [
                "多阅读人民日报评论员文章，学习官方表达方式",
                "练习时注意控制字数，培养精炼表达能力",
                "每道题完成后对照参考答案找差距",
            ],
        }

    result["recordsReviewed"] = len(texts)
    return result


@router.post("/chat")
async def chat_with_teacher(req: ChatRequest, request: Request):
    """与飞扬老师 AI 对话（真实 LLM）。"""
    user = await _require_user(request)

    q_obj = None
    if req.questionId:
        q = _get_question(req.questionId)
        if not q:
            raise HTTPException(status_code=404, detail="题目不存在")
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
    except TimeoutError as e:
        logger.error("Chat timeout")
        raise HTTPException(status_code=504, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Chat failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))

    mode = "chat" if not req.questionId else "grade"

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
                    json.dumps({"reply": reply, "mode": mode}, ensure_ascii=False),
                    datetime.now(timezone(timedelta(hours=8))).isoformat(),
                ),
            )
            conn.commit()
    except Exception as e:
        logger.warning(f"Failed to save chat to history: {e}")

    # 自动记录错题：当关联了题目时
    if req.questionId and q_obj:
        try:
            with get_db() as conn:
                conn.execute(
                    """INSERT INTO shenlun_mistakes
                       (user_id, question_id, question_title, question_type,
                        student_answer, ai_reply, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        user["user_id"],
                        req.questionId,
                        q_obj.title,
                        q_obj.type,
                        req.message,
                        reply,
                        datetime.now(timezone(timedelta(hours=8))).isoformat(),
                    ),
                )
                conn.commit()
        except Exception as e:
            logger.warning(f"Failed to auto-track mistake: {e}")

    return {"reply": reply, "mode": mode}
