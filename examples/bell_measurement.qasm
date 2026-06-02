// Bell measurement — project a two-qubit state onto the Bell basis
// {|Φ+⟩, |Φ−⟩, |Ψ+⟩, |Ψ−⟩} and record which Bell state it landed in.
//
// The trick: the inverse Bell-prep circuit CX(a,b)·H(a) rotates the
// Bell basis back onto the computational basis. After applying it, a
// computational-basis measurement reveals the Bell index:
//
//     measurement  →  Bell state
//     00           →  |Φ+⟩
//     01           →  |Ψ+⟩
//     10           →  |Φ−⟩
//     11           →  |Ψ−⟩
//
// Bell measurement is the foundational ingredient in teleportation,
// entanglement swapping, and dense coding. Here we prepare |Φ+⟩
// (Bell pair) and measure it — the outcome should be 00 with
// probability 1.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[2] c;

// Prepare |Φ+⟩ = (|00⟩ + |11⟩)/√2.
h q[0];
cx q[0], q[1];

// Bell measurement (CX then H on the control).
cx q[0], q[1];
h q[0];

c[0] = measure q[0];
c[1] = measure q[1];
