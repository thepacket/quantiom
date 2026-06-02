// Grover's algorithm on N = 8 (3 qubits) with one marked state |111⟩.
//
// Problem: find x* such that an oracle f(x*) = 1 (else 0), using as
// few queries as possible. Classical: O(N) queries in the worst case.
// Quantum: O(√N) — Grover (1996).
//
// Each iteration applies:
//   1. Oracle (here: CCZ — phase-flip the marked state |111⟩).
//   2. Diffusion operator: 2|ψ⟩⟨ψ| − I, the reflection about the
//      equal-superposition state. Implemented as H · X · CCZ · X · H
//      sandwich.
//
// Together each iteration rotates the state vector in the
// (|marked⟩, |unmarked⟩) plane by an angle 2·arcsin(√(1/N)). The
// probability of measuring the marked state evolves as
// sin²((2k+1)·arcsin(√(1/N))) where k is the iteration count.
//
// Optimal iteration count: k* = floor((π/4)·√N) = 2 for N = 8. After
// two iterations the |111⟩ probability is sin²(5·arcsin(1/√8)) ≈ 0.945
// (94.5%) — the textbook peak. Continuing past k* overshoots and the
// amplitude swings back down (the famous "souffle problem": Grover
// over-cooked is worse than the perfect 2 iterations).
//
// Open the Probabilities panel after loading — one tall spike at index
// 7 (= 0b111), six tiny ones elsewhere.

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
