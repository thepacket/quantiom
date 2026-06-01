# Quantiom server

FastAPI service. Bridges multi-language QC packages — Python (sympy / numpy / qiskit) at first; future Julia / Rust / C++ simulators via subprocess or RPC.

```
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn quantiom.app:app --reload --port 8000
```

Health check: `curl localhost:8000/api/health`.
