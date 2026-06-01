// Deutsch's original 1-bit algorithm — the seed from which Deutsch–Jozsa,
// Bernstein–Vazirani, Simon, Grover, and Shor all grow.
//
// Question: given a black-box f: {0,1} → {0,1}, with one query decide
// whether f is constant (f(0) = f(1)) or balanced (f(0) ≠ f(1)).
//
// Setup: q[0] is the input, q[1] is an ancilla put in |−⟩. Then the
// oracle is run; finally we Hadamard q[0] and measure it. Outcome 0
// means constant, outcome 1 means balanced.
//
// The oracle below implements the balanced function f(x) = x (one CNOT).

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[1] c;

// Ancilla in |−⟩.
x q[1];
h q[1];

// Input in equal superposition.
h q[0];

// Oracle for f(x) = x: XOR x into the ancilla.
cx q[0], q[1];

h q[0];

c[0] = measure q[0];
