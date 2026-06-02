// Coined quantum walk on the 4-cycle — 8 unitary steps without any
// intermediate measurement. The classical random walk on the same
// graph would spread diffusively (positions equally likely after many
// steps). The quantum version spreads BALLISTICALLY (linear in the
// number of steps) with interference patterns that no classical
// process produces.
//
// Encoding: q[0..1] = position (4 nodes around the cycle), q[2] = coin
// state (left / right). Each step:
//   1. Coin Hadamard — superpose the two move directions.
//   2. Conditional shift — modular ±1 on the position depending on coin.
//
// After 8 steps the position-marginal distribution differs dramatically
// from a classical walk: instead of the binomial-like spread you'd see
// classically, you get a distribution with sharp peaks at SPECIFIC
// position values determined by the interference of the coin
// trajectories.
//
// Quantum walks underlie several algorithms with provable speedups:
// element distinctness, triangle finding, matrix product verification,
// boolean formula evaluation. The interference pattern shown here is
// the basic mechanism.
//
// Open the Probabilities panel after loading; trace the qubit 0–1
// marginals (sum probabilities by position bits) to see the
// non-classical distribution.

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
