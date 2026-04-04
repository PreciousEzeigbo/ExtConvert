import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.routes import router


def _allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "")
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or ["http://localhost:3000"]

app = FastAPI(
    title="ExtConvert API",
    description="Batch file conversion API — Images ↔ Documents ↔ Text",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)