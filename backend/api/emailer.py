import os
import requests
from fastapi import FastAPI, HTTPException, APIRouter

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

@router.post('/alertEmail')
def send_alert_email():
	return {"ok": True}
	

