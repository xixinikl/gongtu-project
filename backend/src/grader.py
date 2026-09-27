"""LLM grading module with strict provider-boundary validation."""

from __future__ import annotations

import json
import logging
import os
import re
import time
from collections.abc import Callable
from typing import Any, TypeVar

from openai import OpenAI

from src.models import GradingResult, PointScore
from src.prompt_builder import build_chat_prompt, build_grading_prompt

logger = logging.getLogger("grader")

# Load config from environment
API_KEY = os.getenv("LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY", "")
BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com")
MODEL = os.getenv("LLM_MODEL", "deepseek-flash")  # "deepseek-chat" 已于 2026-07-24 下线
TIMEOUT = int(os.getenv("LLM_TIMEOUT", "30"))

GRADING_DIMENSIONS = (
    "内容完整性",
    "逻辑结构",
    "语言表达",
    "对策可行性",
    "格式规范",
)
GRADING_RATINGS = frozenset({"优秀", "良好", "一般", "较差"})
# 模型只判断每个赋分要点的覆盖程度，分数由系统按题目赋分计算，保证可复算。
POINT_HIT_WEIGHTS = {"完全": 1.0, "部分": 0.5, "未覆盖": 0.0}
PROVIDER_ERROR_CODES = frozenset(
    {"provider_timeout", "provider_invalid_output", "provider_unavailable"}
)

T = TypeVar("T")


class ProviderFailure(RuntimeError):
    """Safe provider error whose string form never contains provider payloads."""

    def __init__(self, code: str):
        safe_code = code if code in PROVIDER_ERROR_CODES else "provider_unavailable"
        self.code = safe_code
        super().__init__(safe_code)


def _require_api_key() -> None:
    if not API_KEY or API_KEY == "your-api-key-here":
        raise ProviderFailure("provider_unavailable")


def _require_text(content: str | None) -> str:
    """Reject empty provider payloads without preserving their content."""
    if not isinstance(content, str) or not content.strip():
        raise ProviderFailure("provider_invalid_output")
    return content.strip()


def _response_text(response: Any) -> str:
    """Read the SDK response shape as untrusted provider output."""
    try:
        content = response.choices[0].message.content
    except (AttributeError, IndexError, KeyError, TypeError):
        raise ProviderFailure("provider_invalid_output") from None
    return _require_text(content)


def _extract_json(text: str) -> str:
    """Extract one JSON object from a provider response."""
    text = text.strip()
    if text.startswith("{"):
        return text
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return match.group(1)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return match.group(0) if match else text


def _nonempty_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _scoring_points(question: Any) -> list[Any]:
    reference = getattr(question, "referenceAnswer", None)
    return list(getattr(reference, "scoringPoints", None) or [])


def score_point_hits(question: Any, hits: Any) -> tuple[float, float, list[PointScore]]:
    """Turn per-point coverage judgments into a reproducible score."""
    points = _scoring_points(question)
    if not isinstance(hits, list) or len(hits) != len(points):
        raise ProviderFailure("provider_invalid_output")
    point_scores: list[PointScore] = []
    for sp, hit in zip(points, hits):
        label = _nonempty_text(hit)
        if label not in POINT_HIT_WEIGHTS:
            raise ProviderFailure("provider_invalid_output")
        max_score = float(sp.score)
        point_scores.append(
            PointScore(
                point=sp.point,
                maxScore=max_score,
                hit=label,
                score=round(max_score * POINT_HIT_WEIGHTS[label], 2),
            )
        )
    max_total = float(getattr(question, "score", 0) or sum(p.maxScore for p in point_scores))
    total = min(round(sum(p.score for p in point_scores), 2), max_total)
    return total, max_total, point_scores


def _existing_score(data: dict[str, Any]) -> dict[str, Any]:
    """Keep a score that was already computed by the system (re-validation)."""
    if data.get("score") is None:
        return {}
    try:
        point_scores = [PointScore(**item) for item in data.get("pointScores") or []]
        score = float(data["score"])
        max_score = float(data["maxScore"])
    except (TypeError, ValueError, KeyError):
        raise ProviderFailure("provider_invalid_output") from None
    if not 0 <= score <= max_score:
        raise ProviderFailure("provider_invalid_output")
    return {"score": score, "maxScore": max_score, "pointScores": point_scores}


def validate_grading_result(payload: Any, question: Any = None) -> GradingResult:
    """Validate the exact five-dimension grading contract.

    Provider JSON is flat, while the internal model nests values under
    ``dimensions``. Both shapes are accepted; every returned result is
    normalized to the internal model before it can reach persistence.
    When ``question`` has scoring points, the provider must also return
    ``pointHits`` and the score is computed here.
    """
    if isinstance(payload, GradingResult):
        data: Any = payload.model_dump()
    elif hasattr(payload, "model_dump"):
        data = payload.model_dump()
    else:
        data = payload
    if not isinstance(data, dict):
        raise ProviderFailure("provider_invalid_output")

    dimensions = data.get("dimensions")
    if dimensions is None:
        dimensions = {key: data.get(key) for key in GRADING_DIMENSIONS}
    if not isinstance(dimensions, dict) or set(dimensions) != set(GRADING_DIMENSIONS):
        raise ProviderFailure("provider_invalid_output")

    normalized_dimensions: dict[str, str | None] = {}
    for key in GRADING_DIMENSIONS:
        rating = _nonempty_text(dimensions.get(key))
        allowed = GRADING_RATINGS | ({"N/A"} if key == "对策可行性" else set())
        if rating not in allowed:
            raise ProviderFailure("provider_invalid_output")
        normalized_dimensions[key] = rating

    overall_comment = _nonempty_text(data.get("overallComment"))
    suggestions = data.get("suggestions")
    if (
        overall_comment is None
        or not isinstance(suggestions, list)
        or len(suggestions) != 3
    ):
        raise ProviderFailure("provider_invalid_output")
    normalized_suggestions = [_nonempty_text(item) for item in suggestions]
    if any(item is None for item in normalized_suggestions):
        raise ProviderFailure("provider_invalid_output")

    if question is not None and _scoring_points(question):
        total, max_total, point_scores = score_point_hits(question, data.get("pointHits"))
        score_fields: dict[str, Any] = {
            "score": total,
            "maxScore": max_total,
            "pointScores": point_scores,
        }
    else:
        score_fields = _existing_score(data)

    return GradingResult(
        dimensions=normalized_dimensions,
        overallComment=overall_comment,
        suggestions=[item for item in normalized_suggestions if item is not None],
        **score_fields,
    )


def _failure_from_exception(exc: Exception) -> ProviderFailure:
    if isinstance(exc, ProviderFailure):
        return exc
    # The provider SDK uses several timeout subclasses. Inspecting the local
    # exception is necessary for classification, but its text is never logged,
    # returned, chained, or persisted.
    error_type = type(exc).__name__.lower()
    error_text = str(exc).lower()
    if "timeout" in error_type or "timeout" in error_text or "timed out" in error_text:
        return ProviderFailure("provider_timeout")
    return ProviderFailure("provider_unavailable")


def _retry_provider(operation: str, call: Callable[[], T]) -> T:
    """Retry a provider operation and expose only stable, redacted failures."""
    last_failure = ProviderFailure("provider_unavailable")
    for attempt in range(1, 4):
        try:
            return call()
        except Exception as exc:
            last_failure = _failure_from_exception(exc)
            logger.warning(
                "provider_attempt_failed operation=%s attempt=%s code=%s error_type=%s",
                operation,
                attempt,
                last_failure.code,
                type(exc).__name__,
            )
            if attempt < 3:
                time.sleep(2 ** (attempt - 1))
    raise ProviderFailure(last_failure.code) from None


def grade(question: Any, student_answer: str) -> GradingResult:
    """Grade an answer and return only a strictly validated result."""
    _require_api_key()
    system_prompt, user_prompt = build_grading_prompt(question, student_answer)
    start_time = time.time()

    def run_once() -> GradingResult:
        logger.info(
            "grading_request question_id=%s answer_chars=%s",
            question.id,
            len(student_answer),
        )
        client = OpenAI(api_key=API_KEY, base_url=BASE_URL, timeout=TIMEOUT)
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=1000,
        )
        raw_output = _response_text(response)
        logger.info(
            "grading_response elapsed_seconds=%.1f output_chars=%s",
            time.time() - start_time,
            len(raw_output),
        )
        try:
            data = json.loads(_extract_json(raw_output))
        except (json.JSONDecodeError, TypeError, ValueError):
            raise ProviderFailure("provider_invalid_output") from None
        return validate_grading_result(data, question=question)

    return _retry_provider("grade", run_once)


def call_llm_api(prompt: str, system_prompt: str | None = None) -> str:
    """Call the provider for an arbitrary prompt with redacted failures."""
    _require_api_key()

    def run_once() -> str:
        client = OpenAI(api_key=API_KEY, base_url=BASE_URL, timeout=TIMEOUT)
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                    or "你是一个专业的AI助手。请根据用户要求给出详细、准确的回答。",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
            max_tokens=2000,
        )
        return _response_text(response)

    return _retry_provider("generic", run_once)


def chat(question: Any, user_message: str) -> str:
    """Reply as the Feiyang teacher without exposing provider failures."""
    _require_api_key()
    system_prompt, user_prompt = build_chat_prompt(question, user_message)

    def run_once() -> str:
        logger.info("chat_request message_chars=%s", len(user_message))
        client = OpenAI(api_key=API_KEY, base_url=BASE_URL, timeout=TIMEOUT)
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=1500,
        )
        reply = _response_text(response)
        logger.info("chat_response reply_chars=%s", len(reply))
        return reply

    return _retry_provider("chat", run_once)
