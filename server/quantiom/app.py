from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import sympy as sp

from .circuit import Circuit
from .parsing import latex_clean
from .simulator import (
    SimulationError,
    bloch_vectors,
    numeric_amplitudes,
    probabilities,
    simulate_statevector,
    simulate_unitary,
)

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


class Amplitude(BaseModel):
    basis: str           # e.g. "010"
    index: int           # big-endian basis index
    expr: str            # sympy str form
    latex: str           # sympy latex form
    isZero: bool
    re: float | None = None  # numeric real part (None if symbolic)
    im: float | None = None  # numeric imaginary part (None if symbolic)


class BlochVector(BaseModel):
    x: float
    y: float
    z: float


class SkippedOut(BaseModel):
    id: str
    gateId: str
    reason: str


class StatevectorResponse(BaseModel):
    numQubits: int
    amplitudes: list[Amplitude]
    ketLatex: str        # the full |ψ⟩ = sum a_i |i⟩ expression
    skipped: list[SkippedOut]
    probabilities: list[float | None]   # |amplitude|² per basis state (None if symbolic)
    blochVectors: list[BlochVector | None]  # one per qubit (None if any amp symbolic)


def _basis_label(index: int, n: int) -> str:
    return format(index, f"0{n}b")


@app.post("/api/simulate/statevector", response_model=StatevectorResponse)
def statevector(circuit: Circuit) -> StatevectorResponse:
    try:
        result = simulate_statevector(circuit)
    except SimulationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    n = result.numQubits
    simplified = [sp.simplify(a) for a in result.amplitudes]
    numeric = numeric_amplitudes(simplified)
    probs = probabilities(numeric)
    blochs = bloch_vectors(numeric, n)

    amps: list[Amplitude] = []
    ket_terms: list[sp.Expr] = []
    for i, simp in enumerate(simplified):
        label = _basis_label(i, n)
        is_zero = simp == 0
        num = numeric[i]
        amps.append(
            Amplitude(
                basis=label,
                index=i,
                expr=sp.sstr(simp),
                latex=latex_clean(sp.latex(simp)),
                isZero=is_zero,
                re=None if num is None else num[0],
                im=None if num is None else num[1],
            )
        )
        if not is_zero:
            ket_symbol = sp.Symbol(f"|{label}\\rangle")
            ket_terms.append(simp * ket_symbol)

    if not ket_terms:
        ket_latex = "0"
    else:
        ket_latex = latex_clean(sp.latex(sp.Add(*ket_terms, evaluate=False)))

    return StatevectorResponse(
        numQubits=n,
        amplitudes=amps,
        ketLatex=ket_latex,
        skipped=[SkippedOut(id=s.id, gateId=s.gateId, reason=s.reason) for s in result.skipped],
        probabilities=probs,
        blochVectors=[None if b is None else BlochVector(x=b[0], y=b[1], z=b[2]) for b in blochs],
    )


class UnitaryResponse(BaseModel):
    numQubits: int
    latex: str
    entries: list[list[str]]
    skipped: list[SkippedOut]


@app.post("/api/simulate/unitary", response_model=UnitaryResponse)
def unitary(circuit: Circuit) -> UnitaryResponse:
    try:
        result = simulate_unitary(circuit)
    except SimulationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    U = result.matrix
    dim = U.shape[0]
    entries = [[sp.sstr(U[i, j]) for j in range(dim)] for i in range(dim)]
    return UnitaryResponse(
        numQubits=result.numQubits,
        latex=latex_clean(sp.latex(U)),
        entries=entries,
        skipped=[SkippedOut(id=s.id, gateId=s.gateId, reason=s.reason) for s in result.skipped],
    )


# ─── Static client (production) ────────────────────────────────────────────
# In production, the built Vite client is copied into quantiom/static. We mount
# it at "/" so the server serves both the API and the SPA from a single origin.
# Mounted last so /api routes win.

_STATIC_DIR = Path(__file__).parent / "static"
if _STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")
