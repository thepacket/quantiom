// Single first-order Trotter step of the Heisenberg XYZ Hamiltonian on a
// 4-site open chain:
//   H = Σ_<i,j> Jx · X_i X_j + Jy · Y_i Y_j + Jz · Z_i Z_j
// with three nearest-neighbour bonds (0,1), (1,2), (2,3).
//
// Each bond evolves under e^{-i δ (Jx XX + Jy YY + Jz ZZ)} which decomposes
// into the three commuting two-body rotations RXX, RYY, RZZ. The bare RXX,
// RYY, RZZ gates are in the gate palette — no decomposition needed.
//
// Free parameters Jx, Jy, Jz, delta are exposed as sliders. Defaults give
// an antiferromagnetic-like point.

OPENQASM 3.0;
include "stdgates.inc";

input float Jx;
input float Jy;
input float Jz;
input float delta;

qubit[4] q;

// Initial state: Néel order |0101⟩ via X on q[1] and q[3].
x q[1];
x q[3];

// Bond (0,1)
rxx(2 * Jx * delta) q[0], q[1];
ryy(2 * Jy * delta) q[0], q[1];
rzz(2 * Jz * delta) q[0], q[1];

// Bond (1,2)
rxx(2 * Jx * delta) q[1], q[2];
ryy(2 * Jy * delta) q[1], q[2];
rzz(2 * Jz * delta) q[1], q[2];

// Bond (2,3)
rxx(2 * Jx * delta) q[2], q[3];
ryy(2 * Jy * delta) q[2], q[3];
rzz(2 * Jz * delta) q[2], q[3];
