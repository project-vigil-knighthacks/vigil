# Vigil SIEM: Architecture Q&A

General quetsions for the architecture of Vigil SIEM!

## 1. How does the dummy website connect to the SIEM dashboard?

**FastAPI is the bridge, but the dummy website never talks to the dashboard directly.**

```
Dummy Website → *writes log files* → Collector (watchdog) → *parses* → SQLite
                                                                         ↓
                                        FastAPI ← Dashboard (Next.js) queries
```

| Layer | Role |
|---|---|
| Dummy website | Writes standard log files (access.log, auth.log) |
| Collector (`log_collector.py`) | Watches log files via `watchdog`, parses with `grokmoment`, stores in SQLite, POSTs to FastAPI |
| FastAPI (`api_endpoint.py`) | Receives events from collector (`POST /api/collect`), serves events to dashboard (`GET /api/events`) |
| Dashboard (Next.js) | Queries FastAPI to display events, alerts, stats |

This is the standard SIEM data flow (Splunk, Wazuh, ELK all work this way). The monitored app never needs to know the SIEM exists.

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