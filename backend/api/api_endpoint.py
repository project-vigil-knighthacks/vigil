from contextlib import asynccontextmanager
from typing import Optional
import asyncio
import os
import base64
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, WebSocket, WebSocketDisconnect, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import init_db, write_events, read_events, count_events
from classifier import parse_and_sort, grok_parse
from emailer import router as emailer_router


# ── Startup ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(lifespan=lifespan)
app.include_router(emailer_router, prefix="/api")


# ── WebSocket broadcaster ─────────────────────────────────────────────────────
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


# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────
class StringPayload(BaseModel):
    content: str

class EnvKeysPayload(BaseModel):
    openai_key: str
    elevenlabs_key: str
    anthropic_key: str
    groq_key: str
    ollama_url: str
    ai_provider: str  # "openai" | "anthropic" | "groq" | "ollama"

class VoiceQuery(BaseModel):
    query: str

class TTSRequest(BaseModel):
    text: str


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"ok": True}


# ── Save API keys to .env ─────────────────────────────────────────────────────
@app.post("/api/save_keys")
def save_api_keys(payload: EnvKeysPayload):
    try:
        with open('.env', 'w') as f:
            f.write(f"OPENAI_API_KEY={payload.openai_key}\n")
            f.write(f"ELEVENLABS_API_KEY={payload.elevenlabs_key}\n")
            f.write(f"ANTHROPIC_API_KEY={payload.anthropic_key}\n")
            f.write(f"GROQ_API_KEY={payload.groq_key}\n")
            f.write(f"OLLAMA_URL={payload.ollama_url}\n")
            f.write(f"AI_PROVIDER={payload.ai_provider}\n")
        from dotenv import load_dotenv
        load_dotenv(override=True)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Legacy env endpoint (kept for compatibility) ──────────────────────────────
@app.post("/api/create_env")
def create_edit_openai_env_file(api_key: StringPayload):
    try:
        with open('.env', 'w') as f:
            f.write(api_key.content)
        from dotenv import load_dotenv
        load_dotenv(override=True)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Log parsing ───────────────────────────────────────────────────────────────
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


# ── SQLite events ─────────────────────────────────────────────────────────────
@app.post("/api/collect")
async def collect_events(events: list[dict]):
    """Receive parsed log events from the collector and store them in SQLite"""
    try:
        inserted = write_events(events)
        await event_broadcaster.broadcast({"type": "collector_events", "events": events})
        return {"ok": True, "inserted": inserted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store events: {str(e)}")

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


# ── WebSockets ────────────────────────────────────────────────────────────────
async def _stream_learning_status(websocket: WebSocket, initial_state: bool) -> None:
    if not initial_state:
        return
    while grok_parse.matcher.learning_in_progress:
        await websocket.send_json({"type": "learning", "learning_in_progress": True})
        await asyncio.sleep(0.5)
    await websocket.send_json({"type": "learning", "learning_in_progress": False})

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
                await websocket.send_json({"type": "event", "index": idx, "event": log_event})

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


# ── Voice agent ───────────────────────────────────────────────────────────────
@app.get("/api/voice/status")
def voice_status():
    provider = os.environ.get("AI_PROVIDER", "openai")
    if provider == "openai":
        enabled = bool(os.environ.get("OPENAI_API_KEY"))
    elif provider == "anthropic":
        enabled = bool(os.environ.get("ANTHROPIC_API_KEY"))
    elif provider == "groq":
        enabled = bool(os.environ.get("GROQ_API_KEY"))
    elif provider == "ollama":
        enabled = True  # Ollama is always local — no key needed
    else:
        enabled = False
    return {"enabled": enabled, "provider": provider}

@app.post("/api/voice")
async def voice_agent(body: VoiceQuery):
    provider = os.environ.get("AI_PROVIDER", "openai")

    try:
        recent_events = read_events(limit=10)
        context = str(recent_events)
    except Exception:
        context = "No recent events available."

    system_prompt = (
        "You are Vigil, an AI security assistant built into a SIEM dashboard. "
        "Answer questions about security events, alerts, and logs concisely. "
        "Keep responses under 3 sentences — they will be read aloud. "
        f"Here is the current security context: {context}"
    )

    # ── OpenAI ──
    if provider == "openai":
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return {"reply": None, "disabled": True}
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=150,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": body.query}
            ]
        )
        return {"reply": response.choices[0].message.content, "disabled": False}

    # ── Anthropic ──
    elif provider == "anthropic":
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return {"reply": None, "disabled": True}
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=150,
            system=system_prompt,
            messages=[{"role": "user", "content": body.query}]
        )
        return {"reply": message.content[0].text, "disabled": False}

    # ── Groq ──
    elif provider == "groq":
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            return {"reply": None, "disabled": True}
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "llama3-8b-8192",
                    "max_tokens": 150,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": body.query}
                    ]
                }
            )
        if response.status_code != 200:
            return {"reply": None, "disabled": True}
        return {"reply": response.json()["choices"][0]["message"]["content"], "disabled": False}

    # ── Ollama (local) ──
    elif provider == "ollama":
        ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{ollama_url}/api/chat",
                json={
                    "model": "llama3",
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": body.query}
                    ]
                },
                timeout=30.0
            )
        if response.status_code != 200:
            return {"reply": None, "disabled": True}
        return {"reply": response.json()["message"]["content"], "disabled": False}

    return {"reply": None, "disabled": True}


# ── ElevenLabs TTS ────────────────────────────────────────────────────────────
@app.get("/api/tts/status")
def tts_status():
    enabled = bool(os.environ.get("ELEVENLABS_API_KEY"))
    return {"enabled": enabled}

@app.post("/api/tts")
async def text_to_speech(body: TTSRequest):
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        return {"disabled": True}

    voice_id = "EXAVITQu4vr4xnSDxMaL"  # Bella — free tier
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={
                "text": body.text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}
            }
        )
    if response.status_code != 200:
        return {"disabled": True, "error": "ElevenLabs request failed"}

    audio_b64 = base64.b64encode(response.content).decode("utf-8")
    return {"audio": audio_b64, "disabled": False}