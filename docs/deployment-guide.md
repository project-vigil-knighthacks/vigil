# Connecting a Real Website to Vigil

How to hook up a deployed website (or any web server) to Vigil for real-time monitoring.

---

## The Core Requirement

Vigil needs exactly **one thing** from your website: a text-based log file that it can read.

```
Your website  ──writes──▶  access.log  ◀──reads──  Vigil collector
```

That's it. Vigil **never touches your website code, database, or server configuration**. It only reads a log file.

---

## Bare Minimum: What Your Website Must Produce

### 1. An HTTP Access Log File

Your web server (or hosting platform) must write access logs to a file that Vigil's collector can reach. Every major web server does this by default:

| Server | Default log location | Format |
|--------|---------------------|--------|
| **Nginx** | `/var/log/nginx/access.log` | Combined by default |
| **Apache** | `/var/log/apache2/access.log` | Combined or Common |
| **Caddy** | Needs explicit config | JSON or Common |
| **Node.js / Express** | None by default: needs `morgan` or similar middleware | Configurable |
| **IIS** | `C:\inetpub\logs\LogFiles\` | W3C Extended |

**The log format Vigil already has a Grok pattern for:**

```
Apache Combined / Common:
127.0.0.1 - alice [08/Apr/2026:14:23:01 +0000] "GET /dashboard HTTP/1.1" 200 1234
```

Pattern: `%{IP:src_ip} - - [%{HTTPDATE:timestamp}] "%{WORD} %{URIPATH:uri} HTTP/%{NUMBER}" %{INT:status_code} %{INT:bytes_sent}`

If your logs are in a different format (JSON, W3C, custom), Vigil can still handle them:
- **With `OPENAI_API_KEY`**: Grokmoment will auto-generate a new pattern from the first few unrecognized lines
- **Without `OPENAI_API_KEY`**: You'd need to write a Grok pattern manually and add it to `backend/api/data/patterns.json`

### 2. File Access

The Vigil collector must be able to read the log file. This means one of:

| Scenario | How it works |
|----------|--------------|
| **Same machine** | Collector reads the file directly (simplest) |
| **Remote server** | Mount the log file locally via `sshfs`, `NFS`, `SMB`, or sync it with `rsync` / `scp` on a cron |
| **Cloud hosting** | Download logs via API (Vercel, Cloudflare, AWS CloudWatch) and write them to a local file for the collector |

---

## Your Situation: Website with No Logs or Backend

If your deployed website currently produces **no logs and has no backend/database**, here's what you need to add:

### Option A: Add Logging at the Web Server Level (Recommended)

If your site is served by **Nginx, Apache, or Caddy**, it's already producing access logs: you just need to find them or enable them.

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
    # ... rest of config
}
```

This requires **zero changes to your website code**. The web server logs every request automatically.

### Option B: Static Site / No Server Control (e.g., Vercel, Netlify, GitHub Pages)

If you have no access to the web server and it's a static frontend-only site:

1. **Check if your platform exposes logs:**
   - **Vercel**: Runtime Logs API (`vercel logs --json`)
   - **Cloudflare Pages**: Analytics API (not raw access logs)
   - **Netlify**: Analytics add-on (limited)
   - **AWS S3 + CloudFront**: Access logging to S3 bucket

2. **Write a small sync script** that pulls logs from the platform API and writes them to a local file. Then point the collector at that file. Example concept:
   ```bash
   # Cron every minute:
   vercel logs --json --since 1m >> /var/log/mysite/access.log
   ```

3. **If no logs are available at all**, you could add a lightweight logging endpoint to a minimal backend (a single serverless function or tiny Express server) that your frontend pings on each page load. But at that point you're building a backend.

### Option C: Add Express/Node Middleware (if you add a backend)

If you decide to add a backend to your website:

```js
// Express example
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

const accessLogStream = fs.createWriteStream(
  path.join(__dirname, 'logs', 'access.log'),
  { flags: 'a' }
);

app.use(morgan('combined', { stream: accessLogStream }));
```

This writes Apache Combined format that Vigil already understands.

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
| `VIGIL_LOG_PATH` | *(not yet implemented)*: Tell the collector which file to watch without editing code |

---

## What Needs to Be Built in Vigil First

Before a real website's logs will flow end-to-end through the dashboard, these items from [constraints.md](constraints.md) must be resolved:

1. **Collector accepts a file path argument**: so you can run `python collector.py /var/log/nginx/access.log`
2. **Collector parses locally and POSTs structured events**: not raw text
3. **`patterns.json` is seeded with the Apache pattern**: or you have `OPENAI_API_KEY` set
4. **HTTP-aware severity classification**: so 404s, 500s, and `/etc/passwd` probes get flagged properly
5. **Frontend event columns include `uri` and `status_code`**: so you can actually see what URLs are being hit

Items 1–3 are required. Items 4–5 are required for the dashboard to be useful (otherwise events just show dashes).

---

## Testing Checklist

Once the above Vigil changes are made:

```
[ ] Web server writing access.log (verify with tail -f)
[ ] Vigil backend running (http://localhost:8000/api/health returns {"ok": true})
[ ] Vigil frontend running (http://localhost:3000 loads)
[ ] Collector pointed at access.log and running
[ ] Visit your website in a browser: check that events appear in /events
[ ] Check /alerts for any warning/critical entries
[ ] Run the dummy-site simulator against your real site URL to generate attack traffic:
    python simulate.py --base https://yoursite.com --mode attack --requests 50
```