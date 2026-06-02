// Surface code single-plaquette stabilizer measurement. 4 data qubits
// arranged on a square face, 1 X-type ancilla measuring XXXX on the
// four corners, 1 Z-type ancilla measuring ZZZZ on the same.
//
// One full stabilizer cycle: prep ancillas, entangle, measure, reset.
// The two ancilla outcomes are the X- and Z-syndrome bits for this face.
//
// Qubit map:
//   q[0], q[1], q[2], q[3]  — four data qubits at the face's corners
//   q[4]                    — X-stabilizer ancilla
//   q[5]                    — Z-stabilizer ancilla

OPENQASM 3.0;
include "stdgates.inc";

qubit[6] q;
bit[2] c;

// Initialize the data block in the |+⟩^⊗4 logical product (so X-syndrome
// is +1 and Z-syndrome is 0 deterministically before any error).
h q[0];
h q[1];
h q[2];
h q[3];

// ── X-stabilizer (XXXX) on q[4] ────────────────────────────────────────
// Standard recipe: H on ancilla, four CXs ancilla→data, H on ancilla,
// measure ancilla in Z. Equivalent to projecting onto ±1 eigenspace of XXXX.
h q[4];
cx q[4], q[0];
cx q[4], q[1];
cx q[4], q[2];
cx q[4], q[3];
h q[4];
c[0] = measure q[4];

// ── Z-stabilizer (ZZZZ) on q[5] ────────────────────────────────────────
// Z-stabilizer uses four CXs data→ancilla; no Hadamard envelope needed.
cx q[0], q[5];
cx q[1], q[5];
cx q[2], q[5];
cx q[3], q[5];
c[1] = measure q[5];
