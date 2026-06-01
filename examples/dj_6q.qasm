// Deutsch–Jozsa on 5 input bits + 1 ancilla = 6 qubits. The oracle below
// implements the balanced function f(x) = x[0] ⊕ x[2] ⊕ x[4]. After the
// protocol, measuring the input register returns the all-zero string iff
// f is constant — here it isn't, so you'll see one of the other 31
// outcomes.

OPENQASM 3.0;
include "stdgates.inc";

qubit[6] q;
bit[5] c;

x q[5];
h q[5];

h q[0]; h q[1]; h q[2]; h q[3]; h q[4];

// Balanced oracle: XOR of selected input bits into the ancilla.
cx q[0], q[5];
cx q[2], q[5];
cx q[4], q[5];

h q[0]; h q[1]; h q[2]; h q[3]; h q[4];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
c[4] = measure q[4];
