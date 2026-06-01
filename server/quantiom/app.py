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
    ketLatex: str        # the full |ψ⟩ = sum a_i |i⟩ expression (empty if isLarge)
    skipped: list[SkippedOut]
    probabilities: list[float | None]   # |amplitude|² per basis state (None if symbolic)
    blochVectors: list[BlochVector | None]  # one per qubit (None if any amp symbolic)
    freeSymbols: list[str]               # symbol names appearing in any amplitude
    isLarge: bool                        # symbolic display skipped — render numeric


class SimulateRequest(BaseModel):
    circuit: Circuit
    parameterValues: dict[str, float] = {}


def _basis_label(index: int, n: int) -> str:
    return format(index, f"0{n}b")


# ─── Symbolic-state cache ──────────────────────────────────────────────────
# The symbolic statevector depends only on the circuit IR, not on the user's
# parameter values. Caching it means parameter sweeps (e.g. the animation Play
# button driving `t`) only re-run the cheap numeric substitution path.

# Beyond these thresholds we skip sp.simplify and sp.latex entirely — a
# 6-qubit, 30-gate symbolic circuit can produce > 20 MB of LaTeX in 30 s,
# blocking the request and the panels behind it.
_LATEX_MAX_GATES = 12
_LATEX_MAX_QUBITS = 4

_STATE_CACHE: dict[str, "CachedSymbolicState"] = {}
_STATE_CACHE_LRU: list[str] = []
_STATE_CACHE_MAX = 32


class CachedSymbolicState(BaseModel):
    """Everything `_cached_symbolic_state` precomputes for one circuit."""
    model_config = {"arbitrary_types_allowed": True}
    amplitudes: list[sp.Expr]      # may be simplified or raw, see is_large
    ampExprs: list[str]             # sp.sstr per amplitude (or "…" if large)
    ampLatexes: list[str]           # sp.latex per amplitude (or "…" if large)
    ketLatex: str
    skipped: list                   # list[SkippedGate]
    freeSymbols: list[str]
    isLarge: bool                   # if True, ampExprs/ampLatexes/ketLatex are stubs


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


_LARGE_STUB_KET = ""
_LARGE_STUB_AMP = ""


def _cached_symbolic_state(circuit: Circuit) -> CachedSymbolicState:
    """Compute the symbolic state and all derived strings for a circuit.

    For small circuits the amplitudes are run through sp.simplify and each
    is converted to a string and to LaTeX. Past the threshold all of that
    is skipped — the numeric panels (probabilities, Bloch, sonorizer) work
    fine on the unsimplified expressions; the ket display falls back to a
    stub. The threshold is chosen so animation playback never blocks.
    """
    key = _circuit_key(circuit)
    hit = _STATE_CACHE.get(key)
    if hit is not None:
        _STATE_CACHE_LRU.remove(key)
        _STATE_CACHE_LRU.append(key)
        return hit

    result = simulate_statevector(circuit)
    n = result.numQubits
    is_large = len(circuit.gates) > _LATEX_MAX_GATES or n > _LATEX_MAX_QUBITS

    if not is_large:
        amps_sym = [sp.simplify(a) for a in result.amplitudes]
        amp_exprs = [sp.sstr(a) for a in amps_sym]
        amp_latexes = [latex_clean(sp.latex(a)) for a in amps_sym]
        ket_terms: list[sp.Expr] = []
        for i, simp in enumerate(amps_sym):
            if simp != 0:
                label = format(i, f"0{n}b")
                ket_terms.append(simp * sp.Symbol(f"|{label}\\rangle"))
        ket_latex = (
            "0" if not ket_terms else latex_clean(sp.latex(sp.Add(*ket_terms, evaluate=False)))
        )
    else:
        amps_sym = result.amplitudes
        amp_exprs = [_LARGE_STUB_AMP] * len(amps_sym)
        amp_latexes = [_LARGE_STUB_AMP] * len(amps_sym)
        ket_latex = _LARGE_STUB_KET

    free_syms = free_symbol_names(amps_sym)

    value = CachedSymbolicState(
        amplitudes=amps_sym,
        ampExprs=amp_exprs,
        ampLatexes=amp_latexes,
        ketLatex=ket_latex,
        skipped=result.skipped,
        freeSymbols=free_syms,
        isLarge=is_large,
    )
    _STATE_CACHE[key] = value
    _STATE_CACHE_LRU.append(key)
    if len(_STATE_CACHE_LRU) > _STATE_CACHE_MAX:
        oldest = _STATE_CACHE_LRU.pop(0)
        _STATE_CACHE.pop(oldest, None)
    return value


@app.post("/api/simulate/statevector", response_model=StatevectorResponse)
def statevector(req: SimulateRequest) -> StatevectorResponse:
    try:
        cached = _cached_symbolic_state(req.circuit)
    except SimulationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    n = req.circuit.numQubits
    numeric = numeric_amplitudes(cached.amplitudes, req.parameterValues)
    probs = probabilities(numeric)
    blochs = bloch_vectors(numeric, n)

    amps: list[Amplitude] = []
    for i, simp in enumerate(cached.amplitudes):
        label = _basis_label(i, n)
        num = numeric[i]
        is_zero = (
            (num is not None and abs(num[0]) < 1e-12 and abs(num[1]) < 1e-12)
            or (num is None and simp == 0)
        )
        amps.append(
            Amplitude(
                basis=label,
                index=i,
                expr=cached.ampExprs[i],
                latex=cached.ampLatexes[i],
                isZero=is_zero,
                re=None if num is None else num[0],
                im=None if num is None else num[1],
            )
        )

    return StatevectorResponse(
        numQubits=n,
        amplitudes=amps,
        ketLatex=cached.ketLatex,
        skipped=[SkippedOut(id=s.id, gateId=s.gateId, reason=s.reason) for s in cached.skipped],
        probabilities=probs,
        blochVectors=[None if b is None else BlochVector(x=b[0], y=b[1], z=b[2]) for b in blochs],
        freeSymbols=cached.freeSymbols,
        isLarge=cached.isLarge,
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
