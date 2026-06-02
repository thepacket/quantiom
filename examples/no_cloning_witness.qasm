// No-cloning witness — a circuit that *would* clone if it could, and
// the visible failure that follows.
//
// Imagine you want a circuit C that takes |ψ⟩ on q[0] and produces
// |ψ⟩|ψ⟩ on q[0]q[1]. The CX gate appears at first glance to do this:
// it COPIES the computational basis (|0⟩ → |00⟩, |1⟩ → |11⟩). But
// applied to a superposition input:
//
//   CX |+⟩|0⟩ = (|00⟩ + |11⟩) / √2  ≠  |+⟩|+⟩
//
// You don't get two copies of |+⟩ — you get a Bell state, in which
// each individual qubit has Bloch vector (0, 0, 0) (maximally mixed).
// The "copies" are correlated, not independent.
//
// To see the failure visually: load this circuit, open the Bloch
// panel. Both qubits collapse to the origin (mixed) instead of
// staying on the X axis like |+⟩ would.
//
// This is *the* foundational no-go theorem of quantum information.
// Wootters & Zurek (1982), Dieks (1982).

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;

// Prepare q[0] in a nontrivial superposition |+⟩.
h q[0];

// "Cloning" attempt: copy the computational-basis value via CX.
cx q[0], q[1];

// Result is a Bell pair, NOT two copies of |+⟩.
// Bloch panel: both single-qubit reduced states sit at the origin.
