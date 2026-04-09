import os
import requests
from fastapi import FastAPI, HTTPException, APIRouter
import database

router = APIRouter()


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
    users = database.get_subscriptions()

    for event in events:
        for user in users:
            if should_alert(event, user["min_severity"]):
                send_event_alert(event, user["email"])

def send_event_alert(event: dict, user: str):
	cfg = mailGun_Config()

	resp =  requests.post(
		f"https://api.mailgun.net/v3/{cfg['domain']}/messages",
		auth=("api", cfg.get("api_key")),
		dat={f"from": cfg.get("sender"),
			f"to": user["email"],
			f"subject": "Vigil Alert "+ event.get("severity", "unknown"),
			f"text": "Vigil SIEM has detected the following problem:"+
			event.get("severity", "unknown")+":"+event.get("event"),
               }
			)
	return{
		"status_code": resp.status_code,
		"text": resp.text,
	}

