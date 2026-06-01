// Bernstein–Vazirani with a 5-bit hidden string s = 11010 (read MSB-first
// as s[0]…s[4]). Uses 6 qubits: 5 for the input register, 1 ancilla.
//
// The oracle XORs bits of x · s into the ancilla via one CNOT per set bit
// of s. After Hadamards on both sides, measuring the input register
// returns s exactly.

OPENQASM 3.0;
include "stdgates.inc";

qubit[6] q;
bit[5] c;

x q[5];
h q[5];

h q[0]; h q[1]; h q[2]; h q[3]; h q[4];

// Oracle for s = 11010 (bits set at positions 0, 1, 3).
cx q[0], q[5];
cx q[1], q[5];
cx q[3], q[5];

h q[0]; h q[1]; h q[2]; h q[3]; h q[4];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
c[4] = measure q[4];
