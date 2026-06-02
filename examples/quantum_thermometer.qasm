// Ramsey-style quantum thermometer — measure a small unknown phase φ
// (proportional to temperature in a real spin sensor) via interferometry.
//
// Protocol: prepare a probe qubit in |+⟩, let it accumulate phase
// during free evolution (modelled here as Rz(φ)), then measure in the
// X basis. The probability of measuring 0 is:
//
//     P(0) = (1 + cos φ) / 2
//
// so φ = arccos(2·P(0) − 1) up to ambiguity in [0, π]. For small φ,
// sensitivity ∂P/∂φ ≈ sin(φ)/2 — maximal near φ = π/2, where a small
// temperature change produces the largest measurement-statistics change.
//
// In real quantum metrology, replacing the single probe with an
// entangled GHZ state of N probes improves the sensitivity by a factor
// of N (Heisenberg-limited scaling) instead of √N (shot-noise limit).
//
// Slide phi in the Parameters panel to see the fringe oscillate.

OPENQASM 3.0;
include "stdgates.inc";

qubit[1] q;
bit[1] c;

// Prepare probe in |+⟩.
h q[0];

// Accumulate phase φ (the thing being sensed).
rz(phi) q[0];

// Read out in the X basis.
h q[0];
c[0] = measure q[0];
