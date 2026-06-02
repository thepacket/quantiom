import type { Circuit, PlacedGate } from "../editor/types";

/**
 * Emit OpenQASM 2.0 text from a Circuit IR.
 *
 * QASM 2 targets `qelib1.inc`. Relative to the QASM 3 emitter:
 *   - no `ctrl @` / `negctrl @` modifiers (anti-controls cannot round-trip)
 *   - no `input float` declarations (free symbols flow through as-is in
 *     gate parameters and are emitted with a header comment listing them)
 *   - `qubit[n] q` becomes `qreg q[n]`; `bit[n] c` becomes `creg c[n]`
 *   - `c[k] = measure q[k]` becomes `measure q[k] -> c[k]`
 *   - conditions become `if (c == v) ...` (whole-creg compare). Single-bit
 *     conditions are only safe to translate when the creg has width 1;
 *     otherwise we emit a warning comment.
 *   - gates outside qelib1.inc emit as commented placeholders.
 */

// IR gate id → qelib1.inc gate name. Anything not here emits a comment.
const QASM2_NAME: Record<string, string> = {
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
  u1: "u1",
  u2: "u2",
  u3: "u3",
  cx: "cx",
  cy: "cy",
  cz: "cz",
  ch: "ch",
  csx: "csx",
  swap: "swap",
  crx: "crx",
  cry: "cry",
  crz: "crz",
  cp: "cp",
  cu: "cu",
  cu1: "cu1",
  cu3: "cu3",
  rxx: "rxx",
  rzz: "rzz",
  ccx: "ccx",
  cswap: "cswap",
  rccx: "rccx",
  c3x: "c3x",
  c4x: "c4x",
};

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

function hasAntiControls(g: PlacedGate): boolean {
  if (!g.controlStates) return false;
  for (let i = 0; i < g.controls.length; i++) {
    if (g.controlStates[i] === false) return true;
  }
  return false;
}

function emitGate(g: PlacedGate): string[] {
  if (g.gateId === "barrier") {
    return [`barrier ${g.targets.map(qref).join(", ")};`];
  }
  if (g.gateId === "delay") {
    return [`// delay(${asciify(g.params[0] ?? "0")}) ${qref(g.targets[0])}; -- not in OpenQASM 2`];
  }

  if (g.gateId === "measure") {
    return [`measure ${qref(g.targets[0])} -> c[${g.clbits[0]}];`];
  }
  if (g.gateId === "measure_x" || g.gateId === "measure_y") {
    const q = qref(g.targets[0]);
    const c = `c[${g.clbits[0]}]`;
    if (g.gateId === "measure_x") {
      return [`h ${q};`, `measure ${q} -> ${c};`, `h ${q};`];
    }
    return [`sdg ${q};`, `h ${q};`, `measure ${q} -> ${c};`, `h ${q};`, `s ${q};`];
  }
  if (g.gateId === "reset") {
    return [`reset ${qref(g.targets[0])};`];
  }

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
        return [`// initialize(${asciify(g.params[0] ?? "")}) ${q}; -- arbitrary state prep not in qelib1.inc`];
      default:
        return [`// ${g.gateId} ${q}; -- unrecognized state prep`];
    }
  }

  if (g.gateId === "if" || g.gateId === "while" || g.gateId === "switch" || g.gateId === "box") {
    return [`// ${g.gateId}: control flow not exported in OpenQASM 2`];
  }

  if (hasAntiControls(g)) {
    return [`// ${g.gateId}: anti-controls not expressible in OpenQASM 2`];
  }

  if (g.gateId === "u_arb" || g.gateId === "u_arb_2") {
    const args = [...g.controls, ...g.targets].map(qref).join(", ");
    const cells = g.params.map(asciify).join(", ");
    return [`// ${g.gateId}([${cells}]) ${args}; -- arbitrary unitary, not in qelib1.inc`];
  }

  const name = QASM2_NAME[g.gateId];
  if (!name) {
    return [`// ${g.gateId}: not in qelib1.inc`];
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

export function emitQasm2(circuit: Circuit): string {
  const out: string[] = [];
  out.push("OPENQASM 2.0;");
  out.push('include "qelib1.inc";');
  out.push("");

  const symbols = collectFreeSymbols(circuit);
  if (symbols.length > 0) {
    out.push(`// free parameters (no symbolic input in QASM 2): ${symbols.join(", ")}`);
    out.push("");
  }

  out.push(`qreg q[${circuit.numQubits}];`);
  if (circuit.numClbits > 0) {
    out.push(`creg c[${circuit.numClbits}];`);
  }
  out.push("");

  const sorted = [...circuit.gates].sort(
    (a, b) => a.column - b.column || a.id.localeCompare(b.id),
  );
  for (const g of sorted) {
    const lines = emitGate(g);
    if (g.condition) {
      // QASM 2 if() compares whole creg to an integer. When the creg width
      // is 1, a single-bit condition translates directly; otherwise the
      // bit-level meaning is lost, so warn and drop the wrap.
      if (circuit.numClbits === 1 && g.condition.clbit === 0) {
        const cond = `if (c == ${g.condition.value}) `;
        for (const line of lines) out.push(`${cond}${line}`);
      } else {
        out.push(`// if (c[${g.condition.clbit}] == ${g.condition.value}): single-bit conditions not expressible in QASM 2 with multi-bit creg`);
        for (const line of lines) out.push(line);
      }
    } else {
      for (const line of lines) out.push(line);
    }
  }

  return out.join("\n");
}
