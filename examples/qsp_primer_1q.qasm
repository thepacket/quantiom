// Quantum signal processing (QSP) — a single-qubit primer.
//
// QSP is the engine under quantum singular-value transformation and
// modern Hamiltonian-simulation algorithms. The idea: interleave a
// fixed "signal" rotation W(θ) (which encodes the variable x = cos(θ/2))
// with tunable "processing" rotations about a perpendicular axis. After
// d signal calls the unitary's ⟨0|U|0⟩ amplitude is a degree-d
// polynomial P(x) whose coefficients are set entirely by the processing
// phases φ₀…φ_d. Choosing the phases shapes the polynomial — that is the
// whole game.
//
// Convention used here:
//   • signal      W(θ) = Rx(θ)            (θ = the variable, animatable)
//   • processing  S(φ) = Rz(2φ)           (the tunable phases)
//   • sequence    U = S(φ0)·W·S(φ1)·W·S(φ2)·W·S(φ3)     (degree d = 3)
//
// With the symmetric phase set below the response P(x) = ⟨0|U|0⟩ traces
// out a cubic Chebyshev-like curve in x = cos(θ/2). The phases for a
// *specific* target polynomial normally come from a classical solver
// (Remez / Wilson); here they're a hand-picked illustrative set so you
// can watch the shaped response directly.
//
// How to explore in Quantiom:
//   • θ (theta) is a free symbol — the t-clock can drive it. Open the
//     Bloch panel and the Probabilities panel and animate: the |0⟩
//     population P₀(θ) = |P(cos θ/2)|² oscillates with the higher-order
//     structure the phases impose, not the simple cos² of a bare Rx.
//   • Set every φ to 0 (delete the Rz gates) to collapse U back to
//     Rx(3θ) — the trivial degree-3 "polynomial" — and compare.
//   • Add another W·S(φ) pair to raise the degree to 4 and watch an
//     extra oscillation appear.

OPENQASM 3.0;
include "stdgates.inc";
// qubit_names: signal

qubit[1] q;

// note: processing phase φ0 = π/2, applied as Rz(2φ0) = Rz(π)
rz(π) q[0];
// note: signal W(θ)
rx(theta) q[0];

// note: processing phase φ1 = −π/3, applied as Rz(2φ1) = Rz(−2π/3)
rz(-2*π/3) q[0];
rx(theta) q[0];

// note: processing phase φ2 = π/3, applied as Rz(2φ2) = Rz(2π/3)
rz(2*π/3) q[0];
rx(theta) q[0];

// note: processing phase φ3 = −π/2, applied as Rz(2φ3) = Rz(−π)
rz(-π) q[0];
