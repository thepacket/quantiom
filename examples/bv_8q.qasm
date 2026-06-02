// Bernstein–Vazirani with a 7-bit hidden string s = 1011010.
//
// Problem: an oracle implements f(x) = s · x mod 2 for some unknown
// hidden bit-string s ∈ {0,1}⁷. Recover s.
//
// Classical lower bound: 7 oracle queries (one per bit of s, querying
// e_k = 0…010…0 reveals s[k]).
//
// Quantum (this circuit): exactly ONE oracle call. The Hadamard
// transform before and after the oracle turns the parity computation
// f(x) = s · x into a direct readout: measuring the input register
// after the second H block returns s outright.
//
// Mechanism: phase kickback gives the input register a phase
// (−1)^{s·x} on branch |x⟩. The final Hadamard transform converts
// "phase pattern" → "amplitude pattern" — and the (−1)^{s·x} phase
// pattern is exactly the Hadamard-transform image of the bit-string
// s. So the final state is exactly |s⟩.
//
// Below the oracle has bits set at positions 0, 2, 3, 5 — that's
// s = 1011010 (read q[0] q[1] q[2] q[3] q[4] q[5] q[6] = MSB first).
// The Probabilities panel shows a single spike at index 0b1011010 = 90.

OPENQASM 3.0;
include "stdgates.inc";

qubit[8] q;
bit[7] c;

x q[7];
h q[7];

h q[0]; h q[1]; h q[2]; h q[3]; h q[4]; h q[5]; h q[6];

// Oracle for s = 1011010 (bits set at positions 0, 2, 3, 5).
cx q[0], q[7];
cx q[2], q[7];
cx q[3], q[7];
cx q[5], q[7];

h q[0]; h q[1]; h q[2]; h q[3]; h q[4]; h q[5]; h q[6];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
c[4] = measure q[4];
c[5] = measure q[5];
c[6] = measure q[6];
