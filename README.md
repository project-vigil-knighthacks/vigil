# VIGIL SIEM

![Python](https://img.shields.io/badge/Python-FastAPI-3776AB?logo=python&logoColor=white)
![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.x-005571?logo=elasticsearch)
![React](https://img.shields.io/badge/React-Dashboard-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Filebeat](https://img.shields.io/badge/Filebeat-Log%20Shipping-005571?logo=elastic)
![Sigma](https://img.shields.io/badge/Sigma-Detection%20Rules-EE3124)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Azure](https://img.shields.io/badge/Azure-Container%20Apps-0078D4?logo=microsoftazure)
![License](https://img.shields.io/badge/License-MIT-green)

An open-source, deployable SIEM with real-time threat detection, Sigma rule support, MITRE ATT&CK mapping, and an AI voice assistant that summarizes security posture and recommends remediation actions.

## Architecture

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

                  ───────────── All services run in Docker on Azure Container Apps ─────────────
```

## Development Setup (Current, Pre-Docker*)
<h5>*setup for early stages -- Docker not setup yet</h5>

### Prerequisites

| Dependency | Version | Install |
|------------|---------|---------|
| Python | 3.10+ | [python.org](https://www.python.org/downloads/) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| npm | 9+ | bundled with Node.js |

---

### Backend

**Directory:** `vigil/vigil/backend/api`

```bash
cd vigil/vigil/backend/api

# Install all required Python packages
python -m pip install fastapi uvicorn python-multipart pygrok openai

# Start the API server (hot-reload enabled)
python -m uvicorn api_endpoint:app --reload --host 127.0.0.1 --port 8000
```

API will be available at `http://localhost:8000`  

#### Python package reference

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `python-multipart` | File upload support |
| `pygrok` | Grok pattern matching (log parser) |
| `openai` | LLM pattern generation (optional, see below) |

---

### Frontend

**Directory:** `vigil/vigil/frontend`

```bash
cd vigil/vigil/frontend

# Install Node dependencies (first time only)
npm install

# Start the dev server
npm run dev
```

Dashboard will be available at `http://localhost:3000`

Health check page (verifies backend connection): `http://localhost:3000/health`

---

### Environment Variables

#### Frontend — `vigil/vigil/frontend/.env.local`

Create this file if it doesn't exist:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

#### Backend — shell environment

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Optional | Enables automatic Grok pattern generation for unrecognized log lines. Without it, the parser still works for any line matching an existing pattern in `backend/api/data/patterns.json`. |

Set it for your session if you want full LLM-powered parsing:

```powershell
# PowerShell, REQUIRED
$env:OPENAI_API_KEY = "sk-..."

# Bash, optional
export OPENAI_API_KEY="sk-..."
```

---

### Log Parser (grokmoment)

The log parser is based on [grokmoment](https://github.com/mdunn99/grokmoment) (MIT), inlined at `vigil/vigil/backend/api/grokmoment.py`. **No separate clone is required.**

- **With `OPENAI_API_KEY`**: Unrecognized log lines are sent to the OpenAI API to auto-generate a new Grok pattern, which is then saved to `backend/api/data/patterns.json` for future use.
- **Without `OPENAI_API_KEY`**: Only lines matching existing patterns are parsed. Unmatched lines appear in the output with an `UNMATCHED` badge, and the UI will prompt you to set an API key.

Patterns are stored in `backend/api/data/patterns.json` and persist across runs. You can inspect or edit them manually.

---

### Run Order

Start backend first, then frontend (separate terminals):

```
Terminal 1 — backend:
  cd vigil/vigil/backend/api
  python -m uvicorn api_endpoint:app --reload --host 127.0.0.1 --port 8000

Terminal 2 — frontend:
  cd vigil/vigil/frontend
  npm run dev
```

---

## Quick Start (Docker, draft)

```bash
docker compose up --build
```

| Service        | Local URL                  |
|----------------|----------------------------|
| Dashboard      | http://localhost:3000       |
| API            | http://localhost:8000/docs  |
| Elasticsearch  | http://localhost:9200       |

## Project Structure (draft)

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

## Detection Rules (draft)

Sigma-format YAML rules mapped to MITRE ATT&CK:

| Rule | Technique | ID |
|------|-----------|----|
| Brute Force Login | Credential Access | T1110 |
| Privilege Escalation | Privilege Escalation | T1548 |
| Port Scan Detection | Discovery | T1046 |
| Suspicious Process Execution | Execution | T1059 |
| Unusual Account Login | Initial Access | T1078 |
