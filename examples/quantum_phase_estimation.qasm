// Quantum Phase Estimation for U = T = diag(1, e^{iπ/4}) on its eigenvector
// |1⟩ (eigenvalue e^{iπ/4} → phase φ = 1/8). With 3 counting qubits, the
// answer 0.001 binary is read out exactly.
//
//   q[0..2]: counting register (will hold the phase bits, MSB first).
//   q[3]:    eigenvector register, prepared in |1⟩.
//
// Layout: Hadamards on the counting register, controlled-U^(2^k) from each
// counting qubit to the target, inverse QFT on the counting register,
// measure.

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;
bit[3] c;

// Eigenvector |1⟩.
x q[3];

// Counting register in uniform superposition.
h q[0];
h q[1];
h q[2];

// Controlled-T^(2^k). For T the phase is π/4, so T^(2^k) is a controlled-P.
cp(pi/4)     q[2], q[3];          // k = 0: one application of T
cp(pi/2)     q[1], q[3];          // k = 1: T^2 = S
cp(pi)       q[0], q[3];          // k = 2: T^4 = Z

// Inverse QFT on q[0..2] (qubits in order; finishes with a SWAP).
h q[0];
cp(-pi/2) q[1], q[0];
cp(-pi/4) q[2], q[0];
h q[1];
cp(-pi/2) q[2], q[1];
h q[2];
swap q[0], q[2];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
