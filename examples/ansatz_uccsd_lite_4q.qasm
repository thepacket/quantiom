OPENQASM 3.0;
include "stdgates.inc";

input float theta;

qubit[4] q;

// UCCSD-lite — a stripped-down Unitary Coupled-Cluster Singles
// Doubles ansatz, the gold-standard variational form for molecular
// ground states.
//
// Full UCCSD applies all single and double fermionic excitations
// e^{T - T†} where T = Σ t_ia (a†_i a_a) + Σ t_ijab (a†_i a†_j a_b a_a).
// On a 4-orbital system that's many parameters and very deep circuits.
// "UCCSD-lite" here implements just ONE single excitation between
// occupied orbital 2 and virtual orbital 0:
//
//     U(θ) = exp(−iθ (a†_0 a_2 − a_2† a_0)) / 2
//
// Under Jordan-Wigner, that exponential becomes a Pauli-string
// rotation Rz(2θ) on a single qubit conjugated by a "CNOT staircase"
// that propagates the JW string parity. The pattern is universal:
// every fermionic excitation lowers to this CNOT-staircase + middle
// rotation form, which is why it shows up in nearly every chemistry
// ansatz from UCCSD to k-UpCCGSD to ADAPT-VQE.
//
// Below: Hartree-Fock reference |1100⟩ on q[0..3], one excitation
// rotation. Slide θ in the Parameter panel to watch the
// |1100⟩ ↔ |0011⟩ amplitudes oscillate (full state interferes within
// the particle-conserving subspace).

// Hartree-Fock reference: spin-up orbitals occupied.
x q[0];
x q[1];

barrier q[0], q[1], q[2], q[3];

// CNOT staircase for Pauli string Z_0 Z_1 Y_2 X_3 (single excitation).
cx q[3], q[2];
cx q[2], q[1];
cx q[1], q[0];

// Ry(θ) on the active qubit.
ry(theta) q[0];

// Undo staircase.
cx q[1], q[0];
cx q[2], q[1];
cx q[3], q[2];
