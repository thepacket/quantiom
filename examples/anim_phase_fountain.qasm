// Phase fountain on 4 qubits. The Hadamards put each qubit on the
// equator of the Bloch sphere; a CZ ladder entangles them; the inner
// RZ block then sprays four different phase rates (1, 2, 3, 5) ×
// t into the four wires; an outer CZ + RZ block partially undoes the
// entanglement, leaving a fluid swirl across all 16 amplitudes.
//
// Sonorizer: all 16 partials are active; their phases shift at
// independent rates, producing a deep wavetable-style morph.

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[4] q;

h q[0];
h q[1];
h q[2];
h q[3];

cz q[0], q[1];
cz q[1], q[2];
cz q[2], q[3];

rz(t) q[0];
rz(2*t) q[1];
rz(3*t) q[2];
rz(5*t) q[3];

cz q[0], q[1];
cz q[1], q[2];
cz q[2], q[3];

rz(-t) q[0];
rz(-2*t) q[1];
rz(-3*t) q[2];
rz(-5*t) q[3];
