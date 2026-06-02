// Stabilizer measurement — read the eigenvalue ±1 of a Pauli operator
// without destroying the state's eigenstructure. The fundamental
// syndrome-extraction primitive for every stabilizer code.
//
// Goal: measure Z⊗Z on the data register q[1..2] without learning the
// individual Z values (which would collapse a superposition like
// (|00⟩+|11⟩)/√2 to either |00⟩ or |11⟩).
//
// Technique: an ancilla in |+⟩, then controlled-Z from the ancilla onto
// each qubit covered by the stabilizer, then H on ancilla and measure.
// The ancilla outcome m relates to the eigenvalue as Z⊗Z = (−1)^m.
//
// Below: prepare the data in (|00⟩ + |11⟩)/√2 = |Φ+⟩, a Z⊗Z = +1
// eigenstate. The ancilla measurement should give 0 with certainty,
// while the data register stays in |Φ+⟩ — entanglement preserved,
// stabilizer eigenvalue read out.
//
// This generalises: any multi-qubit Pauli string can be measured by a
// chain of controlled-(X/Y/Z) gates from the ancilla onto each
// non-identity qubit of the string. The 7-qubit Steane code, surface
// code, etc. all build their syndromes this way.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;       // q[0] ancilla, q[1..2] data
bit[1] c;

// Data state |Φ+⟩ = (|00⟩ + |11⟩)/√2 — a Z⊗Z = +1 eigenstate.
h q[1];
cx q[1], q[2];

// Stabilizer measurement of Z⊗Z onto the ancilla.
h q[0];
cz q[0], q[1];
cz q[0], q[2];
h q[0];

c[0] = measure q[0];
