// 3-qubit W state: (|001⟩ + |010⟩ + |100⟩)/√3.
//
// Unlike GHZ, the W state remains entangled after losing one qubit (its
// reduced 2-qubit density matrix is still entangled). Construction uses
// non-trivial rotation angles so that the amplitude is distributed evenly
// across the three single-excitation basis states.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[3] c;

// Put q[0] into cos(arccos(1/√3))|0⟩ + sin(...)|1⟩, i.e. amplitude 1/√3 on |1⟩.
ry(2*acos(1/sqrt(3))) q[0];

// Conditional rotation on q[1] given q[0] = 0 — implemented as X-conditioned
// CRY surrounded by X gates so the control is "if q[0] is 0".
x q[0];
cry(2*acos(1/sqrt(2))) q[0], q[1];
x q[0];

// Spread amplitude to q[2] when both q[0] and q[1] are |0⟩.
x q[0];
x q[1];
ccx q[0], q[1], q[2];
x q[1];
x q[0];

cx q[1], q[0];
cx q[2], q[1];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
