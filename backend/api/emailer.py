import os
import requests
from fastapi import FastAPI, HTTPException, APIRouter

router = APIRouter()

@router.post("/emailer_router")
def send_simple_message():
    return {"ok": True}


@router.post('/sampleEmail')
def send_simple_message():
	api_key = os.getenv("MAILGUN_API_KEY")
	if not api_key:
		raise HTTPException(status_code=500, detail="MAILGUN_API_KEY not set")
	return requests.post(
  		"https://api.mailgun.net/v3/sandbox9cbb2289c7094d94a2c44ac87d927e96.mailgun.org/messages",
  		auth=("api", api_key),
  		data={"from": "Mailgun Sandbox <postmaster@sandbox9cbb2289c7094d94a2c44ac87d927e96.mailgun.org>",
			"to": "Nicholas Westerfeld <nickwesterfeld@gmail.com>",
  			"subject": "Hello Nicholas Westerfeld",
  			"text": "Congratulations Nicholas Westerfeld, you just sent an email with Mailgun! You are truly awesome!"}
			)