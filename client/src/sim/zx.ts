/**
 * ZX-diagram generation. Translates a circuit into a ZX-calculus diagram —
 * green Z-spiders, red X-spiders, yellow Hadamard boxes, and the wires that
 * connect them — laid out on the circuit's own qubit×column grid so it
 * reads like the circuit in spider form.
 *
 * Gate → spider mapping (standard ZX):
 *   Z, S, S†, T, T†, P(θ), Rz(θ), U1(θ)  → green Z-spider, phase as shown
 *   X, √X, √X†, Rx(θ)                     → red X-spider
 *   H                                     → Hadamard box
 *   CX  → green (control) — plain edge — red (target)
 *   CZ  → green — Hadamard edge (dashed) — green
 * Anything else renders as a labelled generic box on its wire(s), so the
 * diagram is always complete even when a gate has no pure-spider form.
 *
 * This is faithful diagram *generation and rendering* — not PyZX-style
 * rewriting / T-count reduction (a separate research effort). Purely
 * structural; no simulation.
 */

import type { Circuit, PlacedGate } from "../editor/types";

export type ZXKind = "Z" | "X" | "H" | "box";

export type ZXNode = {
  id: string;
  kind: ZXKind;
  qubit: number;
  col: number;
  /** Phase label (e.g. "π", "π/4", "t"); empty for phase-0 spiders. */
  phase: string;
  /** Generic-box label (gate id) when kind === "box". */
  label?: string;
};

export type ZXEdge = {
  /** Vertical connector between two qubit wires at a column. */
  q1: number;
  q2: number;
  col: number;
  /** Dashed Hadamard edge (CZ); plain wire otherwise. */
  hadamard: boolean;
};

export type ZXResult = {
  nodes: ZXNode[];
  edges: ZXEdge[];
  numQubits: number;
  numCols: number;
  /** Count of spiders that fuse trivially (adjacent same-colour, degree-2)
   *  — a quick "how reducible is this" hint, not an actual rewrite. */
  fusableHint: number;
};

const GREEN_FIXED: Record<string, string> = {
  z: "π", s: "π/2", sdg: "−π/2", t: "π/4", tdg: "−π/4",
};
const RED_FIXED: Record<string, string> = {
  x: "π", sx: "π/2", sxdg: "−π/2",
};
const GREEN_PARAM = new Set(["rz", "p", "u1"]);
const RED_PARAM = new Set(["rx"]);
const SKIP = new Set(["barrier", "delay", "i", "id"]);

function phaseOf(g: PlacedGate): string {
  return g.params && g.params.length > 0 ? g.params[0] : "";
}

export function zxDiagram(circuit: Circuit): ZXResult {
  const n = circuit.numQubits;
  const nodes: ZXNode[] = [];
  const edges: ZXEdge[] = [];
  let maxCol = 0;

  const sorted = [...circuit.gates].sort(
    (a, b) => a.column - b.column || a.id.localeCompare(b.id),
  );

  for (const g of sorted) {
    if (SKIP.has(g.gateId)) continue;
    const col = g.column;
    if (col > maxCol) maxCol = col;
    const id = g.id;

    // ── two-qubit clean cases ──
    if (g.gateId === "cx" && g.controls.length === 1 && g.targets.length === 1) {
      const c = g.controls[0], t = g.targets[0];
      nodes.push({ id: `${id}-c`, kind: "Z", qubit: c, col, phase: "" });
      nodes.push({ id: `${id}-t`, kind: "X", qubit: t, col, phase: "" });
      edges.push({ q1: c, q2: t, col, hadamard: false });
      continue;
    }
    if (g.gateId === "cz" && g.controls.length === 1 && g.targets.length === 1) {
      const a = g.controls[0], b = g.targets[0];
      nodes.push({ id: `${id}-a`, kind: "Z", qubit: a, col, phase: "" });
      nodes.push({ id: `${id}-b`, kind: "Z", qubit: b, col, phase: "" });
      edges.push({ q1: a, q2: b, col, hadamard: true });
      continue;
    }

    // ── single-qubit spiders ──
    if (g.controls.length === 0 && g.targets.length === 1) {
      const q = g.targets[0];
      if (GREEN_FIXED[g.gateId] !== undefined) {
        nodes.push({ id, kind: "Z", qubit: q, col, phase: GREEN_FIXED[g.gateId] });
        continue;
      }
      if (RED_FIXED[g.gateId] !== undefined) {
        nodes.push({ id, kind: "X", qubit: q, col, phase: RED_FIXED[g.gateId] });
        continue;
      }
      if (GREEN_PARAM.has(g.gateId)) {
        nodes.push({ id, kind: "Z", qubit: q, col, phase: phaseOf(g) });
        continue;
      }
      if (RED_PARAM.has(g.gateId)) {
        nodes.push({ id, kind: "X", qubit: q, col, phase: phaseOf(g) });
        continue;
      }
      if (g.gateId === "h") {
        nodes.push({ id, kind: "H", qubit: q, col, phase: "" });
        continue;
      }
    }

    // ── fallback: generic labelled box on every touched wire ──
    const qubits = [...new Set([...g.controls, ...g.targets])].filter((q) => q >= 0 && q < n);
    for (const q of qubits) {
      nodes.push({ id: `${id}-q${q}`, kind: "box", qubit: q, col, phase: "", label: g.gateId });
    }
    for (let i = 0; i + 1 < qubits.length; i++) {
      edges.push({ q1: qubits[i], q2: qubits[i + 1], col, hadamard: false });
    }
  }

  // Trivial-fusion hint: count same-colour spiders adjacent on a wire with
  // nothing else between them (degree-2 on the wire).
  let fusableHint = 0;
  const perQ: ZXNode[][] = Array.from({ length: n }, () => []);
  for (const nd of nodes) if (nd.qubit >= 0 && nd.qubit < n) perQ[nd.qubit].push(nd);
  for (const list of perQ) {
    list.sort((a, b) => a.col - b.col);
    for (let i = 0; i + 1 < list.length; i++) {
      if ((list[i].kind === "Z" || list[i].kind === "X") && list[i].kind === list[i + 1].kind) {
        fusableHint++;
      }
    }
  }

  return { nodes, edges, numQubits: n, numCols: maxCol + 1, fusableHint };
}
