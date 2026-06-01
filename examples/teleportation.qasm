// Quantum teleportation of a state on q[0] to q[2] using a shared Bell pair
// on q[1]–q[2] and two classical bits of feedback.
//
// The conditional X and Z at the end are written as classically-controlled
// gates; some QASM 3 toolchains require `if (c0 == 1) x q[2];` syntax — adjust
// for your target.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[2] c;

// (Optional) prepare an interesting state to teleport on q[0].
// Replace with whatever state you want to send.
ry(pi/3) q[0];
rz(pi/5) q[0];

// Shared Bell pair on q[1] and q[2].
h q[1];
cx q[1], q[2];

// Bell-basis measurement on (q[0], q[1]).
cx q[0], q[1];
h q[0];
c[0] = measure q[0];
c[1] = measure q[1];

// Classical feedback to recover the state on q[2].
if (c[1] == 1) x q[2];
if (c[0] == 1) z q[2];
