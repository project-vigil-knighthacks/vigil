# SQLite Layer

# Script for managing SQLite reads and writes in the Vigil backend.
# Both log_collector.py (writer) and api_endpoint.py (reader + writer) import
# from this module. No other file should open vigil.db directly.

# Default location: vigil/backend/api/vigil.db  (next to this file)
# Override:         set the VIGIL_DB_PATH environment variable

# SQLite's default journal mode locks the file for both reads and writes
# WAL lets readers and a single writer run at the same time
# collector (writer) and FastAPI (reader) run as separate processes simultaneously

import os
import sqlite3
from typing import Optional

DB_PATH = os.environ.get("VIGIL_DB_PATH", os.path.join(os.path.dirname(__file__), "vigil.db"))
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


# Internal helpers
def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")  # must be set before first query
    conn.row_factory = sqlite3.Row
    return conn


# Public API
def init_db() -> None:
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
    
    create_subscriptions_table()



def write_events(events: list[dict]) -> int:
    conn = get_connection()
    try:
        placeholders = ", ".join("?" for _ in EVENT_COLUMNS)
        col_names = ", ".join(EVENT_COLUMNS)
        for event in events:
            conn.execute(
                f"INSERT INTO events ({col_names}) VALUES ({placeholders})",
                # event.get(col) returns None (→ NULL) for any field not present
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
    conn = get_connection()
    try:
        query = "SELECT * FROM events"
        params: list = []

        if severity:
            # Split "critical,warning" → ["critical", "warning"]
            # Use parameterised IN clause — never interpolate user input directly
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


def reset_events() -> int:
    conn = get_connection()
    try:
        count = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        conn.execute("DELETE FROM events")
        conn.commit()
        return count
    finally:
        conn.close()


def count_events(severity: Optional[str] = None) -> int:
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

def create_subscriptions_table() -> None:
    conn = get_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS alert_subscriptions (
                email TEXT PRIMARY KEY,
                min_severity TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
    finally:
        conn.close()

def add_subscription(email: str, min_severity: str) -> None:
    conn = get_connection()
    try:
        conn.execute("""
            INSERT INTO alert_subscriptions (email, min_severity)
            VALUES (?, ?)
            ON CONFLICT(email) DO UPDATE SET min_severity=excluded.min_severity
        """, (email, min_severity))
        conn.commit()
    finally:
        conn.close()

def get_subscriptions() -> list[dict]:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT email, min_severity FROM alert_subscriptions"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
