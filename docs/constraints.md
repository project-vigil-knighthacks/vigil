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
- [ ] **Log path is hardcoded** to `backend/dummy-logs/evil_1000.log`: needs to accept a CLI arg or env var so it can watch any file (e.g. `dummy-site/logs/access.log`)
- [ ] **`send_to_api` POSTs to `/ws/parse`**: that's a WebSocket endpoint, not HTTP. The POST silently fails. Should only POST to `/api/collect`
- [ ] **Sends raw content, not parsed events**: `on_modified` sends `{"content": new_data}` but `/api/collect` expects `list[dict]`. The collector should call `parse_and_sort(new_data)` locally, then POST `result["logs"]`

### Classifier (`backend/api/classifier.py`)

- [x] Grok pattern matching via grokmoment
- [x] Severity classification for syslog/auth.log events
- [ ] **No HTTP-aware severity rules**: Apache access log events have `status_code` and `uri` but no `login_status` or `proc`. Needs rules like:
  - `status_code >= 500` → critical
  - `status_code >= 400` → warning
  - URI contains `/etc/passwd`, `/.env`, `/.git`, `/wp-admin` → critical

### Grok Patterns (`backend/api/data/patterns.json`)

- [x] Pattern storage and persistence
- [x] 19 reference patterns in `patterns_backup` covering syslog, auth.log, Apache access
- [ ] **Active `patterns.json` may be empty**: backup patterns aren't auto-loaded. Must seed it with at least the Apache access log pattern so HTTP logs parse without needing `OPENAI_API_KEY`

### API Server (`backend/api/api_endpoint.py`)

- [x] REST endpoints: health, parse, upload, collect, events
- [x] WebSocket: `/ws/parse`, `/ws/collector`
- [x] CORS, EventBroadcaster, emailer router
- [ ] **`emailer_router` included twice**: `app.include_router(emailer_router, prefix="/api")` appears at both the top and bottom of the file. Remove one

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
