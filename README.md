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

## Quick Start (draft)

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
