import type { Circuit, PlacedGate } from "../editor/types";

/**
 * Emit OpenQASM 3 text from a Circuit IR.
 *
 * Targets the `stdgates.inc` library plus the `ctrl @` modifier for the
 * variable-arity multi-controlled gates. Greek-letter symbolic parameters
 * (θ, φ, λ, …) are transliterated to ASCII identifiers and declared at the
 * top of the program as `input float`. Non-unitary state prep gates expand
 * into `reset` + a short basis-change sequence.
 *
 * Gates outside the QASM 3 stdgates surface (control flow, arbitrary
 * Initialize, basis-change measurements) emit as commented placeholders so
 * the structure of the circuit is still readable in the export.
 */

// Map of IR gate id → QASM 3 gate name in stdgates.inc. Entries that need
// special handling (state prep, measurement, control flow, ctrl @ form) are
// not in this table and are dispatched in emitGate().
const QASM_NAME: Record<string, string> = {
  i: "id",
  x: "x",
  y: "y",
  z: "z",
  h: "h",
  s: "s",
  sdg: "sdg",
  sx: "sx",
  sxdg: "sxdg",
  t: "t",
  tdg: "tdg",
  p: "p",
  rx: "rx",
  ry: "ry",
  rz: "rz",
  u: "U",
  u1: "U1",
  u2: "U2",
  u3: "U3",
  cx: "cx",
  cy: "cy",
  cz: "cz",
  ch: "ch",
  csx: "csx",
  csxdg: "csxdg",
  swap: "swap",
  iswap: "iswap",
  dcx: "dcx",
  ecr: "ecr",
  crx: "crx",
  cry: "cry",
  crz: "crz",
  cp: "cp",
  cu: "cu",
  cu1: "cu1",
  cu3: "cu3",
  rxx: "rxx",
  ryy: "ryy",
  rzz: "rzz",
  rzx: "rzx",
  xx_plus_yy: "xx_plus_yy",
  xx_minus_yy: "xx_minus_yy",
  ccx: "ccx",
  ccz: "ccz",
  cswap: "cswap",
  rccx: "rccx",
  rcccx: "rcccx",
  c3x: "c3x",
  c4x: "c4x",
};

// Greek glyph → ASCII identifier acceptable to OpenQASM 3.
const GLYPH_TO_ASCII: Array<[string, string]> = [
  ["π", "pi"],
  ["θ", "theta"],
  ["φ", "phi"],
  ["λ", "lambda"],
  ["γ", "gamma"],
  ["β", "beta"],
  ["τ", "tau"],
  ["α", "alpha"],
  ["δ", "delta"],
  ["ω", "omega"],
];

const FREE_SYMBOL_NAMES = [
  "theta",
  "phi",
  "lambda",
  "gamma",
  "beta",
  "tau",
  "alpha",
  "delta",
  "omega",
];

function asciify(expr: string): string {
  let out = expr;
  for (const [g, ascii] of GLYPH_TO_ASCII) {
    out = out.split(g).join(ascii);
  }
  return out.trim();
}

function qref(q: number): string {
  return `q[${q}]`;
}

function emitGate(g: PlacedGate): string[] {
  // ── Markers ─────────────────────────────────────────────────────────
  if (g.gateId === "barrier") {
    return [`barrier ${g.targets.map(qref).join(", ")};`];
  }
  if (g.gateId === "delay") {
    const tau = asciify(g.params[0] ?? "0");
    return [`delay[${tau}] ${qref(g.targets[0])};`];
  }

  // ── Non-unitary ─────────────────────────────────────────────────────
  if (g.gateId === "measure") {
    return [`c[${g.clbits[0]}] = measure ${qref(g.targets[0])};`];
  }
  if (g.gateId === "measure_x" || g.gateId === "measure_y") {
    // Rotate into Z basis, measure, rotate back. QASM 3 stdgates supports h/sdg.
    const q = qref(g.targets[0]);
    const c = `c[${g.clbits[0]}]`;
    if (g.gateId === "measure_x") {
      return [`h ${q};`, `${c} = measure ${q};`, `h ${q};`];
    }
    return [`sdg ${q};`, `h ${q};`, `${c} = measure ${q};`, `h ${q};`, `s ${q};`];
  }
  if (g.gateId === "reset") {
    return [`reset ${qref(g.targets[0])};`];
  }

  // ── State preparation ───────────────────────────────────────────────
  if (g.gateId.startsWith("init")) {
    const q = qref(g.targets[0]);
    switch (g.gateId) {
      case "init0":
        return [`reset ${q};`];
      case "init1":
        return [`reset ${q};`, `x ${q};`];
      case "initplus":
        return [`reset ${q};`, `h ${q};`];
      case "initminus":
        return [`reset ${q};`, `x ${q};`, `h ${q};`];
      case "initiplus":
        return [`reset ${q};`, `h ${q};`, `s ${q};`];
      case "initiminus":
        return [`reset ${q};`, `h ${q};`, `sdg ${q};`];
      case "initialize":
        return [`// initialize(${asciify(g.params[0] ?? "")}) ${q}; -- arbitrary state prep not in stdgates.inc`];
      default:
        return [`// ${g.gateId} ${q}; -- unrecognized state prep`];
    }
  }

  // ── Control flow (placeholders) ─────────────────────────────────────
  if (g.gateId === "if" || g.gateId === "while" || g.gateId === "switch" || g.gateId === "box") {
    const arg = asciify(g.params[0] ?? "");
    return [`// ${g.gateId} ${arg}: control flow not yet exported`];
  }

  // ── Variable-arity multi-controlled via ctrl @ modifier ─────────────
  if (g.gateId === "mcx" || g.gateId === "mcp" || g.gateId === "mcu") {
    const base = g.gateId === "mcx" ? "x" : g.gateId === "mcp" ? "p" : "U";
    const params = g.params.length > 0 ? `(${g.params.map(asciify).join(", ")})` : "";
    const n = g.controls.length;
    const args = [...g.controls, ...g.targets].map(qref).join(", ");
    return [`ctrl(${n}) @ ${base}${params} ${args};`];
  }

  // ── Arbitrary user-entered matrices (no stdgate form) ──────────────
  if (g.gateId === "u_arb" || g.gateId === "u_arb_2") {
    const args = [...g.controls, ...g.targets].map(qref).join(", ");
    const cells = g.params.map(asciify).join(", ");
    return [`// ${g.gateId}([${cells}]) ${args}; -- arbitrary unitary, not in stdgates.inc`];
  }

  // ── Standard gates table ────────────────────────────────────────────
  const name = QASM_NAME[g.gateId];
  if (!name) {
    return [`// ${g.gateId}: not yet exported`];
  }
  const params = g.params.length > 0 ? `(${g.params.map(asciify).join(", ")})` : "";
  const args = [...g.controls, ...g.targets].map(qref).join(", ");
  return [`${name}${params} ${args};`];
}

function collectFreeSymbols(circuit: Circuit): string[] {
  const found = new Set<string>();
  for (const g of circuit.gates) {
    for (const raw of g.params) {
      const text = asciify(raw);
      for (const name of FREE_SYMBOL_NAMES) {
        const re = new RegExp(`(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`);
        if (re.test(text)) found.add(name);
      }
    }
  }
  return [...found].sort();
}

export function emitQasm3(circuit: Circuit): string {
  const out: string[] = [];
  out.push("OPENQASM 3.0;");
  out.push('include "stdgates.inc";');
  out.push("");

  const symbols = collectFreeSymbols(circuit);
  if (symbols.length > 0) {
    for (const s of symbols) out.push(`input float ${s};`);
    out.push("");
  }

  out.push(`qubit[${circuit.numQubits}] q;`);
  if (circuit.numClbits > 0) {
    out.push(`bit[${circuit.numClbits}] c;`);
  }
  out.push("");

  const sorted = [...circuit.gates].sort(
    (a, b) => a.column - b.column || a.id.localeCompare(b.id),
  );
  for (const g of sorted) {
    for (const line of emitGate(g)) out.push(line);
  }

  return out.join("\n");
}
