// 8-qubit Walsh–Hadamard transform. Produces (1/16) Σ |x⟩ over 256
// basis states — uniform superposition. Sonorizer: 256 partials at equal
// magnitude, the brightest possible sound the engine emits at this
// register width.

OPENQASM 3.0;
include "stdgates.inc";

qubit[8] q;

h q[0];
h q[1];
h q[2];
h q[3];
h q[4];
h q[5];
h q[6];
h q[7];
