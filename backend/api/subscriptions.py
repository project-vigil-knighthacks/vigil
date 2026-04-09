from fastapi import APIRouter
from pydantic import BaseModel
import database

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
    database.add_subscription(payload.email, payload.min_severity)
    return {"ok": True}

@router.get("/subscriptions")
def list_subscriptions():
    return database.get_subscriptions()

