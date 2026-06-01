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
import sonoOctave from "../../examples/sono_octave.qasm?raw";
import sonoPhase from "../../examples/sono_phase_slide.qasm?raw";
import sonoTremolo from "../../examples/sono_tremolo.qasm?raw";
import sonoSaw from "../../examples/sono_sawtooth.qasm?raw";
import sonoBell from "../../examples/sono_bell_chord.qasm?raw";
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

export type Example = { id: string; label: string; qasm: string };

export type ExampleCategory = { label: string; items: Example[] };

export const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    label: "Intro",
    items: [
      { id: "coin-flip", label: "Quantum coin flip (1q)", qasm: coinFlip },
      { id: "hadamard-3", label: "Walsh–Hadamard transform (3q)", qasm: hadamard3 },
      { id: "magic-state", label: "Magic state |H⟩ = T|+⟩ (1q)", qasm: magicState },
    ],
  },
  {
    label: "Entanglement",
    items: [
      { id: "bell", label: "Bell state (2q)", qasm: bell },
      { id: "ghz", label: "GHZ state (3q)", qasm: ghz },
      { id: "ghz-8", label: "GHZ state (8q)", qasm: ghz8 },
      { id: "ghz-12", label: "GHZ state (12q, 4096 amps)", qasm: ghz12 },
      { id: "ghz-16", label: "GHZ state (16q, 65k amps)", qasm: ghz16 },
      { id: "w_state", label: "W state (3q)", qasm: wState },
      { id: "w-state-4", label: "W state (4q)", qasm: wState4 },
      { id: "cluster", label: "Linear cluster (4q)", qasm: cluster },
      { id: "cat-phase", label: "Phased Schrödinger cat (3q)", qasm: catPhase },
    ],
  },
  {
    label: "Protocols",
    items: [
      { id: "teleport", label: "Quantum teleportation (3q)", qasm: teleport },
      { id: "ent-swap", label: "Entanglement swapping (4q)", qasm: entSwap },
      { id: "superdense", label: "Superdense coding (2q)", qasm: superdense },
      { id: "kickback", label: "Phase kickback (2q)", qasm: kickback },
      { id: "chsh", label: "CHSH inequality test (2q)", qasm: chsh },
      { id: "bb84", label: "BB84 round (1q)", qasm: bb84 },
    ],
  },
  {
    label: "Algorithms",
    items: [
      { id: "deutsch-1", label: "Deutsch, 1-bit (2q)", qasm: deutsch1 },
      { id: "dj", label: "Deutsch–Jozsa (4q)", qasm: dj },
      { id: "dj-6", label: "Deutsch–Jozsa (6q)", qasm: dj6 },
      { id: "bv", label: "Bernstein–Vazirani (4q)", qasm: bv },
      { id: "bv-6", label: "Bernstein–Vazirani (6q)", qasm: bv6 },
      { id: "bv-8", label: "Bernstein–Vazirani (8q)", qasm: bv8 },
      { id: "simon-2", label: "Simon, s = 11 (4q)", qasm: simon2 },
      { id: "grover", label: "Grover, 1 iter (2q)", qasm: grover },
      { id: "grover-3q", label: "Grover, 2 iters (3q)", qasm: grover3 },
      { id: "grover-4q", label: "Grover, 3 iters (4q)", qasm: grover4 },
      { id: "grover-5q", label: "Grover, 4 iters (5q)", qasm: grover5 },
      { id: "amp-amp", label: "Amplitude amplification (3q, 2 marked)", qasm: amplitudeAmp },
      { id: "qft", label: "QFT (3q)", qasm: qft },
      { id: "qft-5", label: "QFT (5q)", qasm: qft5 },
      { id: "qft-8", label: "QFT (8q)", qasm: qft8 },
      { id: "iqft", label: "Inverse QFT (3q)", qasm: iqft },
      { id: "qpe", label: "Quantum phase estimation (4q)", qasm: qpe },
      { id: "had-8", label: "Hadamard transform (8q)", qasm: hadamard8 },
      { id: "had-12", label: "Hadamard transform (12q)", qasm: hadamard12 },
      { id: "had-16", label: "Hadamard transform (16q)", qasm: hadamard16 },
      { id: "draper", label: "Draper adder, +1 (2q)", qasm: draperAdder },
      { id: "qwalk", label: "Quantum walk step (3q)", qasm: qWalk },
      { id: "qwalk-8", label: "Quantum walk, 8 steps (3q)", qasm: qWalk8 },
    ],
  },
  {
    label: "Arithmetic & ECC",
    items: [
      { id: "half-adder", label: "Half adder (4q)", qasm: halfAdder },
      { id: "cuccaro", label: "Cuccaro ripple-carry, 2-bit (6q)", qasm: cuccaro },
      { id: "cuccaro-3", label: "Cuccaro ripple-carry, 3-bit (8q)", qasm: cuccaro3 },
      { id: "bit-flip", label: "Bit-flip code (3q)", qasm: bitFlip },
      { id: "steane", label: "Steane [[7,1,3]] encoder (7q)", qasm: steane },
      { id: "five-code", label: "5-qubit perfect code encoder (5q)", qasm: fiveCode },
    ],
  },
  {
    label: "Hamiltonian dynamics",
    items: [
      { id: "trotter-ising-6", label: "Ising Trotter, 6-spin chain", qasm: trotterIsing6 },
      { id: "trotter-xy-4", label: "XY model Trotter (4q)", qasm: trotterXy4 },
    ],
  },
  {
    label: "Decompositions",
    items: [
      { id: "toffoli-decomp", label: "Toffoli → 1- and 2-qubit gates (3q)", qasm: toffoliDecomp },
    ],
  },
  {
    label: "Variational",
    items: [
      { id: "qaoa", label: "QAOA MaxCut triangle (3q)", qasm: qaoa },
      { id: "qaoa-kite", label: "QAOA MaxCut kite (4q)", qasm: qaoaKite },
      { id: "vqe", label: "Hardware-efficient ansatz, 2 layers (4q)", qasm: vqe },
      { id: "vqe-6", label: "Hardware-efficient ansatz, 6 layers (4q)", qasm: vqeHwe6 },
    ],
  },
  {
    label: "Animation",
    items: [
      { id: "animated", label: "Rabi + Larmor (2q)", qasm: animated },
      { id: "anim-qft", label: "QFT of evolving state (3q)", qasm: animQft },
      { id: "anim-qft-5", label: "QFT of evolving state (5q)", qasm: qftAnim5 },
      { id: "anim-fountain", label: "Phase fountain (4q)", qasm: animFountain },
      { id: "anim-ising", label: "Ising Trotter (4q, ~25 gates)", qasm: animIsing },
      { id: "anim-cascade", label: "Multi-frequency cascade (5q)", qasm: animCascade },
      { id: "anim-swirl", label: "Dense swirl (6q, ~35 gates)", qasm: animSwirl },
      { id: "anim-swirl-8", label: "Deep swirl (8q, ~100 gates)", qasm: animSwirl8 },
    ],
  },
  {
    label: "Sonorizer",
    items: [
      { id: "sono-octave", label: "Pure octave (1q)", qasm: sonoOctave },
      { id: "sono-tremolo", label: "Tremolo, RY(t) (1q)", qasm: sonoTremolo },
      { id: "sono-phase", label: "Animated phase, H + RZ(t) (1q)", qasm: sonoPhase },
      { id: "sono-bell", label: "Bell chord (2q)", qasm: sonoBell },
      { id: "sono-saw", label: "Sawtooth-like, H⊗⁴ (4q)", qasm: sonoSaw },
    ],
  },
];

/** Flat list — kept for any caller that doesn't care about grouping. */
export const EXAMPLES: Example[] = EXAMPLE_CATEGORIES.flatMap((c) => c.items);
