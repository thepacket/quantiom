// Grover search on a 3-qubit register (N = 8), with |111⟩ marked.
//
// Optimal iteration count is floor((π/4)√N) = 2. After two iterations the
// probability of measuring |111⟩ is ≈ 94.5%, the textbook peak before the
// amplitude starts coming back down.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[3] c;

h q[0];
h q[1];
h q[2];

// ── Iteration 1 ────────────────────────────────────────────────────────
// Oracle: phase-flip on |111⟩.
ccz q[0], q[1], q[2];

// Diffusion operator about the equal-superposition state.
h q[0];
h q[1];
h q[2];
x q[0];
x q[1];
x q[2];
ccz q[0], q[1], q[2];
x q[0];
x q[1];
x q[2];
h q[0];
h q[1];
h q[2];

// ── Iteration 2 ────────────────────────────────────────────────────────
ccz q[0], q[1], q[2];

h q[0];
h q[1];
h q[2];
x q[0];
x q[1];
x q[2];
ccz q[0], q[1], q[2];
x q[0];
x q[1];
x q[2];
h q[0];
h q[1];
h q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
