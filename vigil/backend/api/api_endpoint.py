from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# note to Mike & backend devs:
# renamed from "api-endpoint" to "api_endpoint" to avoid hyphen in filename which is not allowed in Python, - Zayne
# https://stackoverflow.com/questions/2740026/why-are-underscores-better-than-hyphens-for-file-names <- refer to this

app = FastAPI()

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