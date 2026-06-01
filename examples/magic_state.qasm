// Magic state |H⟩ = T|+⟩ = (|0⟩ + e^{iπ/4}|1⟩)/√2.
//
// Magic states are the resource that lets a Clifford-only fault-tolerant
// computer execute non-Clifford gates (here, T) via state-injection
// teleportation. Distilling many noisy copies into one high-fidelity
// |H⟩ is the dominant resource cost of most error-corrected quantum
// algorithms — so this single-line circuit is, in a real sense, the
// most expensive thing a fault-tolerant computer does.

OPENQASM 3.0;
include "stdgates.inc";

qubit[1] q;

h q[0];
t q[0];
