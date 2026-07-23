"""Opt-in AI quotas for the public interview deployment.

The local/default build is unaffected. Enable with ``GONTU_DEMO_MODE=1`` only
on the public demo service.
"""

from __future__ import annotations

import math
import os

from fastapi import HTTPException, Request

try:
    from auth_rate_limit import SlidingWindowRateLimiter, request_source
except ModuleNotFoundError:  # package-style imports used by isolated tests
    from .auth_rate_limit import SlidingWindowRateLimiter, request_source


WINDOW_SECONDS = 24 * 60 * 60
AI_PER_USER = 20
AI_PER_SOURCE = 80
_limiter = SlidingWindowRateLimiter()


def _int_env(name: str, default: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return max(1, value)


def enabled() -> bool:
    return os.environ.get("GONTU_DEMO_MODE", "0").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def enforce_ai_limit(request: Request, user_id: int) -> None:
    """Consume one AI call only when the public demo switch is enabled."""
    if not enabled():
        return

    source = request_source(request)
    user_key = f"demo-ai:user:{user_id}"
    source_key = f"demo-ai:source:{source}"
    user_retry = _limiter.consume(
        user_key,
        limit=_int_env("GONTU_DEMO_AI_PER_USER", AI_PER_USER),
        window_seconds=WINDOW_SECONDS,
    )
    source_retry = _limiter.consume(
        source_key,
        limit=_int_env("GONTU_DEMO_AI_PER_SOURCE", AI_PER_SOURCE),
        window_seconds=WINDOW_SECONDS,
    )
    retry_after = max(user_retry or 0, source_retry or 0)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="今日 AI 体验次数已用完，其他学习功能不受影响，明天自动恢复。",
            headers={"Retry-After": str(max(1, math.ceil(retry_after)))},
        )
