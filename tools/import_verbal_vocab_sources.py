#!/usr/bin/env python3
"""Import verified idiom vocab and Huasheng verbal questions into SQLite.

Default mode is dry-run. Use --apply to write the database. The apply mode
backs up data.db, data.db-wal and data.db-shm before touching the target DB.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parents[0]
BACKEND_DIR = PROJECT_ROOT / "backend"
BACKUP_ROOT = Path("/Users/miduoduo/Documents/gongtu-db-backups")

sys.path.insert(0, str(SCRIPT_DIR))
from verify_verbal_vocab_sources import (  # noqa: E402
    QUESTION_JSON,
    VOCAB_XLSX,
    flatten_question_json,
    verify_questions,
    verify_vocab,
)


def make_fingerprint(question: dict) -> str:
    payload = {
        "stem": question["stem"],
        "options": question["options"],
        "answer": question["answer"],
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def backup_db(db_path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = BACKUP_ROOT / f"before-vocab-verbal-import-{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    for suffix in ["", "-wal", "-shm"]:
        src = Path(str(db_path) + suffix)
        if src.exists():
            shutil.copy2(src, backup_dir / src.name)
    return backup_dir


def ensure_schema(db_path: Path) -> None:
    os.environ["GONTU_DB_PATH"] = str(db_path)
    sys.path.insert(0, str(BACKEND_DIR))
    from database import init_db  # noqa: WPS433

    init_db()


def build_vocab_records() -> tuple[list[dict], dict]:
    summary, entries = verify_vocab()
    seen: set[str] = set()
    records: list[dict] = []
    for entry in entries:
        word = entry["word"]
        if word in seen:
            continue
        seen.add(word)
        records.append(
            {
                "word": word,
                "meaning": entry["meaning"],
                "category": "考公高频",
                "examples": entry["examples"],
                "source": "内置词库",
                "search_url": f"https://search.people.cn/s?keyword={quote(word)}",
            }
        )
    return records, summary


def build_question_records() -> tuple[list[dict], dict]:
    summary = verify_questions()
    json_questions = flatten_question_json()
    records: list[dict] = []
    module_counts: dict[str, int] = {}
    for question in json_questions:
        source_module = question["source_module"]
        module_counts[source_module] = module_counts.get(source_module, 0) + 1
        records.append(
            {
                "id": question["id"],
                "bank_id": "huasheng_haihai",
                "question_type": question["type"],
                "source_module": source_module,
                "module_sequence": module_counts[source_module],
                "stem": question["stem"],
                "options_json": json.dumps(question["options"], ensure_ascii=False),
                "correct_answer": question["answer"],
                "explanation": question["explanation"],
                "related_terms_json": json.dumps(question.get("relatedIdioms", []), ensure_ascii=False),
                "fingerprint": make_fingerprint(question),
            }
        )
    return records, summary


def import_records(db_path: Path, apply: bool) -> dict:
    vocab_records, vocab_summary = build_vocab_records()
    question_records, question_summary = build_question_records()
    result = {
        "db_path": str(db_path),
        "mode": "apply" if apply else "dry-run",
        "source_files": {
            "vocab_xlsx": str(VOCAB_XLSX),
            "question_json": str(QUESTION_JSON),
        },
        "vocab_to_import": len(vocab_records),
        "questions_to_import": len(question_records),
        "vocab_summary": vocab_summary,
        "question_summary": {
            "total_xlsx_questions": question_summary["total_xlsx_questions"],
            "total_json_questions": question_summary["total_json_questions"],
            "by_type": question_summary["by_type"],
            "pdf_answer_mismatch_count": question_summary["pdf_answer_mismatch_count"],
            "raw_question_number_anomaly_count": question_summary["raw_question_number_anomaly_count"],
        },
        "backup_dir": "",
    }
    if not apply:
        return result

    backup_dir = backup_db(db_path)
    result["backup_dir"] = str(backup_dir)
    ensure_schema(db_path)

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        new_vocab_words = [item["word"] for item in vocab_records]
        placeholders = ",".join("?" for _ in new_vocab_words)
        conn.execute(
            f"DELETE FROM highfreq_vocab WHERE word NOT IN ({placeholders})",  # nosec B608 - placeholders are generated from record count only.
            new_vocab_words,
        )
        for item in vocab_records:
            conn.execute(
                """
                INSERT INTO highfreq_vocab
                    (word, meaning, category, examples, source, search_url)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(word) DO UPDATE SET
                    meaning=excluded.meaning,
                    category=excluded.category,
                    examples=excluded.examples,
                    source=excluded.source,
                    search_url=excluded.search_url
                """,
                (
                    item["word"],
                    item["meaning"],
                    item["category"],
                    item["examples"],
                    item["source"],
                    item["search_url"],
                ),
            )

        conn.execute(
            """
            INSERT INTO question_banks (id, name, version, description, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                version=excluded.version,
                description=excluded.description,
                updated_at=datetime('now')
            """,
            ("huasheng_haihai", "花生海海刷", "2026.07", "四海海海刷言语理解题库"),
        )
        for item in question_records:
            conn.execute(
                """
                INSERT INTO verbal_questions
                    (id, bank_id, question_type, source_module, module_sequence,
                     stem, options_json, correct_answer, explanation,
                     related_terms_json, fingerprint, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                    bank_id=excluded.bank_id,
                    question_type=excluded.question_type,
                    source_module=excluded.source_module,
                    module_sequence=excluded.module_sequence,
                    stem=excluded.stem,
                    options_json=excluded.options_json,
                    correct_answer=excluded.correct_answer,
                    explanation=excluded.explanation,
                    related_terms_json=excluded.related_terms_json,
                    fingerprint=excluded.fingerprint,
                    updated_at=datetime('now')
                """,
                (
                    item["id"],
                    item["bank_id"],
                    item["question_type"],
                    item["source_module"],
                    item["module_sequence"],
                    item["stem"],
                    item["options_json"],
                    item["correct_answer"],
                    item["explanation"],
                    item["related_terms_json"],
                    item["fingerprint"],
                ),
            )
        conn.commit()

        result["post_import_counts"] = {
            "highfreq_vocab": conn.execute("SELECT COUNT(*) FROM highfreq_vocab").fetchone()[0],
            "highfreq_vocab_with_examples": conn.execute(
                "SELECT COUNT(*) FROM highfreq_vocab WHERE examples <> ''"
            ).fetchone()[0],
            "question_banks": conn.execute("SELECT COUNT(*) FROM question_banks").fetchone()[0],
            "verbal_questions": conn.execute("SELECT COUNT(*) FROM verbal_questions").fetchone()[0],
            "logic_fill": conn.execute(
                "SELECT COUNT(*) FROM verbal_questions WHERE question_type='logic_fill'"
            ).fetchone()[0],
            "reading_comprehension": conn.execute(
                "SELECT COUNT(*) FROM verbal_questions WHERE question_type='reading_comprehension'"
            ).fetchone()[0],
        }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=str(BACKEND_DIR / "data.db"), help="SQLite database path")
    parser.add_argument("--apply", action="store_true", help="Write to database; default is dry-run")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    result = import_records(db_path, args.apply)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
