// Sonorizer demo: amplitude tremolo.
//
// RY(t) on |0⟩ produces cos(t/2)|0⟩ + sin(t/2)|1⟩. As t sweeps around
// the unit circle, the fundamental and the octave-up partial fade in
// and out in opposition — a pure quantum-driven tremolo with no LFO.
// At t = π only the octave plays; at t = 0 or t = 2π only the
// fundamental.

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[1] q;

ry(t) q[0];
