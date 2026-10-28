
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000",
)

allowed_origins = [
    origin.strip()
    for origin in raw_origins.split(",")
    if origin.strip()
]

app = FastAPI(
    title="Incipit API",
    description="An open-source contribution navigator",
    version="0.1.0",
)

raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000",
)

allowed_origins = [
    origin.strip()
    for origin in raw_origins.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "healthy"}
