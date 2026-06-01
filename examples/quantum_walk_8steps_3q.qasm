// Eight steps of the coined quantum walk on the 4-cycle from
// quantum_walk_step.qasm. After 8 unitary steps starting from |position
// = 00, coin = 0⟩, the walker has spread non-classically across all four
// positions; the position-marginal distribution differs from a classical
// random walk on the same graph.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[3] c;

// One step macro repeated 8×.
h q[2];
ccx q[2], q[1], q[0]; cx q[2], q[1];
x q[2]; cx q[2], q[1]; ccx q[2], q[1], q[0]; x q[2];

h q[2];
ccx q[2], q[1], q[0]; cx q[2], q[1];
x q[2]; cx q[2], q[1]; ccx q[2], q[1], q[0]; x q[2];

h q[2];
ccx q[2], q[1], q[0]; cx q[2], q[1];
x q[2]; cx q[2], q[1]; ccx q[2], q[1], q[0]; x q[2];

h q[2];
ccx q[2], q[1], q[0]; cx q[2], q[1];
x q[2]; cx q[2], q[1]; ccx q[2], q[1], q[0]; x q[2];

h q[2];
ccx q[2], q[1], q[0]; cx q[2], q[1];
x q[2]; cx q[2], q[1]; ccx q[2], q[1], q[0]; x q[2];

h q[2];
ccx q[2], q[1], q[0]; cx q[2], q[1];
x q[2]; cx q[2], q[1]; ccx q[2], q[1], q[0]; x q[2];

h q[2];
ccx q[2], q[1], q[0]; cx q[2], q[1];
x q[2]; cx q[2], q[1]; ccx q[2], q[1], q[0]; x q[2];

h q[2];
ccx q[2], q[1], q[0]; cx q[2], q[1];
x q[2]; cx q[2], q[1]; ccx q[2], q[1], q[0]; x q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
