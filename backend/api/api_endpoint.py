from contextlib import asynccontextmanager
from typing import Optional
import asyncio
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, WebSocket, WebSocketDisconnect, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import init_db, write_events, read_events, count_events
from classifier import parse_and_sort, grok_parse
from emailer import router as emailer_router
from subscriptions import router as subscriptions_router




# lifespan runs init_db() once at startup so vigil.db and its tables exist before any request is handled
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(lifespan=lifespan)
app.include_router(emailer_router, prefix="/api")
router=APIRouter


class EventBroadcaster:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def register(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.add(websocket)

    async def unregister(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, payload: dict) -> None:
        async with self._lock:
            connections = list(self._connections)

        for websocket in connections:
            try:
                await websocket.send_json(payload)
            except WebSocketDisconnect:
                await self.unregister(websocket)


event_broadcaster = EventBroadcaster()

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
        await event_broadcaster.broadcast({"type": "collector_events", "events": events})
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


async def _stream_learning_status(websocket: WebSocket, initial_state: bool) -> None:
    if not initial_state:
        return
    while grok_parse.matcher.learning_in_progress:
        await websocket.send_json({"type": "learning", "learning_in_progress": True})
        await asyncio.sleep(0.5) # poll undetermined patterns every 5 seconds
    await websocket.send_json({"type": "learning", "learning_in_progress": False}) # update the fact that the log excerpt is no longer learning


@app.websocket("/ws/parse")
async def parse_logs_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_json()
            content = payload.get("content")
            if not isinstance(content, str):
                await websocket.send_json(
                    {"type": "error", "message": "\"content\" must be a string log payload."}
                )
                continue
            try:
                result = parse_and_sort(content)
            except Exception as exc:
                await websocket.send_json({"type": "error", "message": str(exc)})
                continue

            for idx, log_event in enumerate(result["logs"]):
                await websocket.send_json(
                    {"type": "event", "index": idx, "event": log_event}
                )

            summary = {
                "format": result["format"],
                "count": result["count"],
                "parsed_at": result["parsed_at"],
                "filename": result.get("filename"),
                "api_key_available": result.get("api_key_available"),
                "api_key_required": result.get("api_key_required"),
                "api_key_message": result.get("api_key_message"),
                "unmatched_count": result.get("unmatched_count"),
                "learning_in_progress": result.get("learning_in_progress"),
            }
            await websocket.send_json({"type": "summary", "summary": summary})

            await _stream_learning_status(websocket, result.get("learning_in_progress", False))
    except WebSocketDisconnect:
        return
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)


@app.websocket("/ws/collector")
async def collector_events_stream(websocket: WebSocket):
    await websocket.accept()
    await event_broadcaster.register(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        return
    finally:
        await event_broadcaster.unregister(websocket)

app.include_router(emailer_router, prefix="/api")

app.include_router(subscriptions_router, prefix="/api")

