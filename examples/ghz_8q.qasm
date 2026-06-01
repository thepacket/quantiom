// 8-qubit GHZ state. Generalises the 3-qubit GHZ from ghz.qasm: a single
// Hadamard followed by a chain of CNOTs entangles all 8 qubits into
// (|0⟩⊗⁸ + |1⟩⊗⁸)/√2. Only two of the 256 basis amplitudes are non-zero;
// the simulator handles the full state vector all the same.

OPENQASM 3.0;
include "stdgates.inc";

qubit[8] q;

h q[0];
cx q[0], q[1];
cx q[1], q[2];
cx q[2], q[3];
cx q[3], q[4];
cx q[4], q[5];
cx q[5], q[6];
cx q[6], q[7];
