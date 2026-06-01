"""Symbolic gate matrices (sympy).

Convention:
- A k-qubit gate is a 2^k × 2^k matrix.
- Basis state indexing is *big-endian* for the gate's qubit list:
    U[i, j] = ⟨q0 q1 ... q_{k-1} = bits(i) | U | q0 q1 ... q_{k-1} = bits(j)⟩
  i.e. qubit 0 contributes the most-significant bit of the index.
- Controlled gates put the control qubit(s) first; the "all controls = 1"
  block is the last 2^t × 2^t sub-block of the unitary.

This convention is internal — the simulator handles mapping a placed gate's
qubit indices onto the global statevector regardless of the chosen ordering.
"""

from __future__ import annotations

from collections.abc import Callable

import sympy as sp


# ─── Single-qubit, fixed ───────────────────────────────────────────────────

def m_I() -> sp.Matrix:
    return sp.eye(2)


def m_X() -> sp.Matrix:
    return sp.Matrix([[0, 1], [1, 0]])


def m_Y() -> sp.Matrix:
    return sp.Matrix([[0, -sp.I], [sp.I, 0]])


def m_Z() -> sp.Matrix:
    return sp.Matrix([[1, 0], [0, -1]])


def m_H() -> sp.Matrix:
    return sp.Rational(1, 1) / sp.sqrt(2) * sp.Matrix([[1, 1], [1, -1]])


def m_S() -> sp.Matrix:
    return sp.Matrix([[1, 0], [0, sp.I]])


def m_Sdg() -> sp.Matrix:
    return sp.Matrix([[1, 0], [0, -sp.I]])


def m_SX() -> sp.Matrix:
    return sp.Rational(1, 2) * sp.Matrix([[1 + sp.I, 1 - sp.I], [1 - sp.I, 1 + sp.I]])


def m_SXdg() -> sp.Matrix:
    return m_SX().H


def m_T() -> sp.Matrix:
    return sp.Matrix([[1, 0], [0, sp.exp(sp.I * sp.pi / 4)]])


def m_Tdg() -> sp.Matrix:
    return sp.Matrix([[1, 0], [0, sp.exp(-sp.I * sp.pi / 4)]])


# ─── Single-qubit, parameterized ───────────────────────────────────────────

def m_P(lam: sp.Expr) -> sp.Matrix:
    return sp.Matrix([[1, 0], [0, sp.exp(sp.I * lam)]])


def m_RX(theta: sp.Expr) -> sp.Matrix:
    c, s = sp.cos(theta / 2), sp.sin(theta / 2)
    return sp.Matrix([[c, -sp.I * s], [-sp.I * s, c]])


def m_RY(theta: sp.Expr) -> sp.Matrix:
    c, s = sp.cos(theta / 2), sp.sin(theta / 2)
    return sp.Matrix([[c, -s], [s, c]])


def m_RZ(theta: sp.Expr) -> sp.Matrix:
    return sp.Matrix(
        [[sp.exp(-sp.I * theta / 2), 0], [0, sp.exp(sp.I * theta / 2)]]
    )


def m_U(theta: sp.Expr, phi: sp.Expr, lam: sp.Expr) -> sp.Matrix:
    c, s = sp.cos(theta / 2), sp.sin(theta / 2)
    return sp.Matrix(
        [
            [c, -sp.exp(sp.I * lam) * s],
            [sp.exp(sp.I * phi) * s, sp.exp(sp.I * (phi + lam)) * c],
        ]
    )


def m_U1(lam: sp.Expr) -> sp.Matrix:
    return m_P(lam)


def m_U2(phi: sp.Expr, lam: sp.Expr) -> sp.Matrix:
    return sp.Rational(1, 1) / sp.sqrt(2) * sp.Matrix(
        [
            [1, -sp.exp(sp.I * lam)],
            [sp.exp(sp.I * phi), sp.exp(sp.I * (phi + lam))],
        ]
    )


def m_U3(theta: sp.Expr, phi: sp.Expr, lam: sp.Expr) -> sp.Matrix:
    return m_U(theta, phi, lam)


# ─── Two-qubit, fixed ──────────────────────────────────────────────────────

def m_SWAP() -> sp.Matrix:
    return sp.Matrix(
        [
            [1, 0, 0, 0],
            [0, 0, 1, 0],
            [0, 1, 0, 0],
            [0, 0, 0, 1],
        ]
    )


def m_iSWAP() -> sp.Matrix:
    return sp.Matrix(
        [
            [1, 0, 0, 0],
            [0, 0, sp.I, 0],
            [0, sp.I, 0, 0],
            [0, 0, 0, 1],
        ]
    )


def m_DCX() -> sp.Matrix:
    # CNOT(a→b) · CNOT(b→a). Equivalent to a partial swap.
    return sp.Matrix(
        [
            [1, 0, 0, 0],
            [0, 0, 0, 1],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
        ]
    )


def m_ECR() -> sp.Matrix:
    # Echoed cross-resonance: (1/√2) [[0, 1, 0, i], [1, 0, -i, 0], [0, i, 0, 1], [-i, 0, 1, 0]]
    inv_sqrt2 = sp.Rational(1, 1) / sp.sqrt(2)
    return inv_sqrt2 * sp.Matrix(
        [
            [0, 1, 0, sp.I],
            [1, 0, -sp.I, 0],
            [0, sp.I, 0, 1],
            [-sp.I, 0, 1, 0],
        ]
    )


# ─── Two-qubit, parameterized (Ising / native) ─────────────────────────────

def m_RXX(theta: sp.Expr) -> sp.Matrix:
    c, s = sp.cos(theta / 2), sp.I * sp.sin(theta / 2)
    return sp.Matrix(
        [
            [c, 0, 0, -s],
            [0, c, -s, 0],
            [0, -s, c, 0],
            [-s, 0, 0, c],
        ]
    )


def m_RYY(theta: sp.Expr) -> sp.Matrix:
    c, s = sp.cos(theta / 2), sp.I * sp.sin(theta / 2)
    return sp.Matrix(
        [
            [c, 0, 0, s],
            [0, c, -s, 0],
            [0, -s, c, 0],
            [s, 0, 0, c],
        ]
    )


def m_RZZ(theta: sp.Expr) -> sp.Matrix:
    em = sp.exp(-sp.I * theta / 2)
    ep = sp.exp(sp.I * theta / 2)
    return sp.diag(em, ep, ep, em)


def m_RZX(theta: sp.Expr) -> sp.Matrix:
    c, s = sp.cos(theta / 2), sp.I * sp.sin(theta / 2)
    return sp.Matrix(
        [
            [c, -s, 0, 0],
            [-s, c, 0, 0],
            [0, 0, c, s],
            [0, 0, s, c],
        ]
    )


def m_XX_PLUS_YY(theta: sp.Expr, beta: sp.Expr) -> sp.Matrix:
    c, s = sp.cos(theta / 2), sp.sin(theta / 2)
    return sp.Matrix(
        [
            [1, 0, 0, 0],
            [0, c, -sp.I * s * sp.exp(-sp.I * beta), 0],
            [0, -sp.I * s * sp.exp(sp.I * beta), c, 0],
            [0, 0, 0, 1],
        ]
    )


def m_XX_MINUS_YY(theta: sp.Expr, beta: sp.Expr) -> sp.Matrix:
    c, s = sp.cos(theta / 2), sp.sin(theta / 2)
    return sp.Matrix(
        [
            [c, 0, 0, -sp.I * s * sp.exp(-sp.I * beta)],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [-sp.I * s * sp.exp(sp.I * beta), 0, 0, c],
        ]
    )


# ─── Controlled wrapper ────────────────────────────────────────────────────

def controlled(U: sp.Matrix, n_ctrl: int = 1) -> sp.Matrix:
    """Wrap an arbitrary unitary U with n control qubits placed as MSBs.

    The resulting 2^(n_ctrl + t) × 2^(n_ctrl + t) matrix applies U to the
    target subspace iff all control bits are 1; otherwise acts as identity.
    """
    d = U.shape[0]
    full_dim = (2 ** n_ctrl) * d
    M = sp.eye(full_dim)
    offset = ((2 ** n_ctrl) - 1) * d
    for i in range(d):
        for j in range(d):
            M[offset + i, offset + j] = U[i, j]
    return sp.Matrix(M)


# ─── Resolver: gateId + params → matrix + qubit count ──────────────────────

# Each entry: gate_id → (num_qubits_in_matrix, builder(params: list[sp.Expr]) -> Matrix).
# num_qubits_in_matrix is the size of the matrix's qubit space (controls + targets);
# the simulator maps placed-gate (controls + targets) onto this.
_FIXED_SINGLE: dict[str, Callable[[], sp.Matrix]] = {
    "i": m_I,
    "x": m_X,
    "y": m_Y,
    "z": m_Z,
    "h": m_H,
    "s": m_S,
    "sdg": m_Sdg,
    "sx": m_SX,
    "sxdg": m_SXdg,
    "t": m_T,
    "tdg": m_Tdg,
}

_PARAM_SINGLE: dict[str, Callable[..., sp.Matrix]] = {
    "p": m_P,
    "rx": m_RX,
    "ry": m_RY,
    "rz": m_RZ,
    "u": m_U,
    "u1": m_U1,
    "u2": m_U2,
    "u3": m_U3,
}

_FIXED_TWO: dict[str, Callable[[], sp.Matrix]] = {
    "swap": m_SWAP,
    "iswap": m_iSWAP,
    "dcx": m_DCX,
    "ecr": m_ECR,
}

_PARAM_TWO: dict[str, Callable[..., sp.Matrix]] = {
    "rxx": m_RXX,
    "ryy": m_RYY,
    "rzz": m_RZZ,
    "rzx": m_RZX,
    "xx_plus_yy": m_XX_PLUS_YY,
    "xx_minus_yy": m_XX_MINUS_YY,
}

# Controlled-from-single mapping: gate_id → (target_builder, n_ctrl, takes_params)
_CONTROLLED: dict[str, tuple[str, int]] = {
    "cx": ("x", 1),
    "cy": ("y", 1),
    "cz": ("z", 1),
    "ch": ("h", 1),
    "csx": ("sx", 1),
    "csxdg": ("sxdg", 1),
    "ccx": ("x", 2),
    "ccz": ("z", 2),
    "rccx": ("x", 2),  # in pure simulation we treat as Toffoli (relative phase ignored)
    "rcccx": ("x", 3),
    "c3x": ("x", 3),
    "c4x": ("x", 4),
}

_CONTROLLED_PARAM: dict[str, tuple[str, int]] = {
    "crx": ("rx", 1),
    "cry": ("ry", 1),
    "crz": ("rz", 1),
    "cp": ("p", 1),
    "cu1": ("u1", 1),
    "cu3": ("u3", 1),
    "cu": ("u", 1),  # last param γ is a global phase we ignore for now
}

# Controlled-SWAP (target is two-qubit SWAP)
_CONTROLLED_TWO: dict[str, tuple[str, int]] = {
    "cswap": ("swap", 1),
}


class UnsupportedGate(Exception):
    """Raised when the simulator doesn't (yet) support a gate id."""


def build_matrix(gate_id: str, params: list[sp.Expr]) -> sp.Matrix:
    """Return the unitary matrix for a gate id and parsed parameters.

    Raises UnsupportedGate for non-unitary or unimplemented gates.
    """
    if gate_id in _FIXED_SINGLE:
        return _FIXED_SINGLE[gate_id]()
    if gate_id in _PARAM_SINGLE:
        return _PARAM_SINGLE[gate_id](*params)
    if gate_id in _FIXED_TWO:
        return _FIXED_TWO[gate_id]()
    if gate_id in _PARAM_TWO:
        return _PARAM_TWO[gate_id](*params)
    if gate_id in _CONTROLLED:
        tgt_id, n_ctrl = _CONTROLLED[gate_id]
        return controlled(_FIXED_SINGLE[tgt_id](), n_ctrl=n_ctrl)
    if gate_id in _CONTROLLED_PARAM:
        tgt_id, n_ctrl = _CONTROLLED_PARAM[gate_id]
        # For "cu" the last (γ) parameter is a global phase — strip to match U(θ,φ,λ).
        builder_params = params[: _PARAM_SINGLE[tgt_id].__code__.co_argcount]
        return controlled(_PARAM_SINGLE[tgt_id](*builder_params), n_ctrl=n_ctrl)
    if gate_id in _CONTROLLED_TWO:
        tgt_id, n_ctrl = _CONTROLLED_TWO[gate_id]
        return controlled(_FIXED_TWO[tgt_id](), n_ctrl=n_ctrl)
    raise UnsupportedGate(gate_id)
