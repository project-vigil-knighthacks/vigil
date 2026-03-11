# SQLite database layer for Vigil SIEM.
# shared by the collector (writes) and the FastAPI server (reads + writes).

import os
import sqlite3
from typing import Optional

# DB path is configurable via VIGIL_DB_PATH env var; defaults to vigil.db next to this file
DB_PATH = os.environ.get("VIGIL_DB_PATH", os.path.join(os.path.dirname(__file__), "vigil.db"))

# 32 normalized fields from grokmoment.. stored as TEXT; NULL means the field wasn't present in the log line
EVENT_COLUMNS = [
    "timestamp", "host", "proc", "pid", "severity", "facility",
    "login", "target_user", "auth_method", "login_status",
    "src_ip", "dst_ip", "src_port", "dst_port",
    "url", "domain", "path", "uri",
    "hash", "hash_algo", "signature",
    "command", "args", "session_id",
    "request_id", "trace_id", "status_code",
    "bytes_sent", "bytes_recv", "duration",
    "tty", "pwd",
]


def get_connection() -> sqlite3.Connection:
    # WAL mode allows the collector (writer) and FastAPI (reader) to run concurrently without locking
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    # creates the events table on first run; safe to call on every startup (IF NOT EXISTS)
    conn = get_connection()
    try:
        cols = ",\n            ".join(f"{col} TEXT" for col in EVENT_COLUMNS)
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                {cols}
            )
        """)
        conn.commit()
    finally:
        conn.close()


def write_events(events: list[dict]) -> int:
    # inserts a batch of parsed log events and returns the number of rows written
    conn = get_connection()
    try:
        placeholders = ", ".join("?" for _ in EVENT_COLUMNS)
        col_names = ", ".join(EVENT_COLUMNS)
        for event in events:
            conn.execute(
                f"INSERT INTO events ({col_names}) VALUES ({placeholders})",
                tuple(event.get(col) for col in EVENT_COLUMNS),
            )
        conn.commit()
        return len(events)
    finally:
        conn.close()


def read_events(
    limit: int = 100,
    offset: int = 0,
    severity: Optional[str] = None,
) -> list[dict]:
    # fetches events newest-first; accepts a comma-separated severity string e.g. "critical,warning"
    conn = get_connection()
    try:
        query = "SELECT * FROM events"
        params: list = []

        if severity:
            severities = [s.strip() for s in severity.split(",")]
            placeholders = ", ".join("?" for _ in severities)
            query += f" WHERE severity IN ({placeholders})"
            params.extend(severities)

        query += " ORDER BY id DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def count_events(severity: Optional[str] = None) -> int:
    # returns total matching row count used by the API for pagination metadata
    conn = get_connection()
    try:
        query = "SELECT COUNT(*) FROM events"
        params: list = []

        if severity:
            severities = [s.strip() for s in severity.split(",")]
            placeholders = ", ".join("?" for _ in severities)
            query += f" WHERE severity IN ({placeholders})"
            params.extend(severities)

        return conn.execute(query, params).fetchone()[0]
    finally:
        conn.close()