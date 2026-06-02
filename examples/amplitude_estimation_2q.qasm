// Amplitude estimation (Brassard, Høyer, Mosca, Tapp 2002) — recover
// the amplitude a of a "good" state in a superposition prepared by an
// oracle A, with √M-fewer queries than classical sampling.
//
// Setup: A|0⟩ = √(1−a)|ψ_bad⟩ + √a|ψ_good⟩. Standard sampling needs
// O(1/ε²) shots for precision ε; amplitude estimation needs O(1/ε) by
// using Grover's diffusion + QPE to estimate a quadratically faster.
//
// Below: a tiny 2-qubit demo with one estimation qubit and one
// "good-state indicator" qubit. The oracle A is a Ry(2θ), making
// a = sin²(θ). We sweep θ via the Parameters panel slider so you can
// watch the estimation track the true amplitude.
//
// For real amplitude estimation, you'd use M counting qubits plus
// repeated applications of the Grover operator Q = A·S₀·A†·S_good.
// This minimal version is the conceptual seed.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;       // q[0] counting ancilla, q[1] Grover register
bit[1] c;

// Oracle A: produce √(1−a)|0⟩ + √a|1⟩ with a = sin²(theta).
ry(2*theta) q[1];

// One Hadamard test step toward estimation (real of ⟨ψ|Q|ψ⟩ ≈ 1 − 2a).
h q[0];
cz q[0], q[1];
h q[0];

c[0] = measure q[0];
