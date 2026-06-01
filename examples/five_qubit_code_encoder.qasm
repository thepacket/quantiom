// 5-qubit perfect code [[5,1,3]] encoder for the logical |0⟩.
//
// The smallest QEC code that corrects an arbitrary single-qubit Pauli
// error, saturating the quantum Hamming bound. The encoder below uses a
// standard sequence of 4 Hadamards plus 8 controlled gates (CNOTs and
// CZs) to produce the +1 eigenstate of all four stabiliser generators.

OPENQASM 3.0;
include "stdgates.inc";

qubit[5] q;

z q[0];

h q[1];
h q[2];
h q[3];
h q[4];

cx q[4], q[0];
cz q[4], q[1];
cz q[4], q[2];
cx q[4], q[3];

cx q[3], q[0];
cx q[3], q[1];
cz q[3], q[2];

cz q[2], q[0];
cx q[2], q[1];

cz q[1], q[0];
