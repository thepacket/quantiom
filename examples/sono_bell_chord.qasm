// Sonorizer demo: the sound of entanglement.
//
// The Bell state (|00⟩ + |11⟩)/√2 puts equal amplitude on basis states
// |0⟩ and |3⟩ — partials 1 and 4 of the harmonic series. Partial 4 is
// two octaves above the fundamental, so the sonorizer plays a wide
// chord: a low pure tone with a bright second-octave overtone.
//
// Pair this with sono_octave (|0⟩, |1⟩ → partials 1, 2) to hear how
// entanglement shifts which harmonics get excited.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;

h q[0];
cx q[0], q[1];
