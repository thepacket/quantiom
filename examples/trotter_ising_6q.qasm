// Transverse-field Ising chain on 6 spins via 4 Trotter steps.
//
//   H = −J Σ Z_i Z_{i+1} − h Σ X_i,  with J = 1, h = 0.5, time step
//   δ = t/4.
//
// Six qubits × 5 RZZ couplings per step × 4 steps + 6 RX per step × 4
// steps = ~70 parameterized gates. The Bloch spheres show the quench
// dynamics rolling out from the |+⟩⊗⁶ initial state.

OPENQASM 3.0;
include "stdgates.inc";

input float t;

qubit[6] q;

h q[0]; h q[1]; h q[2]; h q[3]; h q[4]; h q[5];

// Step 1
rzz(t/4) q[0], q[1]; rzz(t/4) q[1], q[2]; rzz(t/4) q[2], q[3];
rzz(t/4) q[3], q[4]; rzz(t/4) q[4], q[5];
rx(t/8) q[0]; rx(t/8) q[1]; rx(t/8) q[2]; rx(t/8) q[3]; rx(t/8) q[4]; rx(t/8) q[5];

// Step 2
rzz(t/4) q[0], q[1]; rzz(t/4) q[1], q[2]; rzz(t/4) q[2], q[3];
rzz(t/4) q[3], q[4]; rzz(t/4) q[4], q[5];
rx(t/8) q[0]; rx(t/8) q[1]; rx(t/8) q[2]; rx(t/8) q[3]; rx(t/8) q[4]; rx(t/8) q[5];

// Step 3
rzz(t/4) q[0], q[1]; rzz(t/4) q[1], q[2]; rzz(t/4) q[2], q[3];
rzz(t/4) q[3], q[4]; rzz(t/4) q[4], q[5];
rx(t/8) q[0]; rx(t/8) q[1]; rx(t/8) q[2]; rx(t/8) q[3]; rx(t/8) q[4]; rx(t/8) q[5];

// Step 4
rzz(t/4) q[0], q[1]; rzz(t/4) q[1], q[2]; rzz(t/4) q[2], q[3];
rzz(t/4) q[3], q[4]; rzz(t/4) q[4], q[5];
rx(t/8) q[0]; rx(t/8) q[1]; rx(t/8) q[2]; rx(t/8) q[3]; rx(t/8) q[4]; rx(t/8) q[5];
