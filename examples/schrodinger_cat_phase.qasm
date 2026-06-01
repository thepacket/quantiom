// Phased Schrödinger cat state on 3 qubits:
//
//   |ψ⟩ = (|000⟩ + e^{iφ}|111⟩) / √2
//
// Same shape as a GHZ state but with a tunable relative phase φ between
// the two branches. Drag the φ slider in the Parameters panel — the ket
// stays symbolic while the per-amplitude phase rotates around the unit
// circle.
//
// Try φ = π for the "GHZ−" sister state, or use the special symbol `t`
// in place of φ to animate the phase.

OPENQASM 3.0;
include "stdgates.inc";

input float phi;

qubit[3] q;

h q[0];
cx q[0], q[1];
cx q[0], q[2];
p(phi) q[0];
