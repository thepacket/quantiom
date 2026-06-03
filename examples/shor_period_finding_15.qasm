// Shor's period-finding — the quantum heart of factoring, worked end to
// end for N = 15 with base a = 4.
//
// Factoring 15 reduces to finding the multiplicative order r of a = 4
// mod 15: the smallest r with 4ʳ ≡ 1 (mod 15). Here 4¹ = 4, 4² = 16 ≡ 1,
// so r = 2. Once r is known classically, gcd(4^(r/2) ± 1, 15) =
// gcd(4 ± 1, 15) = {5, 3} hands you the factors 15 = 3 × 5.
//
// The quantum subroutine is phase estimation on the modular-multiplication
// operator U|y⟩ = |4·y mod 15⟩. Its eigenphases are s/r, so reading the
// estimate and taking the denominator (via continued fractions, trivial
// here) yields r.
//
// Registers:
//   q[0..2]  — 3 counting qubits (the phase-estimation register)
//   q[3..6]  — 4 work qubits holding a value mod 15, MSB = q[3]
//
// The key simplification that makes this small: because 15 = 2⁴ − 1,
// multiplying by 4 = 2² mod 15 is just a *cyclic left-rotation by two
// bits* of the 4-bit work register — i.e. two SWAPs. The controlled
// powers needed by QPE are
//
//     U¹ = ×4   = rotate-by-2 = SWAP(q3,q5)·SWAP(q4,q6)
//     U² = ×16  ≡ ×1 = identity
//     U⁴ = ×256 ≡ ×1 = identity
//
// so only the U¹ control (counting qubit q[2]) does anything; the higher
// counting qubits estimate phase bits that are exactly zero for r = 2.
//
// What you should see (Probabilities / Measurement-counts panels): the
// counting register collapses onto just two outcomes, 000 (= 0) and
// 100 (= 4), with equal weight. Reading m/8 gives phase 0 and 1/2; the
// denominator of 1/2 is r = 2. Done.
//
// How to explore in Quantiom:
//   • Run Measurement-counts to sample the counting register and confirm
//     the two-peak 0 / 4 histogram.
//   • Step through the columns to watch the work register cycle
//     1 → 4 → 1 under repeated ×4, and the inverse QFT concentrate the
//     phase back onto the counting bits.

OPENQASM 3.0;
include "stdgates.inc";
// qubit_names: c0, c1, c2, w3, w2, w1, w0

qubit[7] q;
bit[3] c;

// ── Counting register into uniform superposition ──────────────────────
h q[0];
h q[1];
h q[2];

// ── Work register initialised to |1⟩  (value 1 = 0001) ────────────────
x q[6];

// ── Controlled modular multiplication ─────────────────────────────────
// note: q[2] controls U¹ = ×4 mod 15 = rotate work bits left by 2
cswap q[2], q[3], q[5];
cswap q[2], q[4], q[6];
// (q[0], q[1] would control U⁴, U² = identity — omitted)

// ── Inverse QFT on the counting register (q0 MSB … q2 LSB) ─────────────
swap q[0], q[2];
h q[2];
cp(-π/2) q[1], q[2];
h q[1];
cp(-π/4) q[0], q[2];
cp(-π/2) q[0], q[1];
h q[0];

// ── Measure the counting register → peaks at 0 and 4 ──────────────────
c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
