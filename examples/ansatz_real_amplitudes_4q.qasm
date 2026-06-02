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

// Real Amplitudes ansatz (Qiskit standard) — 2 layers of Ry rotations
// separated by a linear chain of CNOTs. Real-valued amplitudes (no Rz),
// suitable for ground-state energies of real Hamiltonians.

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
