# Quantiom server

A deliberately minimal FastAPI shell. The quantum simulator and everything
else run entirely in the browser (see `client/src/sim/`); this service only:

- exposes `GET /api/health` for Fly's health check, and
- serves the built client as static files from `quantiom/static/`.

It performs no circuit computation, makes no outbound calls, and stores no
data. Dependencies are just `fastapi` and `uvicorn` — no sympy / numpy /
qiskit (an earlier server-side symbolic-simulation design was removed in favour
of the pure-TypeScript browser simulator).

## Run it

```
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn quantiom.app:app --reload --port 8000
```

Health check: `curl localhost:8000/api/health` → `{"status":"ok"}`.

`quantiom/static/` is populated at image-build time by the root `Dockerfile`
(which runs the client's `vite build` and copies `dist/` in), so a bare local
checkout serves only `/api/health` until that directory exists. For local UI
development, run the client's Vite dev server instead (`cd client && npm run
dev`); it proxies `/api` to this server on port 8000.
