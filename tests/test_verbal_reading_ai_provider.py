import sys
from pathlib import Path
import unittest
from unittest.mock import patch

import httpx


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from verbal_reading_ai_config import VerbalAISettings  # noqa: E402
from verbal_reading_diagnosis import normalize_diagnosis_shape  # noqa: E402
from verbal_reading_provider import (  # noqa: E402
    ProviderError,
    _classify_http,
    call_deepseek_json,
)


class VerbalReadingProviderTests(unittest.TestCase):
    def settings(self):
        return VerbalAISettings(
            api_key="test-only-key",
            base_url="https://provider.invalid",
            model="deepseek-chat",
            timeout_seconds=5,
            max_retries=1,
        )

    def test_http_errors_are_safely_classified(self):
        self.assertEqual(_classify_http(401), "provider_authentication")
        self.assertEqual(_classify_http(403), "provider_authentication")
        self.assertEqual(_classify_http(429), "provider_rate_limit")
        self.assertEqual(_classify_http(503), "provider_upstream")
        self.assertEqual(_classify_http(400), "provider_request_rejected")

    def test_timeout_is_bounded_and_key_never_enters_error(self):
        with patch("verbal_reading_provider.httpx.Client", side_effect=httpx.ReadTimeout("slow")):
            with self.assertRaises(ProviderError) as raised:
                call_deepseek_json(
                    self.settings(), system_prompt="system", user_prompt="user"
                )
        self.assertEqual(raised.exception.code, "provider_timeout")
        self.assertEqual(raised.exception.status, "timed_out")
        self.assertNotIn("test-only-key", str(raised.exception))

    def test_harmless_better_path_shape_drift_is_normalized(self):
        output = {
            "question_feedback": [
                {"better_path": "识别问法；定位重点句；比较选项。"}
            ]
        }
        normalized = normalize_diagnosis_shape(output)
        self.assertEqual(
            normalized["question_feedback"][0]["better_path"],
            ["识别问法", "定位重点句", "比较选项"],
        )


if __name__ == "__main__":
    unittest.main()
