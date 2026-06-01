// Animated example. The literal symbol `t` is a special parameter that the
// Parameters panel can play through 0 → 2π continuously when you click ▶.
//
//   q[0] — Larmor-style precession: a Hadamard parks the qubit on the +x
//          axis (state |+⟩), then RZ(t) rotates it around the Z axis as t
//          advances. On the Bloch sphere the vector traces the equator.
//
//   q[1] — Rabi-style oscillation: RY(t) sweeps the qubit from |0⟩
//          through |+⟩ to |1⟩ and back as t advances. The probability bars
//          for |0⟩ and |1⟩ pulse against each other.
//
// Open the Parameters panel and hit ▶. The Hz slider controls how fast t
// runs (default 0.5 cycles/second).

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[2] q;

h q[0];
rz(t) q[0];

ry(t) q[1];
