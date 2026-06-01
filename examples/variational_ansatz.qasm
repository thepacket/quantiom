// Hardware-efficient variational ansatz on 4 qubits, two layers.
//
// Per layer: single-qubit RY/RZ rotations on every qubit, then a ring of
// CNOTs for entanglement. Eight symbolic parameters per layer, sixteen
// total — typical scale for a small VQE/QAOA experiment.

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
input float phi_0;
input float phi_1;
input float phi_2;
input float phi_3;
input float phi_4;
input float phi_5;
input float phi_6;
input float phi_7;

qubit[4] q;
bit[4] c;

// Layer 1
ry(theta_0) q[0];
ry(theta_1) q[1];
ry(theta_2) q[2];
ry(theta_3) q[3];
rz(phi_0) q[0];
rz(phi_1) q[1];
rz(phi_2) q[2];
rz(phi_3) q[3];

cx q[0], q[1];
cx q[1], q[2];
cx q[2], q[3];
cx q[3], q[0];

// Layer 2
ry(theta_4) q[0];
ry(theta_5) q[1];
ry(theta_6) q[2];
ry(theta_7) q[3];
rz(phi_4) q[0];
rz(phi_5) q[1];
rz(phi_6) q[2];
rz(phi_7) q[3];

cx q[0], q[1];
cx q[1], q[2];
cx q[2], q[3];
cx q[3], q[0];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
