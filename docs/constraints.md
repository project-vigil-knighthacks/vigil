# Vigil SIEM: Constraints & Development Checklist

What must be fixed for the SIEM to work end-to-end (dummy-site → collector → backend → dashboard).

---

## Legend

- [x] Done
- [ ] Must fix

---

## Backend

### Collector (`backend/api/collector.py`)

- [x] Watchdog-based file tailer
- [x] Imports `parse_and_sort` and `write_events`
- [x] **Log path**: accepts CLI arg, `VIGIL_LOG_PATH` env var, or defaults to `dummy-site/logs/access.log`
- [x] **`send_to_api`**: POSTs only to `/api/collect` (removed bogus WebSocket POST)
- [x] **Sends parsed events**: calls `parse_and_sort()` locally, POSTs `result["logs"]` as `list[dict]`

### Classifier (`backend/api/classifier.py`)

- [x] Grok pattern matching via grokmoment
- [x] Severity classification for syslog/auth.log events
- [x] **HTTP-aware severity rules**: 5xx → critical, 4xx → warning, suspicious URIs → critical

### Grok Patterns (`backend/api/data/patterns.json`)

- [x] Pattern storage and persistence
- [x] 19 reference patterns in `patterns_backup` covering syslog, auth.log, Apache access
- [x] **`patterns.json` seeded** with Apache access log pattern

### API Server (`backend/api/api_endpoint.py`)

- [x] REST endpoints: health, parse, upload, collect, events
- [x] WebSocket: `/ws/parse`, `/ws/collector`
- [x] CORS, EventBroadcaster, emailer router
- [x] **`emailer_router` duplicate removed**

---

## Frontend

- [x] Log Parser, Events, Alerts, Settings, Health, Sidebar: all working
- [x] HTTP columns (`uri`, `status_code`, `bytes_sent`) added to Events and Alerts pages
- [x] `ParsedLog` type updated with HTTP fields

---

## Dummy Site (`dummy-site/`)

- [x] Flask app generating Apache access logs ✔
- [x] Traffic simulator (benign + attack) ✔
- [x] Log format matches existing Grok pattern in `patterns_backup` ✔

---

## Fix Order (lowest → highest LoC)

| # | Fix | File | LoC | Impact |
|---|-----|------|----------|--------------|
| 1 | Remove duplicate `include_router` | `backend/api/api_endpoint.py` | ~1 | Prevents the emailer router from being registered twice, which can cause duplicate email alerts |
| 2 | Seed `patterns.json` with Apache pattern | `backend/api/data/patterns.json` | ~1–3 | Lets HTTP access logs parse out of the box without needing an OpenAI API key |
| 3 | Add HTTP severity rules | `backend/api/classifier.py` | ~10–15 | Tags Apache log events with correct severity (5xx → critical, 4xx → warning, suspicious URIs → critical) so they appear on the Alerts page |
| 4 | Fix the collector | `backend/api/collector.py` | ~20–25 | Enables the full pipeline: watches any log file, parses lines locally, and POSTs structured events to the backend — this is what makes the live dashboard work |
