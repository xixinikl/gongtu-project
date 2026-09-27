#!/usr/bin/env python3
"""Build the portable Phase 3 verbal catalog from validated local sources.

The source database is only an export input and is never copied.  Logic-fill
questions come from the JSON that was independently checked against the answer
summary PDF.  Output ordering and JSON formatting are deterministic.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
from urllib.parse import quote


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build(vocab_db: Path, question_json: Path, output_dir: Path) -> None:
    with sqlite3.connect(vocab_db) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT word, meaning, examples, search_url
               FROM highfreq_vocab ORDER BY id"""
        ).fetchall()
    vocab = []
    seen: set[str] = set()
    for row in rows:
        word = row["word"].strip()
        if not word or word in seen:
            continue
        seen.add(word)
        examples = [line.strip() for line in (row["examples"] or "").splitlines() if line.strip()]
        vocab.append(
            {
                "word": word,
                "meaning": (row["meaning"] or "").strip(),
                "examples": examples,
                "search_url": row["search_url"]
                or f"https://search.people.cn/s?keyword={quote(word)}",
            }
        )
    if len(vocab) != 801 or any(not item["examples"] for item in vocab):
        raise SystemExit("vocab gate failed: expected 801 unique entries with examples")

    source = json.loads(question_json.read_text(encoding="utf-8"))
    raw_questions = source["categories"]["logic_fill"]["questions"]
    logic = []
    module_counts: dict[str, int] = {}
    for raw in raw_questions:
        module = raw["source"].strip()
        module_counts[module] = module_counts.get(module, 0) + 1
        options = {key: raw["options"][key].strip() for key in ("A", "B", "C", "D")}
        answer = raw["answer"].strip().upper()
        if answer not in options:
            raise SystemExit(f"invalid answer for {raw['id']}")
        logic.append(
            {
                "id": f"haihai_logic_{len(logic) + 1:03d}",
                "source_id": raw["id"],
                "source_module": module,
                "module_sequence": module_counts[module],
                "stem": raw["stem"].strip(),
                "options": options,
                "correct_answer": answer,
                "official_analysis": None,
                "related_terms": list(dict.fromkeys(raw.get("relatedIdioms") or [])),
            }
        )
    if len(logic) != 231 or any(item["official_analysis"] is not None for item in logic):
        raise SystemExit("logic-fill gate failed: expected 231 questions without official analysis")

    output_dir.mkdir(parents=True, exist_ok=True)
    common = {
        "schema_version": "1.0.0",
        "generated_from": {
            "vocab_export_sha256": _sha256(vocab_db),
            "question_json_sha256": _sha256(question_json),
            "answer_audit": "450 questions compared by module order; 0 PDF answer mismatches",
        },
    }
    (output_dir / "vocab_801.json").write_text(
        json.dumps({**common, "count": len(vocab), "items": vocab}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (output_dir / "logic_fill_231.json").write_text(
        json.dumps({**common, "count": len(logic), "items": logic}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vocab-db", type=Path, required=True)
    parser.add_argument("--question-json", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("data/verbal_catalog"))
    args = parser.parse_args()
    build(args.vocab_db, args.question_json, args.output_dir)


if __name__ == "__main__":
    main()
