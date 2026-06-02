import type { Circuit, PlacedGate } from "../editor/types";

/**
 * Emit a quantikz LaTeX snippet from the Circuit IR.
 *
 * Output is a `\begin{quantikz} ... \end{quantikz}` block. The caller must
 * `\usepackage{tikz}` and `\usetikzlibrary{quantikz}` (or use the quantikz
 * package directly) in their preamble.
 *
 * Layout: rows are qubits (q0 on top), columns are the IR's `column` field
 * after a fresh ASAP pack so empty columns are removed. Single-qubit gates
 * render as `\gate{LABEL}`, CX as `\ctrl{Δ}` + `\targ{}`, CZ as `\ctrl{Δ}` +
 * `\control{}`, SWAP as `\swap{Δ}` + `\targX{}`. Generic two-qubit controls
 * use `\ctrl{Δ}` + `\gate{LABEL}`. Measurements use `\meter{}`. Barriers and
 * gates we don't have a special form for render as `\gate{...}` with the IR
 * name, so the structure is always visible even if it doesn't match a built-
 * in quantikz glyph.
 */

// Display name used inside `\gate{...}` for each IR gate.
const LABELS: Record<string, string> = {
  i: "I", x: "X", y: "Y", z: "Z", h: "H",
  s: "S", sdg: "S^\\dagger", sx: "\\sqrt{X}", sxdg: "\\sqrt{X}^\\dagger",
  t: "T", tdg: "T^\\dagger",
  p: "P", rx: "R_X", ry: "R_Y", rz: "R_Z",
  u: "U", u1: "U_1", u2: "U_2", u3: "U_3",
  crx: "R_X", cry: "R_Y", crz: "R_Z", cp: "P",
  cu: "U", cu1: "U_1", cu3: "U_3",
  ch: "H", csx: "\\sqrt{X}", csxdg: "\\sqrt{X}^\\dagger",
  rxx: "R_{XX}", ryy: "R_{YY}", rzz: "R_{ZZ}", rzx: "R_{ZX}",
  xx_plus_yy: "XX{+}YY", xx_minus_yy: "XX{-}YY",
  iswap: "iSWAP", dcx: "DCX", ecr: "ECR",
  ccz: "Z", rccx: "RCCX", rcccx: "RCCCX",
  u_arb: "U_{\\rm arb}", u_arb_2: "U_{\\rm arb}^{(2)}",
};

const GLYPH_TO_LATEX: Array<[string, string]> = [
  ["π", "\\pi"],
  ["θ", "\\theta"],
  ["φ", "\\varphi"],
  ["λ", "\\lambda"],
  ["γ", "\\gamma"],
  ["β", "\\beta"],
  ["τ", "\\tau"],
  ["α", "\\alpha"],
  ["δ", "\\delta"],
  ["ω", "\\omega"],
];

function latexify(expr: string): string {
  let s = expr;
  for (const [g, tex] of GLYPH_TO_LATEX) s = s.split(g).join(tex);
  return s;
}

function paramTeX(g: PlacedGate): string {
  if (g.params.length === 0) return "";
  return `(${g.params.map(latexify).join(", ")})`;
}

function gateLabel(g: PlacedGate): string {
  const base = LABELS[g.gateId] ?? g.gateId.replace(/_/g, "\\_");
  return `${base}${paramTeX(g)}`;
}

type Cell =
  | { kind: "qw" }
  | { kind: "gate"; label: string }
  | { kind: "ctrl"; delta: number }
  | { kind: "negctrl"; delta: number }
  | { kind: "targ" }
  | { kind: "control" }
  | { kind: "swap"; delta: number }
  | { kind: "swapend" }
  | { kind: "meter" }
  | { kind: "raw"; tex: string };

function cellToTex(c: Cell): string {
  switch (c.kind) {
    case "qw": return "\\qw";
    case "gate": return `\\gate{${c.label}}`;
    case "ctrl": return `\\ctrl{${c.delta}}`;
    case "negctrl": return `\\octrl{${c.delta}}`;
    case "targ": return "\\targ{}";
    case "control": return "\\control{}";
    case "swap": return `\\swap{${c.delta}}`;
    case "swapend": return "\\targX{}";
    case "meter": return "\\meter{}";
    case "raw": return c.tex;
  }
}

export function emitQuantikz(circuit: Circuit): string {
  const n = circuit.numQubits;
  if (n === 0) return "% empty circuit";

  // ASAP-pack the columns so empties collapse.
  const sorted = [...circuit.gates].sort(
    (a, b) => a.column - b.column || a.id.localeCompare(b.id),
  );
  const nextColQ = new Array<number>(n).fill(0);
  type Placed = { g: PlacedGate; col: number };
  const placed: Placed[] = [];
  for (const g of sorted) {
    const qs = [...g.controls, ...g.targets];
    if (qs.length === 0) {
      placed.push({ g, col: 0 });
      continue;
    }
    let col = 0;
    for (const q of qs) col = Math.max(col, nextColQ[q] ?? 0);
    placed.push({ g, col });
    for (const q of qs) nextColQ[q] = col + 1;
  }
  const maxCol = placed.reduce((m, p) => Math.max(m, p.col), -1);
  const numCols = maxCol + 1;

  // Grid: rows are qubits, columns are time steps. Default to `\qw`.
  const grid: Cell[][] = Array.from({ length: n }, () =>
    Array.from({ length: Math.max(1, numCols) }, () => ({ kind: "qw" } as Cell)),
  );

  for (const { g, col } of placed) {
    placeGateInGrid(grid, g, col);
  }

  const lines: string[] = [];
  lines.push("\\begin{quantikz}");
  for (let q = 0; q < n; q++) {
    const cells = grid[q].map(cellToTex);
    const lwire = `\\lstick{$\\ket{q_{${q}}}$}`;
    const trailing = q === n - 1 ? "" : " \\\\";
    lines.push(`  ${lwire} & ${cells.join(" & ")}${trailing}`);
  }
  lines.push("\\end{quantikz}");
  return lines.join("\n");
}

function placeGateInGrid(grid: Cell[][], g: PlacedGate, col: number): void {
  const cols = grid[0].length;
  if (col < 0 || col >= cols) return;

  // ── Markers / non-unitary ───────────────────────────────────────────
  if (g.gateId === "barrier") {
    for (const t of g.targets) grid[t][col] = { kind: "raw", tex: "\\qw\\slice{}" };
    return;
  }
  if (g.gateId === "delay") {
    grid[g.targets[0]][col] = { kind: "gate", label: `\\text{delay}(${g.params[0] ? latexify(g.params[0]) : ""})` };
    return;
  }
  if (g.gateId === "measure") {
    grid[g.targets[0]][col] = { kind: "meter" };
    return;
  }
  if (g.gateId === "measure_x" || g.gateId === "measure_y") {
    grid[g.targets[0]][col] = { kind: "gate", label: g.gateId === "measure_x" ? "\\text{meas}_X" : "\\text{meas}_Y" };
    return;
  }
  if (g.gateId === "reset") {
    grid[g.targets[0]][col] = { kind: "gate", label: "|0\\rangle" };
    return;
  }
  if (g.gateId.startsWith("init")) {
    const labels: Record<string, string> = {
      init0: "|0\\rangle", init1: "|1\\rangle",
      initplus: "|+\\rangle", initminus: "|-\\rangle",
      initiplus: "|{+}i\\rangle", initiminus: "|{-}i\\rangle",
      initialize: "\\text{init}",
    };
    grid[g.targets[0]][col] = { kind: "gate", label: labels[g.gateId] ?? "\\text{init}" };
    return;
  }
  if (g.gateId === "if" || g.gateId === "while" || g.gateId === "switch" || g.gateId === "box") {
    // No clean quantikz form; mark on the first qubit of the placed gate.
    const q = g.targets[0] ?? g.controls[0] ?? 0;
    grid[q][col] = { kind: "gate", label: `\\text{${g.gateId}}` };
    return;
  }

  // ── Controls ────────────────────────────────────────────────────────
  const controls = g.controls;
  const targets = g.targets;
  const states = controls.map((_, i) => (g.controlStates ? g.controlStates[i] !== false : true));

  // Single-qubit gate, no controls.
  if (controls.length === 0 && targets.length === 1) {
    grid[targets[0]][col] = { kind: "gate", label: gateLabel(g) };
    return;
  }

  // SWAP (no controls, two targets).
  if (g.gateId === "swap" && controls.length === 0 && targets.length === 2) {
    const [a, b] = targets;
    grid[a][col] = { kind: "swap", delta: b - a };
    grid[b][col] = { kind: "swapend" };
    return;
  }

  // CSWAP and other controlled SWAPs.
  if (g.gateId === "cswap" && controls.length >= 1 && targets.length === 2) {
    const [t0, t1] = targets;
    for (let i = 0; i < controls.length; i++) {
      grid[controls[i]][col] = { kind: states[i] ? "ctrl" : "negctrl", delta: t0 - controls[i] };
    }
    grid[t0][col] = { kind: "swap", delta: t1 - t0 };
    grid[t1][col] = { kind: "swapend" };
    return;
  }

  // CX family — bare X target, no params.
  if ((g.gateId === "cx" || g.gateId === "ccx" || g.gateId === "c3x" || g.gateId === "c4x" || g.gateId === "mcx") && targets.length === 1) {
    const t = targets[0];
    for (let i = 0; i < controls.length; i++) {
      grid[controls[i]][col] = { kind: states[i] ? "ctrl" : "negctrl", delta: t - controls[i] };
    }
    grid[t][col] = { kind: "targ" };
    return;
  }

  // CZ family — controls + control glyph on target.
  if ((g.gateId === "cz" || g.gateId === "ccz") && targets.length === 1) {
    const t = targets[0];
    for (let i = 0; i < controls.length; i++) {
      grid[controls[i]][col] = { kind: states[i] ? "ctrl" : "negctrl", delta: t - controls[i] };
    }
    grid[t][col] = { kind: "control" };
    return;
  }

  // Generic controlled-target-with-label: ctrl(s) + \gate{LABEL} on target.
  if (targets.length === 1 && controls.length >= 1) {
    const t = targets[0];
    for (let i = 0; i < controls.length; i++) {
      grid[controls[i]][col] = { kind: states[i] ? "ctrl" : "negctrl", delta: t - controls[i] };
    }
    grid[t][col] = { kind: "gate", label: gateLabel(g) };
    return;
  }

  // 2-qubit gate on two adjacent (or distant) targets — render as a tall
  // multi-qubit gate on the top target with a `\qwbundle` workaround. For
  // anything we don't have a special form for, drop a labeled `\gate` on
  // each target row plus a vertical connector.
  if (targets.length === 2 && controls.length === 0) {
    const [a, b] = targets;
    const top = Math.min(a, b);
    const bot = Math.max(a, b);
    grid[top][col] = { kind: "raw", tex: `\\gate[${bot - top + 1}]{${gateLabel(g)}}` };
    for (let q = top + 1; q <= bot; q++) {
      // Subsequent rows are absorbed by the multi-qubit \gate; leave a `\qw`
      // unless quantikz needs an explicit no-op (the `\gate[n]` form covers
      // span automatically).
      grid[q][col] = { kind: "raw", tex: "" };
    }
    return;
  }

  // Fallback: a labeled gate per target row.
  for (const t of targets) {
    grid[t][col] = { kind: "gate", label: gateLabel(g) };
  }
  for (let i = 0; i < controls.length; i++) {
    grid[controls[i]][col] = { kind: states[i] ? "ctrl" : "negctrl", delta: targets[0] - controls[i] };
  }
}
