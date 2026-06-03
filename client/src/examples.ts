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
import grover3 from "../../examples/grover_3q.qasm?raw";
import toffoliDecomp from "../../examples/toffoli_decomposition.qasm?raw";
import entSwap from "../../examples/entanglement_swap.qasm?raw";
import bb84 from "../../examples/bb84_round.qasm?raw";
import draperAdder from "../../examples/draper_adder.qasm?raw";
import qWalk from "../../examples/quantum_walk_step.qasm?raw";
import magicState from "../../examples/magic_state.qasm?raw";
import deutsch1 from "../../examples/deutsch_1bit.qasm?raw";
import simon2 from "../../examples/simon_2bit.qasm?raw";
import catPhase from "../../examples/schrodinger_cat_phase.qasm?raw";
import cuccaro from "../../examples/cuccaro_adder_2bit.qasm?raw";
import steane from "../../examples/steane_encode_logical_zero.qasm?raw";
import animCascade from "../../examples/anim_cascade_5q.qasm?raw";
import animIsing from "../../examples/anim_ising_trotter.qasm?raw";
import animFountain from "../../examples/anim_phase_fountain.qasm?raw";
import animQft from "../../examples/anim_qft_state.qasm?raw";
import animSwirl from "../../examples/anim_swirl_6q.qasm?raw";
import ghz8 from "../../examples/ghz_8q.qasm?raw";
import ghz12 from "../../examples/ghz_12q.qasm?raw";
import ghz16 from "../../examples/ghz_16q.qasm?raw";
import hadamard8 from "../../examples/hadamard_8q.qasm?raw";
import hadamard12 from "../../examples/hadamard_12q.qasm?raw";
import hadamard16 from "../../examples/hadamard_16q.qasm?raw";
import wState4 from "../../examples/w_state_4q.qasm?raw";
import qft5 from "../../examples/qft_5q.qasm?raw";
import qft8 from "../../examples/qft_8q.qasm?raw";
import grover4 from "../../examples/grover_4q.qasm?raw";
import grover5 from "../../examples/grover_5q.qasm?raw";
import bv6 from "../../examples/bv_6q.qasm?raw";
import bv8 from "../../examples/bv_8q.qasm?raw";
import dj6 from "../../examples/dj_6q.qasm?raw";
import vqeHwe6 from "../../examples/vqe_hwe_6layer_4q.qasm?raw";
import animSwirl8 from "../../examples/anim_deep_swirl_8q.qasm?raw";
import trotterIsing6 from "../../examples/trotter_ising_6q.qasm?raw";
import trotterXy4 from "../../examples/trotter_xy_4q.qasm?raw";
import fiveCode from "../../examples/five_qubit_code_encoder.qasm?raw";
import cuccaro3 from "../../examples/cuccaro_adder_3bit.qasm?raw";
import qaoaKite from "../../examples/qaoa_kite_4q.qasm?raw";
import qftAnim5 from "../../examples/qft_animated_5q.qasm?raw";
import qWalk8 from "../../examples/quantum_walk_8steps_3q.qasm?raw";
import amplitudeAmp from "../../examples/amplitude_amplification_3q.qasm?raw";
import realAmplitudes4 from "../../examples/ansatz_real_amplitudes_4q.qasm?raw";
import uccsdLite4 from "../../examples/ansatz_uccsd_lite_4q.qasm?raw";
import qaoaSquareP2 from "../../examples/qaoa_square_p2.qasm?raw";
import teleportDynamic from "../../examples/teleport_dynamic.qasm?raw";
import repeatUntilSuccess from "../../examples/repeat_until_success.qasm?raw";
import surfacePlaquette from "../../examples/surface_code_plaquette.qasm?raw";
import heisenbergXyz4 from "../../examples/heisenberg_xyz_trotter_4q.qasm?raw";
import lihJw4 from "../../examples/lih_jw_trotter_4q.qasm?raw";
import swapTest from "../../examples/swap_test.qasm?raw";
import hadamardTest from "../../examples/hadamard_test.qasm?raw";
import bellMeasurement from "../../examples/bell_measurement.qasm?raw";
import phaseFlipCode from "../../examples/phase_flip_code.qasm?raw";
import merminGhzTest from "../../examples/mermin_ghz_test.qasm?raw";
import iterativeQpe from "../../examples/iterative_qpe.qasm?raw";
import vqeH2Minimal from "../../examples/vqe_h2_minimal.qasm?raw";
import trotterHeisenberg2 from "../../examples/trotter_heisenberg_2q.qasm?raw";
import gateTeleportation from "../../examples/gate_teleportation.qasm?raw";
import dickeState3 from "../../examples/dicke_state_3q.qasm?raw";
import stabilizerMeas from "../../examples/stabilizer_measurement.qasm?raw";
import shor9qEncoder from "../../examples/shor_9q_encoder.qasm?raw";
import quantumThermometer from "../../examples/quantum_thermometer.qasm?raw";
import noCloningWitness from "../../examples/no_cloning_witness.qasm?raw";
import ampEst2 from "../../examples/amplitude_estimation_2q.qasm?raw";
import qWalkCycle from "../../examples/quantum_random_walk_cycle.qasm?raw";
import qftAdd4 from "../../examples/quantum_fourier_addition_4q.qasm?raw";
import surfaceLogical from "../../examples/surface_code_logical_ops.qasm?raw";
import qaoa3sat from "../../examples/qaoa_3sat_3var.qasm?raw";
import qspPrimer from "../../examples/qsp_primer_1q.qasm?raw";
import kickedIsing from "../../examples/kicked_ising_floquet_4q.qasm?raw";
import ghzMetrology from "../../examples/ghz_metrology_3q.qasm?raw";
import shorPeriod from "../../examples/shor_period_finding_15.qasm?raw";

export type Example = { id: string; label: string; qasm: string; description: string };

export type ExampleCategory = { label: string; items: Example[] };

/**
 * Pull the leading `//` comment block out of a QASM file and clean it up
 * for display as a tooltip. Stops at the first non-comment line (typically
 * `OPENQASM 3.0;`). Strips the `// ` prefix and collapses interior blank
 * `//` lines to single newlines.
 *
 * Used to surface each example's pedagogical header as a hover tooltip on
 * the example-picker entry — so the user can scan the library by what
 * each circuit teaches, not just by gate count or qubit count.
 */
function extractDescription(qasm: string): string {
  const lines = qasm.split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trimStart();
    if (line.startsWith("//")) {
      out.push(line.replace(/^\/\/\s?/, ""));
    } else if (line === "") {
      // Blank line — either intra-comment (keep as paragraph break) or
      // post-comment (we'll exit on the next non-comment).
      if (out.length > 0) out.push("");
    } else {
      // First real code line — stop scanning.
      break;
    }
  }
  // Drop trailing blanks.
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n").trim();
}

function ex(id: string, label: string, qasm: string): Example {
  return { id, label, qasm, description: extractDescription(qasm) };
}

export const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    label: "Intro",
    items: [
      ex("coin-flip", "Quantum coin flip (1q)", coinFlip),
      ex("hadamard-3", "Walsh–Hadamard transform (3q)", hadamard3),
      ex("magic-state", "Magic state |H⟩ = T|+⟩ (1q)", magicState),
    ],
  },
  {
    label: "Entanglement",
    items: [
      ex("bell", "Bell state (2q)", bell),
      ex("ghz", "GHZ state (3q)", ghz),
      ex("ghz-8", "GHZ state (8q)", ghz8),
      ex("ghz-12", "GHZ state (12q, 4096 amps)", ghz12),
      ex("ghz-16", "GHZ state (16q, 65k amps)", ghz16),
      ex("w_state", "W state (3q)", wState),
      ex("w-state-4", "W state (4q)", wState4),
      ex("cluster", "Linear cluster (4q)", cluster),
      ex("cat-phase", "Phased Schrödinger cat (3q)", catPhase),
    ],
  },
  {
    label: "Protocols",
    items: [
      ex("teleport", "Quantum teleportation (3q)", teleport),
      ex("teleport-dynamic", "Teleportation with classical feedback (3q)", teleportDynamic),
      ex("repeat-until-success", "Repeat-until-success template (2q)", repeatUntilSuccess),
      ex("ent-swap", "Entanglement swapping (4q)", entSwap),
      ex("superdense", "Superdense coding (2q)", superdense),
      ex("kickback", "Phase kickback (2q)", kickback),
      ex("chsh", "CHSH inequality test (2q)", chsh),
      ex("mermin-ghz", "Mermin GHZ inequality (3q)", merminGhzTest),
      ex("bb84", "BB84 round (1q)", bb84),
      ex("gate-teleport", "Gate teleportation: T via magic state (2q)", gateTeleportation),
      ex("bell-meas", "Bell measurement (2q)", bellMeasurement),
      ex("stab-meas", "Stabilizer Z⊗Z measurement (3q)", stabilizerMeas),
      ex("no-cloning", "No-cloning witness (2q)", noCloningWitness),
    ],
  },
  {
    label: "Algorithms",
    items: [
      ex("deutsch-1", "Deutsch, 1-bit (2q)", deutsch1),
      ex("dj", "Deutsch–Jozsa (4q)", dj),
      ex("dj-6", "Deutsch–Jozsa (6q)", dj6),
      ex("bv", "Bernstein–Vazirani (4q)", bv),
      ex("bv-6", "Bernstein–Vazirani (6q)", bv6),
      ex("bv-8", "Bernstein–Vazirani (8q)", bv8),
      ex("simon-2", "Simon, s = 11 (4q)", simon2),
      ex("grover", "Grover, 1 iter (2q)", grover),
      ex("grover-3q", "Grover, 2 iters (3q)", grover3),
      ex("grover-4q", "Grover, 3 iters (4q)", grover4),
      ex("grover-5q", "Grover, 4 iters (5q)", grover5),
      ex("amp-amp", "Amplitude amplification (3q, 2 marked)", amplitudeAmp),
      ex("qft", "QFT (3q)", qft),
      ex("qft-5", "QFT (5q)", qft5),
      ex("qft-8", "QFT (8q)", qft8),
      ex("iqft", "Inverse QFT (3q)", iqft),
      ex("qpe", "Quantum phase estimation (4q)", qpe),
      ex("iterative-qpe", "Iterative QPE, 1-ancilla (2q)", iterativeQpe),
      ex("amp-est-2", "Amplitude estimation seed (2q)", ampEst2),
      ex("qft-add-4", "Draper Fourier addition, 2+2 bit (4q)", qftAdd4),
      ex("swap-test", "SWAP test for state overlap (3q)", swapTest),
      ex("hadamard-test", "Hadamard test for Re⟨ψ|U|ψ⟩ (2q)", hadamardTest),
      ex("qsp-primer", "Quantum signal processing primer (1q)", qspPrimer),
      ex("shor-period", "Shor period-finding, N=15 a=4 (7q)", shorPeriod),
      ex("had-8", "Hadamard transform (8q)", hadamard8),
      ex("had-12", "Hadamard transform (12q)", hadamard12),
      ex("had-16", "Hadamard transform (16q)", hadamard16),
      ex("draper", "Draper adder, +1 (2q)", draperAdder),
      ex("qwalk", "Quantum walk step (3q)", qWalk),
      ex("qwalk-8", "Quantum walk, 8 steps (3q)", qWalk8),
      ex("qwalk-cycle", "Quantum walk on 4-cycle (3q)", qWalkCycle),
    ],
  },
  {
    label: "Arithmetic & ECC",
    items: [
      ex("half-adder", "Half adder (4q)", halfAdder),
      ex("cuccaro", "Cuccaro ripple-carry, 2-bit (6q)", cuccaro),
      ex("cuccaro-3", "Cuccaro ripple-carry, 3-bit (8q)", cuccaro3),
      ex("bit-flip", "Bit-flip code (3q)", bitFlip),
      ex("phase-flip", "Phase-flip code (3q)", phaseFlipCode),
      ex("steane", "Steane [[7,1,3]] encoder (7q)", steane),
      ex("five-code", "5-qubit perfect code encoder (5q)", fiveCode),
      ex("shor-9q", "Shor [[9,1,3]] encoder (9q)", shor9qEncoder),
      ex("surface-plaquette", "Surface code plaquette (6q, XXXX+ZZZZ)", surfacePlaquette),
      ex("surface-logical", "Surface code logical ops, [[4,2,2]] (6q)", surfaceLogical),
    ],
  },
  {
    label: "Hamiltonian dynamics",
    items: [
      ex("trotter-ising-6", "Ising Trotter, 6-spin chain", trotterIsing6),
      ex("trotter-xy-4", "XY model Trotter (4q)", trotterXy4),
      ex("trotter-heisenberg-2", "Heisenberg XXX Trotter (2q)", trotterHeisenberg2),
      ex("heisenberg-xyz-4", "Heisenberg XYZ Trotter step (4q)", heisenbergXyz4),
      ex("lih-jw-4", "LiH (Jordan–Wigner, 4q Trotter step)", lihJw4),
      ex("kicked-ising", "Kicked-Ising Floquet, 4 periods (4q)", kickedIsing),
    ],
  },
  {
    label: "Decompositions",
    items: [
      ex("toffoli-decomp", "Toffoli → 1- and 2-qubit gates (3q)", toffoliDecomp),
    ],
  },
  {
    label: "Variational",
    items: [
      ex("qaoa", "QAOA MaxCut triangle (3q)", qaoa),
      ex("qaoa-kite", "QAOA MaxCut kite (4q)", qaoaKite),
      ex("qaoa-square-p2", "QAOA MaxCut square, depth 2 (4q)", qaoaSquareP2),
      ex("qaoa-3sat", "QAOA MAX-3-SAT, 3 clauses (3q)", qaoa3sat),
      ex("vqe", "Hardware-efficient ansatz, 2 layers (4q)", vqe),
      ex("vqe-6", "Hardware-efficient ansatz, 6 layers (4q)", vqeHwe6),
      ex("real-amps-4", "Real Amplitudes ansatz, 2 layers (4q)", realAmplitudes4),
      ex("uccsd-lite-4", "UCCSD-lite single excitation (4q)", uccsdLite4),
      ex("vqe-h2", "VQE: H₂ minimal ansatz (2q)", vqeH2Minimal),
    ],
  },
  {
    label: "States & sensing",
    items: [
      ex("dicke-3", "Dicke state |D₃¹⟩ (3q)", dickeState3),
      ex("thermometer", "Quantum Ramsey thermometer (1q)", quantumThermometer),
      ex("ghz-metrology", "GHZ Ramsey metrology, Heisenberg scaling (3q)", ghzMetrology),
    ],
  },
  {
    label: "Animation",
    items: [
      ex("animated", "Rabi + Larmor (2q)", animated),
      ex("anim-qft", "QFT of evolving state (3q)", animQft),
      ex("anim-qft-5", "QFT of evolving state (5q)", qftAnim5),
      ex("anim-fountain", "Phase fountain (4q)", animFountain),
      ex("anim-ising", "Ising Trotter (4q, ~25 gates)", animIsing),
      ex("anim-cascade", "Multi-frequency cascade (5q)", animCascade),
      ex("anim-swirl", "Dense swirl (6q, ~35 gates)", animSwirl),
      ex("anim-swirl-8", "Deep swirl (8q, ~100 gates)", animSwirl8),
    ],
  },
];

/** Flat list — kept for any caller that doesn't care about grouping. */
export const EXAMPLES: Example[] = EXAMPLE_CATEGORIES.flatMap((c) => c.items);
