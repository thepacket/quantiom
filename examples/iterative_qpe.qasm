// Iterative Quantum Phase Estimation — measure the eigenphase φ of a
// unitary U with a SINGLE ancilla qubit, recycled bit by bit.
//
// Standard QPE uses N ancillas to read N bits of φ in one shot. The
// iterative version (Kitaev) keeps just one ancilla and measures the
// least significant bit first, feeds the classical result back as a
// phase correction, then measures the next bit, and so on. Same
// precision, exponentially fewer qubits — at the cost of running the
// circuit N times sequentially.
//
// Here U = T (phase π/4 on |1⟩), eigenvector |1⟩, and we measure 3 bits
// of the eigenphase. The expected output is 0.001 in binary = 1/8 =
// φ/(2π) for φ = π/4.
//
// This single file demonstrates the *first* bit of the iteration (the
// most-significant). Subsequent iterations would apply U^{2^(N−k)}
// instead of U^{2^(N−1)}, with a classical Rz feedback that the IR's
// `if` lets us express.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;       // q[0] ancilla, q[1] = eigenvector |1⟩
bit[1] c;

// Eigenvector |1⟩.
x q[1];

// Iteration k = 0 (most significant): controlled-U^{2^2} = U^4 = T^4 = Z.
h q[0];
cz q[0], q[1];    // controlled-Z = controlled-T^4
h q[0];

c[0] = measure q[0];
