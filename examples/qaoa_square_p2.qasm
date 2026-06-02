OPENQASM 3.0;
include "stdgates.inc";

input float gamma_0;
input float beta_0;
input float gamma_1;
input float beta_1;

qubit[4] q;

// QAOA depth-2 on a square graph (q0-q1, q1-q2, q2-q3, q3-q0).
// Standard MaxCut alternating cost / mixer Hamiltonians.

// Initial superposition.
h q[0];
h q[1];
h q[2];
h q[3];

barrier q[0], q[1], q[2], q[3];

// Layer 0: cost U_C(γ_0) — ZZ on each edge.
rzz(2*gamma_0) q[0], q[1];
rzz(2*gamma_0) q[1], q[2];
rzz(2*gamma_0) q[2], q[3];
rzz(2*gamma_0) q[3], q[0];

// Mixer U_B(β_0) — RX on every qubit.
rx(2*beta_0) q[0];
rx(2*beta_0) q[1];
rx(2*beta_0) q[2];
rx(2*beta_0) q[3];

barrier q[0], q[1], q[2], q[3];

// Layer 1: cost U_C(γ_1).
rzz(2*gamma_1) q[0], q[1];
rzz(2*gamma_1) q[1], q[2];
rzz(2*gamma_1) q[2], q[3];
rzz(2*gamma_1) q[3], q[0];

// Mixer U_B(β_1).
rx(2*beta_1) q[0];
rx(2*beta_1) q[1];
rx(2*beta_1) q[2];
rx(2*beta_1) q[3];
