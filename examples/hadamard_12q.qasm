// 12-qubit Walsh–Hadamard transform — 4 096 basis states at uniform
// amplitude 1/64. Sonorizer plays 4 096 partials simultaneously; well
// past the harmonic range a human can resolve, so it sounds like soft
// digital noise. State memory 64 KB.

OPENQASM 3.0;
include "stdgates.inc";

qubit[12] q;

h q[0];
h q[1];
h q[2];
h q[3];
h q[4];
h q[5];
h q[6];
h q[7];
h q[8];
h q[9];
h q[10];
h q[11];
