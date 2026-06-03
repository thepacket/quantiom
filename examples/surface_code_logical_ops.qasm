// Surface-code logical operators on the smallest patch: the [[4,2,2]]
// code (the d=2 rotated surface / "detection" code). Four data qubits
// on a square face, two stabilizers — the X-plaquette XXXX and the
// Z-plaquette ZZZZ — encoding two logical qubits.
//
// The point of this example is to *see* a logical operator act inside
// the code space and leave the stabilizers undisturbed: a logical X̄
// is a string of physical X's along a boundary, and because it shares
// an even number of qubits with each plaquette it commutes with both
// stabilizers — so the error-detection syndrome stays trivial even
// though the encoded information flipped.
//
// Code (q0..q3 are the data qubits at the corners):
//        q0 ──── q1
//        │        │          stabilizers:  S_X = X0 X1 X2 X3
//        q2 ──── q3                         S_Z = Z0 Z1 Z2 Z3
//
//   logical qubit 1:  X̄₁ = X0 X1   Z̄₁ = Z0 Z2
//   logical qubit 2:  X̄₂ = X0 X2   Z̄₂ = Z0 Z1
//
// The logical |0̄0̄⟩ state (the +1 eigenstate of S_X, S_Z, Z̄₁, Z̄₂) is
// exactly the 4-qubit GHZ state (|0000⟩ + |1111⟩)/√2 — check the
// Statevector panel after loading: only those two amplitudes are
// populated, each 0.7071.
//
// We then apply X̄₁ = X0 X1 (flip logical qubit 1) and measure both
// stabilizers through their ancillas. Both syndrome bits come out 0:
// the logical operation never left the code space. Open the Probabilities
// panel — the data block stays on the |0000⟩/|1111⟩ branches.
//
// Qubit map:
//   q[0..3] — data qubits (corners of the face)
//   q[4]    — X-syndrome ancilla (reads S_X = XXXX)
//   q[5]    — Z-syndrome ancilla (reads S_Z = ZZZZ)

OPENQASM 3.0;
include "stdgates.inc";
// qubit_names: d0, d1, d2, d3, aX, aZ

qubit[6] q;
bit[2] c;

// ── Encode logical |0̄0̄⟩ = 4-qubit GHZ on the data block ───────────────
h q[0];
cx q[0], q[1];
cx q[0], q[2];
cx q[0], q[3];

// ── Apply logical X̄₁ = X0·X1 (flips encoded qubit 1) ──────────────────
// note: logical X̄₁ — a boundary string, not a single physical X
x q[0];
x q[1];

// ── Read the X-stabilizer S_X = XXXX on ancilla q[4] ──────────────────
h q[4];
cx q[4], q[0];
cx q[4], q[1];
cx q[4], q[2];
cx q[4], q[3];
h q[4];
c[0] = measure q[4];

// ── Read the Z-stabilizer S_Z = ZZZZ on ancilla q[5] ──────────────────
cx q[0], q[5];
cx q[1], q[5];
cx q[2], q[5];
cx q[3], q[5];
c[1] = measure q[5];
