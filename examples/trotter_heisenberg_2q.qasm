// Trotter step for the 2-qubit Heisenberg XXX model:
//
//     H = J · (XX + YY + ZZ)
//
// First-order Trotter: e^{−iHδ} ≈ Rxx(2Jδ) · Ryy(2Jδ) · Rzz(2Jδ).
// Apply repeatedly to evolve under H for total time t = n·δ.
//
// On the singlet |Ψ−⟩ = (|01⟩−|10⟩)/√2, H acts as 3J·(−1) — i.e. just
// a phase. So |Ψ−⟩ is an eigenstate and time evolution is just an
// overall phase, which is invisible to any measurement.
//
// On the triplet states (|Φ+⟩, |Φ−⟩, |Ψ+⟩), H acts as +J, and the
// states are exchanged within the triplet subspace under XX, YY, ZZ
// rotations.
//
// Here we prepare |10⟩ — a uniform superposition of singlet and Ψ+
// triplet — and apply ONE Trotter step. Slide t in the Parameters
// panel (or hit ▶) to watch the populations oscillate between |10⟩
// and |01⟩ at frequency 2J.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;

// Initial state |10⟩.
x q[0];

// One Trotter step with J = 1 and δt = t (the magic animation symbol).
rxx(2*t) q[0], q[1];
ryy(2*t) q[0], q[1];
rzz(2*t) q[0], q[1];
