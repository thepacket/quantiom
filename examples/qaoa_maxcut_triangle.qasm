// QAOA for MaxCut on a 3-vertex triangle graph. Single layer with two
// parameters γ (cost) and β (mixer):
//
//   |ψ⟩ = e^{−iβ H_M} e^{−iγ H_C} H^{⊗3} |000⟩
//
//   H_C = ½ Σ_{(i,j) ∈ E} (1 − Z_i Z_j)    (one term per graph edge)
//   H_M = Σ_i X_i                          (single-qubit X mixer)
//
// On the triangle K_3 every pair of vertices is an edge, so the cost
// layer is three RZZ rotations. The mixer is three RX rotations.
// Optimal expectation value is reached around γ ≈ π/4, β ≈ π/8.

OPENQASM 3.0;
include "stdgates.inc";

input float gamma;
input float beta;

qubit[3] q;
bit[3] c;

// Uniform superposition.
h q[0];
h q[1];
h q[2];

// Cost layer e^{−iγ H_C}: RZZ(2γ) on each edge of the triangle.
rzz(2*gamma) q[0], q[1];
rzz(2*gamma) q[1], q[2];
rzz(2*gamma) q[0], q[2];

// Mixer layer e^{−iβ H_M}: RX(2β) on each qubit.
rx(2*beta) q[0];
rx(2*beta) q[1];
rx(2*beta) q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
