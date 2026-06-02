// Hadamard test — measure the real (and, with a phase tweak, imaginary)
// part of ⟨ψ|U|ψ⟩ for a unitary U and a state |ψ⟩.
//
// Setup: an ancilla in |+⟩ plus a state register holding |ψ⟩. A
// controlled-U conditioned on the ancilla, then a final H on the ancilla.
// The measurement probability obeys:
//
//     P(0) − P(1) = Re ⟨ψ|U|ψ⟩
//
// For the imaginary part, insert S† on the ancilla just before the
// final H — that rotates the X-basis measurement to Y, and you read off
// Im ⟨ψ|U|ψ⟩ instead.
//
// The Hadamard test is the workhorse of variational expectation
// estimation: ⟨H⟩ for a Hamiltonian Σ_k h_k P_k decomposes term-by-term
// into a sum of Pauli expectations, each measurable by one Hadamard
// test with U = P_k.
//
// Here we measure Re ⟨+|Z|+⟩, which is 0 — qubit 1 is in |+⟩, Z on it
// flips to |−⟩, and ⟨+|−⟩ = 0. P(0) − P(1) = 0 → P(0) = 0.5 statistically.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;       // q[0] ancilla, q[1] = |ψ⟩
bit[1] c;

// Prepare |ψ⟩ = |+⟩ on the state qubit.
h q[1];

// Hadamard-test core, U = Z.
h q[0];
cz q[0], q[1];    // controlled-Z = ancilla-controlled U
h q[0];

c[0] = measure q[0];
