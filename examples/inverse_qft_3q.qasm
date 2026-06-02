// 3-qubit Inverse Quantum Fourier Transform — the companion to
// qft_3q.qasm. QFT⁻¹ is the QFT circuit run backwards with negated
// phase angles: every cp(+θ) becomes cp(−θ), and the order of gates
// reverses.
//
// The inverse QFT shows up in:
//   • Quantum phase estimation: after a controlled-U cascade prepares
//     |k⟩ where k encodes the phase, the inverse QFT extracts k into
//     the computational basis for direct measurement.
//   • Shor's algorithm: after modular-exponentiation period encoding,
//     the inverse QFT reads off the period.
//   • Hidden-subgroup algorithms generally.
//
// QFT · QFT⁻¹ = I (modulo a single SWAP if you keep both circuits
// in their natural "bit-reversed" form). To verify: load qft_3q.qasm
// in one tab and this one in another, then drag-drop them into a
// combined circuit — the result on any input state should equal the
// input.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;

// Initial bit-reversal swap (mirror of the post-swap in QFT).
swap q[0], q[2];

h q[2];

cp(-pi/2) q[2], q[1];
h q[1];

cp(-pi/4) q[2], q[0];
cp(-pi/2) q[1], q[0];
h q[0];
