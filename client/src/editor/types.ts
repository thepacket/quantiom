export type GateId = string;

export type GateCategory =
  | "identity-pauli"
  | "clifford-t"
  | "phase-rotation"
  | "general-u"
  | "two-qubit-clifford"
  | "controlled-rotation"
  | "ising-native"
  | "three-qubit"
  | "multi-controlled"
  | "state-prep"
  | "non-unitary"
  | "control-flow"
  | "marker";

export type ParamSpec = {
  name: string; // display name, e.g. "θ", "φ", "λ"
  default: string; // symbolic default, e.g. "π/2", "0"
};

/**
 * Visual rendering hint for a target qubit. Different gates draw targets
 * differently: a labeled box (H, X, RX), the CNOT target glyph (⊕), the
 * SWAP × glyph, the measure meter, the reset glyph, etc.
 */
export type TargetGlyph =
  | "box"
  | "x-target" // ⊕ used by CX target
  | "swap" // × glyph
  | "measure" // meter readout
  | "reset" // |0⟩ readout
  | "state" // initial state ket
  | "barrier"
  | "delay";

export type GateDef = {
  id: GateId;
  symbol: string; // short label drawn on the box, e.g. "H", "RX", "X"
  name: string; // human-readable name
  category: GateCategory;
  numControls: number;
  numTargets: number;
  numClbits: number;
  params: ParamSpec[];
  targetGlyph: TargetGlyph;
  /**
   * If true, the user can change the number of controls when placing the gate
   * (multi-controlled gates like MCX, MCP, MCU).
   */
  variableControls?: boolean;
  description?: string;
};

export type PlacedGate = {
  /** instance id, generated at placement time */
  id: string;
  gateId: GateId;
  column: number;
  controls: number[]; // qubit indices acting as controls (in order)
  targets: number[]; // qubit indices acting as targets (in order)
  clbits: number[]; // classical bit indices used (e.g. measure destination)
  params: string[]; // symbolic parameter values, parallel to GateDef.params
  /**
   * Per-control firing condition. Same length as `controls`; entry true means
   * the gate fires when that control qubit is |1⟩ (the default), false means
   * it fires when the control is |0⟩ (an "anti-control" / "negctrl @" in
   * OpenQASM 3). Absent on circuits saved before this field existed —
   * absent ≡ all-true.
   */
  controlStates?: boolean[];
  /**
   * Classical-bit-conditioned execution. Equivalent to OpenQASM `if (c == v) gate`.
   */
  condition?: { clbit: number; value: number };
};

export type Circuit = {
  numQubits: number;
  numClbits: number;
  gates: PlacedGate[];
  /** Human-readable circuit title, surfaced in the app header. Optional —
   * absent for blank/scratch circuits and replaced on every example or
   * file load. */
  name?: string;
};
