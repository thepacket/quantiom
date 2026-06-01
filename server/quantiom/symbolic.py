"""Symbolic quantum-state endpoints.

The canonical compute path: parse a symbolic circuit description, return symbolic
statevector / unitary / probabilities. Numeric is derived via .evalf() on demand.

This module is a stub — it demonstrates the symbolic-native contract so the rest of
the system can be built around it. Real gate application, custom gates, classical
registers, mid-circuit measurement, etc. come next.
"""

from __future__ import annotations

import sympy as sp
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/symbolic", tags=["symbolic"])


class BellRequest(BaseModel):
    """Demo: compute the Bell state symbolically as (|00> + |11>) / sqrt(2)."""

    numeric: bool = False


class StateResponse(BaseModel):
    latex: str
    amplitudes: list[str]  # one entry per basis state, in computational-basis order


@router.post("/bell", response_model=StateResponse)
def bell(req: BellRequest) -> StateResponse:
    sqrt2 = sp.sqrt(2)
    amps = [1 / sqrt2, sp.Integer(0), sp.Integer(0), 1 / sqrt2]
    if req.numeric:
        amps = [a.evalf() for a in amps]
    expr = (
        amps[0] * sp.Symbol("|00\\rangle")
        + amps[3] * sp.Symbol("|11\\rangle")
    )
    return StateResponse(
        latex=sp.latex(expr),
        amplitudes=[sp.sstr(a) for a in amps],
    )
