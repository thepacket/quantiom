// Kicked-Ising Floquet circuit — a 4-spin chain driven by a periodic
// two-step "drive" repeated over several periods. This is the canonical
// playground for Floquet (periodically-driven) phases, including the
// discrete time crystal (DTC).
//
// Each Floquet period applies the same two-piece evolution operator
//
//     U_F = [ Π_i Rx(g)_i ]  ·  [ Π_⟨i,j⟩ Rzz(J)_{ij} ]
//            └─ transverse kick ─┘  └──── Ising coupling along the chain ──┘
//
// and the circuit below stacks FOUR periods, so the simulated state is
// U_F⁴|0000⟩. The bonds are the open chain 0–1, 1–2, 2–3.
//
// The physics to look for (Bloch + Probabilities panels):
//   • Near g = π the kick is a near-perfect global spin flip, so a
//     single period roughly inverts every spin and the magnetisation
//     oscillates with period 2 in the number of Floquet steps — the
//     hallmark "period-doubling" of the discrete time crystal. The
//     Ising coupling J is what rigidifies that subharmonic response
//     against detuning of g away from π.
//   • At g = π/2 the kick is a √-flip and the dynamics scrambles instead.
//
// How to explore in Quantiom:
//   • g and J are free symbols (Parameters panel). Set g ≈ π, J small
//     (say 0.2–0.6) for DTC-like behaviour; sweep g down toward π/2 to
//     watch the subharmonic lock break.
//   • Drive g with the t-clock to animate the response, or step the
//     circuit column-by-column to watch one period at a time.
//   • Each period is one labelled block below — copy a block to add
//     more periods and see the oscillation persist (or decay).

OPENQASM 3.0;
include "stdgates.inc";
// qubit_names: s0, s1, s2, s3

qubit[4] q;

// ── Floquet period 1 ──────────────────────────────────────────────────
// note: transverse kick Rx(g) on every spin
rx(g) q[0];
rx(g) q[1];
rx(g) q[2];
rx(g) q[3];
// note: Ising coupling Rzz(J) along the chain
rzz(J) q[0], q[1];
rzz(J) q[1], q[2];
rzz(J) q[2], q[3];

// ── Floquet period 2 ──────────────────────────────────────────────────
rx(g) q[0];
rx(g) q[1];
rx(g) q[2];
rx(g) q[3];
rzz(J) q[0], q[1];
rzz(J) q[1], q[2];
rzz(J) q[2], q[3];

// ── Floquet period 3 ──────────────────────────────────────────────────
rx(g) q[0];
rx(g) q[1];
rx(g) q[2];
rx(g) q[3];
rzz(J) q[0], q[1];
rzz(J) q[1], q[2];
rzz(J) q[2], q[3];

// ── Floquet period 4 ──────────────────────────────────────────────────
rx(g) q[0];
rx(g) q[1];
rx(g) q[2];
rx(g) q[3];
rzz(J) q[0], q[1];
rzz(J) q[1], q[2];
rzz(J) q[2], q[3];
