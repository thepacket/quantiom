"""Quantiom server.

The quantum simulator runs entirely in the browser (see client/src/sim/).
This service only:
  - exposes /api/health for Fly's TCP health check
  - serves the built client as static files from quantiom/static/
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Quantiom", version="0.9.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Mount the built client at "/" so the same Fly URL serves the SPA and the
# health endpoint. The static directory is populated by the Dockerfile.
_STATIC_DIR = Path(__file__).parent / "static"
if _STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")
