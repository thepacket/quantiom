// GHZ-state Ramsey metrology — Heisenberg-limited phase estimation.
//
// An N-qubit GHZ state accumulates phase N times faster than a single
// qubit under a collective Z rotation, which is the resource behind
// Heisenberg-limited sensing (precision ∝ 1/N instead of the standard
// quantum limit 1/√N). This circuit runs the full interferometer for
// N = 3: prepare GHZ, imprint the phase, disentangle, and read out.
//
// The sequence:
//   1. Prepare |GHZ₃⟩ = (|000⟩ + |111⟩)/√2.
//   2. Apply the signal Rz(φ) to every qubit. The GHZ branches pick up a
//      relative phase 3φ (each of the three qubits contributes φ), versus
//      just φ for a lone qubit.
//   3. Run the preparation in reverse (the inverse GHZ circuit) to fold
//      that collective phase back onto qubit 0.
//   4. Measuring qubit 0 then gives P(0) = cos²(3φ/2): the fringes
//      oscillate THREE times faster in φ than a single-qubit Ramsey
//      experiment — that is the metrological gain.
//
// How to explore in Quantiom:
//   • φ (phi) is a free symbol. Open the Probabilities panel and drive φ
//     with the t-clock: |000⟩ ↔ |001⟩ oscillate at frequency 3φ. Compare
//     against the single-qubit Ramsey "thermometer" example, whose
//     fringe runs at φ — same sweep, one-third the speed.
//   • The Bloch panel shows qubit 0 tracing the readout meridian while
//     qubits 1–2 return to the poles after the un-prep.
//   • Swap the 3-qubit GHZ for the 8- or 12-qubit GHZ examples to watch
//     the fringe frequency scale with N.

OPENQASM 3.0;
include "stdgates.inc";
// qubit_names: probe0, probe1, probe2

qubit[3] q;
bit[1] c;

// ── Prepare GHZ₃ ──────────────────────────────────────────────────────
h q[0];
cx q[0], q[1];
cx q[0], q[2];

// ── Imprint the phase: collective Rz(φ) → relative phase 3φ ────────────
// note: each qubit accrues φ; the GHZ branches differ by 3φ
rz(phi) q[0];
rz(phi) q[1];
rz(phi) q[2];

// ── Disentangle (inverse GHZ prep) ────────────────────────────────────
cx q[0], q[2];
cx q[0], q[1];
h q[0];

// ── Read out qubit 0: P(0) = cos²(3φ/2) ───────────────────────────────
c[0] = measure q[0];
