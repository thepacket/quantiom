// Dicke state |D₃¹⟩ — the symmetric superposition of all 3-qubit basis
// states with exactly ONE qubit in |1⟩:
//
//     |D₃¹⟩ = (|001⟩ + |010⟩ + |100⟩) / √3
//
// Dicke states arise in quantum optics (multiphoton emission from
// symmetric atom clouds), quantum metrology (super-resolution
// measurements), and combinatorial optimization (warm-starting QAOA).
//
// Bärtschi-Eidenbenz (2019) construction: starts from |001⟩, then
// applies a cascade of controlled-Ry rotations that "spread" the
// excitation symmetrically across all qubits. The Ry angles are
// chosen so the final amplitudes are exactly equal.
//
// To verify: probabilities should be 1/3 each on |001⟩, |010⟩, |100⟩
// and 0 elsewhere. Open the Probabilities panel after loading.

OPENQASM 3.0;
include "stdgates.inc";

qubit[3] q;
bit[3] c;

// Single-excitation seed.
x q[0];

// Spread amplitude symmetrically. The angle ratios are chosen so the
// final amplitudes on |001⟩, |010⟩, |100⟩ are equal.
ry(2*1.910633) q[1];   // 2·arccos(√(1/3))
cx q[1], q[0];

ry(2*1.570796) q[2];   // = π — Ry(π) = X up to phase
cx q[2], q[1];
cx q[2], q[0];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
