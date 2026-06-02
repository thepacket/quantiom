// Quantum Fourier addition — Draper's algorithm extended to 2-bit
// inputs (4 qubits total: a[0..1] and b[0..1]).
//
// Idea: compute |a⟩|b⟩ → |a⟩|a + b mod 4⟩ by going through the QFT
// basis. In the QFT basis, addition becomes a sum of LOCAL phase
// rotations — much cheaper than the ripple-carry adder (no
// CCX/Toffoli, no carry qubits).
//
// Steps:
//   1. QFT on b register: b ↦ |QFT(b)⟩.
//   2. For each bit a_j of the addend, apply controlled phase rotations
//      Rz(π/2^k) onto b — the QFT-basis "add a" operation.
//   3. Inverse QFT on b register: |QFT(a+b)⟩ ↦ |a+b⟩.
//
// Below: a = 01 (q[0..1]) is the classical addend, b = 10 (q[2..3])
// the quantum register. Expected output on b: 10 + 01 = 11 (binary 3).

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;       // q[0..1] = a, q[2..3] = b
bit[2] c;

// Classical addend a = 01.
x q[1];

// Quantum input b = 10.
x q[2];

// QFT on b register.
h q[2];
cp(pi/2) q[3], q[2];
h q[3];
swap q[2], q[3];

// Controlled phase additions: a + b in the Fourier basis.
cp(pi)   q[0], q[2];
cp(pi/2) q[0], q[3];
cp(pi/2) q[1], q[2];
cp(pi/4) q[1], q[3];

// Inverse QFT on b register.
swap q[2], q[3];
h q[3];
cp(-pi/2) q[3], q[2];
h q[2];

c[0] = measure q[2];
c[1] = measure q[3];
