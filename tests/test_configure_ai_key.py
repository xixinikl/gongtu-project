import importlib.util
import os
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "tools" / "configure-ai-key.py"
SPEC = importlib.util.spec_from_file_location("configure_ai_key", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ConfigureAIKeyTests(unittest.TestCase):
    def test_writes_private_ignored_style_env_without_printing_key(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text("LLM_MODEL=custom-model\nDEEPSEEK_API_KEY=sk-old-placeholder-value\n")
            MODULE.write_local_key("sk-test-only-value-1234567890", path)
            content = path.read_text()
            self.assertIn("DEEPSEEK_API_KEY=sk-test-only-value-1234567890", content)
            self.assertNotIn("sk-old-placeholder-value", content)
            self.assertIn("LLM_MODEL=custom-model", content)
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)

    def test_rejects_invalid_key_without_creating_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            with self.assertRaises(ValueError):
                MODULE.write_local_key("not-a-key", path)
            self.assertFalse(path.exists())


if __name__ == "__main__":
    unittest.main()
