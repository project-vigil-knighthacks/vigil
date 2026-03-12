# Vigil SIEM: Backend API

This directory is the entire Python backend. It runs as a single FastAPI process and shares a SQLite database with the log collector.

---

## File Overview

| File | Purpose |
|---|---|
| `api_endpoint.py` | FastAPI server, all HTTP endpoints |
| `database.py` | SQLite read/write layer, imported by both the collector and the API |
| `log_collector.py` | Watchdog-based log file tailer, parses and ships events |
| `log_parse.py` | Grok pattern matching with API key fallback logic |
| `grokmoment.py` (inlined from MIT library) | LLM-powered Grok pattern auto-generation |
| `patterns.json` / `data/patterns.json` | Learned Grok patterns, persisted across runs |

---

## What Happens When a Log Line Is Written to a File

This is the full pipeline from a raw log line to the dashboard:

```
┌────────────────────────────────────────────────────────────────────────┐
│                         LOG PIPELINE                                   │
│                                                                        │
│  1. A line is appended to the watched log file                         │
│     e.g.  /var/log/apache2/access.log                                  │
│                          │                                             │
│                          v                                             │
│  2. watchdog fires on_modified() in log_collector.py                   │
│     - seeks to last-read byte offset                                   │
│     - reads only the new lines                                         │
│                          │                                             │
│                          v                                             │
│  3. log_parse.parse_logs(content)                                      │
│     ┌─────────────────────────────────────────────────┐                │
│     │  OPENAI_API_KEY set?                            │                │
│     │    YES > grokmoment.py: try existing patterns   │                │
│     │          if no match > ask LLM for new pattern  │                │
│     │          save new pattern to data/patterns.json │                │
│     │    NO  > try existing patterns from             │                │
│     │          data/patterns.json only                │                │
│     │          unmatched  > {unmatched: True, raw: …} │                │
│     └─────────────────────────────────────────────────┘                │
│     Returns: { "logs": [ list of structured event dicts ] }            │
│                          │                                             │
│                          v                                             │
│  4. database.write_events(events)               ┌──────────────┐       │
│     INSERT INTO events …  ──────────────────────>  vigil.db    │       │
│                          │                      └──────────────┘       │
│                          ▼                                             │
│  5. send_to_api(events)                                                │
│     POST /api/collect  ──>  api_endpoint.py                            │
│                              calls write_events() again                │
│                              (see note below on double-write)          │
│                                                                        │
│  6. Frontend (Next.js) polls GET /api/events                           │
│     api_endpoint.py calls database.read_events()                       │
│     returns JSON  ──>  /events page renders the table                  │
└────────────────────────────────────────────────────────────────────────┘
```

> **Why is `write_events()` called twice?**
> Once directly in the collector (step 4) and once via `/api/collect` (step 5).
> The direct write is a safety net, events are saved to disk even if FastAPI is offline.
> The POST to FastAPI is so the live dashboard gets an immediate update.
> If you want to simplify this, remove the direct `write_events()` call in `log_collector.py`
> and let `/api/collect` be the only writer.

---

## Alternative Entry Points (not the collector)

The collector isn't the only way events reach the database:

```
Dashboard Log Parser page
  > user uploads/pastes a log file
  > POST /api/logs/parse or /api/logs/upload
  > log_parse.parse_logs()
  > user clicks "Save to DB"
  > POST /api/collect
  > database.write_events()
  > vigil.db
```

---

## Module Dependency Map

```
api_endpoint.py
    ├── imports log_parse.py        (for /api/logs/parse and /api/logs/upload)
    └── imports database.py         (for /api/collect and /api/events)

log_collector.py
    ├── imports log_parse.py        (parse new lines on file change)
    └── imports database.py         (write parsed events to SQLite)

log_parse.py
    ├── imports grokmoment.py       (only when OPENAI_API_KEY is set)
    └── imports pygrok              (always, pattern matching)

grokmoment.py
    ├── imports openai              (only when OPENAI_API_KEY is set)
    └── imports pygrok
```

`database.py` has **no local imports**, it only uses Python stdlib (`sqlite3`, `os`). This is intentional so it can be imported by any module without creating circular dependencies.

---

## API Endpoints

| Method | Path | Called by | Description |
|---|---|---|---|
| `GET` | `/api/health` | Frontend health page | Returns `{"ok": true}`; used to check backend connectivity |
| `POST` | `/api/logs/parse` | Dashboard Log Parser | Parse log text sent as JSON body; returns structured events |
| `POST` | `/api/logs/upload` | Dashboard Log Parser | Parse an uploaded log file; returns structured events |
| `POST` | `/api/collect` | `log_collector.py` + Dashboard "Save to DB" button | Receive a list of parsed event dicts and write them to SQLite |
| `GET` | `/api/events` | Dashboard /events page | Read events from SQLite; supports `?limit`, `?offset`, `?severity` |

### GET /api/events query parameters

| Param | Default | Description |
|---|---|---|
| `limit` | 100 | Rows to return (max 1000) |
| `offset` | 0 | Row offset for pagination |
| `severity` | *(none)* | Comma-separated filter: `critical`, `warning`, `info`, `unknown` |

Example: `GET /api/events?limit=50&offset=0&severity=critical,warning`, used by the Alerts page.

---

## Database Schema

File: `vigil.db` (SQLite, WAL mode)  
Override path: set `VIGIL_DB_PATH` environment variable.

```sql
CREATE TABLE events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT,
    host        TEXT,
    proc        TEXT,
    pid         TEXT,
    severity    TEXT,   -- 'info' | 'warning' | 'critical' | 'unknown'
    facility    TEXT,
    login       TEXT,
    target_user TEXT,
    auth_method TEXT,
    login_status TEXT,
    src_ip      TEXT,
    dst_ip      TEXT,
    src_port    TEXT,
    dst_port    TEXT,
    url         TEXT,
    domain      TEXT,
    path        TEXT,
    uri         TEXT,
    hash        TEXT,
    hash_algo   TEXT,
    signature   TEXT,
    command     TEXT,
    args        TEXT,
    session_id  TEXT,
    request_id  TEXT,
    trace_id    TEXT,
    status_code TEXT,
    bytes_sent  TEXT,
    bytes_recv  TEXT,
    duration    TEXT,
    tty         TEXT,
    pwd         TEXT
);
```

All columns are `TEXT`. Missing fields are `NULL`. The column list is defined in `database.py > EVENT_COLUMNS` and mirrors `grokmoment.py > VARIABLES`.

> **Adding a new field:** add it to `EVENT_COLUMNS` in `database.py` AND `VARIABLES` in `grokmoment.py`, then delete `vigil.db` so it gets recreated with the new column. (Or write a migration: `ALTER TABLE events ADD COLUMN <name> TEXT`.)

---

## Running the Backend

```bash
cd vigil/vigil/backend/api

# Install dependencies
pip install fastapi uvicorn python-multipart pygrok openai watchdog requests

# Start FastAPI (hot-reload)
python -m uvicorn api_endpoint:app --reload --host 127.0.0.1 --port 8000

# In a separate terminal - start the collector pointed at a log file
python log_collector.py -l /path/to/your/access.log
```

Interactive API docs (auto-generated by FastAPI): `http://localhost:8000/docs`
