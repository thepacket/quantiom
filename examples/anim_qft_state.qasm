// Quantum Fourier Transform of an evolving input state.
//
// Three Y-rotations at rates 1, 2, 3 sweep the input register through a
// continuous family of computational-basis-mixed states; the QFT that
// follows turns each into its Fourier dual. As t advances, the Q-sphere
// markers slide around the latitudes, the probability bars rearrange,
// and the sonorizer's harmonics chase each other up and down the scale.

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[3] q;

// Time-dependent input.
ry(t) q[0];
ry(2*t) q[1];
ry(3*t) q[2];

// 3-qubit QFT.
h q[0];
cp(pi/2) q[1], q[0];
cp(pi/4) q[2], q[0];

h q[1];
cp(pi/2) q[2], q[1];

h q[2];

swap q[0], q[2];
