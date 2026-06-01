// One round of BB84 quantum key distribution.
//
//   Alice picks a random bit a ∈ {0, 1} and a basis α ∈ {Z, X}; she
//   prepares |a⟩ (Z basis) or H|a⟩ (X basis) and sends it to Bob.
//   Bob picks his own random basis β and measures in it.
//
//   When α = β their outcomes correlate perfectly — those rounds form
//   the shared key after they publicly compare bases. When α ≠ β the
//   outcome is uniformly random.
//
// Parameters: alpha (0 = Z, π/2 = X) and beta likewise. Vary them with
// the sliders to see the four (basis, basis) combinations. Alice's bit
// here is hard-wired to 1 (the leading X).

OPENQASM 3.0;
include "stdgates.inc";

input float alpha;
input float beta;

qubit[1] q;
bit[1] c;

// Alice prepares |1⟩, then rotates into her chosen basis.
x q[0];
ry(alpha) q[0];

// Bob rotates back by his chosen basis before a Z-basis measurement.
ry(-beta) q[0];

c[0] = measure q[0];
