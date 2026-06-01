// Cuccaro ripple-carry adder for two 2-bit numbers, with carry-out.
// Cuccaro, Draper, Kutin, Moulton — "A new quantum ripple-carry addition
// circuit" (2004). One ancilla per bit plus a final carry-out qubit.
//
// Layout:
//   q[0] = c_in      (start 0)
//   q[1] = a₀        (LSB of a)
//   q[2] = b₀        (LSB of b → LSB of sum)
//   q[3] = a₁        (MSB of a)
//   q[4] = b₁        (MSB of b → MSB of sum, before carry)
//   q[5] = c_out     (final carry → MSB of result)
//
// After the circuit, q[5] q[4] q[2] holds a + b as a 3-bit number, and
// a is restored on q[1], q[3].
//
// Initial inputs below: a = 3 (binary 11), b = 2 (binary 10).
// Expected output: 5 (binary 101), i.e. q[5] = 1, q[4] = 0, q[2] = 1.

OPENQASM 3.0;
include "stdgates.inc";

qubit[6] q;
bit[6] c;

// ── Inputs ────────────────────────────────────────────────────────────
x q[1];     // a₀ = 1
x q[3];     // a₁ = 1   →   a = 11 = 3
x q[4];     // b₁ = 1   →   b = 10 = 2

// ── MAJ(c_in, b₀, a₀) ─────────────────────────────────────────────────
cx q[1], q[2];
cx q[1], q[0];
ccx q[2], q[0], q[1];

// ── MAJ(a₀, b₁, a₁) ───────────────────────────────────────────────────
cx q[3], q[4];
cx q[3], q[1];
ccx q[4], q[1], q[3];

// ── Carry-out ─────────────────────────────────────────────────────────
cx q[3], q[5];

// ── UMA(a₀, b₁, a₁) ───────────────────────────────────────────────────
ccx q[4], q[1], q[3];
cx q[3], q[1];
cx q[3], q[4];

// ── UMA(c_in, b₀, a₀) ─────────────────────────────────────────────────
ccx q[2], q[0], q[1];
cx q[1], q[0];
cx q[1], q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
c[4] = measure q[4];
c[5] = measure q[5];
