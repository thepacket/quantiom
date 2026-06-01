// CHSH inequality test: prepare a Bell pair and measure each qubit in one
// of two bases (parameterized by the angles θ_a, θ_b). Repeated runs over
// the four (a, b) basis pairs yield correlations whose sum E_CHSH violates
// the classical bound |E| ≤ 2, reaching 2√2 for the optimal angles
// (θ_a ∈ {0, π/2}, θ_b ∈ {π/4, 3π/4}).
//
// This file fixes one specific (a, b) — Alice measures in the X basis
// (θ_a = π/2), Bob measures along the angle 3π/8 between X and Z.

OPENQASM 3.0;
include "stdgates.inc";

input float theta_a;
input float theta_b;

qubit[2] q;
bit[2] c;

// Bell pair |Φ+⟩.
h q[0];
cx q[0], q[1];

// Alice rotates by θ_a around Y then measures in Z; equivalent to
// measuring in a basis tilted by θ_a from |0⟩/|1⟩.
ry(theta_a) q[0];

// Bob rotates by θ_b similarly.
ry(theta_b) q[1];

c[0] = measure q[0];
c[1] = measure q[1];
