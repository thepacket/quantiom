// Draper adder: add the classical constant 1 to a 2-qubit register held
// in |a⟩, by working in the Fourier basis. Conceptually:
//
//   QFT |a⟩      → (1/√4) Σ_y exp(2πi a y / 4) |y⟩
//   apply phases → (1/√4) Σ_y exp(2πi (a + 1) y / 4) |y⟩
//   QFT^{-1}     → |(a + 1) mod 4⟩
//
// The two single-qubit phase rotations replace what would otherwise be
// a chain of carry gates. We start with a = 2 (binary 10); the result
// should land on 3 (binary 11).
//
// Qubit-order convention used here: q[0] is the MSB.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[2] c;

// Initial state |10⟩  (decimal 2).
x q[0];

// ── QFT on q[0..1] ─────────────────────────────────────────────────────
h q[0];
cp(pi/2) q[1], q[0];
h q[1];
swap q[0], q[1];

// ── Add 1 in the Fourier basis ─────────────────────────────────────────
// qubit q[j] picks up phase exp(2πi · 1 / 2^(j+1)) when in state |1⟩.
p(pi) q[0];        // 2π / 2 — MSB
p(pi/2) q[1];      // 2π / 4 — LSB

// ── Inverse QFT ────────────────────────────────────────────────────────
swap q[0], q[1];
h q[1];
cp(-pi/2) q[1], q[0];
h q[0];

c[0] = measure q[0];
c[1] = measure q[1];
