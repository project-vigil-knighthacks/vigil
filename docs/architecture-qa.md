# Vigil SIEM: Architecture Q&A

General questions for the architecture of Vigil SIEM!

## 1. How does a website connect to the SIEM dashboard?

**FastAPI is the bridge. The monitored website never talks to the dashboard directly.**

There are two ingestion paths:

### Path A: File-based (local sites / traditional servers)

```
Website → *writes log files* → Collector (watchdog) → *parses* → SQLite
                                                                    ↓
                                     FastAPI ← Dashboard (Next.js) queries
```

### Path B: HTTP ingestion (cloud / serverless sites like Vercel, Netlify)

```
Website middleware → POST raw log line → /api/ingest → *parses* → SQLite
                                                                    ↓
                                     FastAPI ← Dashboard (Next.js) queries
```

| Layer | Role |
|---|---|
| Monitored website | Writes access logs to file (Path A) or POSTs raw log lines to `/api/ingest` (Path B) |
| Collector (`collector.py`) | *Path A only:* Watches log files via `watchdog`, calls `parse_and_sort()` locally, POSTs parsed events to FastAPI |
| FastAPI (`api_endpoint.py`) | Receives events (`POST /api/collect` for pre-parsed, `POST /api/ingest` for raw text), stores in SQLite, broadcasts via WebSocket, serves events to dashboard (`GET /api/events`) |
| Dashboard (Next.js) | Queries FastAPI and subscribes to WebSocket `/ws/collector` for real-time events |

This is the standard SIEM data flow (Splunk, Wazuh, ELK all work this way). The monitored app never needs to know the SIEM exists — it only needs to produce logs.

---

## 2. What does a website owner need to change? Can the SIEM be universal?

**Minimal requirements: the SIEM adapts to the logs, not the other way around.**

### What website owners already have (no changes needed)
- Web servers (Apache, Nginx, IIS) produce access logs in standard formats
- App frameworks (Django, Express, Rails, Flask) log auth events and errors by default

### What website owners do NOT need
- They do NOT add FastAPI to their own website (Vigil's FastAPI is separate)
- They do NOT modify application code to emit special formats

**Key differentiator:** Grokmoment's LLM pattern auto-generation means unrecognized formats get learned automatically: more flexible than most open-source SIEMs.

---

## 3. How does SQLite work for an open-source, locally-run SIEM?

**SQLite is the ideal default for single-site, self-hosted use.**

### SQLite for this use case

| Factor | SQLite
|---|---|
| Setup | Zero: it's a file, ships with Python |
| Deployment | `git clone` → `pip install` → running |
| Portability | Single `vigil.db` file, copy to back up |
| Concurrency | One writer (fine for single-site) |
| Scale | ~1TB / millions of rows |

### What this means for website owners cloning the repo
1. **Zero database setup** - collector creates `vigil.db` automatically
2. **Persists across restarts** - file lives in project directory
3. **Easy reset** - delete `vigil.db`, collector recreates on next run
4. **Works offline** - no network database server needed