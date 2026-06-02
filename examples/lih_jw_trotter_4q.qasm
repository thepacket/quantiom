// Single Trotter step of a minimal LiH Hamiltonian after Jordan–Wigner
// mapping, projected onto an active space yielding a four-qubit operator.
//
// We keep the four largest-weight Pauli terms (1-body and 2-body) as a
// pedagogical stand-in for the full LiH expansion. Coefficients h1..h4
// are exposed as input parameters so the user can swap in any literature
// values without editing the circuit.
//
// Each Pauli term P with coefficient h_k is implemented as a
//   {basis-change}–{CNOT staircase}–{Rz(2 h_k δ)}–{undo}
// sandwich. We use the IR's bare RZZ for the all-Z two-body term, and
// explicit decompositions for the X/Y-bearing terms.

OPENQASM 3.0;
include "stdgates.inc";

input float delta;
input float h1;  // I ⊗ Z ⊗ I ⊗ I    (one-body Z on q[2])
input float h2;  // I ⊗ I ⊗ Z ⊗ Z    (two-body ZZ on q[0],q[1])
input float h3;  // X ⊗ X ⊗ Y ⊗ Y    (four-body XXYY)
input float h4;  // Y ⊗ Y ⊗ X ⊗ X    (four-body YYXX, partner term)

qubit[4] q;

// Hartree–Fock-like starting state: q[0] and q[1] occupied.
x q[0];
x q[1];

// h1 · Z2 — single-qubit rotation about Z on q[2].
rz(2 * h1 * delta) q[2];

// h2 · Z0 Z1 — two-qubit Ising rotation via the bare RZZ gate.
rzz(2 * h2 * delta) q[0], q[1];

// h3 · X0 X1 Y2 Y3 — basis-change H/H/S†H/S†H, CNOT staircase, Rz, undo.
h q[0];
h q[1];
sdg q[2]; h q[2];
sdg q[3]; h q[3];
cx q[0], q[1];
cx q[1], q[2];
cx q[2], q[3];
rz(2 * h3 * delta) q[3];
cx q[2], q[3];
cx q[1], q[2];
cx q[0], q[1];
h q[3]; s q[3];
h q[2]; s q[2];
h q[1];
h q[0];

// h4 · Y0 Y1 X2 X3 — partner term, basis-change S†H/S†H/H/H, same staircase.
sdg q[0]; h q[0];
sdg q[1]; h q[1];
h q[2];
h q[3];
cx q[0], q[1];
cx q[1], q[2];
cx q[2], q[3];
rz(2 * h4 * delta) q[3];
cx q[2], q[3];
cx q[1], q[2];
cx q[0], q[1];
h q[3];
h q[2];
h q[1]; s q[1];
h q[0]; s q[0];
