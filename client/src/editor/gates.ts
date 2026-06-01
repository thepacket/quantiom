import type { GateDef, GateCategory } from "./types";

const def = (g: Partial<GateDef> & Pick<GateDef, "id" | "symbol" | "name" | "category">): GateDef => ({
  numControls: 0,
  numTargets: 1,
  numClbits: 0,
  params: [],
  targetGlyph: "box",
  ...g,
});

const theta = { name: "θ", default: "π/2" };
const phi = { name: "φ", default: "0" };
const lambda = { name: "λ", default: "π/2" };
const gamma = { name: "γ", default: "0" };
const beta = { name: "β", default: "π/4" };
const tau = { name: "τ", default: "0" };

export const GATES: GateDef[] = [
  // ─── Identity & Pauli ──────────────────────────────────────────────────
  def({ id: "i", symbol: "I", name: "Identity", category: "identity-pauli", description: "Identity (no-op)." }),
  def({ id: "x", symbol: "X", name: "Pauli-X", category: "identity-pauli", description: "Bit flip. Equivalent to a π rotation about X." }),
  def({ id: "y", symbol: "Y", name: "Pauli-Y", category: "identity-pauli", description: "π rotation about Y." }),
  def({ id: "z", symbol: "Z", name: "Pauli-Z", category: "identity-pauli", description: "Phase flip. π rotation about Z." }),

  // ─── Clifford + T ──────────────────────────────────────────────────────
  def({ id: "h", symbol: "H", name: "Hadamard", category: "clifford-t", description: "Maps |0⟩↔(|0⟩+|1⟩)/√2." }),
  def({ id: "s", symbol: "S", name: "S (√Z)", category: "clifford-t", description: "Phase gate. √Z." }),
  def({ id: "sdg", symbol: "S†", name: "S-dagger", category: "clifford-t", description: "Inverse of S." }),
  def({ id: "sx", symbol: "√X", name: "√X (SX)", category: "clifford-t", description: "Square root of X." }),
  def({ id: "sxdg", symbol: "√X†", name: "√X-dagger", category: "clifford-t", description: "Inverse of √X." }),
  def({ id: "t", symbol: "T", name: "T (√S)", category: "clifford-t", description: "π/4 phase gate. √S." }),
  def({ id: "tdg", symbol: "T†", name: "T-dagger", category: "clifford-t", description: "Inverse of T." }),

  // ─── Phase & Rotation (single-qubit, parameterized) ────────────────────
  def({ id: "p", symbol: "P", name: "Phase", category: "phase-rotation", params: [lambda], description: "Diagonal phase gate diag(1, e^{iλ})." }),
  def({ id: "rx", symbol: "RX", name: "Rotation X", category: "phase-rotation", params: [theta], description: "Rotation by θ about X." }),
  def({ id: "ry", symbol: "RY", name: "Rotation Y", category: "phase-rotation", params: [theta], description: "Rotation by θ about Y." }),
  def({ id: "rz", symbol: "RZ", name: "Rotation Z", category: "phase-rotation", params: [theta], description: "Rotation by θ about Z." }),

  // ─── General U gates ───────────────────────────────────────────────────
  def({ id: "u", symbol: "U", name: "U(θ,φ,λ)", category: "general-u", params: [theta, phi, lambda], description: "Most general single-qubit unitary." }),
  def({ id: "u1", symbol: "U1", name: "U1(λ)", category: "general-u", params: [lambda], description: "Legacy single-param phase. Equivalent to P(λ)." }),
  def({ id: "u2", symbol: "U2", name: "U2(φ,λ)", category: "general-u", params: [phi, lambda], description: "Legacy two-parameter rotation." }),
  def({ id: "u3", symbol: "U3", name: "U3(θ,φ,λ)", category: "general-u", params: [theta, phi, lambda], description: "Legacy U3. Equivalent to U(θ,φ,λ)." }),

  // ─── Two-qubit Clifford ────────────────────────────────────────────────
  def({ id: "cx", symbol: "X", name: "CNOT (CX)", category: "two-qubit-clifford", numControls: 1, targetGlyph: "x-target", description: "Controlled-X. Workhorse two-qubit gate." }),
  def({ id: "cy", symbol: "Y", name: "Controlled-Y", category: "two-qubit-clifford", numControls: 1 }),
  def({ id: "cz", symbol: "Z", name: "Controlled-Z", category: "two-qubit-clifford", numControls: 1 }),
  def({ id: "ch", symbol: "H", name: "Controlled-H", category: "two-qubit-clifford", numControls: 1 }),
  def({ id: "csx", symbol: "√X", name: "Controlled-√X", category: "two-qubit-clifford", numControls: 1 }),
  def({ id: "csxdg", symbol: "√X†", name: "Controlled-√X†", category: "two-qubit-clifford", numControls: 1 }),
  def({ id: "swap", symbol: "SWAP", name: "SWAP", category: "two-qubit-clifford", numTargets: 2, targetGlyph: "swap", description: "Swap two qubits." }),
  def({ id: "iswap", symbol: "iSWAP", name: "iSWAP", category: "two-qubit-clifford", numTargets: 2, targetGlyph: "swap", description: "SWAP with an i phase on |01⟩↔|10⟩." }),
  def({ id: "dcx", symbol: "DCX", name: "DCX", category: "two-qubit-clifford", numTargets: 2, description: "Double-CNOT, two back-to-back CNOTs with swapped roles." }),
  def({ id: "ecr", symbol: "ECR", name: "Echoed cross-resonance", category: "two-qubit-clifford", numTargets: 2, description: "Hardware-native two-qubit gate on some IBM devices." }),

  // ─── Controlled rotations ──────────────────────────────────────────────
  def({ id: "crx", symbol: "RX", name: "Controlled-RX", category: "controlled-rotation", numControls: 1, params: [theta] }),
  def({ id: "cry", symbol: "RY", name: "Controlled-RY", category: "controlled-rotation", numControls: 1, params: [theta] }),
  def({ id: "crz", symbol: "RZ", name: "Controlled-RZ", category: "controlled-rotation", numControls: 1, params: [theta] }),
  def({ id: "cp", symbol: "P", name: "Controlled-Phase", category: "controlled-rotation", numControls: 1, params: [lambda] }),
  def({ id: "cu", symbol: "U", name: "Controlled-U", category: "controlled-rotation", numControls: 1, params: [theta, phi, lambda, gamma], description: "Controlled-U with a global phase γ." }),
  def({ id: "cu1", symbol: "U1", name: "Controlled-U1", category: "controlled-rotation", numControls: 1, params: [lambda] }),
  def({ id: "cu3", symbol: "U3", name: "Controlled-U3", category: "controlled-rotation", numControls: 1, params: [theta, phi, lambda] }),

  // ─── Ising / two-qubit rotations ───────────────────────────────────────
  def({ id: "rxx", symbol: "RXX", name: "RXX (Ising XX)", category: "ising-native", numTargets: 2, params: [theta] }),
  def({ id: "ryy", symbol: "RYY", name: "RYY (Ising YY)", category: "ising-native", numTargets: 2, params: [theta] }),
  def({ id: "rzz", symbol: "RZZ", name: "RZZ (Ising ZZ)", category: "ising-native", numTargets: 2, params: [theta] }),
  def({ id: "rzx", symbol: "RZX", name: "RZX", category: "ising-native", numTargets: 2, params: [theta] }),
  def({ id: "xx_plus_yy", symbol: "XX+YY", name: "XX + YY", category: "ising-native", numTargets: 2, params: [theta, beta] }),
  def({ id: "xx_minus_yy", symbol: "XX−YY", name: "XX − YY", category: "ising-native", numTargets: 2, params: [theta, beta] }),

  // ─── Three-qubit ───────────────────────────────────────────────────────
  def({ id: "ccx", symbol: "X", name: "Toffoli (CCX)", category: "three-qubit", numControls: 2, targetGlyph: "x-target", description: "Doubly-controlled X." }),
  def({ id: "ccz", symbol: "Z", name: "Controlled-CZ (CCZ)", category: "three-qubit", numControls: 2 }),
  def({ id: "cswap", symbol: "SWAP", name: "Fredkin (CSWAP)", category: "three-qubit", numControls: 1, numTargets: 2, targetGlyph: "swap" }),
  def({ id: "rccx", symbol: "X*", name: "Relative-phase Toffoli", category: "three-qubit", numControls: 2, targetGlyph: "x-target", description: "Simplified Toffoli up to relative phase." }),
  def({ id: "rcccx", symbol: "X*", name: "Relative-phase C3X", category: "three-qubit", numControls: 3, targetGlyph: "x-target" }),

  // ─── Multi-controlled ──────────────────────────────────────────────────
  def({ id: "c3x", symbol: "X", name: "C3X", category: "multi-controlled", numControls: 3, targetGlyph: "x-target" }),
  def({ id: "c4x", symbol: "X", name: "C4X", category: "multi-controlled", numControls: 4, targetGlyph: "x-target" }),
  def({ id: "mcx", symbol: "X", name: "MCX (n-controlled X)", category: "multi-controlled", numControls: 2, targetGlyph: "x-target", variableControls: true, description: "Multi-controlled X with a user-chosen number of controls." }),
  def({ id: "mcp", symbol: "P", name: "MCP (n-controlled Phase)", category: "multi-controlled", numControls: 2, params: [lambda], variableControls: true }),
  def({ id: "mcu", symbol: "U", name: "MCU (n-controlled U)", category: "multi-controlled", numControls: 2, params: [theta, phi, lambda], variableControls: true }),

  // ─── State preparation ─────────────────────────────────────────────────
  def({ id: "init0", symbol: "|0⟩", name: "Prepare |0⟩", category: "state-prep", targetGlyph: "state" }),
  def({ id: "init1", symbol: "|1⟩", name: "Prepare |1⟩", category: "state-prep", targetGlyph: "state" }),
  def({ id: "initplus", symbol: "|+⟩", name: "Prepare |+⟩", category: "state-prep", targetGlyph: "state" }),
  def({ id: "initminus", symbol: "|−⟩", name: "Prepare |−⟩", category: "state-prep", targetGlyph: "state" }),
  def({ id: "initiplus", symbol: "|i⟩", name: "Prepare |+i⟩", category: "state-prep", targetGlyph: "state" }),
  def({ id: "initiminus", symbol: "|−i⟩", name: "Prepare |−i⟩", category: "state-prep", targetGlyph: "state" }),
  def({ id: "initialize", symbol: "Init", name: "Initialize (arbitrary)", category: "state-prep", params: [{ name: "state", default: "|0⟩" }], description: "Initialize to an arbitrary symbolic state." }),

  // ─── Non-unitary ───────────────────────────────────────────────────────
  def({ id: "measure", symbol: "M", name: "Measure (Z basis)", category: "non-unitary", numClbits: 1, targetGlyph: "measure" }),
  def({ id: "measure_x", symbol: "Mx", name: "Measure X basis", category: "non-unitary", numClbits: 1, targetGlyph: "measure" }),
  def({ id: "measure_y", symbol: "My", name: "Measure Y basis", category: "non-unitary", numClbits: 1, targetGlyph: "measure" }),
  def({ id: "reset", symbol: "|0⟩", name: "Reset", category: "non-unitary", targetGlyph: "reset", description: "Non-unitary reset to |0⟩." }),

  // ─── Control flow ──────────────────────────────────────────────────────
  def({ id: "if", symbol: "if", name: "If (classical condition)", category: "control-flow", params: [{ name: "condition", default: "c == 1" }], description: "Execute the body only if a classical condition holds." }),
  def({ id: "switch", symbol: "sw", name: "Switch", category: "control-flow", params: [{ name: "selector", default: "c" }] }),
  def({ id: "while", symbol: "wh", name: "While", category: "control-flow", params: [{ name: "condition", default: "c == 1" }] }),
  def({ id: "box", symbol: "□", name: "Box (subroutine)", category: "control-flow", description: "A reusable named circuit block." }),

  // ─── Markers ───────────────────────────────────────────────────────────
  def({ id: "barrier", symbol: "‖", name: "Barrier", category: "marker", numTargets: 1, targetGlyph: "barrier", description: "Optimization barrier; gates don't commute across it." }),
  def({ id: "delay", symbol: "τ", name: "Delay", category: "marker", numTargets: 1, params: [tau], targetGlyph: "delay" }),
];

export const GATES_BY_ID: Record<string, GateDef> = Object.fromEntries(GATES.map((g) => [g.id, g]));

export const CATEGORY_ORDER: GateCategory[] = [
  "identity-pauli",
  "clifford-t",
  "phase-rotation",
  "general-u",
  "two-qubit-clifford",
  "controlled-rotation",
  "ising-native",
  "three-qubit",
  "multi-controlled",
  "state-prep",
  "non-unitary",
  "control-flow",
  "marker",
];

export const CATEGORY_LABELS: Record<GateCategory, string> = {
  "identity-pauli": "Identity & Pauli",
  "clifford-t": "Clifford + T",
  "phase-rotation": "Phase & Rotation",
  "general-u": "General U",
  "two-qubit-clifford": "Two-qubit Clifford",
  "controlled-rotation": "Controlled rotations",
  "ising-native": "Ising / native",
  "three-qubit": "Three-qubit",
  "multi-controlled": "Multi-controlled",
  "state-prep": "State preparation",
  "non-unitary": "Non-unitary",
  "control-flow": "Control flow",
  marker: "Markers",
};

export function totalQubits(g: GateDef): number {
  return g.numControls + g.numTargets;
}
