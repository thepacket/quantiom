OPENQASM 3.0;
include "stdgates.inc";

input float gamma_0;
input float beta_0;
input float gamma_1;
input float beta_1;

qubit[4] q;

// Quantum Approximate Optimization Algorithm (QAOA) for MaxCut on the
// 4-cycle (square graph): edges {(0,1), (1,2), (2,3), (3,0)}.
//
// MaxCut: partition the graph's vertices into two sets to maximise the
// number of edges with endpoints in different sets. For the square,
// optimal cuts have value 4 (every edge cut — bipartite graph).
//
// QAOA (Farhi-Goldstone-Gutmann 2014) approximates the optimum by
// alternating two Hamiltonian evolutions p times:
//   • Cost layer U_C(γ) = e^{−iγ H_C}, H_C = Σ_(i,j)∈E (1−Z_iZ_j)/2.
//     Each edge contributes an RZZ(2γ) on its endpoints.
//   • Mixer layer U_B(β) = e^{−iβ H_B}, H_B = Σ_i X_i.
//     Each qubit gets RX(2β).
//
// Below: p = 2 (two cost+mixer layer pairs, 4 parameters total γ_0, β_0,
// γ_1, β_1). Optimise over (γ_k, β_k) to maximise ⟨H_C⟩. For MaxCut on
// the square, p = 1 already gives ~0.78 of the optimum; p = 2 pushes
// closer to 0.93. Larger p → tighter approximation, limited by hardware
// noise on real devices.
//
// To run: set up the cost Hamiltonian (4 ZZ terms) in the Expectation
// panel and click Optimise. Watch γ, β converge to the locally optimal
// QAOA angles for this graph.

// Initial superposition.
h q[0];
h q[1];
h q[2];
h q[3];

barrier q[0], q[1], q[2], q[3];

// Layer 0: cost U_C(γ_0) — ZZ on each edge.
rzz(2*gamma_0) q[0], q[1];
rzz(2*gamma_0) q[1], q[2];
rzz(2*gamma_0) q[2], q[3];
rzz(2*gamma_0) q[3], q[0];

// Mixer U_B(β_0) — RX on every qubit.
rx(2*beta_0) q[0];
rx(2*beta_0) q[1];
rx(2*beta_0) q[2];
rx(2*beta_0) q[3];

barrier q[0], q[1], q[2], q[3];

// Layer 1: cost U_C(γ_1).
rzz(2*gamma_1) q[0], q[1];
rzz(2*gamma_1) q[1], q[2];
rzz(2*gamma_1) q[2], q[3];
rzz(2*gamma_1) q[3], q[0];

// Mixer U_B(β_1).
rx(2*beta_1) q[0];
rx(2*beta_1) q[1];
rx(2*beta_1) q[2];
rx(2*beta_1) q[3];
