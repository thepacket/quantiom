// 6-qubit dense ansatz with the time parameter t threaded through 18
// rotations. Two layers of (H · RY(k·t) · CNOT-ladder · RZ(−k·t) ·
// CNOT-ladder · RX(t/2)) drive 64 amplitudes through a slow tumble.
//
// This sits at the high end of what the symbolic simulator handles
// comfortably — expect a brief computation pause when you load the
// circuit, then smooth animation thereafter (the symbolic state is
// cached and only the numeric substitution re-runs per frame).

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[6] q;

// Hadamard prep.
h q[0];
h q[1];
h q[2];
h q[3];
h q[4];
h q[5];

// RY at multiples of t.
ry(t) q[0];
ry(2*t) q[1];
ry(3*t) q[2];
ry(4*t) q[3];
ry(5*t) q[4];
ry(6*t) q[5];

// Forward CNOT ladder.
cx q[0], q[1];
cx q[1], q[2];
cx q[2], q[3];
cx q[3], q[4];
cx q[4], q[5];

// RZ at negative multiples of t.
rz(-t) q[0];
rz(-2*t) q[1];
rz(-3*t) q[2];
rz(-4*t) q[3];
rz(-5*t) q[4];
rz(-6*t) q[5];

// Reverse CNOT ladder.
cx q[4], q[5];
cx q[3], q[4];
cx q[2], q[3];
cx q[1], q[2];
cx q[0], q[1];

// Common transverse kick.
rx(t/2) q[0];
rx(t/2) q[1];
rx(t/2) q[2];
rx(t/2) q[3];
rx(t/2) q[4];
rx(t/2) q[5];
