// Toffoli (CCX) decomposed into 1- and 2-qubit Clifford+T gates. Useful
// when a target architecture lacks a native three-qubit gate. The exact
// sequence below uses 6 CNOTs, 7 T/T†, and 2 Hadamards, and is
// unitarily equivalent to ccx q[0], q[1], q[2] up to global phase.
//
// Set q[0] = q[1] = 1 with the X gates at the top to test: the target
// q[2] should flip to 1 by the end.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[3] c;

// Inputs: both controls on.
x q[0];
x q[1];

// Decomposition body.
h q[2];
cx q[1], q[2];
tdg q[2];
cx q[0], q[2];
t q[2];
cx q[1], q[2];
tdg q[2];
cx q[0], q[2];
t q[1];
t q[2];
h q[2];
cx q[0], q[1];
t q[0];
tdg q[1];
cx q[0], q[1];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
