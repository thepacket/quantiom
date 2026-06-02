// Generalised amplitude amplification — Grover-style search with a
// multi-element marked set.
//
// Setup: a 3-qubit register N = 8 with a "marked subspace" containing
// TWO states: {|001⟩, |110⟩}. Initial uniform superposition has
// 2/8 = 1/4 probability of landing in the marked subspace. One
// Grover iteration amplifies this toward unity:
//
//   1. Oracle: phase-flips ONLY the marked states (no flag qubit
//      needed — direct in-place phase kickback via controlled-Z
//      conjugated by X gates that select the marked bitstring).
//   2. Diffusion: reflection about the mean. Implemented as the
//      classic H · X · (multi-CZ) · X · H sandwich.
//
// Optimal iteration count for M = 2 marked items out of N = 8:
// k = floor(π√(N/M) / 4) = floor(π · 2 / 4) = 1. After exactly one
// iteration, the combined marked probability peaks at
// sin²(3·arcsin(√(M/N))) ≈ 0.78 — almost 4× the random-guess baseline.
//
// Reference: Brassard, Høyer, Mosca, Tapp (2002).

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[3] c;

h q[0]; h q[1]; h q[2];

// Oracle: phase-flip on |001⟩ and |110⟩.
// |001⟩ — q[0]=0, q[1]=0, q[2]=1
x q[0]; x q[1];
ctrl(2) @ z q[0], q[1], q[2];
x q[0]; x q[1];

// |110⟩ — q[0]=1, q[1]=1, q[2]=0
x q[2];
ctrl(2) @ z q[0], q[1], q[2];
x q[2];

// Diffusion about the equal-superposition state.
h q[0]; h q[1]; h q[2];
x q[0]; x q[1]; x q[2];
ctrl(2) @ z q[0], q[1], q[2];
x q[0]; x q[1]; x q[2];
h q[0]; h q[1]; h q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
