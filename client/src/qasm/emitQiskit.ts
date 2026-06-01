import type { Circuit, PlacedGate } from "../editor/types";

/**
 * Emit a Qiskit Python program from a Circuit IR. The output is a
 * self-contained `QuantumCircuit(...)` construction that researchers
 * can paste into a Jupyter notebook or save as a .py module.
 *
 * Mapping is intentionally close to the OpenQASM emitter:
 *   • Standard gates → `qc.<name>(params, qubits)` method calls
 *   • Multi-controlled forms → `qc.mcx/mcp/mcu(controls, target, params)`
 *   • Anti-controls → reflected via `ctrl_state` argument on MCX, or
 *     X-bracketing for the named two-qubit gates that don't accept it
 *   • Free symbols → `from qiskit.circuit import Parameter` declarations
 *   • Initialize-style state prep → reset + the basis-change chain
 *
 * Greek-letter parameter glyphs are transliterated to ASCII identifiers,
 * matching the QASM emitter's convention.
 */

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
  "theta", "phi", "lambda", "gamma", "beta", "tau", "alpha", "delta", "omega",
];

const QISKIT_METHOD: Record<string, string> = {
  i: "id", x: "x", y: "y", z: "z", h: "h",
  s: "s", sdg: "sdg", sx: "sx", sxdg: "sxdg", t: "t", tdg: "tdg",
  p: "p", rx: "rx", ry: "ry", rz: "rz",
  u: "u", u1: "u1", u2: "u2", u3: "u3",
  cx: "cx", cy: "cy", cz: "cz", ch: "ch",
  csx: "csx", csxdg: "csxdg",
  swap: "swap", iswap: "iswap", dcx: "dcx", ecr: "ecr",
  crx: "crx", cry: "cry", crz: "crz", cp: "cp",
  cu: "cu", cu1: "cu1", cu3: "cu3",
  rxx: "rxx", ryy: "ryy", rzz: "rzz", rzx: "rzx",
  xx_plus_yy: "xx_plus_yy", xx_minus_yy: "xx_minus_yy",
  ccx: "ccx", ccz: "ccz", cswap: "cswap",
  rccx: "rccx", rcccx: "rcccx",
  c3x: "c3x", c4x: "c4x",
};

function asciify(expr: string): string {
  let out = expr;
  for (const [g, ascii] of GLYPH_TO_ASCII) out = out.split(g).join(ascii);
  return out.trim();
}

function qubitList(idxs: number[]): string {
  return idxs.join(", ");
}

function paramList(params: string[]): string {
  return params.map(asciify).join(", ");
}

function ctrlState(g: PlacedGate): string {
  // ctrl_state bit string, little-endian, '1' = fires on |1⟩.
  // Returns null-string when all controls fire on |1⟩ (the default).
  if (!g.controlStates) return "";
  const bits: string[] = g.controlStates.map((s) => (s ? "1" : "0")).reverse();
  if (!bits.includes("0")) return "";
  return `, ctrl_state="${bits.join("")}"`;
}

function emitGate(g: PlacedGate): string[] {
  // Markers
  if (g.gateId === "barrier") {
    return [`qc.barrier(${qubitList(g.targets)})`];
  }
  if (g.gateId === "delay") {
    const tau = asciify(g.params[0] ?? "0");
    return [`qc.delay(${tau}, ${g.targets[0]})`];
  }

  // Non-unitary
  if (g.gateId === "measure") {
    return [`qc.measure(${g.targets[0]}, ${g.clbits[0]})`];
  }
  if (g.gateId === "measure_x") {
    return [
      `qc.h(${g.targets[0]})`,
      `qc.measure(${g.targets[0]}, ${g.clbits[0]})`,
      `qc.h(${g.targets[0]})`,
    ];
  }
  if (g.gateId === "measure_y") {
    return [
      `qc.sdg(${g.targets[0]})`,
      `qc.h(${g.targets[0]})`,
      `qc.measure(${g.targets[0]}, ${g.clbits[0]})`,
      `qc.h(${g.targets[0]})`,
      `qc.s(${g.targets[0]})`,
    ];
  }
  if (g.gateId === "reset") {
    return [`qc.reset(${g.targets[0]})`];
  }

  // State preparation
  if (g.gateId.startsWith("init")) {
    const q = g.targets[0];
    switch (g.gateId) {
      case "init0": return [`qc.reset(${q})`];
      case "init1": return [`qc.reset(${q})`, `qc.x(${q})`];
      case "initplus": return [`qc.reset(${q})`, `qc.h(${q})`];
      case "initminus": return [`qc.reset(${q})`, `qc.x(${q})`, `qc.h(${q})`];
      case "initiplus": return [`qc.reset(${q})`, `qc.h(${q})`, `qc.s(${q})`];
      case "initiminus": return [`qc.reset(${q})`, `qc.h(${q})`, `qc.sdg(${q})`];
      case "initialize":
        return [`# qc.initialize(${asciify(g.params[0] ?? "")}, [${q}])  # arbitrary state prep`];
      default: return [`# ${g.gateId} on q${q}  # unrecognised state prep`];
    }
  }

  // Control flow
  if (g.gateId === "if" || g.gateId === "while" || g.gateId === "switch" || g.gateId === "box") {
    return [`# ${g.gateId}(${asciify(g.params[0] ?? "")}): control flow not yet exported`];
  }

  // Arbitrary unitary matrices
  if (g.gateId === "u_arb" || g.gateId === "u_arb_2") {
    const args = qubitList([...g.controls, ...g.targets]);
    return [
      `# ${g.gateId}: arbitrary matrix not yet emitted as a UnitaryGate`,
      `# qc.unitary(<numpy matrix>, [${args}])`,
    ];
  }

  // Variable-arity multi-controlled
  if (g.gateId === "mcx" || g.gateId === "mcp" || g.gateId === "mcu") {
    const method = g.gateId === "mcx" ? "mcx" : g.gateId === "mcp" ? "mcp" : "mcu";
    const ctrls = `[${qubitList(g.controls)}]`;
    const target = g.targets[0];
    const ctrl = ctrlState(g);
    if (g.gateId === "mcx") {
      return [`qc.${method}(${ctrls}, ${target}${ctrl})`];
    }
    const ps = paramList(g.params);
    return [`qc.${method}(${ps}, ${ctrls}, ${target}${ctrl})`];
  }

  // Standard gates table
  const method = QISKIT_METHOD[g.gateId];
  if (!method) return [`# ${g.gateId}: not yet exported`];
  const qubits = qubitList([...g.controls, ...g.targets]);
  const args = g.params.length > 0 ? `${paramList(g.params)}, ${qubits}` : qubits;
  if (g.controlStates && g.controlStates.some((s) => !s)) {
    // Named two-qubit controlled gates in Qiskit accept ctrl_state. For others
    // (rxx etc.) the anti-control concept doesn't apply since they're not
    // control-target. We emit ctrl_state when the method is a known controlled.
    if (method.startsWith("c") && g.controls.length > 0) {
      return [`qc.${method}(${args}, ctrl_state="${(g.controlStates as boolean[]).map((s) => (s ? "1" : "0")).reverse().join("")}")`];
    }
  }
  return [`qc.${method}(${args})`];
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

export function emitQiskit(circuit: Circuit): string {
  const out: string[] = [];
  out.push("# Generated by Quantiom — Qiskit export");
  out.push("from qiskit import QuantumCircuit");
  const symbols = collectFreeSymbols(circuit);
  if (symbols.length > 0) {
    out.push("from qiskit.circuit import Parameter");
    out.push("from math import pi, sin, cos, sqrt, exp, log as ln");
    out.push("");
    for (const s of symbols) out.push(`${s} = Parameter("${s}")`);
  } else {
    out.push("from math import pi, sin, cos, sqrt, exp, log as ln");
  }
  out.push("");
  if (circuit.numClbits > 0) {
    out.push(`qc = QuantumCircuit(${circuit.numQubits}, ${circuit.numClbits})`);
  } else {
    out.push(`qc = QuantumCircuit(${circuit.numQubits})`);
  }
  out.push("");

  const sorted = [...circuit.gates].sort(
    (a, b) => a.column - b.column || a.id.localeCompare(b.id),
  );
  for (const g of sorted) {
    for (const line of emitGate(g)) out.push(line);
  }
  out.push("");
  return out.join("\n");
}
