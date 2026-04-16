import os
import time
import threading
import requests
from fastapi import FastAPI, HTTPException, APIRouter
import database

router = APIRouter()

# ── Digest state ──────────────────────────────────────────────────────────────
_digest_lock = threading.Lock()
_pending_alerts: dict[str, list[dict]] = {}   # email → [events]
_last_sent: dict[str, float] = {}             # email → timestamp
_DIGEST_COOLDOWN = 600  # seconds (10 min) between digest emails per recipient


@router.post("/emailer_router")
def emailer_health():
    return {"ok": True}

def mailGun_Config()-> dict:
	mg_api_key = os.getenv("MAILGUN_API_KEY")
	mg_sender = os.getenv("MAILGUN_SENDER")
	mg_domain = os.getenv("MAILGUN_DOMAIN")
	
	if not mg_api_key or not mg_domain or not mg_sender:
		raise HTTPException(status_code=500, detail="MAILGUN_API_KEY not set")

	
	return {
		"api_key": mg_api_key,
		"sender": mg_sender,
		"domain": mg_domain,
	}

@router.post('/sampleEmail')
def send_simple_message():
    cfg = mailGun_Config()

    resp =  requests.post(
  		f"https://api.mailgun.net/v3/{cfg['domain']}/messages",
  		auth=("api", cfg.get("api_key")),
  		data={"from": cfg.get("sender"),
			"to": "Nicholas Westerfeld <nickwesterfeld@gmail.com>",
  			"subject": "Hello Nicholas Westerfeld",
  			"text": "Congratulations Nicholas Westerfeld, you just sent an email with Mailgun! You are truly awesome!"}
			)
    return{
		"status_code": resp.status_code,
        "text": resp.text,
    }

def severity_rank(sev: str) -> int:
    return {"critical": 3, "warning": 2, "info": 1, "unknown": 0}.get(sev, 0)

def should_alert(event: dict, min_severity: str) -> bool:
    return severity_rank(event.get("severity", "unknown")) >= severity_rank(min_severity)


@router.post("/alertEmail")
def send_alert_email(events: list[dict]):
    """Queue alertable events and send a count-based digest per subscriber (10-min window)."""
    try:
        cfg = mailGun_Config()
    except Exception:
        return  # Mailgun not configured — skip silently

    users = database.get_subscriptions()
    if not users:
        return

    now = time.time()

    with _digest_lock:
        for event in events:
            for user in users:
                if should_alert(event, user["min_severity"]):
                    email = user["email"]
                    _pending_alerts.setdefault(email, []).append(event)

        # Flush any recipients whose cooldown has elapsed
        emails_to_flush = [
            email for email, pending in _pending_alerts.items()
            if pending and (now - _last_sent.get(email, 0)) >= _DIGEST_COOLDOWN
        ]

        batches: dict[str, list[dict]] = {}
        for email in emails_to_flush:
            batches[email] = _pending_alerts.pop(email)
            _last_sent[email] = now

    # Send outside the lock
    for email, batch in batches.items():
        _send_digest(cfg, email, batch)


@router.post("/alerts/flush")
def force_flush_alerts():
    """Force-send all pending alert digests immediately, ignoring cooldown."""
    try:
        cfg = mailGun_Config()
    except Exception:
        raise HTTPException(status_code=503, detail="Mailgun not configured")

    with _digest_lock:
        batches = dict(_pending_alerts)
        _pending_alerts.clear()
        now = time.time()
        for email in batches:
            _last_sent[email] = now

    if not batches:
        return {"ok": True, "sent": 0, "message": "No pending alerts to flush"}

    sent = 0
    for email, batch in batches.items():
        _send_digest(cfg, email, batch)
        sent += 1

    return {"ok": True, "sent": sent, "recipients": list(batches.keys())}


@router.get("/alerts/pending")
def get_pending_alerts():
    """Check how many alerts are queued per recipient."""
    with _digest_lock:
        summary = {email: len(events) for email, events in _pending_alerts.items()}
    return {"pending": summary, "cooldown_seconds": _DIGEST_COOLDOWN}


def _send_digest(cfg: dict, email: str, events: list[dict]):
    """Send a single count-based digest email summarising alert events."""
    by_sev: dict[str, int] = {}
    for ev in events:
        sev = ev.get("severity", "unknown")
        by_sev[sev] = by_sev.get(sev, 0) + 1

    highest = max(by_sev.keys(), key=severity_rank)
    total = len(events)
    subject = f"Vigil Alert Digest — {total} event{'s' if total != 1 else ''} ({highest})"

    lines = [
        "Vigil SIEM — Alert Digest",
        "=" * 40,
        "",
        f"  Total events in this window:  {total}",
        "",
    ]

    for sev in ("critical", "warning", "info", "unknown"):
        count = by_sev.get(sev, 0)
        if count:
            lines.append(f"    {sev.upper():10s}  {count}")
    lines.append("")

    # Top 5 most recent events as a preview
    recent = events[-5:]
    lines.append("── Recent events (up to 5) ──")
    for ev in recent:
        lines.append(
            f"  [{ev.get('severity', '?'):8s}]  "
            f"{ev.get('timestamp', 'n/a')}  "
            f"src={ev.get('src_ip', 'n/a')}  "
            f"uri={ev.get('uri', 'n/a')}  "
            f"status={ev.get('status_code', 'n/a')}"
        )
    lines.append("")

    # Top source IPs
    ip_counts: dict[str, int] = {}
    for ev in events:
        ip = ev.get("src_ip", "unknown")
        ip_counts[ip] = ip_counts.get(ip, 0) + 1
    top_ips = sorted(ip_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    if top_ips:
        lines.append("── Top source IPs ──")
        for ip, cnt in top_ips:
            lines.append(f"  {ip:20s}  {cnt} events")
        lines.append("")

    lines.append("View full details on your Vigil dashboard.")

    body = "\n".join(lines)

    try:
        requests.post(
            f"https://api.mailgun.net/v3/{cfg['domain']}/messages",
            auth=("api", cfg["api_key"]),
            data={
                "from": cfg["sender"],
                "to": email,
                "subject": subject,
                "text": body,
            },
            timeout=10,
        )
    except Exception as exc:
        print(f"[emailer] digest send failed for {email}: {exc}")

