// Grover search on a 5-qubit space (N = 32). Optimal iteration count for
// one marked state |11111⟩ is floor((π/4)√32) = 4. Peak success probability
// is above 99%.
//
// 4 iterations × (oracle + diffusion) = ~120 gates total. The simulator
// runs the whole thing in a couple of milliseconds; the probabilities
// panel makes the spike on |11111⟩ unmistakable.

OPENQASM 3.0;
include "stdgates.inc";

qubit[5] q;
bit[5] c;

h q[0]; h q[1]; h q[2]; h q[3]; h q[4];

// Oracle macro: phase flip on |11111⟩ via H · CCCCX · H on q[4].

// ── Iteration 1 ────────────────────────────────────────────────────────
h q[4];
ctrl(4) @ x q[0], q[1], q[2], q[3], q[4];
h q[4];
h q[0]; h q[1]; h q[2]; h q[3]; h q[4];
x q[0]; x q[1]; x q[2]; x q[3]; x q[4];
h q[4];
ctrl(4) @ x q[0], q[1], q[2], q[3], q[4];
h q[4];
x q[0]; x q[1]; x q[2]; x q[3]; x q[4];
h q[0]; h q[1]; h q[2]; h q[3]; h q[4];

// ── Iteration 2 ────────────────────────────────────────────────────────
h q[4];
ctrl(4) @ x q[0], q[1], q[2], q[3], q[4];
h q[4];
h q[0]; h q[1]; h q[2]; h q[3]; h q[4];
x q[0]; x q[1]; x q[2]; x q[3]; x q[4];
h q[4];
ctrl(4) @ x q[0], q[1], q[2], q[3], q[4];
h q[4];
x q[0]; x q[1]; x q[2]; x q[3]; x q[4];
h q[0]; h q[1]; h q[2]; h q[3]; h q[4];

// ── Iteration 3 ────────────────────────────────────────────────────────
h q[4];
ctrl(4) @ x q[0], q[1], q[2], q[3], q[4];
h q[4];
h q[0]; h q[1]; h q[2]; h q[3]; h q[4];
x q[0]; x q[1]; x q[2]; x q[3]; x q[4];
h q[4];
ctrl(4) @ x q[0], q[1], q[2], q[3], q[4];
h q[4];
x q[0]; x q[1]; x q[2]; x q[3]; x q[4];
h q[0]; h q[1]; h q[2]; h q[3]; h q[4];

// ── Iteration 4 ────────────────────────────────────────────────────────
h q[4];
ctrl(4) @ x q[0], q[1], q[2], q[3], q[4];
h q[4];
h q[0]; h q[1]; h q[2]; h q[3]; h q[4];
x q[0]; x q[1]; x q[2]; x q[3]; x q[4];
h q[4];
ctrl(4) @ x q[0], q[1], q[2], q[3], q[4];
h q[4];
x q[0]; x q[1]; x q[2]; x q[3]; x q[4];
h q[0]; h q[1]; h q[2]; h q[3]; h q[4];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
c[4] = measure q[4];
