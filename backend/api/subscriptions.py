import os
import requests
from fastapi import FastAPI, HTTPException, APIRouter
import database

router = APIRouter()


@router.post("/subscription_router")
def subscription_health():
    return {"ok": True}

@router.post("/add_subscription")
def add_subscription(email: str, min_severity: str):
    pass
