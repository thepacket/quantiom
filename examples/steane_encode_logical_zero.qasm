// Encoder for the logical |0⟩_L state of the Steane [[7,1,3]] code — a
// CSS code built from the [7,4,3] Hamming code that protects one logical
// qubit against any single-qubit Pauli error.
//
// Three of the qubits (q[0], q[1], q[2]) are X-stabilizer ancillas that
// start in |+⟩; the remaining four (q[3..6]) carry the data. After
// encoding, the seven qubits jointly form the codeword
//
//   |0⟩_L = (1/√8) Σ_{x ∈ C} |x⟩
//
// where C is the [7,4,3] Hamming codewords with even weight on the
// stabilizer support. The logical Z is Z⊗Z⊗…⊗Z; the logical X is
// X⊗X⊗…⊗X.

OPENQASM 3.0;
include "stdgates.inc";

qubit[7] q;

h q[0];
h q[1];
h q[2];

cx q[0], q[3];
cx q[0], q[4];
cx q[0], q[5];

cx q[1], q[3];
cx q[1], q[4];
cx q[1], q[6];

cx q[2], q[3];
cx q[2], q[5];
cx q[2], q[6];
