"""Deterministic same-type original-question retrieval from the approved bank."""
from __future__ import annotations


def _values(question: dict) -> dict[str, set[str]]:
    tags = question.get("learning_tags") or {}
    traps = tags.get("option_trap_tags") or {}
    return {
        "题型": {tags.get("question_type")} - {None, ""},
        "结构": {tags.get("passage_type")} - {None, ""},
        "方法": set(tags.get("method_tags") or []),
        # Correct-option labels describe why an answer is right; they are not
        # distractor traps and must not drive weakness matching or UI reasons.
        "陷阱": {
            tag
            for values in traps.values()
            for tag in (values or [])
            if tag and not str(tag).startswith("正确")
        },
        "弱步骤": set(tags.get("weak_steps") or []),
    }


def recommend_original_questions(
    bank: dict[str, dict],
    *,
    current_set_id: str,
    evidence_question_ids: list[str],
    limit: int = 5,
) -> list[dict]:
    targets = []
    for set_data in bank.values():
        for question in set_data["questions"]:
            if question["id"] in evidence_question_ids:
                targets.append(_values(question))
    if not targets:
        return []

    candidates = []
    weights = {"题型": 5, "结构": 2, "方法": 4, "陷阱": 3, "弱步骤": 2}
    for set_id, set_data in bank.items():
        if set_id == current_set_id:
            continue
        for question in set_data["questions"]:
            values = _values(question)
            dimensions: dict[str, set[str]] = {}
            score = 0
            for dimension, weight in weights.items():
                shared = set().union(*(target[dimension] & values[dimension] for target in targets))
                if shared:
                    dimensions[dimension] = shared
                    score += weight + min(2, len(shared) - 1)
            if len(dimensions) < 2:
                continue
            reason_tags = [
                f"{dimension}:{value}"
                for dimension, shared in dimensions.items()
                for value in sorted(shared)[:2]
            ]
            candidates.append(
                {
                    "question_id": question["id"],
                    "set_id": set_id,
                    "question_no": question["question_no"],
                    "score": score,
                    "reason_tags": reason_tags,
                }
            )

    candidates.sort(key=lambda item: (-item["score"], item["set_id"], item["question_no"]))
    selected = []
    used_sets: set[str] = set()
    for candidate in candidates:
        if candidate["set_id"] in used_sets and len(used_sets) < limit:
            continue
        selected.append(candidate)
        used_sets.add(candidate["set_id"])
        if len(selected) == limit:
            break
    if len(selected) < min(3, limit):
        selected_ids = {item["question_id"] for item in selected}
        for candidate in candidates:
            if candidate["question_id"] not in selected_ids:
                selected.append(candidate)
                if len(selected) == min(limit, 3):
                    break
    return selected[:limit]
