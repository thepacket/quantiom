// Sonorizer demo: maximally bright timbre.
//
// H ⊗ H ⊗ H ⊗ H puts the 4-qubit register into uniform superposition
// over 16 basis states. The sonorizer lights up partials 1 through 16
// at equal magnitude — the spectrum of a Dirac-comb-like waveform, the
// brightest tone the engine can produce at this register size.
//
// Compare to sono_octave: each additional Hadamard doubles the partial
// count and brightens the timbre.

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;

h q[0];
h q[1];
h q[2];
h q[3];
