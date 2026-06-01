# ─── Stage 1: build client ──────────────────────────────────────────────
FROM node:20-alpine AS client
WORKDIR /app

# Install deps first (cached unless lockfile changes).
COPY client/package.json client/package-lock.json client/
RUN cd client && npm ci

# Source. The Vite build resolves raw imports from `../../examples/*.qasm`,
# so the examples/ directory must be present at the layout the client expects.
COPY examples/ examples/
COPY client/ client/

RUN cd client && npm run build

# ─── Stage 2: server runtime ────────────────────────────────────────────
FROM python:3.13-slim AS server
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Server is just a static host now — the quantum simulator runs in the
# browser. Drop sympy, numpy, pydantic; FastAPI + uvicorn is enough.
RUN pip install \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.32"

COPY server/quantiom/ ./quantiom/
COPY --from=client /app/client/dist ./quantiom/static

EXPOSE 8000
CMD ["uvicorn", "quantiom.app:app", "--host", "0.0.0.0", "--port", "8000"]
