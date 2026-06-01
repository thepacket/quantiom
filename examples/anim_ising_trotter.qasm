// Transverse-field Ising chain dynamics by Trotter decomposition.
//
//   H = − J Σ Z_i Z_{i+1} − h Σ X_i,  here J = 1, h = 0.5.
//
// The evolution e^{−iHt} is approximated by three Trotter steps of size
// δ = t/3, alternating the ZZ interaction layer (RZZ(δ) on neighbours)
// with the transverse field layer (RX(0.5·δ) on each qubit). Starting
// from |+⟩⊗⁴ — an eigenstate of the field but not of the chain — the
// state ripples through the qubits as a quantum quench.
//
// Watch the Bloch vectors precess at different rates; the probability
// distribution starts on a single ridge and broadens.

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[4] q;

// Initial |+⟩⊗⁴.
h q[0];
h q[1];
h q[2];
h q[3];

// ── Trotter step 1 ────────────────────────────────────────────────────
rzz(t/3) q[0], q[1];
rzz(t/3) q[1], q[2];
rzz(t/3) q[2], q[3];

rx(t/6) q[0];
rx(t/6) q[1];
rx(t/6) q[2];
rx(t/6) q[3];

// ── Trotter step 2 ────────────────────────────────────────────────────
rzz(t/3) q[0], q[1];
rzz(t/3) q[1], q[2];
rzz(t/3) q[2], q[3];

rx(t/6) q[0];
rx(t/6) q[1];
rx(t/6) q[2];
rx(t/6) q[3];

// ── Trotter step 3 ────────────────────────────────────────────────────
rzz(t/3) q[0], q[1];
rzz(t/3) q[1], q[2];
rzz(t/3) q[2], q[3];

rx(t/6) q[0];
rx(t/6) q[1];
rx(t/6) q[2];
rx(t/6) q[3];
