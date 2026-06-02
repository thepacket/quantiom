OPENQASM 3.0;
include "stdgates.inc";

input float theta;

qubit[3] q;
bit[2] c;

// Quantum teleportation — dynamic-circuit version with explicit
// classical feedback. The textbook protocol that "moves" an arbitrary
// quantum state from one qubit to another using a shared Bell pair
// plus two classical bits of communication.
//
// Bennett, Brassard, Crépeau, Jozsa, Peres, Wootters (1993).
//
// Protocol:
//   1. Alice prepares an arbitrary state |ψ⟩ on q[0]. Here that's
//      cos(θ/2)|0⟩ + sin(θ/2)|1⟩ via Ry(θ) — slide θ in the
//      Parameter panel to vary the state.
//   2. Alice and Bob pre-share a Bell pair on q[1] (Alice's half) and
//      q[2] (Bob's half).
//   3. Alice performs a Bell measurement on (q[0], q[1]) — implemented
//      as CX(q0, q1) · H(q0), then measure both. The two outcomes go
//      into classical bits c[0], c[1].
//   4. Alice sends the two classical bits to Bob.
//   5. Bob applies an X correction conditioned on c[1], then a Z
//      correction conditioned on c[0]. q[2] now holds |ψ⟩ exactly.
//
// Notable: no quantum information is transmitted in step 4 — just two
// classical bits. The "quantum-ness" travelled instantaneously through
// the entanglement of step 2, BUT the receiver can't decode it until
// the classical bits arrive (Bob's qubit is in a maximally mixed state
// before he applies the corrections). Speed-of-light limit preserved.
//
// To verify: after running, q[2] should match the prepared state on
// q[0]. Open the Bloch panel — q[2]'s Bloch vector tracks Alice's
// input as you slide θ.

// Prepare an arbitrary state |ψ⟩ = cos(θ/2)|0⟩ + sin(θ/2)|1⟩ on q[0].
ry(theta) q[0];

// Bell pair on q[1], q[2].
h q[1];
cx q[1], q[2];

barrier q[0], q[1], q[2];

// Bell-basis measurement on q[0], q[1].
cx q[0], q[1];
h q[0];
c[0] = measure q[0];
c[1] = measure q[1];

barrier q[0], q[1], q[2];

// Classical corrections on q[2].
if (c[1] == 1) x q[2];
if (c[0] == 1) z q[2];
