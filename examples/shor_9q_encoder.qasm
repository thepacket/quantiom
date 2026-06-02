// Shor [[9,1,3]] code encoder — the original quantum error-correcting
// code, protecting one logical qubit against ANY single-qubit error
// (bit-flip, phase-flip, or both).
//
// Structure: concatenation of the 3-qubit bit-flip code with the
// 3-qubit phase-flip code. Each of the three "blocks" {q[0..2]},
// {q[3..5]}, {q[6..8]} protects against bit flips. A second layer
// across blocks protects against phase flips. Combined, the code can
// correct any single-qubit Pauli error.
//
// Encoding map:
//   |0⟩_L → ((|000⟩ + |111⟩) / √2)^⊗3 / (2√2)
//   |1⟩_L → ((|000⟩ − |111⟩) / √2)^⊗3 / (2√2)
//
// This is just the encoder — decoding and syndrome extraction would
// add ~6 ancillas. Useful as a study circuit for visualising the
// stabilizer structure (open the Bloch panel after loading and see
// the entangled high-weight superposition).
//
// Reference: Shor (1995), "Scheme for reducing decoherence in quantum
// memory".

OPENQASM 3.0;
include "stdgates.inc";

qubit[9] q;

// Logical |0⟩_L input: q[0] starts as |0⟩, do nothing. Toggle
// to logical |1⟩_L by uncommenting `x q[0];` below.
// x q[0];

// Phase-flip outer code: spread q[0] onto q[3], q[6] in Hadamard basis.
cx q[0], q[3];
cx q[0], q[6];
h q[0]; h q[3]; h q[6];

// Bit-flip inner code: spread each of q[0], q[3], q[6] onto its block.
cx q[0], q[1]; cx q[0], q[2];
cx q[3], q[4]; cx q[3], q[5];
cx q[6], q[7]; cx q[6], q[8];
