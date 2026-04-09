# Vigil Dummy Site

A minimal Flask web application that generates **Apache Combined Log Format** access logs: the kind Vigil's pipeline already knows how to parse.

## Quick Start

```bash
# From the vigil root (with the venv active)
cd dummy-site
pip install -r requirements.txt

# 1. Start the site (writes to dummy-site/logs/access.log)
python app.py

# 2. In another terminal, point the collector at the log file
#    (requires updating collector.py's target: see Constraints below)

# 3. Generate traffic
python simulate.py                       # 200 mixed requests
python simulate.py --mode attack --requests 500
python simulate.py --mode benign --delay 0.2
```

## Structure

```
dummy-site/
  app.py            Flask application (routes + Apache-format logger)
  config.py         Ports, log path, dummy credentials
  simulate.py       Traffic generator (benign + attack patterns)
  requirements.txt  Python deps (flask)
  templates/        Jinja2 HTML templates
  static/           CSS
  logs/             Generated access logs (gitignored, created at runtime)
```

## How It Connects to Vigil

```
dummy-site (Flask)
    │  writes Apache access logs
    ▼
logs/access.log
    │  watched by
    ▼
collector.py  ──POST /api/collect──▶  api_endpoint.py (FastAPI)
    │                                      │
    │                                      ▼
    │                                  vigil.db (SQLite)
    │                                      │
    │                                      ▼
    └──────── WS /ws/collector ──────▶ Next.js frontend
```

### Log format produced

```
127.0.0.1 - alice [06/Apr/2026:14:23:01 +0000] "POST /login HTTP/1.1" 302 0
192.168.1.10 - - [06/Apr/2026:14:23:02 +0000] "GET /../../etc/passwd HTTP/1.1" 404 234
```

This matches the Grok pattern already in `patterns_backup`:
```
%{IP:src_ip} - - [%{HTTPDATE:timestamp}] "%{WORD} %{URIPATH:uri} HTTP/%{NUMBER}" %{INT:status_code} %{INT:bytes_sent}
```

## Simulated Traffic Types

| Mode     | What it generates |
|----------|-------------------|
| benign   | Normal browsing, valid logins, page visits |
| attack   | Brute-force login, SQL injection, XSS, directory traversal, scanner probes |
| mixed    | 60% benign / 40% attack (default) |

## Constraints & Backend/Frontend Work Needed

See the bottom of this README for what still needs to happen in Vigil's backend and frontend for full integration.
