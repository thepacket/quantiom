// 3-qubit Inverse Quantum Fourier Transform. The companion to qft_3q.qasm:
// running QFT followed by QFT^{-1} returns the original state, modulo the
// final SWAP that reverses qubit order.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;

// Initial bit-reversal swap (mirror of the post-swap in QFT).
swap q[0], q[2];

h q[2];

cp(-pi/2) q[2], q[1];
h q[1];

cp(-pi/4) q[2], q[0];
cp(-pi/2) q[1], q[0];
h q[0];
