OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[1] c;

// Repeat-until-success template: try a non-deterministic state prep,
// measure an ancilla. If outcome=0, the data qubit is in the desired
// state and we proceed; if outcome=1, apply a correction.
//
// This is the simplest non-trivial example of a dynamic circuit with
// classical feedback — it actually changes what happens to the data
// qubit depending on the measurement outcome.

// Attempt: H on data, controlled rotation on ancilla, T on data.
h q[0];
ch q[0], q[1];
t q[0];

// Measure ancilla.
c[0] = measure q[1];

// On failure (c[0] == 1), apply the recovery on the data qubit.
if (c[0] == 1) x q[0];
if (c[0] == 1) t q[0];
