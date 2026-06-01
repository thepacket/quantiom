// QAOA MaxCut on the kite graph (4 vertices, 5 edges):
//
//         0───1
//         │ ╲ │
//         │  ╲│
//         3───2
//
// Edges: (0,1), (1,2), (2,3), (0,3), (0,2). One QAOA layer with
// parameters γ (cost) and β (mixer). Each edge contributes an RZZ(2γ);
// the mixer is RX(2β) on every vertex.

OPENQASM 3.0;
include "stdgates.inc";

input float gamma;
input float beta;

qubit[4] q;
bit[4] c;

h q[0]; h q[1]; h q[2]; h q[3];

rzz(2*gamma) q[0], q[1];
rzz(2*gamma) q[1], q[2];
rzz(2*gamma) q[2], q[3];
rzz(2*gamma) q[0], q[3];
rzz(2*gamma) q[0], q[2];

rx(2*beta) q[0];
rx(2*beta) q[1];
rx(2*beta) q[2];
rx(2*beta) q[3];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
