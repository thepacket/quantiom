// 16-qubit Walsh–Hadamard — 65 536 partials at amplitude 1/256. Pure
// "spectrum of all integers" stress test; the Float64Array simulator
// completes the 16 Hadamards in a few milliseconds. The sonorizer
// renders this as pink-ish broadband noise.

OPENQASM 3.0;
include "stdgates.inc";

qubit[16] q;

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
h q[12];
h q[13];
h q[14];
h q[15];
