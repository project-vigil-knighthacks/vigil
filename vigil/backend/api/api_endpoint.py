from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from log_parse import parse_logs
from database import init_db, write_events, read_events, count_events

# lifespan runs init_db() once at startup so vigil.db and its tables exist before any request is handled
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(lifespan=lifespan)

# initializes CORS middleware to allow requests 
# from frontend (on localhost:3000) to backend (on localhost:8000), - Zayne
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Item(BaseModel):
    name: str
    price: float
    is_offer: bool | None = None


class LogParseRequest(BaseModel):
    content: str


# basic API endpoints for testing connectivity and functionality, - Zayne
@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}


@app.put("/items/{item_id}")
def update_item(item_id: int, item: Item):
    return {"item_name": item.name, "item_id": item_id}


# Log parsing endpoints for SIEM functionality (using grokmoment parser)
@app.post("/api/logs/parse")
async def parse_log_content(request: LogParseRequest):
    """Parse syslog-style log content using Grok patterns."""
    try:
        result = parse_logs(request.content)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse logs: {str(e)}")


@app.post("/api/logs/upload")
async def upload_log_file(file: UploadFile = File(...)):
    """Parse an uploaded log file."""
    try:
        content = await file.read()
        content_str = content.decode('utf-8')
        result = parse_logs(content_str)
        result["filename"] = file.filename
        return result
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded text")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")


# SQLite-backed:
# called by log_collector.py after parsing each batch of new log lines
@app.post("/api/collect")
async def collect_events(events: list[dict]):
    """Receive parsed log events from the collector and store them in SQLite"""
    try:
        inserted = write_events(events)
        return {"ok": True, "inserted": inserted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store events: {str(e)}")


# called by the frontend dashboard to display and filter stored events
@app.get("/api/events")
async def get_events(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    severity: Optional[str] = Query(default=None),
):
    """Retrieve stored events from SQLite with optional severity filter and pagination"""
    events = read_events(limit=limit, offset=offset, severity=severity)
    total = count_events(severity=severity)
    return {"events": events, "total": total, "limit": limit, "offset": offset}