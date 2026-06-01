from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import symbolic

app = FastAPI(title="Quantiom", version="0.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(symbolic.router)
