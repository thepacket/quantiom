// 16-qubit GHZ state — 65 536 amplitudes, only |0…0⟩ and |1…1⟩ at
// magnitude 1/√2. State memory is 16·2¹⁶ = 1 MB, which the Float64Array
// simulator handles in milliseconds. The probabilities panel renders
// 65k bars; you'll want "hide zeros" on.

OPENQASM 3.0;
include "stdgates.inc";

qubit[16] q;

h q[0];
cx q[0], q[1];
cx q[1], q[2];
cx q[2], q[3];
cx q[3], q[4];
cx q[4], q[5];
cx q[5], q[6];
cx q[6], q[7];
cx q[7], q[8];
cx q[8], q[9];
cx q[9], q[10];
cx q[10], q[11];
cx q[11], q[12];
cx q[12], q[13];
cx q[13], q[14];
cx q[14], q[15];
