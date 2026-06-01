// Sonorizer demo: pure octave.
//
// A single Hadamard splits |0⟩ into (|0⟩ + |1⟩)/√2 — equal amplitude on
// basis states |0⟩ and |1⟩. The sonorizer maps |i⟩ to the (i+1)-th
// harmonic, so you hear the fundamental (220 Hz by default) and its
// octave (440 Hz) at equal strength: a square-wave-ish tone that's the
// cleanest non-trivial sound the engine produces.
//
// Hit ▶ on the Sonorizer panel.

OPENQASM 3.0;
include "stdgates.inc";

qubit[1] q;

h q[0];
