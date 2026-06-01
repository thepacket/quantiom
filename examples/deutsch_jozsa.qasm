// Deutsch–Jozsa: decide whether f: {0,1}^n → {0,1} is constant or balanced
// with a single oracle query, for n = 3. The example oracle below is
// balanced: f(x) = x[0] ⊕ x[2].
//
// After the protocol, measuring the input register yields the all-zero string
// iff f is constant.

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;
bit[3] c;

// Ancilla in |−⟩.
x q[3];
h q[3];

// Superposition over input register.
h q[0];
h q[1];
h q[2];

// Balanced oracle: x[0] XOR x[2] into the ancilla.
cx q[0], q[3];
cx q[2], q[3];

// Hadamards on the input register reveal the oracle's structure.
h q[0];
h q[1];
h q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
