// Walsh–Hadamard transform on 3 qubits. H⊗H⊗H takes |000⟩ to the equal
// superposition (1/√8) Σ_x |x⟩, the starting point of nearly every
// quantum algorithm. The Q-sphere shows 8 markers of equal magnitude at
// the same phase.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;

h q[0];
h q[1];
h q[2];
