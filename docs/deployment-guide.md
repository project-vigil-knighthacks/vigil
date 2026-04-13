# Connecting a Real Website to Vigil

How to hook up a deployed website (or any web server) to Vigil for real-time monitoring.

---

## The Core Requirement

Vigil needs **one thing** from your website: HTTP request logs in a text format it can parse.

There are two ways to get them there:

```
Option 1 (file-based):   Your website  ──writes──▶  access.log  ◀──reads──  Vigil collector
Option 2 (HTTP ingest):  Your website  ──POSTs raw log lines──▶  Vigil /api/ingest
```

Vigil **never touches your website code, database, or server configuration**. It either reads a log file or receives log lines over HTTP.

---

## Bare Minimum: What Your Website Must Produce

### 1. An HTTP Access Log Line

Each request to your site should produce a log line. Every major web server does this by default:

| Server | Default log location | Format |
|--------|---------------------|--------|
| **Nginx** | `/var/log/nginx/access.log` | Combined by default |
| **Apache** | `/var/log/apache2/access.log` | Combined or Common |
| **Caddy** | Needs explicit config | JSON or Common |
| **Node.js / Express** | None by default: needs `morgan` or similar middleware | Configurable |
| **Next.js (Vercel)** | No file: use edge middleware to POST to `/api/ingest` | Apache format via middleware |
| **IIS** | `C:\inetpub\logs\LogFiles\` | W3C Extended |

**The log format Vigil already has a Grok pattern for:**

```
Apache Combined / Common:
127.0.0.1 - alice [08/Apr/2026:14:23:01 +0000] "GET /dashboard HTTP/1.1" 200 1234
```

Pattern: `%{IP:src_ip} - - [%{HTTPDATE:timestamp}] "%{WORD} %{URIPATH:uri} HTTP/%{NUMBER}" %{INT:status_code} %{INT:bytes_sent}`

If your logs are in a different format (JSON, W3C, custom), Vigil can still handle them:
- **With an LLM API key** (`OPENAI_API_KEY`): Grokmoment will auto-generate a new pattern from the first few unrecognized lines
- **Without an LLM key**: write a Grok pattern manually and add it to `backend/api/data/patterns.json`

### 2. A Way to Deliver Logs to Vigil

| Scenario | Method | Complexity |
|----------|--------|------------|
| **Same machine** | Collector reads the log file directly | Easiest |
| **Remote server** | Mount the log file locally via `sshfs`, `NFS`, `SMB`, or sync with `rsync` | Medium |
| **Cloud / serverless (Vercel, Netlify, etc.)** | Site middleware POSTs raw log lines to `POST /api/ingest` | Easy (no collector needed) |

---

## Integration Options

### Option A: File-Based — Web Server Logs (traditional servers)

If your site is served by **Nginx, Apache, or Caddy**, it's already producing access logs. Point the collector at the file:

```bash
# CLI argument
python collector.py /var/log/nginx/access.log

# Or set the env var
export VIGIL_LOG_PATH=/var/log/nginx/access.log
python collector.py
```

This requires **zero changes to your website code**. The web server logs every request automatically.

**Nginx**: check `/etc/nginx/nginx.conf`:
```nginx
http {
    access_log /var/log/nginx/access.log combined;
}
```

**Apache**: check `/etc/apache2/apache2.conf`:
```apache
CustomLog /var/log/apache2/access.log combined
```

**Caddy**: add to `Caddyfile`:
```
yourdomain.com {
    log {
        output file /var/log/caddy/access.log
    }
}
```

### Option B: HTTP Ingestion — Cloud / Serverless Sites (Recommended for Vercel, Netlify, etc.)

If your site runs on a serverless platform with no persistent filesystem, use Vigil's `POST /api/ingest` endpoint. Your site sends raw Apache-format log lines directly — no collector, no file, no sync scripts.

**How it works:**
1. Add a small middleware/proxy to your site that formats each request as an Apache log line
2. The middleware fire-and-forget POSTs it to your Vigil backend
3. Vigil parses, classifies, stores, and broadcasts the event automatically

**Next.js example** (edge middleware / proxy):
```ts
// src/proxy.ts (or src/middleware.ts for Next.js <16)
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const vigilUrl = process.env.VIGIL_API_URL;
  if (vigilUrl) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const ts = formatHttpDate(new Date());
    const logLine = `${ip} - - [${ts}] "${req.method} ${req.nextUrl.pathname} HTTP/1.1" 200 0`;

    fetch(`${vigilUrl}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: logLine }),
    }).catch(() => {}); // Don't block the response if SIEM is down
  }
  return res;
}
```

Set `VIGIL_API_URL` in your hosting platform's environment variables (e.g. Vercel Project Settings → Environment Variables). The URL should point to your Vigil backend — either a public deployment or an ngrok tunnel to `localhost:8000`.

**Express example:**
```js
const morgan = require('morgan');

// POST each log line to Vigil instead of writing to a file
app.use(morgan('combined', {
  stream: {
    write: (line) => {
      fetch(`${process.env.VIGIL_API_URL}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: line.trim() }),
      }).catch(() => {});
    }
  }
}));
```

### Option C: File + Express/Node Middleware (self-hosted Node.js)

If you run your own Node.js server and prefer the file-based approach:

```js
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

const accessLogStream = fs.createWriteStream(
  path.join(__dirname, 'logs', 'access.log'),
  { flags: 'a' }
);

app.use(morgan('combined', { stream: accessLogStream }));
```

Then run the collector pointed at `logs/access.log`.

---

## Exposing the Vigil Backend

If your website is deployed remotely (not on the same machine as Vigil), the backend needs to be reachable:

| Method | Use case |
|--------|----------|
| **ngrok** (`ngrok http 8000`) | Quick testing — gives a public URL that tunnels to your local backend |
| **Deploy backend** (Railway, Fly.io, etc.) | Persistent — no tunnel needed |
| **VPN / Tailscale** | Private — site and SIEM on same network |

For ngrok, set `VIGIL_API_URL=https://your-tunnel.ngrok-free.app` in your site's environment.

**CORS**: Vigil's backend must allow your site's origin. Add it to the `allow_origins` list in `backend/api/api_endpoint.py`:
```python
allow_origins=[
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://your-site.vercel.app",  # add your deployed site
],
```

---

## .env Variables for Full Functionality

What a website owner would configure in Vigil:

### Essential

| Variable | Why |
|----------|-----|
| *(none)* | Vigil runs with zero config for basic parsing and viewing |

### For Automatic Pattern Learning

| Variable | Why |
|----------|-----|
| `OPENAI_API_KEY` | If your logs are in a format Vigil hasn't seen, this lets it auto-generate Grok patterns. Without it, you'll need to write patterns manually or use a known format (Apache Combined, syslog, auth.log) |

### For the Voice Agent

| Variable | Why |
|----------|-----|
| `AI_PROVIDER` | Which LLM to use: `openai` (default), `anthropic`, `groq`, or `ollama` |
| `OPENAI_API_KEY` | OpenAI — voice agent + auto pattern generation |
| `ANTHROPIC_API_KEY` | Anthropic — voice agent (Claude) |
| `GROQ_API_KEY` | Groq — voice agent (Llama 3) |
| `OLLAMA_URL` | Ollama instance URL — voice agent locally, no key needed |
| `ELEVENLABS_API_KEY` | ElevenLabs — text-to-speech for voice agent responses |

### For Email Alerts

| Variable | Why |
|----------|-----|
| `MAILGUN_API_KEY` | Send email notifications when critical events are detected |
| `MAILGUN_DOMAIN` | Your Mailgun sending domain |
| `MAILGUN_SENDER` | "From" address for alert emails |

### For Custom Paths

| Variable | Why |
|----------|-----|
| `VIGIL_DB_PATH` | Store the SQLite database somewhere specific instead of next to the backend code |
| `VIGIL_LOG_PATH` | Tell the collector which file to watch (alternative to CLI arg) |

---

## Testing Checklist

```
[ ] Vigil backend running (http://localhost:8000/api/health returns {"ok": true})
[ ] Vigil frontend running (http://localhost:3000 loads)
[ ] Log delivery working (one of):
    [ ] File-based: collector running and pointed at your log file
    [ ] HTTP ingest: site middleware POSTing to /api/ingest (check backend terminal for output)
[ ] Visit your website in a browser: check that events appear in /events
[ ] Check /alerts for any warning/critical entries
[ ] Run the dummy-site simulator against your real site URL to generate attack traffic:
    python simulate.py --base https://yoursite.com --mode attack --requests 50
```