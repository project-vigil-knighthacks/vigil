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
import json
from typing import Optional
from timestamps import normalize_event_timestamp

DB_PATH = os.environ.get("VIGIL_DB_PATH", os.path.join(os.path.dirname(__file__), "vigil.db"))
EVENT_COLUMNS = [
    "timestamp", "host", "proc", "pid", "severity", "facility",
    "login", "target_user", "auth_method", "login_status",
    "src_ip", "dst_ip", "src_port", "dst_port",
    "url", "domain", "path", "uri", "http_method",
    "hash", "hash_algo", "signature",
    "command", "args", "session_id",
    "request_id", "trace_id", "status_code",
    "bytes_sent", "bytes_recv", "duration",
    "tty", "pwd",
]
EXTRA_ATTRS_COLUMN = "extra_attrs"
INTERNAL_EVENT_KEYS = {"id", EXTRA_ATTRS_COLUMN}


# Internal helpers
def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")  # must be set before first query
    conn.row_factory = sqlite3.Row
    return conn


# When we write an event, we want to split out known columns vs extra attributes
def _ensure_events_schema(conn: sqlite3.Connection) -> None:
    existing = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(events)").fetchall()
    }
    if not existing:
        return

    for column in [*EVENT_COLUMNS, EXTRA_ATTRS_COLUMN]:
        if column not in existing:
            conn.execute(f"ALTER TABLE events ADD COLUMN {column} TEXT")


# When we read an event, we want to restore the original event dict by merging
def _split_event_columns(event: dict) -> dict:
    normalized_event = normalize_event_timestamp(dict(event))
    extra_attrs: dict[str, object] = {}

    for key, value in normalized_event.items():
        if key in INTERNAL_EVENT_KEYS or value is None:
            continue
        if key not in EVENT_COLUMNS:
            extra_attrs[key] = value

    row = {column: normalized_event.get(column) for column in EVENT_COLUMNS}
    row[EXTRA_ATTRS_COLUMN] = json.dumps(extra_attrs) if extra_attrs else None
    return row


# When we read an event, we want to restore the original event dict by merging
# the extra attributes back into the main event dictionary
def _restore_event_columns(row: sqlite3.Row) -> dict:
    event = dict(row)
    extra_attrs_raw = event.pop(EXTRA_ATTRS_COLUMN, None)
    if extra_attrs_raw:
        try:
            extra_attrs = json.loads(extra_attrs_raw)
            if isinstance(extra_attrs, dict):
                for key, value in extra_attrs.items():
                    event.setdefault(key, value)
        except json.JSONDecodeError:
            event[EXTRA_ATTRS_COLUMN] = extra_attrs_raw
    return normalize_event_timestamp(event)


# Public API
def init_db() -> None:
    conn = get_connection()
    try:
        cols = ",\n            ".join(f"{col} TEXT" for col in EVENT_COLUMNS)
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                {cols},
                {EXTRA_ATTRS_COLUMN} TEXT
            )
        """)
        _ensure_events_schema(conn)
        conn.commit()
    finally:
        conn.close()
    
    create_subscriptions_table()



def write_events(events: list[dict]) -> int:
    conn = get_connection()
    try:
        write_columns = [*EVENT_COLUMNS, EXTRA_ATTRS_COLUMN]
        placeholders = ", ".join("?" for _ in write_columns)
        col_names = ", ".join(write_columns)
        for event in events:
            row = _split_event_columns(event)
            conn.execute(
                f"INSERT INTO events ({col_names}) VALUES ({placeholders})",
                tuple(row.get(col) for col in write_columns),
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
        return [_restore_event_columns(row) for row in rows] # restore original event structure with extra attributes merged back in
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

def add_subscription(email: str, min_severity: str) -> bool:
    conn = get_connection()
    try:
        cursor = conn.execute("""
            INSERT OR IGNORE INTO alert_subscriptions (email, min_severity)
            VALUES (?, ?)
        """, (email, min_severity))
        inserted = cursor.rowcount == 1

        if not inserted:
            conn.execute("""
                UPDATE alert_subscriptions
                SET min_severity = ?
                WHERE email = ?
            """, (min_severity, email))

        conn.commit()
        return inserted
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
