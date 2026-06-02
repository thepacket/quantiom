OPENQASM 3.0;
include "stdgates.inc";

input float theta_0;
input float theta_1;
input float theta_2;
input float theta_3;
input float theta_4;
input float theta_5;
input float theta_6;
input float theta_7;

qubit[4] q;

// Real Amplitudes ansatz — Qiskit's standard real-valued variational
// circuit, particularly well-suited to VQE for Hamiltonians that are
// real in the computational basis (which most condensed-matter and
// quantum-chemistry Hamiltonians are after Jordan-Wigner mapping).
//
// Structure: alternating layers of single-qubit RY rotations and a
// linear CNOT entangling chain. No RZ, no T — every amplitude in the
// resulting state vector is REAL (no complex phases). This halves the
// effective parameter space versus a generic hardware-efficient
// ansatz, which matters for trainability and barren plateau mitigation.
//
// When to use: ground-state problems where the target eigenstate is
// known to be real (Hamiltonian = sum of real Paulis I, X, Z, XX, ZZ,
// etc. — anything without Y). Hubbard, Heisenberg XXX/XXZ, lattice
// gauge theories, many chemistry Hamiltonians after Bravyi-Kitaev or
// JW.
//
// Below: 2 layers, 8 parameters total — small enough to optimise from
// scratch via the Optimise button in the Expectation panel.

// Layer 0
ry(theta_0) q[0];
ry(theta_1) q[1];
ry(theta_2) q[2];
ry(theta_3) q[3];

barrier q[0], q[1], q[2], q[3];

cx q[0], q[1];
cx q[1], q[2];
cx q[2], q[3];

barrier q[0], q[1], q[2], q[3];

// Layer 1
ry(theta_4) q[0];
ry(theta_5) q[1];
ry(theta_6) q[2];
ry(theta_7) q[3];
