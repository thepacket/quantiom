OPENQASM 3.0;
include "stdgates.inc";

input float theta;

qubit[3] q;
bit[2] c;

// Dynamic-circuit teleportation: prepare an arbitrary state on q[0],
// teleport to q[2], and verify by inspecting q[2]. The classical-
// controlled X and Z on q[2] use the new condition support.

// Prepare an arbitrary state |ψ⟩ = cos(θ/2)|0⟩ + sin(θ/2)|1⟩ on q[0].
ry(theta) q[0];

// Bell pair on q[1], q[2].
h q[1];
cx q[1], q[2];

barrier q[0], q[1], q[2];

// Bell-basis measurement on q[0], q[1].
cx q[0], q[1];
h q[0];
c[0] = measure q[0];
c[1] = measure q[1];

barrier q[0], q[1], q[2];

// Classical corrections on q[2].
if (c[1] == 1) x q[2];
if (c[0] == 1) z q[2];
