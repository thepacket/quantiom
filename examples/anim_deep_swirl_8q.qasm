// 8-qubit dense swirl driven by t. Six layers of (RY(k·t) · CNOT-ladder ·
// RZ(−k·t) · CNOT-ladder) on every qubit — ~100 gates animating a
// 256-amplitude state vector. Each Bloch sphere precesses at a different
// rate; the sonorizer paints a slowly-morphing 256-partial wavetable.

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[8] q;

h q[0]; h q[1]; h q[2]; h q[3]; h q[4]; h q[5]; h q[6]; h q[7];

// Layer 1
ry(t)   q[0]; ry(2*t) q[1]; ry(3*t) q[2]; ry(4*t) q[3];
ry(5*t) q[4]; ry(6*t) q[5]; ry(7*t) q[6]; ry(8*t) q[7];
cx q[0], q[1]; cx q[1], q[2]; cx q[2], q[3]; cx q[3], q[4];
cx q[4], q[5]; cx q[5], q[6]; cx q[6], q[7];
rz(-t)   q[0]; rz(-2*t) q[1]; rz(-3*t) q[2]; rz(-4*t) q[3];
rz(-5*t) q[4]; rz(-6*t) q[5]; rz(-7*t) q[6]; rz(-8*t) q[7];
cx q[6], q[7]; cx q[5], q[6]; cx q[4], q[5]; cx q[3], q[4];
cx q[2], q[3]; cx q[1], q[2]; cx q[0], q[1];

// Layer 2
ry(t)   q[7]; ry(2*t) q[6]; ry(3*t) q[5]; ry(4*t) q[4];
ry(5*t) q[3]; ry(6*t) q[2]; ry(7*t) q[1]; ry(8*t) q[0];
cx q[0], q[2]; cx q[1], q[3]; cx q[2], q[4]; cx q[3], q[5];
cx q[4], q[6]; cx q[5], q[7];
rz(-t)   q[7]; rz(-2*t) q[6]; rz(-3*t) q[5]; rz(-4*t) q[4];
rz(-5*t) q[3]; rz(-6*t) q[2]; rz(-7*t) q[1]; rz(-8*t) q[0];
cx q[5], q[7]; cx q[4], q[6]; cx q[3], q[5]; cx q[2], q[4];
cx q[1], q[3]; cx q[0], q[2];

// Layer 3 — transverse kick
rx(t/2) q[0]; rx(t/2) q[1]; rx(t/2) q[2]; rx(t/2) q[3];
rx(t/2) q[4]; rx(t/2) q[5]; rx(t/2) q[6]; rx(t/2) q[7];
