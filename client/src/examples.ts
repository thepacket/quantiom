// Bundle the repo-root `examples/*.qasm` files as raw text via Vite's ?raw import.
// Vite's fs.allow is configured in vite.config.ts to permit traversal above the
// client root.

import bell from "../../examples/bell.qasm?raw";
import ghz from "../../examples/ghz.qasm?raw";
import wState from "../../examples/w_state.qasm?raw";
import bv from "../../examples/bernstein_vazirani.qasm?raw";
import dj from "../../examples/deutsch_jozsa.qasm?raw";
import grover from "../../examples/grover_2q.qasm?raw";
import qft from "../../examples/qft_3q.qasm?raw";
import teleport from "../../examples/teleportation.qasm?raw";
import kickback from "../../examples/phase_kickback.qasm?raw";
import vqe from "../../examples/variational_ansatz.qasm?raw";
import animated from "../../examples/animated_rabi_larmor.qasm?raw";
import superdense from "../../examples/superdense_coding.qasm?raw";
import chsh from "../../examples/chsh_test.qasm?raw";
import qpe from "../../examples/quantum_phase_estimation.qasm?raw";
import iqft from "../../examples/inverse_qft_3q.qasm?raw";
import halfAdder from "../../examples/half_adder.qasm?raw";
import bitFlip from "../../examples/bit_flip_code.qasm?raw";
import qaoa from "../../examples/qaoa_maxcut_triangle.qasm?raw";
import cluster from "../../examples/cluster_state_4q.qasm?raw";
import coinFlip from "../../examples/quantum_coin_flip.qasm?raw";
import hadamard3 from "../../examples/hadamard_transform_3q.qasm?raw";

export type Example = { id: string; label: string; qasm: string };

export type ExampleCategory = { label: string; items: Example[] };

export const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    label: "Intro",
    items: [
      { id: "coin-flip", label: "Quantum coin flip (1q)", qasm: coinFlip },
      { id: "hadamard-3", label: "Walsh–Hadamard transform (3q)", qasm: hadamard3 },
    ],
  },
  {
    label: "Entanglement",
    items: [
      { id: "bell", label: "Bell state (2q)", qasm: bell },
      { id: "ghz", label: "GHZ state (3q)", qasm: ghz },
      { id: "w_state", label: "W state (3q)", qasm: wState },
      { id: "cluster", label: "Linear cluster (4q)", qasm: cluster },
    ],
  },
  {
    label: "Protocols",
    items: [
      { id: "teleport", label: "Quantum teleportation (3q)", qasm: teleport },
      { id: "superdense", label: "Superdense coding (2q)", qasm: superdense },
      { id: "kickback", label: "Phase kickback (2q)", qasm: kickback },
      { id: "chsh", label: "CHSH inequality test (2q)", qasm: chsh },
    ],
  },
  {
    label: "Algorithms",
    items: [
      { id: "bv", label: "Bernstein–Vazirani (4q)", qasm: bv },
      { id: "dj", label: "Deutsch–Jozsa (4q)", qasm: dj },
      { id: "grover", label: "Grover, 1 iter (2q)", qasm: grover },
      { id: "qft", label: "QFT (3q)", qasm: qft },
      { id: "iqft", label: "Inverse QFT (3q)", qasm: iqft },
      { id: "qpe", label: "Quantum phase estimation (4q)", qasm: qpe },
    ],
  },
  {
    label: "Arithmetic & ECC",
    items: [
      { id: "half-adder", label: "Half adder (4q)", qasm: halfAdder },
      { id: "bit-flip", label: "Bit-flip code (3q)", qasm: bitFlip },
    ],
  },
  {
    label: "Variational",
    items: [
      { id: "qaoa", label: "QAOA MaxCut triangle (3q)", qasm: qaoa },
      { id: "vqe", label: "Hardware-efficient ansatz (4q)", qasm: vqe },
    ],
  },
  {
    label: "Animation",
    items: [
      { id: "animated", label: "Rabi + Larmor (2q, drives t)", qasm: animated },
    ],
  },
];

/** Flat list — kept for any caller that doesn't care about grouping. */
export const EXAMPLES: Example[] = EXAMPLE_CATEGORIES.flatMap((c) => c.items);
