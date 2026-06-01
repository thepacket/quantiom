// 3-qubit bit-flip code. Encodes a logical qubit α|0⟩ + β|1⟩ into the
// repetition codeword α|000⟩ + β|111⟩, suffers a (commented-out) bit-flip
// error on one of the data qubits, then decodes with a majority vote
// implemented as a Toffoli.
//
// To see the code in action, uncomment one of the error gates and confirm
// that the logical qubit on q[0] is restored after decoding.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[3] c;

// Prepare an arbitrary logical state on q[0]; here a Hadamard for |+⟩.
h q[0];

// Encode: |ψ⟩ → α|000⟩ + β|111⟩.
cx q[0], q[1];
cx q[0], q[2];

// Single-qubit bit-flip error (pick at most one):
// x q[0];
x q[1];
// x q[2];

// Syndrome + correction by majority vote.
cx q[0], q[1];
cx q[0], q[2];
ccx q[1], q[2], q[0];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
