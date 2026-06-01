// Superdense coding: Alice sends 2 classical bits to Bob using 1 shared
// entangled qubit pair and a single qubit transmission. Here we encode the
// classical message "10" (bits a=1, b=0).
//
//   Setup: Alice holds q[0], Bob holds q[1]. They share a Bell pair.
//   Encode: Alice applies Z if a=1, then X if b=1, on her qubit.
//   Send:   Alice sends q[0] to Bob (modeled as a no-op here).
//   Decode: Bob applies CNOT(0,1) then H on q[0] and measures both qubits;
//           the measurement outcome reads the original two bits.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[2] c;

// Pre-shared Bell pair.
h q[0];
cx q[0], q[1];

// Alice encodes message "10" (a=1, b=0): apply Z, skip X.
z q[0];

// Bob's decoder.
cx q[0], q[1];
h q[0];

c[0] = measure q[0];
c[1] = measure q[1];
