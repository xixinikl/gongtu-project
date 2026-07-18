import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


class ProductionRuntimeConfigTests(unittest.TestCase):
    def run_import(self, cors_origins: str | None) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as temp:
            env = os.environ.copy()
            env.update(
                {
                    "PYTHONPATH": str(BACKEND),
                    "GONTU_ENV": "production",
                    "GONTU_JWT_SECRET": "production-test-secret-material-0123456789",
                    "GONTU_DB_PATH": str(Path(temp) / "production.db"),
                }
            )
            if cors_origins is None:
                env.pop("GONTU_CORS_ORIGINS", None)
            else:
                env["GONTU_CORS_ORIGINS"] = cors_origins
            return subprocess.run(
                [sys.executable, "-c", "import main; print(main.CORS_ORIGINS)"],
                cwd=BACKEND,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )

    def test_production_requires_explicit_non_wildcard_cors(self):
        missing = self.run_import(None)
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("GONTU_CORS_ORIGINS is required", missing.stderr)

        wildcard = self.run_import("*")
        self.assertNotEqual(wildcard.returncode, 0)
        self.assertIn("Wildcard CORS is forbidden", wildcard.stderr)

    def test_production_accepts_valid_origin_list(self):
        result = self.run_import(
            "https://gongtu.example.com,https://admin.gongtu.example.com/"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("https://gongtu.example.com", result.stdout)
        self.assertIn("https://admin.gongtu.example.com", result.stdout)

    def test_production_rejects_origins_with_paths(self):
        result = self.run_import("https://gongtu.example.com/not-an-origin")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Invalid CORS origin", result.stderr)


if __name__ == "__main__":
    unittest.main()
