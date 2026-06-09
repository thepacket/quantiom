import type { Circuit, PlacedGate } from "../editor/types";

/**
 * Emit a Stim circuit (`.stim`) from a Quantiom Circuit IR.
 *
 * Stim (github.com/quantumlib/Stim) is a fast stabilizer simulator for
 * Clifford circuits and quantum error correction. It only supports Clifford
 * gates, Pauli-basis measurements, resets, and a few annotations — so this
 * emitter covers the Clifford fragment of a circuit and emits a `#`-comment
 * for anything outside it (T, rotations, arbitrary unitaries, multi-controlled
 * gates, anti-controls, classical control flow).
 *
 * Qubits are implicit in Stim (indexed integers); we don't declare them.
 * Gate-target convention: `CX control target`. Single-qubit gates list their
 * targets; two-qubit gates list control/target (or the symmetric pair) per
 * line — one operation per line for legibility.
 */

// Single-qubit Clifford IR id → Stim gate name.
const ONE_Q: Record<string, string> = {
  i: "I",
  x: "X",
  y: "Y",
  z: "Z",
  h: "H",
  s: "S",
  sdg: "S_DAG",
  sx: "SQRT_X",
  sxdg: "SQRT_X_DAG",
  sy: "SQRT_Y",
  sydg: "SQRT_Y_DAG",
};

// Controlled two-qubit Clifford (control + target) IR id → Stim name.
const CTRL_2Q: Record<string, string> = {
  cx: "CX",
  cy: "CY",
  cz: "CZ",
};

// Symmetric two-qubit Clifford (two targets, no control) IR id → Stim name.
const SYM_2Q: Record<string, string> = {
  swap: "SWAP",
  iswap: "ISWAP",
};

// Measurement / reset IR id → Stim instruction.
const MEAS: Record<string, string> = {
  measure: "M",
  measure_x: "MX",
  measure_y: "MY",
  reset: "R",
};

export function emitStim(circuit: Circuit): string {
  const lines: string[] = [];
  lines.push(`# Stim circuit exported from Quantiom${circuit.name ? `: ${circuit.name}` : ""}`);
  lines.push(`# ${circuit.numQubits} qubit(s). Only the Clifford fragment is exported;`);
  lines.push(`# non-Clifford gates appear as comments.`);
  lines.push("");

  // Gates in column order, then placement order within a column.
  const gates = [...circuit.gates].sort((a, b) => a.column - b.column);

  for (const g of gates) {
    lines.push(stimLine(g));
  }
  return lines.join("\n") + "\n";
}

function stimLine(g: PlacedGate): string {
  const id = g.gateId as string;
  const hasCtrl = g.controls.length > 0;
  const hasAnti = !!g.controlStates && g.controlStates.some((s) => s === false);

  // Classically-conditioned gates, anti-controls, and multi-controls aren't
  // expressible as plain Stim gates.
  if (g.condition) return `# unsupported (classical condition): ${id}`;
  if (hasAnti) return `# unsupported (anti-control): ${id}`;
  if (g.controls.length > 1) return `# unsupported (multi-control): ${id}`;

  // Markers.
  if (id === "barrier") return "TICK";
  if (id === "delay") return `# delay`;

  // Measurements / reset (single-qubit list).
  if (id in MEAS && !hasCtrl) {
    return `${MEAS[id]} ${g.targets.join(" ")}`;
  }

  // Single-qubit Clifford (no control).
  if (id in ONE_Q && !hasCtrl) {
    return `${ONE_Q[id]} ${g.targets.join(" ")}`;
  }

  // Controlled two-qubit Clifford: emit `NAME control target`.
  if (id in CTRL_2Q && hasCtrl && g.targets.length === 1) {
    return `${CTRL_2Q[id]} ${g.controls[0]} ${g.targets[0]}`;
  }

  // Symmetric two-qubit Clifford: emit `NAME a b`.
  if (id in SYM_2Q && !hasCtrl && g.targets.length === 2) {
    return `${SYM_2Q[id]} ${g.targets[0]} ${g.targets[1]}`;
  }

  // A bare single-qubit Clifford that was promoted to a control form we don't
  // map (e.g. ch, csx) — report it.
  return `# unsupported in Stim: ${id}${hasCtrl ? ` (controls ${g.controls.join(",")})` : ""}`;
}
