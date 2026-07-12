"""Configuration boundary for the verbal-reading AI provider.

This module does not call the provider. It centralizes environment parsing and
safe summaries so secrets cannot accidentally enter logs or API responses.
"""
from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Mapping

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parent / ".env")


DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"


def _bounded_int(raw: str | None, *, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(raw) if raw is not None else default
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _is_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    return normalized in {"", "your-api-key-here", "replace-me", "changeme"}


@dataclass(frozen=True)
class VerbalAISettings:
    api_key: str
    base_url: str
    model: str
    timeout_seconds: int
    max_retries: int

    @property
    def configured(self) -> bool:
        return not _is_placeholder(self.api_key)

    def safe_summary(self) -> dict[str, object]:
        """Return log/API-safe configuration metadata without any key fragment."""
        return {
            "configured": self.configured,
            "base_url": self.base_url,
            "model": self.model,
            "timeout_seconds": self.timeout_seconds,
            "max_retries": self.max_retries,
        }


def load_verbal_ai_settings(env: Mapping[str, str] | None = None) -> VerbalAISettings:
    source = os.environ if env is None else env
    api_key = source.get("DEEPSEEK_API_KEY") or source.get("LLM_API_KEY", "")
    return VerbalAISettings(
        api_key=api_key.strip(),
        base_url=(source.get("LLM_BASE_URL") or DEFAULT_BASE_URL).rstrip("/"),
        model=source.get("LLM_MODEL") or DEFAULT_MODEL,
        timeout_seconds=_bounded_int(
            source.get("VERBAL_AI_TIMEOUT_SECONDS"), default=30, minimum=5, maximum=120
        ),
        max_retries=_bounded_int(
            source.get("VERBAL_AI_MAX_RETRIES"), default=1, minimum=0, maximum=1
        ),
    )


def redact_sensitive_text(text: str, settings: VerbalAISettings) -> str:
    """Redact the configured key from exception text before logging or returning it."""
    if settings.api_key and settings.api_key in text:
        return text.replace(settings.api_key, "[REDACTED]")
    return text
