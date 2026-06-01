// Bernstein–Vazirani: recover the hidden bit-string s ∈ {0,1}^n with a single
// oracle query. Here n = 3 and s = 101 (read most-significant-bit first as
// s[0] s[1] s[2]).
//
// The oracle implements f(x) = s · x (mod 2) using one CNOT per nonzero bit of
// s, targeting the ancilla q[3]. Hadamards before and after the oracle
// transform the parity measurement on the ancilla into a direct readout of s
// on the input register.

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;
bit[3] c;

// Prep ancilla in |−⟩ so the phase-kickback trick applies.
x q[3];
h q[3];

// Superposition over the input register.
h q[0];
h q[1];
h q[2];

// Oracle for s = 101: XOR bits 0 and 2 of x into the ancilla.
cx q[0], q[3];
cx q[2], q[3];

// Disentangle the input register.
h q[0];
h q[1];
h q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
