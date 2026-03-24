# VIGIL SIEM

![Python](https://img.shields.io/badge/Python-FastAPI-3776AB?logo=python&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Event%20Storage-003B57?logo=sqlite&logoColor=white)
![React](https://img.shields.io/badge/Next.js-Dashboard-000000?logo=nextdotjs&logoColor=white)
![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.x-005571?logo=elasticsearch)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Filebeat](https://img.shields.io/badge/Filebeat-Log%20Shipping-005571?logo=elastic)
![Sigma](https://img.shields.io/badge/Sigma-Detection%20Rules-EE3124)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Azure](https://img.shields.io/badge/Azure-Container%20Apps-0078D4?logo=microsoftazure)
![License](https://img.shields.io/badge/License-MIT-green)

An open-source, self-hosted SIEM for website owners. Point it at your existing log files and get real-time threat detection, structured event storage, and a live security dashboard — no changes to your website required. Planned features include Sigma rule support, MITRE ATT&CK mapping, Dockerized services, Elasticsearch, and Azure deployment, and AI voice assistant.

## Plan Architecture

```
                                   ┌──────────────────────┐
                                   │   Detection Engine   │
┌──────────────┐   ┌───────────┐   │  ┌────────────────┐  │   ┌─────────┐   ┌──────────────┐
│ Log Sources  │   │           │   │  │  Anomaly       │  │   │         │   │  Dashboard   │
│              │   │           │   │  │  Detector      │──┼──>│         │──>│  (React)     │
│  Config      │──>│  Filebeat │──>│  │  (Sigma Rules) │  │   │ Web API │   └──────────────┘
│  Website     │   │           │   │  └────────────────┘  │   │(FastAPI)│
│  OS / VM     │   │           │   │  ┌────────────────┐  │   │         │   ┌───────────────┐
│  Other       │   │           │   │  │   AI Voice Bot │  │   │         │──>│Notifications  │
│              │   │           │   │  │   (LLM + TTS)  │──┼──>│         │   │(Email/Webhook)│
└──────────────┘   └─────┬─────┘   │  └────────────────┘  │   └────┬────┘   └───────────────┘
                         │         └──────────────────────┘        │
                         v                                         │
                  ┌──────────────┐                         ┌───────┴─────┐
                  │Elasticsearch │<────────────────────────│ PostgreSQL  │
                  │ (Log Index)  │    Queries / Searches   │(Users/Rules)│
                  └──────────────┘                         └─────────────┘

                  ───────────── Planned Docker deployment on Azure Container Apps ─────────────
```

## Current Development Setup

Current local development uses the FastAPI backend and Next.js frontend already present in this repo. Docker, Elasticsearch, PostgreSQL, Filebeat, and Azure are still plan items.

### Prerequisites

| Dependency | Version | Install |
|------------|---------|---------|
| Python | 3.10+ | [python.org](https://www.python.org/downloads/) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| npm | 9+ | bundled with Node.js |

---

### Backend

**Directory:** `vigil/backend/api`

```bash
cd vigil/backend/api

# Install all required Python packages
python3 -m pip install fastapi uvicorn python-multipart pygrok openai watchdog requests

# Start the API server (hot-reload enabled)
python3 -m uvicorn api_endpoint:app --reload --host 127.0.0.1 --port 8000
```

API will be available at `http://localhost:8000`  

#### Python package reference

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `python-multipart` | File upload support |
| `pygrok` | Grok pattern matching (log parser) |
| `openai` | LLM pattern generation for unmatched logs |
| `watchdog` | File system event monitoring for the collector |
| `requests` | HTTP client used by collector to POST events to FastAPI |
| `sqlite3` | Built-in — event storage, no install required |
---

### Frontend

**Directory:** `vigil/frontend`

```bash
cd vigil/frontend

# Install Node dependencies (first time only)
npm install

# Start the dev server
npm run dev
```

Dashboard will be available at `http://localhost:3000`

Health check page (verifies backend connection): `http://localhost:3000/health`

---

### Environment Variables

#### Frontend — `vigil/frontend/.env.local`

Create this file if it doesn't exist:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

#### Backend — shell environment

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Optional | Enables automatic Grok pattern generation for unrecognized log lines. Without it, the parser still works for any line matching an existing pattern in `backend/api/data/patterns.json`. |
| `VIGIL_DB_PATH` | Optional | Override the default SQLite database path. Defaults to `vigil/backend/api/vigil.db`. |

Set them for your session:

```powershell
# PowerShell
$env:OPENAI_API_KEY = "sk-..."
$env:VIGIL_DB_PATH = "C:\path\to\your\vigil.db"   # optional override
```

```bash
# Bash
export OPENAI_API_KEY="sk-..."
export VIGIL_DB_PATH="/path/to/your/vigil.db"     # optional override
```

---

### Log Collector

The log collector watches a log file in real time and ships parsed events to both the local SQLite database and the FastAPI server.

**Directory:** `vigil/backend/api`

```bash
# Install collector dependency
python3 -m pip install watchdog requests

# Start the current collector
cd vigil
python3 backend/api/collector.py
```

The current collector is still a development script. Right now it is hard-coded to watch `backend/dummy-logs/evil_1000.log` and POST raw content back to the backend.

> **Note:** The API server must be running for the collector flow to work.

---

### Log Parser (grokmoment)

The log parser is based on [grokmoment](https://github.com/mdunn99/grokmoment) (MIT), inlined at `vigil/backend/api/grokmoment.py`. **No separate clone is required.**

- **With `OPENAI_API_KEY`**: Unrecognized log lines are sent to the OpenAI API to auto-generate a new Grok pattern, which is then saved to `backend/api/data/patterns.json` for future use.
- **Without `OPENAI_API_KEY`**: Only lines matching existing patterns are parsed. Unmatched lines appear in the output with an `UNMATCHED` badge, and the UI will prompt you to set an API key.

Patterns are stored in `backend/api/data/patterns.json` and persist across runs. You can inspect or edit them manually.

---

### Run Order

Start backend first, then frontend, then optionally the collector:

```
Terminal 1 — backend:
  cd vigil/backend/api
  python3 -m uvicorn api_endpoint:app --reload --host 127.0.0.1 --port 8000

Terminal 2 — frontend:
  cd vigil/frontend
  npm run dev

Terminal 3 — log collector (optional, current dev script):
  cd vigil
  python3 backend/api/collector.py
```

With all three running, new lines appended to the collector's watched file can be processed and appear in the dashboard at `http://localhost:3000/events`.

---

## Planned Quick Start (Docker)

```bash
docker compose up --build
```

| Service        | Local URL                  |
|----------------|----------------------------|
| Dashboard      | http://localhost:3000       |
| API            | http://localhost:8000/docs  |
| Elasticsearch  | http://localhost:9200       |

## Planned Project Structure

```
vigil-siem/
├── backend/          # FastAPI — ingestion, detection, auth, AI voice
├── frontend/         # React — dashboard, log explorer, voice bot UI
├── dummy-site/       # Flask — generates realistic security events
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
