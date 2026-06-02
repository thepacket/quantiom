OPENQASM 3.0;
include "stdgates.inc";

input float theta;

qubit[4] q;

// UCCSD-lite: a single excitation rotation e^{-iθ (a†_0 a_2 - a_2† a_0)} on
// a Hartree-Fock reference |1100⟩. Decomposes into a CNOT staircase with
// an Ry(θ) in the middle — the canonical "Givens rotation" pattern that
// shows up everywhere in quantum chemistry ansätze.

// Hartree-Fock reference: spin-up orbitals occupied.
x q[0];
x q[1];

barrier q[0], q[1], q[2], q[3];

// CNOT staircase for Pauli string Z_0 Z_1 Y_2 X_3 (single excitation).
cx q[3], q[2];
cx q[2], q[1];
cx q[1], q[0];

// Ry(θ) on the active qubit.
ry(theta) q[0];

// Undo staircase.
cx q[1], q[0];
cx q[2], q[1];
cx q[3], q[2];
