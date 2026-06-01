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
];
