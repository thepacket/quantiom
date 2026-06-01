// Phase kickback: the mechanism that powers most quantum speedups.
//
// A controlled-U with the target in an eigenstate of U "kicks back" the
// eigenphase onto the control qubit. Here U = Z and the target is in |1⟩
// (an eigenstate with eigenvalue −1), so the control picks up a phase of π,
// flipping |+⟩ to |−⟩.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[1] c;

// Control in |+⟩.
h q[0];

// Target in |1⟩, which is the −1 eigenstate of Z.
x q[1];

// Controlled-Z applies the phase −1 to the |1⟩_target component,
// which the control inherits via the kickback.
cz q[0], q[1];

// Reveal the phase on the control: H |−⟩ = |1⟩.
h q[0];

c[0] = measure q[0];
