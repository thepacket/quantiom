// Minimal VQE ansatz for the H₂ molecule at fixed bond length.
//
// In the 2-qubit Bravyi-Kitaev reduction, the H₂ ground state lives in
// the manifold spanned by |01⟩ and |10⟩. A single-parameter ansatz
//
//     |ψ(θ)⟩ = cos(θ/2)|01⟩ − sin(θ/2)|10⟩
//
// reaches the ground state for the right θ. The circuit below realises
// this with one X gate, one Ry, and one CX.
//
// To find θ minimising ⟨H⟩ in Quantiom: enter the H₂ Hamiltonian in the
// Expectation panel (sum-mode) — for the standard STO-3G basis at
// bond length 0.74 Å it's roughly:
//
//     H = −1.052 II + 0.398 IZ − 0.398 ZI − 0.011 ZZ + 0.181 XX
//
// then drive θ via the Parameters panel slider (or use the Optimise
// button to minimise automatically). The minimum sits around
// θ ≈ 0.2 rad and reproduces the Full-CI ground-state energy.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;

// Reference state: |01⟩.
x q[0];

// Symmetry-preserving ansatz: Ry(θ) ⊗ I → CX, with one variational angle.
ry(theta) q[1];
cx q[1], q[0];
