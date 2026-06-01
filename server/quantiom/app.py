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
    free_symbol_names,
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
    freeSymbols: list[str]               # symbol names appearing in any amplitude


class SimulateRequest(BaseModel):
    circuit: Circuit
    parameterValues: dict[str, float] = {}


def _basis_label(index: int, n: int) -> str:
    return format(index, f"0{n}b")


# ─── Symbolic-state cache ──────────────────────────────────────────────────
# The symbolic statevector depends only on the circuit IR, not on the user's
# parameter values. Caching it means parameter sweeps (e.g. the animation Play
# button driving `t`) only re-run the cheap numeric substitution path.

_STATE_CACHE: dict[str, tuple[list[sp.Expr], list, str, list[str]]] = {}
_STATE_CACHE_LRU: list[str] = []
_STATE_CACHE_MAX = 32


def _circuit_key(circuit: Circuit) -> str:
    """Stable hash key for a circuit IR, ignoring instance ids and column ties."""
    gates = sorted(
        (
            g.gateId,
            g.column,
            tuple(g.controls),
            tuple(g.targets),
            tuple(g.clbits),
            tuple(g.params),
        )
        for g in circuit.gates
    )
    return repr((circuit.numQubits, gates))


def _cached_symbolic_state(
    circuit: Circuit,
) -> tuple[list[sp.Expr], list, str, list[str]]:
    """Return (simplified amplitudes, skipped gates, ket latex, free symbols).

    Cache miss runs the symbolic simulator + simplification + LaTeX rendering;
    cache hit is a dict lookup.
    """
    key = _circuit_key(circuit)
    cached = _STATE_CACHE.get(key)
    if cached is not None:
        _STATE_CACHE_LRU.remove(key)
        _STATE_CACHE_LRU.append(key)
        return cached

    result = simulate_statevector(circuit)
    n = result.numQubits
    simplified = [sp.simplify(a) for a in result.amplitudes]
    ket_terms: list[sp.Expr] = []
    for i, simp in enumerate(simplified):
        if simp != 0:
            label = format(i, f"0{n}b")
            ket_terms.append(simp * sp.Symbol(f"|{label}\\rangle"))
    ket_latex = "0" if not ket_terms else latex_clean(sp.latex(sp.Add(*ket_terms, evaluate=False)))
    free_syms = free_symbol_names(simplified)

    value = (simplified, result.skipped, ket_latex, free_syms)
    _STATE_CACHE[key] = value
    _STATE_CACHE_LRU.append(key)
    if len(_STATE_CACHE_LRU) > _STATE_CACHE_MAX:
        oldest = _STATE_CACHE_LRU.pop(0)
        _STATE_CACHE.pop(oldest, None)
    return value


@app.post("/api/simulate/statevector", response_model=StatevectorResponse)
def statevector(req: SimulateRequest) -> StatevectorResponse:
    try:
        simplified, skipped, ket_latex, free_syms = _cached_symbolic_state(req.circuit)
    except SimulationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    n = req.circuit.numQubits
    numeric = numeric_amplitudes(simplified, req.parameterValues)
    probs = probabilities(numeric)
    blochs = bloch_vectors(numeric, n)

    amps: list[Amplitude] = []
    for i, simp in enumerate(simplified):
        label = _basis_label(i, n)
        num = numeric[i]
        amps.append(
            Amplitude(
                basis=label,
                index=i,
                expr=sp.sstr(simp),
                latex=latex_clean(sp.latex(simp)),
                isZero=simp == 0,
                re=None if num is None else num[0],
                im=None if num is None else num[1],
            )
        )

    return StatevectorResponse(
        numQubits=n,
        amplitudes=amps,
        ketLatex=ket_latex,
        skipped=[SkippedOut(id=s.id, gateId=s.gateId, reason=s.reason) for s in skipped],
        probabilities=probs,
        blochVectors=[None if b is None else BlochVector(x=b[0], y=b[1], z=b[2]) for b in blochs],
        freeSymbols=free_syms,
    )


class UnitaryResponse(BaseModel):
    numQubits: int
    latex: str
    entries: list[list[str]]
    skipped: list[SkippedOut]


@app.post("/api/simulate/unitary", response_model=UnitaryResponse)
def unitary(req: SimulateRequest) -> UnitaryResponse:
    try:
        result = simulate_unitary(req.circuit)
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
