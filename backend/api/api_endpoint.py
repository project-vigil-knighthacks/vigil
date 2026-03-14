from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import init_db, write_events, read_events, count_events
from classifier import parse_and_sort

# lifespan runs init_db() once at startup so vigil.db and its tables exist before any request is handled
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StringPayload(BaseModel):
    content: str

# basic API endpoints for testing connectivity and functionality, - Zayne
@app.get("/api/health")
def health():
    return {"ok": True}

# Log parsing endpoints for SIEM functionality (using grokmoment parser)
@app.post("/api/logs/parse")
async def parse_log_content(request: StringPayload):
    try:
        result = parse_and_sort(request.content)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse logs: {str(e)}")

@app.post("/api/logs/upload")
async def upload_log_file(file: UploadFile = File(...)):
    """Parse an uploaded log file."""
    try:
        content = await file.read()
        result = parse_and_sort(content)
        result["filename"] = file.filename
        return result
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded text")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

@app.post("/api/create_env")
def create_edit_openai_env_file(api_key: StringPayload):
    try:
        with open('.env', 'w') as openai_env:
            openai_env.write(api_key.content)
            return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
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