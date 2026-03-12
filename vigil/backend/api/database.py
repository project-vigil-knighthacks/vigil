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

# DB_PATH is resolved once at import time.
# Using os.path.dirname(__file__) makes the path relative to this file,
# so it works regardless of where the process is launched from.
DB_PATH = os.environ.get("VIGIL_DB_PATH", os.path.join(os.path.dirname(__file__), "vigil.db"))

# EVENT_COLUMNS is the canonical list of fields that grokmoment can extract
# from a log line (defined in grokmoment.py's VARIABLES list).
# Every column is stored as TEXT — SQLite is schema-flexible so missing fields
# are simply NULL rather than causing insert errors.
# If you add a new field to grokmoment's VARIABLES, add it here too and
# drop/recreate vigil.db (or write a migration) so the column exists.
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
    """
    Open (or create) vigil.db and return a connection with:
      - WAL journal mode enabled (concurrent reader + writer support)
      - Row factory set to sqlite3.Row so callers can access columns by name
        (e.g. row["severity"]) instead of by index.

    Every public function in this module calls get_connection() at the start
    and closes the connection in a finally block — we don't pool connections
    because FastAPI's async workers and the collector are separate OS processes.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")  # must be set before first query
    conn.row_factory = sqlite3.Row
    return conn


# Public API
def init_db() -> None:
    """
    Create the `events` table if it doesn't already exist.

    Called once:
      - By api_endpoint.py's lifespan handler when FastAPI starts up
      - By log_collector.py's main() before starting the watchdog observer

    The IF NOT EXISTS clause makes this safe to call on every startup —
    it is a no-op if the table is already there.

    Schema: `id` is auto-assigned by SQLite. All 32 event fields from
    EVENT_COLUMNS are TEXT columns (NULL if not present in the log line).
    """
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
    """
    Insert a batch of parsed log events into the `events` table.
    Returns the number of rows inserted.

    Called by:
      - log_collector.py → on_modified() after parsing new lines from a file
      - api_endpoint.py  → POST /api/collect (same data, different entry point)
      - api_endpoint.py  → POST /api/logs/parse and POST /api/logs/upload
                           when the user clicks "Save to DB" on the dashboard

    Each event dict comes from log_parse.parse_logs() → result["logs"].
    Only keys in EVENT_COLUMNS are written; any extra keys (e.g. "raw",
    "unmatched") are silently ignored via dict.get().
    """
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
    """
    Fetch stored events, newest first (ORDER BY id DESC).
    Called exclusively by api_endpoint.py → GET /api/events.

    Parameters:
      limit    — max rows to return (1–1000, enforced by FastAPI Query validator)
      offset   — row offset for pagination (page 2 = offset 50 if limit=50)
      severity — optional comma-separated filter, e.g. "critical,warning"
                 Parsed into a SQL IN clause with parameterised placeholders
                 to prevent SQL injection.

    Returns a list of plain dicts (converted from sqlite3.Row objects) so
    FastAPI can serialise them directly to JSON.
    """
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


def count_events(severity: Optional[str] = None) -> int:
    """
    Return the total number of events matching the severity filter.
    Called by api_endpoint.py alongside read_events() so the frontend
    can calculate total pages for pagination.

    Mirrors the WHERE logic in read_events() exactly — both functions
    must always use the same filter so the count matches the rows returned.
    """
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