"""Schema and service-fact validation for verbal-reading diagnosis output."""
from __future__ import annotations

import json
from pathlib import Path
import re

from jsonschema import Draft202012Validator


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = PROJECT_ROOT / "spec" / "verbal-reading-ai-diagnosis-v1.schema.json"


def normalize_diagnosis_shape(output: dict) -> dict:
    """Repair harmless provider shape drift without changing grounded facts."""
    for feedback in output.get("question_feedback", []):
        better_path = feedback.get("better_path")
        if isinstance(better_path, str) and better_path.strip():
            steps = [step.strip() for step in re.split(r"[；;。]", better_path) if step.strip()]
            feedback["better_path"] = steps[:8] or [better_path.strip()[:160]]
        elif isinstance(better_path, list):
            normalized_steps: list[str] = []
            for raw_step in better_path:
                if not isinstance(raw_step, str):
                    continue
                normalized_steps.extend(
                    step.strip() for step in re.split(r"[；;。]", raw_step) if step.strip()
                )
            feedback["better_path"] = [step[:160] for step in normalized_steps[:8]]
    return output


def validate_diagnosis(output: dict, *, attempts: dict[str, dict]) -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator(schema).validate(output)

    allowed_ids = set(attempts)
    cited_ids: list[str] = []
    weakness = output.get("primary_weakness")
    if weakness:
        cited_ids.extend(weakness["evidence_question_ids"])
    for pattern in output.get("mistake_patterns", []):
        cited_ids.extend(pattern["question_ids"])
    if not set(cited_ids).issubset(allowed_ids):
        raise ValueError("diagnosis cites a question outside the session")

    seen_feedback: set[str] = set()
    for feedback in output.get("question_feedback", []):
        question_id = feedback["question_id"]
        fact = attempts.get(question_id)
        if not fact:
            raise ValueError("question feedback cites a question outside the session")
        if question_id in seen_feedback:
            raise ValueError("duplicate question feedback")
        seen_feedback.add(question_id)
        if feedback["user_answer"] != fact["final_answer"]:
            raise ValueError("diagnosis user answer conflicts with server fact")
        if feedback["correct_answer"] != fact["correct_answer"]:
            raise ValueError("diagnosis correct answer conflicts with question bank")

    recommended = (output.get("next_training") or {}).get("recommended_question_ids", [])
    if recommended:
        raise ValueError("Phase 2 diagnosis cannot invent recommendation ids")
