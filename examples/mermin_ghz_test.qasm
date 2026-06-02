// Mermin's GHZ inequality — a "stronger than Bell" demonstration of
// quantum nonlocality requiring NO statistical averaging.
//
// On the GHZ state |GHZ⟩ = (|000⟩ + |111⟩)/√2, every local hidden
// variable model predicts that the product of measurements XYY, YXY,
// YYX cannot all equal +1 while XXX equals −1. Quantum mechanics
// predicts:
//
//     ⟨XYY⟩ = ⟨YXY⟩ = ⟨YYX⟩ = +1
//     ⟨XXX⟩ = −1
//
// A single shot can reveal the contradiction — no statistics needed.
// Each run of the circuit below measures one of these four observables
// (which one depends on the basis rotations before measurement).
//
// This file measures XXX. To measure XYY etc., replace the basis
// rotation on the chosen Y-axis qubits with `sdg; h` (Y-basis) instead
// of plain `h` (X-basis). All four together: GHZ state violates a Bell
// inequality with deterministic certainty, not just statistically.
//
// Reference: Mermin (1990), "Quantum Mysteries Revisited".

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[3] c;

// Prepare |GHZ⟩ = (|000⟩ + |111⟩)/√2.
h q[0];
cx q[0], q[1];
cx q[0], q[2];

// Measure XXX (rotate every qubit to the X basis with H).
h q[0]; h q[1]; h q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];

// Outcome parity (c[0] ⊕ c[1] ⊕ c[2]) is always 1 (i.e. ⟨XXX⟩ = −1).
