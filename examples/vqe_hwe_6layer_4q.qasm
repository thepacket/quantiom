// Hardware-efficient variational ansatz, 4 qubits × 6 layers = 48
// independent rotation parameters (theta_0…theta_47) plus 24 entangling
// CNOTs. The kind of circuit you'd hand to a VQE or QAOA optimiser.
//
// Drop a single numeric value into one of the parameter sliders and the
// whole thing recomputes immediately; substitute `t` in place of any
// parameter to animate that axis of the loss landscape.

OPENQASM 3.0;
include "stdgates.inc";

input float theta_0;  input float theta_1;  input float theta_2;  input float theta_3;
input float theta_4;  input float theta_5;  input float theta_6;  input float theta_7;
input float theta_8;  input float theta_9;  input float theta_10; input float theta_11;
input float theta_12; input float theta_13; input float theta_14; input float theta_15;
input float theta_16; input float theta_17; input float theta_18; input float theta_19;
input float theta_20; input float theta_21; input float theta_22; input float theta_23;
input float theta_24; input float theta_25; input float theta_26; input float theta_27;
input float theta_28; input float theta_29; input float theta_30; input float theta_31;
input float theta_32; input float theta_33; input float theta_34; input float theta_35;
input float theta_36; input float theta_37; input float theta_38; input float theta_39;
input float theta_40; input float theta_41; input float theta_42; input float theta_43;
input float theta_44; input float theta_45; input float theta_46; input float theta_47;

qubit[4] q;

ry(theta_0)  q[0]; ry(theta_1)  q[1]; ry(theta_2)  q[2]; ry(theta_3)  q[3];
cx q[0], q[1]; cx q[1], q[2]; cx q[2], q[3]; cx q[3], q[0];

ry(theta_4)  q[0]; ry(theta_5)  q[1]; ry(theta_6)  q[2]; ry(theta_7)  q[3];
cx q[0], q[1]; cx q[1], q[2]; cx q[2], q[3]; cx q[3], q[0];

ry(theta_8)  q[0]; ry(theta_9)  q[1]; ry(theta_10) q[2]; ry(theta_11) q[3];
cx q[0], q[1]; cx q[1], q[2]; cx q[2], q[3]; cx q[3], q[0];

ry(theta_12) q[0]; ry(theta_13) q[1]; ry(theta_14) q[2]; ry(theta_15) q[3];
cx q[0], q[1]; cx q[1], q[2]; cx q[2], q[3]; cx q[3], q[0];

ry(theta_16) q[0]; ry(theta_17) q[1]; ry(theta_18) q[2]; ry(theta_19) q[3];
cx q[0], q[1]; cx q[1], q[2]; cx q[2], q[3]; cx q[3], q[0];

ry(theta_20) q[0]; ry(theta_21) q[1]; ry(theta_22) q[2]; ry(theta_23) q[3];
cx q[0], q[1]; cx q[1], q[2]; cx q[2], q[3]; cx q[3], q[0];

rz(theta_24) q[0]; rz(theta_25) q[1]; rz(theta_26) q[2]; rz(theta_27) q[3];
rz(theta_28) q[0]; rz(theta_29) q[1]; rz(theta_30) q[2]; rz(theta_31) q[3];
rz(theta_32) q[0]; rz(theta_33) q[1]; rz(theta_34) q[2]; rz(theta_35) q[3];
rz(theta_36) q[0]; rz(theta_37) q[1]; rz(theta_38) q[2]; rz(theta_39) q[3];
rz(theta_40) q[0]; rz(theta_41) q[1]; rz(theta_42) q[2]; rz(theta_43) q[3];
rz(theta_44) q[0]; rz(theta_45) q[1]; rz(theta_46) q[2]; rz(theta_47) q[3];
