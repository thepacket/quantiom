// The simplest non-trivial quantum circuit: a single Hadamard puts the
// qubit into |+⟩ = (|0⟩ + |1⟩)/√2, and measurement collapses it to 0 or 1
// with probability ½ each. A perfectly fair coin, sourced from a single
// physical quantum operation.

OPENQASM 3.0;
include "stdgates.inc";

qubit[1] q;
bit[1] c;

h q[0];

c[0] = measure q[0];
