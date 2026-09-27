from __future__ import annotations

import csv
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "backend"))

import shenlun_score_experiment as experiment  # noqa: E402


class ShenlunScoreExperimentTest(unittest.TestCase):
    def test_metrics_on_known_values(self):
        stats = experiment.compare([6, 8, 10], [5, 8, 9])
        self.assertAlmostEqual(stats["mae"], 2 / 3)
        self.assertAlmostEqual(stats["mean_bias"], 2 / 3)
        self.assertAlmostEqual(stats["spearman"], 1.0)
        self.assertEqual(experiment._ranks([3, 1, 3]), [2.5, 1.0, 2.5])

    def test_run_with_fake_grader_counts_failures(self):
        questions = experiment.load_questions()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "answers.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(["answer_id", "question_id", "answer", "rater1", "rater2"])
                writer.writerow(["a1", "q3-1", "作答一", "6", "7"])
                writer.writerow(["a2", "q3-1", "作答二", "9", "9"])
                writer.writerow(["a3", "q3-2", "作答三", "4", "5"])
            rows, raters = experiment.read_answers(path)
        self.assertEqual(raters, ["rater1", "rater2"])

        calls = {"n": 0}

        def fake_grade(question, answer):
            calls["n"] += 1
            if calls["n"] == 2:
                raise TimeoutError("slow")
            return SimpleNamespace(score={"作答一": 6.0, "作答二": 9.0, "作答三": 5.0}[answer])

        results, run_rows = experiment.run_experiment(
            rows, questions, fake_grade, runs=2, log=lambda _: None
        )
        summary = experiment.summarize(results, raters)
        self.assertEqual(len(run_rows), 6)
        self.assertAlmostEqual(summary["stability"]["failure_rate"], 1 / 6)
        self.assertEqual(summary["answers_scored"], 3)
        self.assertEqual(summary["stability"]["mean_run_sd"], 0)
        self.assertEqual(summary["inter_rater"][0]["pair"], "rater1-rater2")
        self.assertAlmostEqual(summary["accuracy"]["mae"], (0.5 + 0 + 0.5) / 3)


if __name__ == "__main__":
    unittest.main()
