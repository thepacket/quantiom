// 4-qubit W state: (|0001⟩ + |0010⟩ + |0100⟩ + |1000⟩)/2.
//
// Generalises the 3-qubit W state to four qubits. Like its little
// sibling it remains entangled after any single-qubit loss (its reduced
// 3-qubit density matrix is still entangled), unlike GHZ which collapses
// to a product state under partial trace.
//
// Construction uses successive RY rotations whose angles place 1/√n of
// the amplitude on each "one-hot" basis state.

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;
bit[4] c;

ry(2*acos(1/sqrt(4))) q[0];

x q[0];
cry(2*acos(1/sqrt(3))) q[0], q[1];
x q[0];

x q[0];
x q[1];
ccx q[0], q[1], q[2];
x q[1];
x q[0];

x q[0];
x q[1];
x q[2];
ccx q[0], q[1], q[2];
ccx q[0], q[1], q[3];
x q[2];
x q[1];
x q[0];

cx q[1], q[0];
cx q[2], q[1];
cx q[3], q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
