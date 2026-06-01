// Grover search on a 4-qubit space (N = 16) with |1111⟩ marked. Optimal
// iteration count for one marked state is floor((π/4)√N) = 3. After three
// iterations the marked basis state's probability peaks above 96%.
//
// Oracle: CCCZ (a 4-controlled Z that flips the phase of |1111⟩).
// Diffusion: H⊗⁴ · X⊗⁴ · CCCZ · X⊗⁴ · H⊗⁴.

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;
bit[4] c;

h q[0]; h q[1]; h q[2]; h q[3];

// ── Iteration 1 ────────────────────────────────────────────────────────
// CCCZ oracle (phase flip on |1111⟩)
h q[3];
ctrl(3) @ x q[0], q[1], q[2], q[3];
h q[3];

// Diffusion
h q[0]; h q[1]; h q[2]; h q[3];
x q[0]; x q[1]; x q[2]; x q[3];
h q[3];
ctrl(3) @ x q[0], q[1], q[2], q[3];
h q[3];
x q[0]; x q[1]; x q[2]; x q[3];
h q[0]; h q[1]; h q[2]; h q[3];

// ── Iteration 2 ────────────────────────────────────────────────────────
h q[3];
ctrl(3) @ x q[0], q[1], q[2], q[3];
h q[3];

h q[0]; h q[1]; h q[2]; h q[3];
x q[0]; x q[1]; x q[2]; x q[3];
h q[3];
ctrl(3) @ x q[0], q[1], q[2], q[3];
h q[3];
x q[0]; x q[1]; x q[2]; x q[3];
h q[0]; h q[1]; h q[2]; h q[3];

// ── Iteration 3 ────────────────────────────────────────────────────────
h q[3];
ctrl(3) @ x q[0], q[1], q[2], q[3];
h q[3];

h q[0]; h q[1]; h q[2]; h q[3];
x q[0]; x q[1]; x q[2]; x q[3];
h q[3];
ctrl(3) @ x q[0], q[1], q[2], q[3];
h q[3];
x q[0]; x q[1]; x q[2]; x q[3];
h q[0]; h q[1]; h q[2]; h q[3];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
