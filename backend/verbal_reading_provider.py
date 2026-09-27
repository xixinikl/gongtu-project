"""DeepSeek provider adapter with bounded timeout, retry, and safe errors."""
from __future__ import annotations

from dataclasses import dataclass
import json
import time

import httpx

from verbal_reading_ai_config import VerbalAISettings


@dataclass(frozen=True)
class ProviderResult:
    output: dict
    usage: dict
    latency_ms: int


@dataclass(frozen=True)
class TextProviderResult:
    content: str
    usage: dict
    latency_ms: int


class ProviderError(RuntimeError):
    def __init__(self, code: str, *, status: str = "failed"):
        super().__init__(code)
        self.code = code
        self.status = status


def _classify_http(status_code: int) -> str:
    if status_code in (401, 403):
        return "provider_authentication"
    if status_code == 429:
        return "provider_rate_limit"
    if status_code >= 500:
        return "provider_upstream"
    return "provider_request_rejected"


def call_deepseek_json(
    settings: VerbalAISettings,
    *,
    system_prompt: str,
    user_prompt: str,
) -> ProviderResult:
    if not settings.configured:
        raise ProviderError("provider_not_configured")

    payload = {
        "model": settings.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        "max_tokens": 6000,
        "stream": False,
    }
    timeout = httpx.Timeout(settings.timeout_seconds, connect=min(10, settings.timeout_seconds))
    started = time.perf_counter()
    last_error: ProviderError | None = None

    for attempt in range(settings.max_retries + 1):
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(
                    f"{settings.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
            if response.status_code >= 400:
                code = _classify_http(response.status_code)
                last_error = ProviderError(code)
                if attempt < settings.max_retries and response.status_code in (429, 500, 502, 503, 504):
                    continue
                raise last_error
            body = response.json()
            content = body["choices"][0]["message"]["content"]
            output = json.loads(content)
            latency_ms = round((time.perf_counter() - started) * 1000)
            return ProviderResult(output=output, usage=body.get("usage") or {}, latency_ms=latency_ms)
        except httpx.TimeoutException:
            last_error = ProviderError("provider_timeout", status="timed_out")
        except httpx.HTTPError:
            last_error = ProviderError("provider_network")
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            raise ProviderError("provider_invalid_json", status="invalid_output")
        if attempt >= settings.max_retries:
            raise last_error or ProviderError("provider_unknown")

    raise last_error or ProviderError("provider_unknown")


def call_deepseek_text(
    settings: VerbalAISettings,
    *,
    system_prompt: str,
    user_prompt: str,
) -> TextProviderResult:
    if not settings.configured:
        raise ProviderError("provider_not_configured")
    payload = {
        "model": settings.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 1800,
        "stream": False,
    }
    timeout = httpx.Timeout(settings.timeout_seconds, connect=min(10, settings.timeout_seconds))
    started = time.perf_counter()
    last_error: ProviderError | None = None
    for attempt in range(settings.max_retries + 1):
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(
                    f"{settings.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
            if response.status_code >= 400:
                code = _classify_http(response.status_code)
                last_error = ProviderError(code)
                if attempt < settings.max_retries and response.status_code in (429, 500, 502, 503, 504):
                    continue
                raise last_error
            body = response.json()
            content = body["choices"][0]["message"]["content"].strip()
            if not content:
                raise ProviderError("provider_empty_output", status="invalid_output")
            return TextProviderResult(
                content=content,
                usage=body.get("usage") or {},
                latency_ms=round((time.perf_counter() - started) * 1000),
            )
        except httpx.TimeoutException:
            last_error = ProviderError("provider_timeout", status="timed_out")
        except httpx.HTTPError:
            last_error = ProviderError("provider_network")
        except (KeyError, TypeError, ValueError):
            raise ProviderError("provider_invalid_response", status="invalid_output")
        if attempt >= settings.max_retries:
            raise last_error or ProviderError("provider_unknown")
    raise last_error or ProviderError("provider_unknown")
