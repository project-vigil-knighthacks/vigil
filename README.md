# VIGIL SIEM

![Python](https://img.shields.io/badge/Python_3.12+-FastAPI-3776AB?logo=python&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57?logo=sqlite&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js_16-React_19-000000?logo=nextdotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

An open-source, self-hosted SIEM (Security Information and Event Management) system for website owners. Point it at your log files and get real-time threat detection, structured event storage, and a live security dashboard: all running locally on your machine.

No cloud services, no external databases, no agents to install on your server. Just your logs and Vigil.

## Architecture

```
┌──────────────┐
│  Log Source  │ Any text-based log file (Apache, syslog, auth.log, etc.)
│  (your site) │
└──────┬───────┘
       │ file tailed in real time
       v
┌──────────────┐    Grok patterns;     ┌────────────────────┐
│   Collector  │── parse each line ──> │    Classifier      │
│  (watchdog)  │                       │ (severity tagging) │
└──────┬───────┘                       └────────┬───────────┘
       │                                        │
       │ POST /api/collect                      │
       v                                        v
┌──────────────┐                      ┌───────────────────┐
│   FastAPI    │<─── parsed events ───│   SQLite (WAL)    │
│   Backend    │─────────────────────>│   vigil.db        │
└──────┬───────┘                      └───────────────────┘
       │  WebSocket /ws/collector
       v
┌──────────────┐
│   Next.js    │  Dashboard, Events, Alerts, Settings
│   Frontend   │  http://localhost:3000
└──────────────┘
```

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

### Key Features (current)

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
│   └── tests/                   (placeholder)
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
├── docs/                        Architecture notes
├── pyproject.toml               Python dependencies
└── env.example                  Environment variable template
```

## Quick Start

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

## Environment Variables

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
| `VIGIL_DB_PATH` | Override SQLite database location (default: `backend/api/vigil.db`) |
| `VIGIL_LOG_PATH` | Tell the collector which log file to watch (alternative to CLI arg) |
| `VIGIL_CORS_ORIGINS` | Comma-separated additional origins allowed to call the API (e.g. `https://your-site.vercel.app`) |
| `MAILGUN_API_KEY` | Email alert notifications via Mailgun |
| `MAILGUN_DOMAIN` | Mailgun sending domain |
| `MAILGUN_SENDER` | "From" address for alert emails |

See `env.example` for the full template.

### Frontend

Create `frontend/.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Or configure the API URL in the dashboard's Settings page.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/logs/parse` | Parse log content (string body) |
| `POST` | `/api/logs/upload` | Parse uploaded log file |
| `POST` | `/api/collect` | Store parsed events in SQLite |
| `GET` | `/api/events` | Query events (limit, offset, severity filter) |
| `POST` | `/api/create_env` | Write `.env` file (for API key setup) |
| `WS` | `/ws/parse` | Stream log parsing results |
| `WS` | `/ws/collector` | Live event stream from collector |

## Planned Project Structure

```
vigil-siem/
├── backend/          # FastAPI: ingestion, detection, auth, AI voice
├── frontend/         # React: dashboard, log explorer, voice bot UI
├── dummy-site/       # Flask: generates realistic security events
├── elasticsearch/    # ES config
├── filebeat/         # Log shipper config
├── docs/             # Architecture, API docs, deployment guide
└── docker-compose.yml
```

## Planned Detection Rules

Sigma-format YAML rules mapped to MITRE ATT&CK:

| Rule | Technique | ID |
|------|-----------|----|
| Brute Force Login | Credential Access | T1110 |
| Privilege Escalation | Privilege Escalation | T1548 |
| Port Scan Detection | Discovery | T1046 |
| Suspicious Process Execution | Execution | T1059 |
| Unusual Account Login | Initial Access | T1078 |
