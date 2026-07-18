"""SQLite database connection & lifecycle."""

import os
import sqlite3
import logging
from contextlib import contextmanager
from typing import Generator

DB_PATH = os.environ.get(
    "GONTU_DB_PATH", os.path.join(os.path.dirname(__file__), "data.db")
)

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
                source_history_id TEXT,
                record_type     TEXT NOT NULL DEFAULT 'grading',
                question_title  TEXT NOT NULL,
                question_type   TEXT NOT NULL,
                question_text   TEXT NOT NULL DEFAULT '',
                question_requirement TEXT NOT NULL DEFAULT '',
                material        TEXT NOT NULL DEFAULT '',
                student_answer  TEXT NOT NULL,
                ai_reply        TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS shenlun_grade_requests (
                user_id         INTEGER NOT NULL,
                idempotency_key TEXT NOT NULL,
                request_hash    TEXT NOT NULL,
                status          TEXT NOT NULL
                                CHECK(status IN ('pending','completed','failed')),
                record_id       TEXT,
                response_json   TEXT,
                error_code      TEXT,
                http_status     INTEGER,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                finished_at     TEXT,
                PRIMARY KEY (user_id, idempotency_key),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (record_id) REFERENCES shenlun_history(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_shenlun_grade_requests_owner_status
                ON shenlun_grade_requests(user_id, status, updated_at DESC);
        """)
        conn.commit()

        # ── v3 migration: add user_id to questions (per-user isolation) ──
        try:
            conn.execute(
                "ALTER TABLE questions ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"
            )
            conn.commit()
            logger.info("Migration: added user_id column to questions")
        except sqlite3.OperationalError:
            pass  # column already exists

        # ── v10 migration: 申论问题追踪保留完整题目与来源历史 ──
        for column_sql in (
            "ALTER TABLE shenlun_mistakes ADD COLUMN source_history_id TEXT",
            "ALTER TABLE shenlun_mistakes ADD COLUMN record_type TEXT NOT NULL DEFAULT 'grading'",
            "ALTER TABLE shenlun_mistakes ADD COLUMN question_text TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE shenlun_mistakes ADD COLUMN question_requirement TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE shenlun_mistakes ADD COLUMN material TEXT NOT NULL DEFAULT ''",
        ):
            try:
                conn.execute(column_sql)
                conn.commit()
            except sqlite3.OperationalError:
                pass  # column already exists
        conn.execute(
            """CREATE UNIQUE INDEX IF NOT EXISTS idx_shenlun_mistakes_owner_history
               ON shenlun_mistakes(user_id, source_history_id)
               WHERE source_history_id IS NOT NULL"""
        )
        conn.commit()

        # ── v9 migration: 跨模块学习活动、问题与任务索引层 ──
        # 现有词库、片段阅读、图推和申论垂直表继续作为事实层；
        # 这四张表只建立可跨模块查询的用户活动、问题和下一步任务。
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS learning_activities_v2 (
                id              TEXT PRIMARY KEY,
                user_id         INTEGER NOT NULL,
                module_id       TEXT NOT NULL,
                activity_type   TEXT NOT NULL,
                source_id       TEXT,
                status          TEXT NOT NULL DEFAULT 'in_progress'
                                CHECK(status IN ('in_progress','completed','abandoned')),
                started_at      TEXT NOT NULL,
                completed_at    TEXT,
                duration_ms     INTEGER NOT NULL DEFAULT 0 CHECK(duration_ms >= 0),
                summary_json    TEXT NOT NULL DEFAULT '{}',
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_learning_activities_v2_user_time
                ON learning_activities_v2(user_id, started_at DESC);
            CREATE INDEX IF NOT EXISTS idx_learning_activities_v2_user_module
                ON learning_activities_v2(user_id, module_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS learning_issues_v2 (
                id                  TEXT PRIMARY KEY,
                user_id             INTEGER NOT NULL,
                module_id           TEXT NOT NULL,
                issue_key           TEXT NOT NULL,
                user_facing_title   TEXT NOT NULL,
                internal_confidence REAL,
                evidence_count      INTEGER NOT NULL DEFAULT 0 CHECK(evidence_count >= 0),
                status              TEXT NOT NULL DEFAULT 'observing'
                                    CHECK(status IN ('observing','training','improved','archived')),
                first_seen_at       TEXT NOT NULL,
                last_seen_at        TEXT NOT NULL,
                created_at          TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(user_id, module_id, issue_key),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_learning_issues_v2_user_status
                ON learning_issues_v2(user_id, module_id, status, last_seen_at DESC);

            CREATE TABLE IF NOT EXISTS learning_issue_evidence_v2 (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                issue_id        TEXT NOT NULL,
                user_id         INTEGER NOT NULL,
                activity_id     TEXT,
                item_id         TEXT,
                evidence_type   TEXT NOT NULL,
                evidence_json   TEXT NOT NULL DEFAULT '{}',
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (issue_id) REFERENCES learning_issues_v2(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (activity_id) REFERENCES learning_activities_v2(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_learning_issue_evidence_v2_owner
                ON learning_issue_evidence_v2(user_id, issue_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS learning_tasks_v2 (
                id              TEXT PRIMARY KEY,
                user_id         INTEGER NOT NULL,
                module_id       TEXT NOT NULL,
                issue_id        TEXT,
                task_type       TEXT NOT NULL,
                title           TEXT NOT NULL,
                target_count    INTEGER NOT NULL DEFAULT 0 CHECK(target_count >= 0),
                status          TEXT NOT NULL DEFAULT 'pending'
                                CHECK(status IN ('pending','in_progress','completed','dismissed')),
                result_json     TEXT NOT NULL DEFAULT '{}',
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
                completed_at    TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (issue_id) REFERENCES learning_issues_v2(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_learning_tasks_v2_user_status
                ON learning_tasks_v2(user_id, status, updated_at DESC);
        """)
        conn.commit()
        logger.info("Table check: unified learning activity/issue/task index ready")

        # ── v8 migration: 片段阅读真实练习会话（per-user）──
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS verbal_practice_sessions (
                id              TEXT PRIMARY KEY,
                user_id         INTEGER NOT NULL,
                set_id          TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'in_progress'
                                CHECK(status IN ('in_progress', 'submitted')),
                started_at      TEXT NOT NULL,
                submitted_at    TEXT,
                elapsed_ms      INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_ms >= 0),
                score           INTEGER,
                question_count  INTEGER NOT NULL DEFAULT 20 CHECK(question_count > 0),
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_verbal_sessions_user_updated
                ON verbal_practice_sessions(user_id, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_verbal_sessions_set
                ON verbal_practice_sessions(set_id);

            CREATE TABLE IF NOT EXISTS verbal_attempt_items (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      TEXT NOT NULL,
                question_id     TEXT NOT NULL,
                first_answer    TEXT CHECK(first_answer IN ('A','B','C','D')),
                final_answer    TEXT CHECK(final_answer IN ('A','B','C','D')),
                correct_answer  TEXT NOT NULL CHECK(correct_answer IN ('A','B','C','D')),
                is_correct      INTEGER NOT NULL DEFAULT 0 CHECK(is_correct IN (0,1)),
                elapsed_ms      INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_ms >= 0),
                change_count    INTEGER NOT NULL DEFAULT 0 CHECK(change_count >= 0),
                answered_at     TEXT NOT NULL,
                UNIQUE(session_id, question_id),
                FOREIGN KEY (session_id) REFERENCES verbal_practice_sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_verbal_attempts_session
                ON verbal_attempt_items(session_id);

            CREATE TABLE IF NOT EXISTS verbal_ai_runs (
                id              TEXT PRIMARY KEY,
                session_id      TEXT NOT NULL,
                user_id         INTEGER NOT NULL,
                kind            TEXT NOT NULL CHECK(kind IN ('diagnosis', 'follow_up')),
                provider        TEXT NOT NULL,
                model           TEXT NOT NULL,
                skill_version   TEXT NOT NULL,
                skill_hash      TEXT NOT NULL,
                status          TEXT NOT NULL CHECK(status IN
                                ('queued','running','completed','failed','timed_out','invalid_output')),
                started_at      TEXT NOT NULL,
                finished_at     TEXT,
                latency_ms      INTEGER,
                usage_json      TEXT,
                error_code      TEXT,
                output_json     TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (session_id) REFERENCES verbal_practice_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_verbal_ai_runs_session_kind
                ON verbal_ai_runs(session_id, kind, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_verbal_ai_runs_user
                ON verbal_ai_runs(user_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS verbal_ai_messages (
                id              TEXT PRIMARY KEY,
                session_id      TEXT NOT NULL,
                user_id         INTEGER NOT NULL,
                question_id     TEXT,
                role            TEXT NOT NULL CHECK(role IN ('user','assistant')),
                content         TEXT NOT NULL,
                run_id          TEXT,
                created_at      TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES verbal_practice_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (run_id) REFERENCES verbal_ai_runs(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_verbal_messages_session_user
                ON verbal_ai_messages(session_id, user_id, created_at);

            CREATE TABLE IF NOT EXISTS verbal_training_recommendations (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      TEXT NOT NULL,
                user_id         INTEGER NOT NULL,
                question_id     TEXT NOT NULL,
                reason_tags_json TEXT NOT NULL,
                rank            INTEGER NOT NULL CHECK(rank > 0),
                score           INTEGER NOT NULL,
                status          TEXT NOT NULL DEFAULT 'recommended'
                                CHECK(status IN ('recommended','started','completed')),
                created_at      TEXT NOT NULL,
                UNIQUE(session_id, question_id),
                FOREIGN KEY (session_id) REFERENCES verbal_practice_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_verbal_recommendations_session
                ON verbal_training_recommendations(session_id, user_id, rank);
        """)
        conn.commit()
        logger.info("Table check: verbal practice sessions + attempts ready")

        # ── v3 migration: add user_id to reviews (per-user isolation) ──
        try:
            conn.execute(
                "ALTER TABLE reviews ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"
            )
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
            conn.execute(
                "ALTER TABLE user_meta ADD COLUMN mindmap_review_json TEXT DEFAULT '{}'"
            )
            conn.commit()
            logger.info("Migration: added mindmap_review_json column to user_meta")
        except sqlite3.OperationalError:
            pass  # column already exists

        # ── v7 migration: users.is_admin 字段 ──
        try:
            conn.execute(
                "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"
            )
            conn.commit()
            logger.info("Migration: added is_admin column to users")
        except sqlite3.OperationalError:
            pass  # column already exists

        # ── v11 migration: VIP / AI credits and global access policy ──
        for column_sql, label in (
            (
                "ALTER TABLE users ADD COLUMN is_vip INTEGER NOT NULL DEFAULT 0",
                "users.is_vip",
            ),
            (
                "ALTER TABLE users ADD COLUMN vip_expires_at TEXT NOT NULL DEFAULT ''",
                "users.vip_expires_at",
            ),
            (
                "ALTER TABLE users ADD COLUMN ai_credits INTEGER NOT NULL DEFAULT 0",
                "users.ai_credits",
            ),
        ):
            try:
                conn.execute(column_sql)
                conn.commit()
                logger.info("Migration: added %s column", label)
            except sqlite3.OperationalError:
                pass  # column already exists

        conn.executescript("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)
        conn.execute(
            """INSERT OR IGNORE INTO app_settings(key, value)
               VALUES('ai_access_mode', 'free')"""
        )
        conn.commit()


def cleanup_old_events(retention_days: int = 365):
    """Remove learning events older than retention_days (must be positive)."""
    if retention_days <= 0:
        logger.warning(
            f"cleanup_old_events called with invalid retention_days={retention_days}, skipping"
        )
        return 0
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM learning_events WHERE created_at < datetime('now', ? || ' days')",
            (f"-{retention_days}",),
        )
        conn.commit()
        deleted = cursor.rowcount
        if deleted:
            logger.info(
                f"Cleaned up {deleted} old learning events (>{retention_days}d)"
            )
        return deleted
