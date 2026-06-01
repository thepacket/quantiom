// One Grover iteration on a 2-qubit search space, with the marked state |11⟩.
//
// For N = 4 a single iteration suffices to amplify the marked amplitude to 1.
//
//   |s⟩ = H⊗H |00⟩
//   Oracle: flip phase of |11⟩  →  CZ
//   Diffusion: 2|s⟩⟨s| − I       →  H X CZ X H on each qubit

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[2] c;

// Equal superposition.
h q[0];
h q[1];

// Oracle: phase-flip the |11⟩ component.
cz q[0], q[1];

// Diffusion operator about the equal-superposition state.
h q[0];
h q[1];
x q[0];
x q[1];
cz q[0], q[1];
x q[0];
x q[1];
h q[0];
h q[1];

c[0] = measure q[0];
c[1] = measure q[1];
