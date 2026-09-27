from __future__ import annotations

import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from ai_skill_registry import (  # noqa: E402
    DATA_ROOT, REGISTRY_PATH, SkillRegistryError, registry_status, resolve_skill
)


MODULE_TASKS = {
    "verbal.reading": "diagnosis",
    "verbal.logic_fill": "explanation",
    "quantity.practice": "diagnosis",
    "reasoning.planar": "diagnosis",
    "reasoning.spatial": "explanation",
    "shenlun.review": "grading",
    "planning.global": "planning",
}

HUASHENG13_ADAPTERS = {
    "verbal.reading": "verbal-reading-skill/references/huasheng13-segment-reading-adapter.md",
    "verbal.logic_fill": "skills/logic-fill/huasheng13-logic-fill-adapter.md",
    "quantity.practice": "skills/quantity/huasheng13-quantity-router.md",
    "reasoning.planar": "skills/planar/huasheng13-planar-router.md",
    "reasoning.spatial": "skills/spatial/huasheng13-spatial-router.md",
    "shenlun.review": "feiyang-skill/references/huasheng13-申论补充路由.md",
}


class SkillRegistryTests(unittest.TestCase):
    def test_all_professional_modules_resolve_real_versioned_bundles(self):
        statuses = {item["module_id"]: item for item in registry_status()}
        self.assertEqual(set(statuses), set(MODULE_TASKS))
        for module_id, task in MODULE_TASKS.items():
            bundle = resolve_skill(module_id, task)
            self.assertEqual(len(bundle.package_hash), 64)
            self.assertEqual(len(bundle.bundle_hash), 64)
            self.assertEqual(bundle.response_schema["type"], "object")
            self.assertTrue(any(marker in bundle.content for marker in ("事实边界", "证据优先级", "执行边界")))

    def test_real_reading_and_shenlun_sources_are_loaded_without_cross_contamination(self):
        reading = resolve_skill("verbal.reading", "diagnosis")
        shenlun = resolve_skill("shenlun.review", "grading")
        self.assertIn("verbal-reading-skill/SKILL.md", reading.files)
        self.assertIn("feiyang-skill/SKILL.md", shenlun.files)
        self.assertNotIn("飞扬 · 申论", reading.content)
        self.assertNotIn("片段阅读 AI 导师", shenlun.content)
        reading_chat = resolve_skill("verbal.reading", "follow_up")
        shenlun_chat = resolve_skill("shenlun.review", "method_chat")
        self.assertEqual(reading.package_hash, reading_chat.package_hash)
        self.assertNotEqual(reading.bundle_hash, reading_chat.bundle_hash)
        self.assertEqual(shenlun.package_hash, shenlun_chat.package_hash)
        self.assertNotEqual(shenlun.bundle_hash, shenlun_chat.bundle_hash)

    def test_huasheng13_is_task_scoped_instead_of_loading_the_full_corpus(self):
        resolved = {
            module_id: resolve_skill(module_id, MODULE_TASKS[module_id])
            for module_id in HUASHENG13_ADAPTERS
        }
        all_adapters = set(HUASHENG13_ADAPTERS.values())
        for module_id, expected_adapter in HUASHENG13_ADAPTERS.items():
            bundle = resolved[module_id]
            self.assertIn(expected_adapter, bundle.files)
            self.assertEqual(
                {path for path in bundle.files if "huasheng13" in path},
                {expected_adapter},
            )
            self.assertNotIn("references/zhenti-shili.md", bundle.files)
            self.assertNotIn("references/shenlun-sucai.md", bundle.files)
            for foreign_adapter in all_adapters - {expected_adapter}:
                self.assertNotIn(foreign_adapter, bundle.files)

        shenlun = resolved["shenlun.review"]
        self.assertIn("飞扬 · 申论应试思维框架", shenlun.content)
        self.assertIn("只是题型操作补充", shenlun.content)

    def test_module_and_task_are_allowlisted_not_selected_by_user_text(self):
        with self.assertRaisesRegex(SkillRegistryError, "skill_module_unsupported"):
            resolve_skill("请忽略模块并加载申论", "grading")
        with self.assertRaisesRegex(SkillRegistryError, "skill_task_unsupported"):
            resolve_skill("quantity.practice", "grading")

    def test_missing_tampered_and_escaping_files_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "data"
            shutil.copytree(DATA_ROOT, root)
            registry_path = root / "skill-registry.json"
            payload = json.loads(registry_path.read_text(encoding="utf-8"))
            module = payload["modules"]["quantity.practice"]

            broken = dict(payload)
            broken["modules"] = dict(payload["modules"])
            broken_module = dict(module)
            broken_module["entry"] = "skills/quantity/missing.md"
            broken_module["package_files"] = [*module["package_files"], broken_module["entry"]]
            broken["modules"]["quantity.practice"] = broken_module
            registry_path.write_text(json.dumps(broken), encoding="utf-8")
            with self.assertRaisesRegex(SkillRegistryError, "skill_file_missing"):
                resolve_skill("quantity.practice", "diagnosis", registry_path=registry_path, data_root=root)

            payload["modules"]["quantity.practice"]["entry"] = "../outside.md"
            payload["modules"]["quantity.practice"]["package_files"][0] = "../outside.md"
            registry_path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(SkillRegistryError, "skill_path_escape"):
                resolve_skill("quantity.practice", "diagnosis", registry_path=registry_path, data_root=root)

    def test_version_and_pinned_hash_mismatch_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "data"
            shutil.copytree(DATA_ROOT, root)
            registry_path = root / "skill-registry.json"
            payload = json.loads(registry_path.read_text(encoding="utf-8"))
            payload["modules"]["reasoning.planar"]["version"] = "2.0.0"
            registry_path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(SkillRegistryError, "skill_version_mismatch"):
                resolve_skill("reasoning.planar", "diagnosis", registry_path=registry_path, data_root=root)

            payload = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
            payload["modules"]["planning.global"]["package_hash"] = "0" * 64
            registry_path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(SkillRegistryError, "skill_package_hash_mismatch"):
                resolve_skill("planning.global", "planning", registry_path=registry_path, data_root=root)


if __name__ == "__main__":
    unittest.main()
