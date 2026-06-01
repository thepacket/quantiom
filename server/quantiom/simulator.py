"""Apply a circuit to a symbolic statevector and return the resulting amplitudes.

Conventions:
- Big-endian basis indexing: qubit 0 is the MSB of the basis state index. So
  for 2 qubits, index 0 = |q0=0, q1=0⟩ = |00⟩, index 1 = |q0=0, q1=1⟩ = |01⟩,
  index 2 = |10⟩, index 3 = |11⟩. The result list is ordered by basis index.
- Initial state is |0⟩^⊗n.
- Non-unitary, control-flow, and marker gates are reported in `skipped`. The
  simulator continues past them as if they weren't there.
- Gates that prepare a definite state (init0, init1, init+, …, reset) are
  applied as projection-then-unitary on the targeted qubit while the rest of
  the state is unentangled — for arbitrary entangled inputs this would be
  non-unitary; for v1 we apply them only when the targeted qubit is unentangled
  with the rest (otherwise we report the gate as skipped).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import sympy as sp

from .circuit import Circuit, PlacedGate
from .gate_matrices import UnsupportedGate, build_matrix
from .parsing import parse_param

MAX_QUBITS = 8


class SimulationError(Exception):
    pass


@dataclass
class SkippedGate:
    id: str
    gateId: str
    reason: str


@dataclass
class StatevectorResult:
    numQubits: int
    amplitudes: list[sp.Expr]  # length 2^n, in big-endian basis-index order
    skipped: list[SkippedGate]


def numeric_amplitudes(
    amps: list[sp.Expr],
    parameter_values: dict[str, float] | None = None,
) -> list[tuple[float, float] | None]:
    """Try to evaluate each amplitude to (re, im). Returns None per slot if the
    amplitude still has free symbols after parameter_values substitution.

    parameter_values maps symbol-name → numeric value, e.g. {"theta": 0.5}.
    """
    subs = _build_subs(parameter_values)
    out: list[tuple[float, float] | None] = []
    for a in amps:
        expr = a.xreplace(subs) if subs else a
        if expr.free_symbols:
            out.append(None)
            continue
        try:
            v = complex(sp.N(expr))
            out.append((float(v.real), float(v.imag)))
        except (TypeError, ValueError):
            out.append(None)
    return out


def _build_subs(parameter_values: dict[str, float] | None) -> dict[sp.Symbol, sp.Expr]:
    if not parameter_values:
        return {}
    return {sp.Symbol(name): sp.Float(value) for name, value in parameter_values.items()}


def free_symbol_names(amps: list[sp.Expr]) -> list[str]:
    """Return sorted unique free-symbol names across all amplitudes."""
    names: set[str] = set()
    for a in amps:
        for s in a.free_symbols:
            if isinstance(s, sp.Symbol):
                names.add(s.name)
    return sorted(names)


def probabilities(numeric: list[tuple[float, float] | None]) -> list[float | None]:
    return [None if p is None else p[0] * p[0] + p[1] * p[1] for p in numeric]


def bloch_vectors(
    numeric: list[tuple[float, float] | None],
    n: int,
) -> list[tuple[float, float, float] | None]:
    """Per-qubit Bloch vector (⟨X⟩, ⟨Y⟩, ⟨Z⟩) from the reduced density matrix.

    Returns None for every qubit if any amplitude is still symbolic.
    """
    if any(p is None for p in numeric):
        return [None] * n

    amps = np.array([complex(re, im) for (re, im) in numeric], dtype=complex)
    result: list[tuple[float, float, float] | None] = []
    dim = 1 << n
    for q in range(n):
        bit_q = 1 << (n - 1 - q)
        rest_mask = (dim - 1) ^ bit_q
        rho = np.zeros((2, 2), dtype=complex)
        for i in range(dim):
            for j in range(dim):
                if (i & rest_mask) != (j & rest_mask):
                    continue
                bi = 1 if (i & bit_q) else 0
                bj = 1 if (j & bit_q) else 0
                rho[bi, bj] += amps[i] * np.conj(amps[j])
        # ⟨X⟩ = ρ[0,1] + ρ[1,0] = 2 Re(ρ[0,1])
        # ⟨Y⟩ = i (ρ[0,1] − ρ[1,0]) = −2 Im(ρ[0,1])
        # ⟨Z⟩ = ρ[0,0] − ρ[1,1]
        x = float(2 * rho[0, 1].real)
        y = float(-2 * rho[0, 1].imag)
        z = float((rho[0, 0] - rho[1, 1]).real)
        result.append((x, y, z))
    return result


# ─── Basis indexing helpers (big-endian) ───────────────────────────────────

def _basis_index(n: int, bits_by_qubit: dict[int, int]) -> int:
    """Build a full basis index from per-qubit bit assignments. Missing qubits are 0."""
    idx = 0
    for q, b in bits_by_qubit.items():
        if b:
            idx |= 1 << (n - 1 - q)
    return idx


def _bit_at(n: int, idx: int, q: int) -> int:
    return (idx >> (n - 1 - q)) & 1


# ─── Apply a k-qubit unitary to the global statevector ─────────────────────

def _apply_unitary(
    state: list[sp.Expr],
    n: int,
    U: sp.Matrix,
    gate_qubits: list[int],
) -> list[sp.Expr]:
    """Apply U to the qubits listed in `gate_qubits` (in order, MSB-first in U's basis).

    The matrix U is 2^k × 2^k. gate_qubits has length k. For every assignment
    of the (n−k) other qubits, the U is applied to the 2^k-dimensional
    subspace.
    """
    k = len(gate_qubits)
    d = 1 << k
    if U.shape != (d, d):
        raise SimulationError(f"matrix shape {U.shape} ≠ expected {(d, d)}")

    other_qubits = [q for q in range(n) if q not in gate_qubits]
    new_state: list[sp.Expr] = [sp.Integer(0)] * (1 << n)

    def _idx(sub_idx: int, other_val: int) -> int:
        bits: dict[int, int] = {}
        for j, q in enumerate(gate_qubits):
            bits[q] = (sub_idx >> (k - 1 - j)) & 1
        for j, q in enumerate(other_qubits):
            bits[q] = (other_val >> (len(other_qubits) - 1 - j)) & 1 if other_qubits else 0
        return _basis_index(n, bits)

    other_count = 1 << len(other_qubits)
    for other_val in range(max(1, other_count)):
        # Extract the 2^k subspace amplitudes.
        sub = [state[_idx(s, other_val)] for s in range(d)]
        # Multiply U · sub.
        for i in range(d):
            acc: sp.Expr = sp.Integer(0)
            for j in range(d):
                if U[i, j] != 0:
                    acc += U[i, j] * sub[j]
            new_state[_idx(i, other_val)] = sp.simplify(acc)

    return new_state


# ─── Per-gate handlers for state prep / non-unitary ────────────────────────

_PREP_STATES: dict[str, tuple[sp.Expr, sp.Expr]] = {
    # gate_id → (amplitude of |0⟩, amplitude of |1⟩) for the target qubit
    "init0": (sp.Integer(1), sp.Integer(0)),
    "init1": (sp.Integer(0), sp.Integer(1)),
    "initplus": (1 / sp.sqrt(2), 1 / sp.sqrt(2)),
    "initminus": (1 / sp.sqrt(2), -1 / sp.sqrt(2)),
    "initiplus": (1 / sp.sqrt(2), sp.I / sp.sqrt(2)),
    "initiminus": (1 / sp.sqrt(2), -sp.I / sp.sqrt(2)),
    "reset": (sp.Integer(1), sp.Integer(0)),
}


def _qubit_is_unentangled_zero(state: list[sp.Expr], n: int, q: int) -> bool:
    """True iff all amplitudes where qubit q = 1 are zero — i.e. q is in |0⟩."""
    for idx in range(1 << n):
        if _bit_at(n, idx, q) == 1 and sp.simplify(state[idx]) != 0:
            return False
    return True


def _apply_prep(
    state: list[sp.Expr],
    n: int,
    q: int,
    amp0: sp.Expr,
    amp1: sp.Expr,
) -> list[sp.Expr] | None:
    """Apply a single-qubit state preparation if q is currently in |0⟩.

    Returns None if q is entangled (we don't perform a partial trace at v1).
    """
    if not _qubit_is_unentangled_zero(state, n, q):
        return None
    new_state: list[sp.Expr] = [sp.Integer(0)] * (1 << n)
    for idx in range(1 << n):
        if _bit_at(n, idx, q) == 0:
            base = state[idx]
            if base == 0:
                continue
            new_state[idx] = sp.simplify(amp0 * base)
            mate = idx | (1 << (n - 1 - q))
            new_state[mate] = sp.simplify(amp1 * base)
    return new_state


# ─── Main entry ────────────────────────────────────────────────────────────

NON_UNITARY = {"measure", "measure_x", "measure_y"}
CONTROL_FLOW = {"if", "switch", "while", "box"}
MARKERS = {"barrier", "delay"}


def _apply_gates(
    state: list[sp.Expr],
    n: int,
    gates_in: list[PlacedGate],
) -> tuple[list[sp.Expr], list[SkippedGate]]:
    skipped: list[SkippedGate] = []
    gates = sorted(gates_in, key=lambda g: (g.column, g.id))

    for g in gates:
        if g.gateId in MARKERS:
            continue
        if g.gateId in NON_UNITARY:
            skipped.append(SkippedGate(g.id, g.gateId, "non-unitary (measurement)"))
            continue
        if g.gateId in CONTROL_FLOW:
            skipped.append(SkippedGate(g.id, g.gateId, "control flow not yet simulated"))
            continue
        if g.gateId in _PREP_STATES or g.gateId == "initialize":
            if g.gateId == "initialize":
                skipped.append(SkippedGate(g.id, g.gateId, "arbitrary Initialize not yet supported"))
                continue
            amp0, amp1 = _PREP_STATES[g.gateId]
            if not g.targets:
                skipped.append(SkippedGate(g.id, g.gateId, "no target qubit"))
                continue
            q = g.targets[0]
            new_state = _apply_prep(state, n, q, amp0, amp1)
            if new_state is None:
                skipped.append(
                    SkippedGate(g.id, g.gateId, "qubit is entangled — state prep is non-unitary")
                )
                continue
            state = new_state
            continue

        # Unitary path.
        try:
            params = [parse_param(p) for p in g.params]
            n_controls = len(g.controls) if g.gateId in ("mcx", "mcp", "mcu") else None
            U = build_matrix(g.gateId, params, n_controls=n_controls)
        except UnsupportedGate:
            skipped.append(SkippedGate(g.id, g.gateId, "gate not yet implemented"))
            continue
        except Exception as e:  # noqa: BLE001 — surface parse failures
            skipped.append(SkippedGate(g.id, g.gateId, f"parameter parse error: {e}"))
            continue

        gate_qubits = list(g.controls) + list(g.targets)
        expected_qubits = int(sp.log(U.shape[0], 2))
        if len(gate_qubits) != expected_qubits:
            skipped.append(
                SkippedGate(g.id, g.gateId, f"expected {expected_qubits} qubits, got {len(gate_qubits)}")
            )
            continue
        if any(q < 0 or q >= n for q in gate_qubits):
            skipped.append(SkippedGate(g.id, g.gateId, "qubit index out of range"))
            continue

        state = _apply_unitary(state, n, U, gate_qubits)

    return state, skipped


def simulate_statevector(circuit: Circuit) -> StatevectorResult:
    n = circuit.numQubits
    if n <= 0:
        raise SimulationError("numQubits must be ≥ 1")
    if n > MAX_QUBITS:
        raise SimulationError(
            f"symbolic simulation is capped at {MAX_QUBITS} qubits (got {n})"
        )

    state: list[sp.Expr] = [sp.Integer(0)] * (1 << n)
    state[0] = sp.Integer(1)
    state, skipped = _apply_gates(state, n, circuit.gates)
    return StatevectorResult(numQubits=n, amplitudes=state, skipped=skipped)


# ─── Full unitary by column-wise simulation ───────────────────────────────

UNITARY_MAX_QUBITS = 4


@dataclass
class UnitaryResult:
    numQubits: int
    matrix: sp.Matrix
    skipped: list[SkippedGate]


def simulate_unitary(circuit: Circuit) -> UnitaryResult:
    """Build the symbolic unitary U of the circuit by simulating each basis
    state |i⟩ as the initial condition. Column i of U is the resulting state.

    Capped at UNITARY_MAX_QUBITS because the matrix is 2^n × 2^n symbolic.
    """
    n = circuit.numQubits
    if n <= 0:
        raise SimulationError("numQubits must be ≥ 1")
    if n > UNITARY_MAX_QUBITS:
        raise SimulationError(
            f"symbolic unitary is capped at {UNITARY_MAX_QUBITS} qubits (got {n}) — "
            f"the matrix is 2^n × 2^n"
        )

    dim = 1 << n
    U = sp.zeros(dim, dim)
    skipped: list[SkippedGate] = []
    seen_skip_ids: set[str] = set()

    for i in range(dim):
        state: list[sp.Expr] = [sp.Integer(0)] * dim
        state[i] = sp.Integer(1)
        state, col_skipped = _apply_gates(state, n, circuit.gates)
        for k in range(dim):
            U[k, i] = sp.simplify(state[k])
        # Skipped gates are the same for every column; dedupe.
        for s in col_skipped:
            if s.id not in seen_skip_ids:
                skipped.append(s)
                seen_skip_ids.add(s.id)

    return UnitaryResult(numQubits=n, matrix=U, skipped=skipped)
