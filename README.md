# VIGIL SIEM

![Python](https://img.shields.io/badge/Python_3.12+-FastAPI-3776AB?logo=python&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57?logo=sqlite&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js_16-React_19-000000?logo=nextdotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

An open-source, self-hosted SIEM (Security Information and Event Management) system for website owners. Point it at your log files and get real-time threat detection, structured event storage, and a live security dashboard: all running locally on your machine.

No cloud services, no external databases, no agents to install on your server. Just your logs and Vigil.

## Table of Contents

- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Quick Start in Terminals](#quick-start-in-terminals)
- [Optional Terminals for Testing w/ Dummy-Site](#optional-terminals-for-testing-w-dummy-site)
- [Connect Your Website](#connect-your-website)
- [Optional Backend Config](#optional-backend-config)
- [API Endpoints](#api-endpoints)

## Architecture

```
                         ┌────────────────────────────────────────┐
                         │              LOCAL MACHINE             │
                         │                                        │
┌──────────────┐         │  ┌──────────────┐     ┌─────────────┐  │
│  Log Source  │ local   │  │   Collector  │     │  Classifier │  │
│  (log file)  │─────────┼─>│  (watchdog)  │────>│ (severity)  │  │
└──────────────┘  tail   │  └──────┬───────┘     └──────┬──────┘  │
                         │         │ POST /api/events/store │     │
                         │         v                        v     │
┌──────────────┐         │  ┌──────────────┐     ┌─────────────┐  │
│  Deployed    │  POST   │  │   FastAPI    │<────│  SQLite     │  │
│  Website     │─────────┼─>│   Backend    │────>│  vigil.db   │  │
│  (Vercel)    │ /ingest │  │  :8000       │     └─────────────┘  │
└──────────────┘         │  └──────┬───────┘                      │
       │                 │         │  WebSocket /ws/collector     │
       │  VIGIL_API_URL  │         v                              │
       │  points here    │  ┌──────────────┐                      │
       │       │         │  │   Next.js    │  Dashboard, Events,  │
       │       │         │  │   Frontend   │  Alerts, Settings    │
       │       │         │  │  :3000       │                      │
       │       │         │  └──────────────┘                      │
       │       │         └────────────────────────────────────────┘
       v       v
  ┌─────────────────┐
  │  localtunnel    │  Public URL → localhost:8000
  │  (loca.lt)      │  npx localtunnel --port 8000
  └─────────────────┘
```

**Two ingestion paths:**
- **Local logs** (Option A): Collector tails a file on disk → parses → stores events
- **Deployed site** (Option B): Site POSTs raw log lines to `POST /api/ingest` via a public tunnel

### Core Components

| Component | Tech | Location |
|-----------|------|----------|
| **API Server** | FastAPI + Uvicorn | `backend/api/api_endpoint.py` |
| **Log Parser** | [grokmoment](https://github.com/mdunn99/grokmoment) (inlined, MIT) + pygrok | `backend/api/grokmoment.py` |
| **Classifier** | Severity tagging (rule-based) | `backend/api/classifier.py` |
| **Collector** | Watchdog file tailer | `backend/api/collector.py` |
| **Database** | SQLite with WAL mode | `backend/api/database.py` |
| **Dashboard** | Next.js 16 / React 19 / Tailwind 4 | `frontend/` |
| **Email Alerts** | Mailgun (optional) | `backend/api/emailer.py` |
| **Dummy Site** | Flask test target + traffic simulator | `dummy-site/` |

### Key Features

- **Grok pattern matching**: 19 built-in patterns for syslog, auth.log, and Apache access logs
- **Auto pattern learning**: unrecognized log lines are sent to an LLM (OpenAI) to generate new Grok patterns automatically (optional, requires API key)
- **Real-time streaming**: WebSocket pushes new events to the dashboard as they arrive
- **Manual log parsing**: drag-and-drop or paste log content on the Log Parser page
- **Severity classification**: info / warning / critical tagging based on log content
- **Event persistence**: all parsed events stored in SQLite with 30+ structured fields
- **Settings**: configurable API URL, polling interval, display preferences, toast alerts
- **Email notifications**: Mailgun integration stub for alert emails

## Project Structure

```
vigil/
├── backend/
│   ├── api/
│   │   ├── api_endpoint.py      FastAPI server (REST + WebSocket)
│   │   ├── classifier.py        Log parsing + severity classification
│   │   ├── collector.py         File watcher → event pipeline
│   │   ├── database.py          SQLite layer (init, read, write)
│   │   ├── emailer.py           Mailgun email alerts (stub)
│   │   ├── grokmoment.py        Inlined grok parser + LLM pattern gen
│   │   └── data/
│   │       ├── patterns.json    Active Grok patterns (grows over time)
│   │       └── patterns_backup  Reference patterns (19 pre-built)
│   ├── dummy-logs/              Synthetic log generators
│   ├── models/                  (placeholder)
│   ├── services/                (placeholder)
│   ├── tests/                   (placeholder)
│   └── env.example              Environment variable template
├── frontend/
│   ├── app/
│   │   ├── page.tsx             Log Parser (upload / paste)
│   │   ├── events/page.tsx      Live event stream + pagination
│   │   ├── alerts/page.tsx      Critical + warning filtered view
│   │   ├── health/page.tsx      System health diagnostics
│   │   ├── settings/page.tsx    User preferences
│   │   ├── components/          Sidebar, FileUpload, LogOutput, Toast
│   │   ├── contexts/            SettingsContext
│   │   └── hooks/               useCollectorStream (WebSocket)
│   └── types/logs.ts            TypeScript interfaces
├── dummy-site/
│   ├── app.py                   Flask site (generates Apache access logs)
│   ├── simulate.py              Traffic generator (benign + attack)
│   ├── config.py                Ports, log path, credentials
│   ├── templates/               HTML pages
│   └── static/                  CSS
└── pyproject.toml               Python dependencies
```

## Quick Start in Terminals

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.12+ | `pyproject.toml` requires `>=3.14` but 3.12 works in practice |
| Node.js | 18+ | For the Next.js frontend |
| npm | 9+ | Bundled with Node.js |

### 1. Backend

```bash
cd backend/api

# Install Python packages
pip install fastapi uvicorn python-multipart pygrok openai watchdog requests python-dotenv

# Start the API server
python -m uvicorn api_endpoint:app --reload --host 127.0.0.1 --port 8000
```

API: `http://localhost:8000` · Docs: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard: `http://localhost:3000`

## Optional Terminals for Testing w/ Dummy-Site
### 3. Dummy Site

```bash
cd dummy-site
pip install flask
python app.py                    # starts on :5000, logs to dummy-site/logs/access.log
```

### 4. Collector (connects dummy-site → backend)

```bash
cd backend/api
python collector.py   # currently hardcoded to watch a specific file: see docs/constraints.md
```

### 5. Fake Traffic / Simulated Attacks

```bash
cd dummy-site                     # separate terminal from 3rd terminal
python simulate.py --mode mixed   # generates traffic
```

> **Note:** The simulator must run _after_ the dummy site (Terminal 3) is up, since it sends HTTP requests to Flask on `:5000`.

#### Available modes

| Flag | Description |
|------|-------------|
| `--mode mixed` | **(default)** 60% benign / 40% attack, randomly interleaved |
| `--mode benign` | Normal browsing only (page visits, valid logins) |
| `--mode attack` | Malicious traffic only (see attack types below) |

#### Additional CLI options

```bash
python simulate.py --requests 500   # number of requests (default: 200)
python simulate.py --delay 0.1      # seconds between requests (default: 0.05)
python simulate.py --base http://127.0.0.1:5000  # target URL (default)
```

> **Tip:** `--requests` sets the number of _iterations_, not individual HTTP requests. Some actions (e.g. a login flow) make 4–5 requests per iteration, so 30 iterations may produce ~75 log entries.

## Connect Your Website

After the SIEM is running, there are only two supported ways to connect a real website:

### Option A: Your site already has access logs

If your site writes a normal access log file, point the collector at it:

```bash
cd backend/api
python collector.py /path/to/your/access.log
```

That is the bare minimum for a self-hosted site.

### Option B: Your site is deployed and does not expose log files

If your site is on Vercel, Netlify, or another hosted platform, the site must send raw log lines to Vigil over HTTP.

Requirements:
1. Your site needs a small logger/proxy that POSTs to `POST /api/ingest`.
2. Your site needs one website-side env var:

```env
VIGIL_API_URL=https://your-public-vigil-backend.example.com
```

`VIGIL_API_URL` is set on the monitored website, not in Vigil's backend `.env.local`.

Since the Vigil backend runs on your local machine, deployed sites can't reach `localhost:8000`. You need a **tunnel** to give your local backend a public URL.

### Initialize a localtunnel Instance

[localtunnel](https://github.com/localtunnel/localtunnel) is an npm package that creates a temporary public URL (e.g. `https://dry-doors-rescue.loca.lt`) which forwards traffic to a port on your machine.

```bash
npx localtunnel --port 8000
# your url is: https://some-random-words.loca.lt
# on your hosting website, save this under env vars as "VIGIL_API_URL=..."
```

> **Note:** The URL changes every time localtunnel restarts. You must update your site's `VIGIL_API_URL` env var in Vercel (or wherever it's hosted) each time the URL changes, then redeploy.

> **Alternatives:** [ngrok](https://ngrok.com/) (free tier gives a stable URL with an account), [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/), or deploy the backend to a server with a real domain.

## Optional Backend Config

These are for `backend/.env.local` only.

### Required for basic operation

None: Vigil runs with zero configuration out of the box.

### Optional

| Variable | Purpose |
|----------|---------|
| `AI_PROVIDER` | LLM backend for the voice agent: `openai` (default), `anthropic`, `groq`, or `ollama` |
| `OPENAI_API_KEY` | OpenAI — enables voice agent + auto Grok pattern generation |
| `ANTHROPIC_API_KEY` | Anthropic — enables voice agent (Claude) |
| `GROQ_API_KEY` | Groq — enables voice agent (Llama 3) |
| `OLLAMA_URL` | Ollama instance URL — enables voice agent locally (no key needed) |
| `ELEVENLABS_API_KEY` | ElevenLabs — enables text-to-speech for voice agent responses |
| `VIGIL_BACKEND_URL` | Where the Vigil frontend proxies API + WebSocket traffic when the backend runs on another host |
| `VIGIL_DB_PATH` | Override SQLite database location (default: `backend/api/vigil.db`) |
| `VIGIL_LOG_PATH` | Tell the collector which log file to watch (alternative to CLI arg) |
| `VIGIL_CORS_ORIGINS` | Comma-separated additional origins allowed to call the API (e.g. `https://your-site.vercel.app`) |
| `MAILGUN_API_KEY` | Email alert notifications via Mailgun |
| `MAILGUN_DOMAIN` | Mailgun sending domain |
| `MAILGUN_SENDER` | "From" address for alert emails |

See `backend/env.example` for the full template.

### Frontend

Create `frontend/.env.local`:

```
VIGIL_BACKEND_URL=http://localhost:8000
```

This is only needed if the Vigil frontend and backend are not running on the same host.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/logs/parse` | Parse log content (string body) |
| `POST` | `/api/logs/upload` | Parse uploaded log file |
| `POST` | `/api/ingest` | Accept raw log text from a remote site, then parse + store it |
| `POST` | `/api/events/store` | Store parsed events in SQLite |
| `GET` | `/api/events` | Query events (limit, offset, severity filter) |
| `POST` | `/api/create_env` | Write `.env` file (for API key setup) |
| `POST` | `/api/alerts/flush` | Force-send all pending alert digests immediately |
| `GET` | `/api/alerts/pending` | Check queued alert count per recipient |
| `WS` | `/ws/parse` | Stream log parsing results |
| `WS` | `/ws/collector` | Live event stream from collector |