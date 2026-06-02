// 3-qubit phase-flip code — companion to the bit-flip code, this one
// detects and corrects Z errors (sign flips).
//
// Key observation: a Z error in the X-basis looks just like an X error
// in the Z-basis. So the phase-flip code is the bit-flip code conjugated
// by Hadamards on every qubit. Encode |+⟩ as (|+++⟩) — a logical qubit
// invariant under Z on any single physical qubit.
//
// Encoding maps |ψ⟩_L = α|+⟩+β|−⟩  →  α|+++⟩ + β|−−−⟩.
// A Z error on any one qubit flips |+⟩ ↔ |−⟩ for that qubit. Majority
// vote (in the X basis) recovers the logical state.
//
// Below: encode (a fresh |0⟩ → H gives |+⟩), then INJECT a Z error on
// q[1], then decode and measure. Without the error correction, this
// would corrupt the state; with it, q[0] returns 0 (i.e. |+⟩).

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[3] c;

// Encode |+⟩ as |+++⟩ via two CXs in the Hadamard-conjugated frame.
h q[0];
cx q[0], q[1];
cx q[0], q[2];
h q[0]; h q[1]; h q[2];

// Inject a Z error on q[1].
z q[1];

// Decode (reverse of encoding).
h q[0]; h q[1]; h q[2];
cx q[0], q[2];
cx q[0], q[1];
// Majority vote on the two ancillas detects the error syndrome.
ccx q[1], q[2], q[0];

h q[0];        // back to Z-basis to read |0⟩ → 0.
c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
