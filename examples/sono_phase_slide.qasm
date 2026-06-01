// Sonorizer demo: animated phase.
//
// After the Hadamard the qubit sits in (|0⟩ + |1⟩)/√2; the RZ(t) then
// rotates the |1⟩ amplitude by e^{it}. The spectrum doesn't change —
// it's still fundamental + octave at equal magnitudes — but the *phase*
// between the two partials slides continuously. The waveform morphs
// from a "square + cosine octave" to a "square + sine octave" and back.
//
// Hit ▶ on the Parameters panel (animates t) and ▶ on the Sonorizer.

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[1] q;

h q[0];
rz(t) q[0];
