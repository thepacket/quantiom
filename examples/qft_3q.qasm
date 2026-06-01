// 3-qubit Quantum Fourier Transform.
//
//   |x⟩ → (1/√8) Σ_y exp(2πi xy / 8) |y⟩
//
// Standard textbook construction: a Hadamard followed by descending
// controlled-phase rotations on each qubit, with a final bit-order reversal.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;

h q[0];
cp(pi/2) q[1], q[0];
cp(pi/4) q[2], q[0];

h q[1];
cp(pi/2) q[2], q[1];

h q[2];

// Reverse qubit order so the output is in standard register layout.
swap q[0], q[2];
