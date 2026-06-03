// QAOA for MAX-3-SAT — one round (p = 1) on a 3-variable, 3-clause
// Boolean formula. This is the constraint-satisfaction cousin of the
// MaxCut QAOA examples: instead of cutting edges we satisfy clauses.
//
// The instance (variables x0, x1, x2):
//
//     C1 = ( x0 ∨  x1 ∨  x2)
//     C2 = (¬x0 ∨  x1 ∨ ¬x2)
//     C3 = ( x0 ∨ ¬x1 ∨  x2)
//
// A clause is violated by exactly one assignment of its three variables
// (the one making every literal false). The cost Hamiltonian counts
// violated clauses, so its phase-separator e^{-iγ C} factorises over
// clauses, and each factor just adds a phase e^{-iγ} to that clause's
// single "bad" computational-basis state:
//
//     C1 bad = |000⟩   C2 bad = |101⟩   C3 bad = |010⟩
//
// We realise "phase only the bad state" with an X-envelope (mapping the
// bad string to |111⟩) wrapped around a doubly-controlled phase
// ctrl @ ctrl @ p(−γ). The mixer e^{-iβ ΣX} is one Rx(2β) per qubit.
//
// How to explore in Quantiom:
//   • γ (gamma) and β (beta) are free symbols — open the Parameters
//     panel and sweep them, or set an Expectation observable and hit
//     Optimise to maximise the satisfied-clause count.
//   • The Probabilities panel shows amplitude flowing toward the
//     satisfying assignments (everything except 000, 101, 010 is fully
//     satisfiable here) as γ, β move away from 0.
//   • For a real optimiser run, repeat the cost+mixer block (raise p)
//     and give each layer its own γ_k, β_k.

OPENQASM 3.0;
include "stdgates.inc";
// qubit_names: x0, x1, x2

qubit[3] q;

// ── Uniform superposition over all 2³ assignments ─────────────────────
h q[0];
h q[1];
h q[2];

// ── Cost layer  e^{-iγ C}  (phase each clause's violating assignment) ──
// note: C1 = (x0 ∨ x1 ∨ x2), bad assignment |000⟩
x q[0];
x q[1];
x q[2];
ctrl @ ctrl @ p(-gamma) q[0], q[1], q[2];
x q[0];
x q[1];
x q[2];

// note: C2 = (¬x0 ∨ x1 ∨ ¬x2), bad assignment |101⟩
x q[1];
ctrl @ ctrl @ p(-gamma) q[0], q[1], q[2];
x q[1];

// note: C3 = (x0 ∨ ¬x1 ∨ x2), bad assignment |010⟩
x q[0];
x q[2];
ctrl @ ctrl @ p(-gamma) q[0], q[1], q[2];
x q[0];
x q[2];

// ── Mixer layer  e^{-iβ Σ Xᵢ} ─────────────────────────────────────────
rx(2*beta) q[0];
rx(2*beta) q[1];
rx(2*beta) q[2];
