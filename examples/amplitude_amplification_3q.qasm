// Generalised amplitude amplification on a 3-qubit register where the
// "marked" subspace is the two states {|001⟩, |110⟩}. The oracle phase-
// flips both; the diffusion step inverts about the equal-superposition
// state. After a single iteration the combined probability of the two
// marked states is amplified well above its initial 1/4.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[3] c;

h q[0]; h q[1]; h q[2];

// Oracle: phase-flip on |001⟩ and |110⟩.
// |001⟩ — q[0]=0, q[1]=0, q[2]=1
x q[0]; x q[1];
ctrl(2) @ z q[0], q[1], q[2];
x q[0]; x q[1];

// |110⟩ — q[0]=1, q[1]=1, q[2]=0
x q[2];
ctrl(2) @ z q[0], q[1], q[2];
x q[2];

// Diffusion about the equal-superposition state.
h q[0]; h q[1]; h q[2];
x q[0]; x q[1]; x q[2];
ctrl(2) @ z q[0], q[1], q[2];
x q[0]; x q[1]; x q[2];
h q[0]; h q[1]; h q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
