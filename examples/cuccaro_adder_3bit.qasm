// Cuccaro ripple-carry adder for two 3-bit numbers with carry-out, 8q.
//
//   q[0] = c_in (start 0)
//   q[1], q[3], q[5] = a₀, a₁, a₂  (LSB → MSB)
//   q[2], q[4], q[6] = b₀, b₁, b₂  (these become the low 3 bits of sum)
//   q[7] = c_out                    (final carry, high bit)
//
// Default inputs: a = 110 (decimal 6), b = 011 (decimal 3).
// Expected output: a+b = 9 = 1001, so q[7] q[6] q[4] q[2] = 1 0 0 1.

OPENQASM 3.0;
include "stdgates.inc";

qubit[8] q;
bit[8] c;

// a = 110 (a₀ = 0, a₁ = 1, a₂ = 1)
x q[3];
x q[5];
// b = 011 (b₀ = 1, b₁ = 1, b₂ = 0)
x q[2];
x q[4];

// MAJ(c_in, b₀, a₀)
cx q[1], q[2];
cx q[1], q[0];
ccx q[2], q[0], q[1];

// MAJ(a₀, b₁, a₁)
cx q[3], q[4];
cx q[3], q[1];
ccx q[4], q[1], q[3];

// MAJ(a₁, b₂, a₂)
cx q[5], q[6];
cx q[5], q[3];
ccx q[6], q[3], q[5];

// carry out
cx q[5], q[7];

// UMA(a₁, b₂, a₂)
ccx q[6], q[3], q[5];
cx q[5], q[3];
cx q[5], q[6];

// UMA(a₀, b₁, a₁)
ccx q[4], q[1], q[3];
cx q[3], q[1];
cx q[3], q[4];

// UMA(c_in, b₀, a₀)
ccx q[2], q[0], q[1];
cx q[1], q[0];
cx q[1], q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
c[4] = measure q[4];
c[5] = measure q[5];
c[6] = measure q[6];
c[7] = measure q[7];
