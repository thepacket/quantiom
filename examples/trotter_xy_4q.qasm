// 4-qubit XY-model Trotter evolution.
//
//   H = − Σ (X_i X_{i+1} + Y_i Y_{i+1}),  three steps δ = t/3.
//
// Uses the (XX + YY)(2δ) gate as the native interaction, so each step is
// just three two-qubit gates on the chain. Starting from |1010⟩ — a
// classical anti-ferromagnet — the spin pattern delocalises with time.

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[4] q;

x q[0];
x q[2];

xx_plus_yy(t/3, 0) q[0], q[1];
xx_plus_yy(t/3, 0) q[1], q[2];
xx_plus_yy(t/3, 0) q[2], q[3];

xx_plus_yy(t/3, 0) q[0], q[1];
xx_plus_yy(t/3, 0) q[1], q[2];
xx_plus_yy(t/3, 0) q[2], q[3];

xx_plus_yy(t/3, 0) q[0], q[1];
xx_plus_yy(t/3, 0) q[1], q[2];
xx_plus_yy(t/3, 0) q[2], q[3];
