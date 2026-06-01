from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import sympy as sp

from .circuit import Circuit
from .parsing import latex_clean
from .simulator import SimulationError, simulate_statevector

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


class SkippedOut(BaseModel):
    id: str
    gateId: str
    reason: str


class StatevectorResponse(BaseModel):
    numQubits: int
    amplitudes: list[Amplitude]
    ketLatex: str        # the full |ψ⟩ = sum a_i |i⟩ expression
    skipped: list[SkippedOut]


def _basis_label(index: int, n: int) -> str:
    return format(index, f"0{n}b")


@app.post("/api/simulate/statevector", response_model=StatevectorResponse)
def statevector(circuit: Circuit) -> StatevectorResponse:
    try:
        result = simulate_statevector(circuit)
    except SimulationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    n = result.numQubits
    amps: list[Amplitude] = []
    ket_terms: list[sp.Expr] = []
    for i, a in enumerate(result.amplitudes):
        simp = sp.simplify(a)
        label = _basis_label(i, n)
        is_zero = simp == 0
        amps.append(
            Amplitude(
                basis=label,
                index=i,
                expr=sp.sstr(simp),
                latex=latex_clean(sp.latex(simp)),
                isZero=is_zero,
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
    )
