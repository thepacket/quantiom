// 8-qubit Quantum Fourier Transform. Same structure as qft_3q / qft_5q
// but scaled to 256 amplitudes — a useful stress test for the editor
// and the simulator alike (~36 gates, 256-dim statevector).
//
// On the |00000000⟩ input, the QFT produces the uniform superposition
// (1/16) Σ |k⟩: the Fourier transform of a delta is constant. Open the
// Probabilities panel: every one of the 256 bins should read 1/256 =
// 0.00391.
//
// The gate count scales as n(n+1)/2 H + cp pairs + n/2 final swaps =
// O(n²). Classical FFT is O(n·2ⁿ) — already at n = 8 the quantum form
// is 36 gates vs. ~2048 classical multiplications.
//
// Try replacing the all-zero input with `x q[0];` before the QFT to
// see the Fourier transform of a single-excitation state (phase fan-out
// across the register that's hard to write down classically but easy
// to render here).

OPENQASM 3.0;
include "stdgates.inc";

qubit[8] q;

h q[0];
cp(pi/2)   q[1], q[0];
cp(pi/4)   q[2], q[0];
cp(pi/8)   q[3], q[0];
cp(pi/16)  q[4], q[0];
cp(pi/32)  q[5], q[0];
cp(pi/64)  q[6], q[0];
cp(pi/128) q[7], q[0];

h q[1];
cp(pi/2)  q[2], q[1];
cp(pi/4)  q[3], q[1];
cp(pi/8)  q[4], q[1];
cp(pi/16) q[5], q[1];
cp(pi/32) q[6], q[1];
cp(pi/64) q[7], q[1];

h q[2];
cp(pi/2)  q[3], q[2];
cp(pi/4)  q[4], q[2];
cp(pi/8)  q[5], q[2];
cp(pi/16) q[6], q[2];
cp(pi/32) q[7], q[2];

h q[3];
cp(pi/2)  q[4], q[3];
cp(pi/4)  q[5], q[3];
cp(pi/8)  q[6], q[3];
cp(pi/16) q[7], q[3];

h q[4];
cp(pi/2) q[5], q[4];
cp(pi/4) q[6], q[4];
cp(pi/8) q[7], q[4];

h q[5];
cp(pi/2) q[6], q[5];
cp(pi/4) q[7], q[5];

h q[6];
cp(pi/2) q[7], q[6];

h q[7];

swap q[0], q[7];
swap q[1], q[6];
swap q[2], q[5];
swap q[3], q[4];
