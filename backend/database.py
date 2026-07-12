"""SQLite database connection & lifecycle."""
import os
import sqlite3
import logging
from contextlib import contextmanager
from typing import Generator

DB_PATH = os.environ.get("GONTU_DB_PATH", os.path.join(os.path.dirname(__file__), "data.db"))

logger = logging.getLogger("gontu.db")


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Context manager — guarantees connection close even on exceptions."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    """Create tables if they don't exist (safe to call on every startup)."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS cards (
                id          TEXT PRIMARY KEY,
                deck        TEXT NOT NULL DEFAULT 'math',
                title       TEXT NOT NULL,
                stars       TEXT DEFAULT '',
                difficulty  TEXT DEFAULT '',
                example     TEXT DEFAULT '',
                solution    TEXT DEFAULT '',
                answer      TEXT DEFAULT '',
                variants    TEXT DEFAULT '',
                blank_steps TEXT DEFAULT NULL
            );

            CREATE TABLE IF NOT EXISTS quiz_items (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                desc        TEXT NOT NULL,
                opts        TEXT NOT NULL,
                ans         INTEGER NOT NULL DEFAULT 0,
                tip         TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS learning_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     TEXT NOT NULL,
                card_id     TEXT NOT NULL,
                action      TEXT NOT NULL CHECK(action IN ('correct','wrong','mastered','reset')),
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_events_user   ON learning_events(user_id);
            CREATE INDEX IF NOT EXISTS idx_events_card    ON learning_events(card_id);
            CREATE INDEX IF NOT EXISTS idx_events_created ON learning_events(created_at);

            CREATE TABLE IF NOT EXISTS highfreq_vocab (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                word        TEXT NOT NULL UNIQUE,
                meaning     TEXT DEFAULT '',
                category    TEXT DEFAULT '考公高频',
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS users (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                username     TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at   TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS questions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                node_path     TEXT NOT NULL,
                title         TEXT NOT NULL,
                image_path    TEXT,
                notes         TEXT,
                option_a      TEXT,
                option_b      TEXT,
                option_c      TEXT,
                option_d      TEXT,
                correct_answer TEXT,
                created_at    TEXT DEFAULT (datetime('now')),
                updated_at    TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS reviews (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                question_id  INTEGER NOT NULL,
                stage        INTEGER DEFAULT 0,
                score        INTEGER,
                reviewed_at  TEXT DEFAULT (datetime('now')),
                next_review  TEXT,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS shenlun_history (
                id              TEXT PRIMARY KEY,
                user_id         INTEGER NOT NULL,
                question_id     TEXT NOT NULL,
                question_title  TEXT NOT NULL,
                question_type   TEXT NOT NULL,
                student_answer  TEXT NOT NULL,
                word_count      INTEGER DEFAULT 0,
                grading_result  TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS shenlun_mistakes (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL,
                question_id     TEXT NOT NULL,
                question_title  TEXT NOT NULL,
                question_type   TEXT NOT NULL,
                student_answer  TEXT NOT NULL,
                ai_reply        TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)
        conn.commit()

        # ── v3 migration: add user_id to questions (per-user isolation) ──
        try:
            conn.execute("ALTER TABLE questions ADD COLUMN user_id TEXT NOT NULL DEFAULT ''")
            conn.commit()
            logger.info("Migration: added user_id column to questions")
        except sqlite3.OperationalError:
            pass  # column already exists

        # ── v3 migration: add user_id to reviews (per-user isolation) ──
        try:
            conn.execute("ALTER TABLE reviews ADD COLUMN user_id TEXT NOT NULL DEFAULT ''")
            conn.commit()
            logger.info("Migration: added user_id column to reviews")
        except sqlite3.OperationalError:
            pass  # column already exists

        # ── v4 migration: user_decks 表（per-user 牌组持久化）──
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS user_decks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                deck_type   TEXT NOT NULL,       -- 'idiom' | 'math'
                cards_json  TEXT DEFAULT '[]',    -- JSON array of card objects
                queue_json  TEXT DEFAULT NULL,    -- JSON object {date, items[], total, doneToday}
                settings_json TEXT DEFAULT '{}',  -- JSON object e.g. {dailyNewCount:10}
                updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(user_id, deck_type)
            );

            CREATE TABLE IF NOT EXISTS user_meta (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL UNIQUE,
                heatmap_json    TEXT DEFAULT '{}',   -- {"2026-06-14":3, ...}
                streak          INTEGER DEFAULT 0,
                last_study_date TEXT DEFAULT '',
                daily_goal      INTEGER DEFAULT 20,
                updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)
        conn.commit()
        logger.info("Table check: user_decks + user_meta ready")

        # ── v5 migration: custom_vocab 表（用户自定义词库）──
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS custom_vocab (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                source_name TEXT NOT NULL DEFAULT '我的词库',
                word        TEXT NOT NULL,
                meaning     TEXT DEFAULT '',
                category    TEXT DEFAULT '自定义',
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(user_id, word)
            );
            CREATE INDEX IF NOT EXISTS idx_custom_vocab_user ON custom_vocab(user_id);
        """)
        conn.commit()
        logger.info("Table check: custom_vocab ready")

        # ── v6 migration: user_meta.mindmap_review_json 字段 ──
        try:
            conn.execute("ALTER TABLE user_meta ADD COLUMN mindmap_review_json TEXT DEFAULT '{}'")
            conn.commit()
            logger.info("Migration: added mindmap_review_json column to user_meta")
        except sqlite3.OperationalError:
            pass  # column already exists

        # ── v7 migration: users.is_admin 字段 ──
        try:
            conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
            conn.commit()
            logger.info("Migration: added is_admin column to users")
        except sqlite3.OperationalError:
            pass  # column already exists

        # ── v8 migration: vocab examples + separated learning state + verbal bank ──
        for ddl, label in [
            ("ALTER TABLE highfreq_vocab ADD COLUMN examples TEXT DEFAULT ''", "highfreq_vocab.examples"),
            ("ALTER TABLE highfreq_vocab ADD COLUMN source TEXT DEFAULT '人民网'", "highfreq_vocab.source"),
            ("ALTER TABLE highfreq_vocab ADD COLUMN search_url TEXT DEFAULT ''", "highfreq_vocab.search_url"),
        ]:
            try:
                conn.execute(ddl)
                conn.commit()
                logger.info("Migration: added %s", label)
            except sqlite3.OperationalError:
                pass

        conn.executescript("""
            CREATE TABLE IF NOT EXISTS vocab_learning_state (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id          INTEGER NOT NULL,
                vocab_source     TEXT NOT NULL DEFAULT 'builtin',
                word             TEXT NOT NULL,
                study_count      INTEGER NOT NULL DEFAULT 0,
                forget_count     INTEGER NOT NULL DEFAULT 0,
                interval_idx     INTEGER NOT NULL DEFAULT 0,
                mastered         INTEGER NOT NULL DEFAULT 0,
                favorite         INTEGER NOT NULL DEFAULT 0,
                last_study_date  TEXT DEFAULT '',
                next_review_date TEXT DEFAULT '',
                updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(user_id, vocab_source, word)
            );
            CREATE INDEX IF NOT EXISTS idx_vocab_state_user_source
                ON vocab_learning_state(user_id, vocab_source);
            CREATE INDEX IF NOT EXISTS idx_vocab_state_next_review
                ON vocab_learning_state(user_id, next_review_date);

            CREATE TABLE IF NOT EXISTS question_banks (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                version     TEXT DEFAULT '',
                description TEXT DEFAULT '',
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS verbal_questions (
                id                 TEXT PRIMARY KEY,
                bank_id            TEXT NOT NULL,
                question_type      TEXT NOT NULL,
                source_module      TEXT NOT NULL,
                module_sequence    INTEGER NOT NULL,
                stem               TEXT NOT NULL,
                options_json       TEXT NOT NULL,
                correct_answer     TEXT NOT NULL,
                explanation        TEXT DEFAULT '',
                related_terms_json TEXT DEFAULT '[]',
                fingerprint        TEXT NOT NULL,
                created_at         TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY(bank_id) REFERENCES question_banks(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_verbal_questions_bank_type
                ON verbal_questions(bank_id, question_type);
            CREATE INDEX IF NOT EXISTS idx_verbal_questions_module
                ON verbal_questions(bank_id, source_module, module_sequence);
            CREATE INDEX IF NOT EXISTS idx_verbal_questions_fingerprint
                ON verbal_questions(fingerprint);

            CREATE TABLE IF NOT EXISTS verbal_attempts (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id            INTEGER NOT NULL,
                question_id        TEXT NOT NULL,
                selected_answer    TEXT NOT NULL,
                is_correct         INTEGER NOT NULL,
                time_spent_seconds INTEGER DEFAULT 0,
                created_at         TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY(question_id) REFERENCES verbal_questions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_verbal_attempts_user
                ON verbal_attempts(user_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_verbal_attempts_question
                ON verbal_attempts(question_id);
        """)
        conn.commit()

        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='verbal_questions'"
        ).fetchone()
        table_sql = row["sql"] if row else ""
        if "fingerprint        TEXT NOT NULL UNIQUE" in table_sql or "fingerprint TEXT NOT NULL UNIQUE" in table_sql:
            logger.info("Migration: relaxing verbal_questions.fingerprint unique constraint")
            conn.executescript("""
                ALTER TABLE verbal_questions RENAME TO verbal_questions_old_unique;
                CREATE TABLE verbal_questions (
                    id                 TEXT PRIMARY KEY,
                    bank_id            TEXT NOT NULL,
                    question_type      TEXT NOT NULL,
                    source_module      TEXT NOT NULL,
                    module_sequence    INTEGER NOT NULL,
                    stem               TEXT NOT NULL,
                    options_json       TEXT NOT NULL,
                    correct_answer     TEXT NOT NULL,
                    explanation        TEXT DEFAULT '',
                    related_terms_json TEXT DEFAULT '[]',
                    fingerprint        TEXT NOT NULL,
                    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY(bank_id) REFERENCES question_banks(id) ON DELETE CASCADE
                );
                INSERT OR IGNORE INTO verbal_questions
                    (id, bank_id, question_type, source_module, module_sequence,
                     stem, options_json, correct_answer, explanation,
                     related_terms_json, fingerprint, created_at, updated_at)
                SELECT id, bank_id, question_type, source_module, module_sequence,
                       stem, options_json, correct_answer, explanation,
                       related_terms_json, fingerprint, created_at, updated_at
                FROM verbal_questions_old_unique;
                DROP TABLE verbal_questions_old_unique;
                CREATE INDEX IF NOT EXISTS idx_verbal_questions_bank_type
                    ON verbal_questions(bank_id, question_type);
                CREATE INDEX IF NOT EXISTS idx_verbal_questions_module
                    ON verbal_questions(bank_id, source_module, module_sequence);
                CREATE INDEX IF NOT EXISTS idx_verbal_questions_fingerprint
                    ON verbal_questions(fingerprint);
            """)
            conn.commit()

        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='verbal_attempts'"
        ).fetchone()
        attempts_sql = row["sql"] if row else ""
        if "verbal_questions_old_unique" in attempts_sql:
            logger.info("Migration: fixing verbal_attempts foreign key target")
            conn.executescript("""
                ALTER TABLE verbal_attempts RENAME TO verbal_attempts_old_fk;
                CREATE TABLE verbal_attempts (
                    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id            INTEGER NOT NULL,
                    question_id        TEXT NOT NULL,
                    selected_answer    TEXT NOT NULL,
                    is_correct         INTEGER NOT NULL,
                    time_spent_seconds INTEGER DEFAULT 0,
                    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY(question_id) REFERENCES verbal_questions(id) ON DELETE CASCADE
                );
                INSERT INTO verbal_attempts
                    (id, user_id, question_id, selected_answer, is_correct, time_spent_seconds, created_at)
                SELECT id, user_id, question_id, selected_answer, is_correct, time_spent_seconds, created_at
                FROM verbal_attempts_old_fk;
                DROP TABLE verbal_attempts_old_fk;
                CREATE INDEX IF NOT EXISTS idx_verbal_attempts_user
                    ON verbal_attempts(user_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_verbal_attempts_question
                    ON verbal_attempts(question_id);
            """)
            conn.commit()
        logger.info("Table check: vocab_learning_state + verbal question bank ready")


def cleanup_old_events(retention_days: int = 365):
    """Remove learning events older than retention_days (must be positive)."""
    if retention_days <= 0:
        logger.warning(f"cleanup_old_events called with invalid retention_days={retention_days}, skipping")
        return 0
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM learning_events WHERE created_at < datetime('now', ? || ' days')",
            (f'-{retention_days}',)
        )
        conn.commit()
        deleted = cursor.rowcount
        if deleted:
            logger.info(f"Cleaned up {deleted} old learning events (>{retention_days}d)")
        return deleted
