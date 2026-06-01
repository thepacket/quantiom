// One step of a discrete-time quantum walk on the 4-cycle.
//
//   q[0..1] — position register (4 sites; q[0] is the MSB).
//   q[2]    — coin qubit; coin = |1⟩ shifts +1, coin = |0⟩ shifts −1.
//
// The coin operator is a Hadamard, putting the walker into a 50/50
// superposition of moving forward and backward. The conditional shift
// then entangles position with coin, so the walker is in two places at
// once — the hallmark of ballistic spreading that beats classical walks.
//
// Starting from |position = 00, coin = 0⟩, after one step the walker is
// in the superposition (|01⟩|1⟩ + |11⟩|0⟩)/√2.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[3] c;

// Coin flip.
h q[2];

// Conditional increment (when coin = 1).
ccx q[2], q[1], q[0];
cx q[2], q[1];

// Conditional decrement (when coin = 0): wrap the same circuit with X
// on the coin so it triggers on the opposite branch, undoing the carry
// chain in reverse order.
x q[2];
cx q[2], q[1];
ccx q[2], q[1], q[0];
x q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
