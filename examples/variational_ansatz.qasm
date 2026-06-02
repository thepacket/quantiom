// Hardware-efficient variational ansatz — the workhorse of NISQ-era
// variational quantum eigensolvers (VQE) and quantum approximate
// optimization (QAOA).
//
// Structure (per layer):
//   1. RY(θ_q) on every qubit — populates the |0⟩/|1⟩ axis.
//   2. RZ(φ_q) on every qubit — adds a phase.
//   3. Ring of CNOTs (q0→q1→q2→q3→q0) — entangling layer.
//
// Two layers, 16 parameters total (8 RY angles + 8 RZ phases). The
// CNOT ring gives every qubit at least two-hop reach to any other
// qubit, so two layers can already prepare highly entangled trial
// wavefunctions over the full 16-dim Hilbert space.
//
// To run a VQE: load this circuit, set up a Hamiltonian in the
// Expectation panel (sum mode), then click "Optimise" — the parameter
// values will be tuned to minimise ⟨H⟩. The Parameter panel shows
// every (θ, φ) as a live slider you can drive manually too.
//
// "Hardware-efficient" because the entangling structure is a single
// linear ring — matches the connectivity of most superconducting
// devices without any SWAP overhead. The trade-off: trainability
// suffers from barren plateaus as depth grows (use the Plateau button
// in the Expectation panel to diagnose).
//
// Reference: Kandala et al. (2017), "Hardware-efficient variational
// quantum eigensolver for small molecules and quantum magnets".

OPENQASM 3.0;
include "stdgates.inc";

input float theta_0;
input float theta_1;
input float theta_2;
input float theta_3;
input float theta_4;
input float theta_5;
input float theta_6;
input float theta_7;
input float phi_0;
input float phi_1;
input float phi_2;
input float phi_3;
input float phi_4;
input float phi_5;
input float phi_6;
input float phi_7;

qubit[4] q;
bit[4] c;

// Layer 1
ry(theta_0) q[0];
ry(theta_1) q[1];
ry(theta_2) q[2];
ry(theta_3) q[3];
rz(phi_0) q[0];
rz(phi_1) q[1];
rz(phi_2) q[2];
rz(phi_3) q[3];

cx q[0], q[1];
cx q[1], q[2];
cx q[2], q[3];
cx q[3], q[0];

// Layer 2
ry(theta_4) q[0];
ry(theta_5) q[1];
ry(theta_6) q[2];
ry(theta_7) q[3];
rz(phi_4) q[0];
rz(phi_5) q[1];
rz(phi_6) q[2];
rz(phi_7) q[3];

cx q[0], q[1];
cx q[1], q[2];
cx q[2], q[3];
cx q[3], q[0];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
