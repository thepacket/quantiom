// QFT of a time-evolving 5-qubit input. Three Y-rotations at incommensurate
// rates (1, 2, 3) sweep the input register through a continuous family of
// states; the 5-qubit QFT then projects each onto its Fourier dual. The
// probabilities panel paints 32 bars that flow into one another.

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[5] q;

ry(t)   q[0];
ry(2*t) q[1];
ry(3*t) q[2];
ry(t/2) q[3];
ry(t/3) q[4];

h q[0];
cp(pi/2)  q[1], q[0];
cp(pi/4)  q[2], q[0];
cp(pi/8)  q[3], q[0];
cp(pi/16) q[4], q[0];

h q[1];
cp(pi/2) q[2], q[1];
cp(pi/4) q[3], q[1];
cp(pi/8) q[4], q[1];

h q[2];
cp(pi/2) q[3], q[2];
cp(pi/4) q[4], q[2];

h q[3];
cp(pi/2) q[4], q[3];

h q[4];

swap q[0], q[4];
swap q[1], q[3];
