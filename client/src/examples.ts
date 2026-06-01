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

export const EXAMPLES: Example[] = [
  { id: "bell", label: "Bell state", qasm: bell },
  { id: "ghz", label: "GHZ state (3q)", qasm: ghz },
  { id: "w_state", label: "W state (3q)", qasm: wState },
  { id: "bv", label: "Bernstein–Vazirani", qasm: bv },
  { id: "dj", label: "Deutsch–Jozsa", qasm: dj },
  { id: "grover", label: "Grover (2q, 1 iter)", qasm: grover },
  { id: "qft", label: "QFT (3q)", qasm: qft },
  { id: "teleport", label: "Teleportation", qasm: teleport },
  { id: "kickback", label: "Phase kickback", qasm: kickback },
  { id: "vqe", label: "Variational ansatz", qasm: vqe },
  { id: "animated", label: "Animated (Rabi + Larmor)", qasm: animated },
  { id: "coin-flip", label: "Quantum coin flip", qasm: coinFlip },
  { id: "hadamard-3", label: "Walsh–Hadamard transform (3q)", qasm: hadamard3 },
  { id: "superdense", label: "Superdense coding", qasm: superdense },
  { id: "chsh", label: "CHSH test", qasm: chsh },
  { id: "iqft", label: "Inverse QFT (3q)", qasm: iqft },
  { id: "qpe", label: "Quantum phase estimation", qasm: qpe },
  { id: "half-adder", label: "Half adder", qasm: halfAdder },
  { id: "bit-flip", label: "Bit-flip error code", qasm: bitFlip },
  { id: "qaoa", label: "QAOA MaxCut (triangle)", qasm: qaoa },
  { id: "cluster", label: "Cluster state (4q linear)", qasm: cluster },
];
