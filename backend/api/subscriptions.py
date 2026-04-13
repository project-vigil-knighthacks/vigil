from fastapi import APIRouter
from pydantic import BaseModel
from emailer import mailGun_Config
import database
import requests

router = APIRouter()

@router.post("/subscription_router")
def subscription_health():
    return {"ok": True}

class SubscriptionPayload(BaseModel):
    email: str
    min_severity: str

@router.post("/add_subscription")
def add_subscription_route(payload: SubscriptionPayload):
    database.create_subscriptions_table()
    if database.add_subscription(payload.email, payload.min_severity):
        opt_in_email(payload.email)

    return {"ok": True}

@router.get("/subscriptions")
def list_subscriptions():
    return database.get_subscriptions()


def opt_in_email(email: str):
    cfg = mailGun_Config()
    
    resp = requests.post( 
        f"https://api.mailgun.net/v3/{cfg['domain']}/messages",
        auth=("api", cfg["api_key"]),
        data={"from": cfg["sender"],
            "to": email,
            "subject": "Welcome to Vigil",
            "text": "You are now opted in to receive alerts."
        },
          timeout=10
    )
    return {"status_code": resp.status_code, "text": resp.text}
