// Multi-frequency cascade on 5 qubits. Each qubit rotates around Y at a
// distinct rational rate; CNOT ladders entangle and disentangle the
// register between rotation layers. The Bloch spheres trace ellipses
// at incommensurate speeds, and the probability bars show a quasi-
// periodic pattern that doesn't repeat within a single t-cycle.

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[5] q;

h q[0];
h q[1];
h q[2];
h q[3];
h q[4];

ry(t) q[0];
ry(2*t) q[1];
ry(3*t) q[2];
ry(5*t) q[3];
ry(7*t) q[4];

cx q[0], q[1];
cx q[1], q[2];
cx q[2], q[3];
cx q[3], q[4];

ry(-t) q[0];
ry(-2*t) q[1];
ry(-3*t) q[2];
ry(-5*t) q[3];
ry(-7*t) q[4];

cx q[3], q[4];
cx q[2], q[3];
cx q[1], q[2];
cx q[0], q[1];
