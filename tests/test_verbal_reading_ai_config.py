import importlib.util
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "backend" / "verbal_reading_ai_config.py"
SPEC = importlib.util.spec_from_file_location("verbal_reading_ai_config", MODULE_PATH)
config = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = config
SPEC.loader.exec_module(config)


class VerbalAIConfigTests(unittest.TestCase):
    def test_missing_or_placeholder_key_is_not_configured(self):
        self.assertFalse(config.load_verbal_ai_settings({}).configured)
        self.assertFalse(
            config.load_verbal_ai_settings({"DEEPSEEK_API_KEY": "replace-me"}).configured
        )

    def test_deepseek_key_takes_priority_and_summary_never_contains_it(self):
        secret = "unit-test-secret-value"
        settings = config.load_verbal_ai_settings(
            {
                "DEEPSEEK_API_KEY": secret,
                "LLM_API_KEY": "legacy-secret",
                "LLM_MODEL": "deepseek-test",
            }
        )
        self.assertEqual(settings.api_key, secret)
        self.assertTrue(settings.configured)
        summary = settings.safe_summary()
        self.assertNotIn(secret, repr(summary))
        self.assertNotIn("api_key", summary)
        self.assertEqual(summary["model"], "deepseek-test")

    def test_numeric_settings_are_bounded(self):
        settings = config.load_verbal_ai_settings(
            {
                "VERBAL_AI_TIMEOUT_SECONDS": "999",
                "VERBAL_AI_MAX_RETRIES": "9",
            }
        )
        self.assertEqual(settings.timeout_seconds, 120)
        self.assertEqual(settings.max_retries, 1)
        settings = config.load_verbal_ai_settings(
            {
                "VERBAL_AI_TIMEOUT_SECONDS": "bad",
                "VERBAL_AI_MAX_RETRIES": "bad",
            }
        )
        self.assertEqual(settings.timeout_seconds, 30)
        self.assertEqual(settings.max_retries, 1)

    def test_sensitive_text_is_redacted(self):
        secret = "unit-test-secret-value"
        settings = config.load_verbal_ai_settings({"DEEPSEEK_API_KEY": secret})
        redacted = config.redact_sensitive_text(
            f"Authorization failed for {secret}", settings
        )
        self.assertEqual(redacted, "Authorization failed for [REDACTED]")


if __name__ == "__main__":
    unittest.main()
