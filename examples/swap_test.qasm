// SWAP test — measure the overlap |⟨ψ|φ⟩|² between two quantum states.
//
// The circuit prepares an ancilla in |+⟩, then applies a controlled-SWAP
// between two state registers conditioned on the ancilla, then a final H
// on the ancilla before measurement. The probability of measuring 0 is:
//
//     P(0) = (1 + |⟨ψ|φ⟩|²) / 2
//
// so |⟨ψ|φ⟩|² = 2·P(0) − 1. Identical states give P(0) = 1; orthogonal
// states give P(0) = 1/2. The test does NOT recover the inner product
// itself (the sign / phase is lost), only its magnitude squared.
//
// Used as a primitive in quantum machine learning (kernel methods),
// quantum fingerprinting, and verification protocols. Here we test two
// trivially identical |+⟩ states, so P(0) should be exactly 1.
//
// Reference: Buhrman, Cleve, Watrous, de Wolf (2001).

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;       // q[0] ancilla, q[1] = |ψ⟩, q[2] = |φ⟩
bit[1] c;

// Prepare |ψ⟩ = |φ⟩ = |+⟩ on the two state qubits.
h q[1];
h q[2];

// SWAP test core.
h q[0];
cswap q[0], q[1], q[2];
h q[0];

c[0] = measure q[0];
