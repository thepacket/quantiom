// Coined quantum walk on a 4-node cycle — the quantum analogue of
// a classical random walk, with quadratic speedup on hitting times
// and unusual interference patterns.
//
// State space: 2 qubits encode the position (4 nodes), 1 qubit is
// the coin (left / right). Each step:
//
//   1. Coin flip — a Hadamard on the coin qubit.
//   2. Conditional shift — if coin = 0 go counter-clockwise, else
//      clockwise. Modulo-4 increment via two CNOTs.
//
// After several steps the position distribution is NON-Gaussian
// (unlike classical), with peaks at the endpoints of the explored
// region. Load this in Quantiom, open the Probabilities panel, and
// step through to watch the distribution interfere.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;       // q[0..1] position (4 nodes), q[2] coin
bit[3] c;

// Start at node 0, balanced coin.
h q[2];           // coin = |+⟩ = (|left⟩ + |right⟩)/√2

// Step 1: coin flip, then conditional shift.
h q[2];
// Conditional shift: if coin = 0, decrement position; else increment.
// Increment mod 4 on q[0..1] controlled by q[2]:
ccx q[2], q[0], q[1];
cx q[2], q[0];

// Step 2.
h q[2];
ccx q[2], q[0], q[1];
cx q[2], q[0];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
