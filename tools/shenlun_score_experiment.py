"""申论 AI 评分一致性实验。

输入一个 CSV，每行一份作答：answer_id, question_id, answer，以及若干以
rater 开头的列（每位评分人按要点赋分表独立给出的分数）。脚本对每份作答
调用系统的批改模块若干次，输出逐次结果和汇总指标：

- 准确性：AI 平均分与参考分（评分人平均分）的平均绝对误差、均方根误差、
  Pearson 与 Spearman 相关系数；
- 稳定性：同一作答多次批改得分的标准差、失败率；
- 评分人一致性：评分人之间的平均绝对误差与相关系数。

用法（在项目根目录）：
    python tools/shenlun_score_experiment.py --input answers.csv --runs 3
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import sys
import time
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND = PROJECT_ROOT / "backend"
QUESTIONS_PATH = BACKEND / "data" / "questions.json"


def load_questions(path: Path = QUESTIONS_PATH) -> dict[str, Any]:
    sys.path.insert(0, str(BACKEND))
    from src.models import Question

    data = json.loads(path.read_text(encoding="utf-8"))
    questions = {}
    for raw in data.get("questions", []):
        item = dict(raw)
        points = item.pop("scoringPoints", [])
        item["referenceAnswer"] = {
            "fullText": item.pop("referenceAnswer", ""),
            "scoringPoints": points,
        }
        questions[item["id"]] = Question(**item)
    return questions


def read_answers(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames or []
        raters = [name for name in fields if name.lower().startswith("rater")]
        missing = {"answer_id", "question_id", "answer"} - set(fields)
        if missing:
            raise SystemExit(f"CSV 缺少列：{', '.join(sorted(missing))}")
        if not raters:
            raise SystemExit("CSV 至少需要一列 rater 开头的参考分")
        rows = []
        for row in reader:
            if not (row.get("answer") or "").strip():
                continue
            row["ref_scores"] = [float(row[name]) for name in raters]
            rows.append(row)
    return rows, raters


def _ranks(values: Sequence[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def pearson(x: Sequence[float], y: Sequence[float]) -> float | None:
    if len(x) < 3 or len(set(x)) < 2 or len(set(y)) < 2:
        return None
    return statistics.correlation(x, y)


def spearman(x: Sequence[float], y: Sequence[float]) -> float | None:
    return pearson(_ranks(x), _ranks(y))


def compare(ai: Sequence[float], ref: Sequence[float]) -> dict[str, float | None]:
    errors = [a - r for a, r in zip(ai, ref)]
    return {
        "n": len(errors),
        "mae": statistics.fmean(abs(e) for e in errors) if errors else None,
        "rmse": math.sqrt(statistics.fmean(e * e for e in errors)) if errors else None,
        "mean_bias": statistics.fmean(errors) if errors else None,
        "pearson": pearson(ai, ref),
        "spearman": spearman(ai, ref),
    }


def summarize(results: list[dict[str, Any]], raters: list[str]) -> dict[str, Any]:
    scored = [r for r in results if r["ai_scores"]]
    ai_mean = [statistics.fmean(r["ai_scores"]) for r in scored]
    ref_mean = [statistics.fmean(r["ref_scores"]) for r in scored]
    # 为便于跨题比较，另外给出按满分归一化到百分制后的误差。
    ai_pct = [a / r["max_score"] * 100 for a, r in zip(ai_mean, scored)]
    ref_pct = [b / r["max_score"] * 100 for b, r in zip(ref_mean, scored)]
    run_sd = [statistics.pstdev(r["ai_scores"]) for r in scored if len(r["ai_scores"]) > 1]
    attempts = sum(r["attempts"] for r in results)
    failures = sum(r["failures"] for r in results)
    latencies = [t for r in results for t in r["latencies"]]

    inter_rater = []
    for i in range(len(raters)):
        for j in range(i + 1, len(raters)):
            a = [r["ref_scores"][i] for r in results]
            b = [r["ref_scores"][j] for r in results]
            inter_rater.append({"pair": f"{raters[i]}-{raters[j]}", **compare(a, b)})

    return {
        "answers": len(results),
        "answers_scored": len(scored),
        "accuracy": compare(ai_mean, ref_mean),
        "accuracy_percent_scale": compare(ai_pct, ref_pct),
        "stability": {
            "mean_run_sd": statistics.fmean(run_sd) if run_sd else None,
            "max_run_sd": max(run_sd) if run_sd else None,
            "failure_rate": failures / attempts if attempts else None,
            "mean_latency_s": statistics.fmean(latencies) if latencies else None,
        },
        "inter_rater": inter_rater,
    }


def run_experiment(
    rows: list[dict[str, Any]],
    questions: dict[str, Any],
    grade: Callable[[Any, str], Any],
    runs: int,
    log: Callable[[str], None] = print,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    results, run_rows = [], []
    for index, row in enumerate(rows, 1):
        question = questions.get(row["question_id"])
        if question is None:
            raise SystemExit(f"题库中没有题目 {row['question_id']}")
        item = {
            "answer_id": row["answer_id"],
            "question_id": row["question_id"],
            "max_score": float(question.score),
            "ref_scores": row["ref_scores"],
            "ai_scores": [],
            "attempts": 0,
            "failures": 0,
            "latencies": [],
        }
        for run in range(1, runs + 1):
            item["attempts"] += 1
            start = time.time()
            try:
                result = grade(question, row["answer"])
                score = result.score
                if score is None:
                    raise ValueError("no score")
                error = ""
            except Exception as exc:  # 记录失败，继续实验
                score, error = None, type(exc).__name__
                item["failures"] += 1
            elapsed = time.time() - start
            item["latencies"].append(elapsed)
            if score is not None:
                item["ai_scores"].append(float(score))
            run_rows.append({
                "answer_id": row["answer_id"],
                "question_id": row["question_id"],
                "run": run,
                "ai_score": "" if score is None else score,
                "max_score": item["max_score"],
                "latency_s": round(elapsed, 2),
                "error": error,
            })
        log(f"[{index}/{len(rows)}] {row['answer_id']} AI={item['ai_scores']} 参考={row['ref_scores']}")
        results.append(item)
    return results, run_rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="申论 AI 评分一致性实验")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--out-dir", type=Path, default=Path("experiment-output"))
    args = parser.parse_args(argv)

    from dotenv import load_dotenv

    load_dotenv(BACKEND / ".env")
    sys.path.insert(0, str(BACKEND))
    from src.grader import MODEL, grade

    questions = load_questions()
    rows, raters = read_answers(args.input)
    results, run_rows = run_experiment(rows, questions, grade, args.runs)
    summary = summarize(results, raters)
    summary["model"] = MODEL
    summary["runs_per_answer"] = args.runs

    args.out_dir.mkdir(parents=True, exist_ok=True)
    with (args.out_dir / "runs.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(run_rows[0]) if run_rows else ["answer_id"])
        writer.writeheader()
        writer.writerows(run_rows)
    (args.out_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
