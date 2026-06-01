// Simon's algorithm on 2 input bits with hidden period s = 11.
//
// Given a black-box f: {0,1}² → {0,1}² with the promise that
// f(x) = f(y) iff x ⊕ y ∈ {00, s}, find s. Classically this takes Θ(2^(n/2))
// queries; Simon needs O(n).
//
// Here we use f(x) = (0, x[0] ⊕ x[1]), which collapses pairs differing by
// s = 11. After the protocol, measuring the input register always returns
// a y satisfying y · s = 0 — so y ∈ {00, 11}. A small classical step
// solves the resulting linear system for s.

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;
bit[2] c;

// Input register in uniform superposition.
h q[0];
h q[1];

// Oracle: q[3] = q[0] ⊕ q[1]; q[2] left at 0.
cx q[0], q[3];
cx q[1], q[3];

// Interference on the input register.
h q[0];
h q[1];

c[0] = measure q[0];
c[1] = measure q[1];
