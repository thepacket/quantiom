// 5-qubit Quantum Fourier Transform.
//
// The QFT maps |x⟩ → (1/√32) Σ_k e^{2πi·xk/32} |k⟩ — the quantum
// analogue of the classical DFT, achieved in O(n²) gates instead of
// the classical O(n·2ⁿ). It's the workhorse behind Shor's algorithm,
// phase estimation, period finding, and the Draper adder.
//
// Structure (per qubit, descending):
//   1. H q[k] — put the most-significant phase on q[k].
//   2. cp(π / 2^j) q[k+j], q[k] — fold in the k+j-th input bit's
//      contribution to q[k]'s phase. The π/2^j angle decreases for
//      bits further away (their contribution to qubit k's Fourier
//      bin is smaller).
//   3. Repeat for k+1, k+2, ...
//   4. Final SWAPs reverse qubit order — without them, the output
//      sits in "bit-reversed" order, which downstream consumers
//      sometimes prefer (e.g. iterative inverse QFTs).
//
// On |00000⟩ the QFT gives the uniform superposition (1/√32) Σ |k⟩
// (the Fourier transform of a delta is constant). Load this circuit,
// open the Probabilities panel — every bin equals 1/32 = 0.03125.
// Try replacing the input with `x q[0];` before the QFT to see a
// non-trivial phase fan-out in the Statevector panel.

OPENQASM 3.0;
include "stdgates.inc";

qubit[5] q;

h q[0];
cp(pi/2)  q[1], q[0];
cp(pi/4)  q[2], q[0];
cp(pi/8)  q[3], q[0];
cp(pi/16) q[4], q[0];

h q[1];
cp(pi/2) q[2], q[1];
cp(pi/4) q[3], q[1];
cp(pi/8) q[4], q[1];

h q[2];
cp(pi/2) q[3], q[2];
cp(pi/4) q[4], q[2];

h q[3];
cp(pi/2) q[4], q[3];

h q[4];

swap q[0], q[4];
swap q[1], q[3];
