// Bell state |Φ+⟩ = (|00⟩ + |11⟩)/√2.
//
// The simplest example of entanglement: a single Hadamard followed by a CNOT
// turns a product state into a maximally entangled pair.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[2] c;

h q[0];
cx q[0], q[1];

c[0] = measure q[0];
c[1] = measure q[1];
