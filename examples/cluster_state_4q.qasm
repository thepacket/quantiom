// 4-qubit linear cluster state. Starting from |+⟩^⊗4 we apply CZ between
// neighbouring qubits along a path 0 — 1 — 2 — 3. The result is the
// canonical resource for measurement-based quantum computation: arbitrary
// single-qubit gates and CNOTs can be enacted on a logical qubit by
// measuring intermediate qubits in adaptively-chosen bases.

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;

h q[0];
h q[1];
h q[2];
h q[3];

cz q[0], q[1];
cz q[1], q[2];
cz q[2], q[3];
