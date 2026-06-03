import type { Circuit, PlacedGate } from "../editor/types";
import { exportLower } from "./exportLower";

/**
 * Emit a Cirq Python program from a Circuit IR.
 *
 * Targets `cirq.Circuit` over `cirq.LineQubit` qubits. Gates with direct
 * Cirq equivalents emit method-style; gates without (the wide U/CU family
 * and arbitrary matrices) fall back to a `cirq.MatrixGate(numpy.array(…))`
 * style or comments noting the gap. Free parameter symbols become sympy
 * `Symbol` declarations (Cirq's idiom for parameterised circuits).
 */

const GLYPH_TO_ASCII: Array<[string, string]> = [
  ["π", "pi"], ["θ", "theta"], ["φ", "phi"], ["λ", "lambda"],
  ["γ", "gamma"], ["β", "beta"], ["τ", "tau"], ["α", "alpha"],
  ["δ", "delta"], ["ω", "omega"],
];
const FREE_SYMBOL_NAMES = ["theta", "phi", "lambda", "gamma", "beta", "tau", "alpha", "delta", "omega"];

function asciify(s: string): string {
  let o = s;
  for (const [g, a] of GLYPH_TO_ASCII) o = o.split(g).join(a);
  return o.trim();
}

function q(i: number): string { return `qs[${i}]`; }

function emitGate(g: PlacedGate): string[] {
  const lowered = exportLower(g);
  if (lowered) return lowered.flatMap(emitGate);
  const target = g.targets[0];
  const ctrls = g.controls;

  // Markers
  if (g.gateId === "barrier") return [`# barrier on ${g.targets.map((t) => `qs[${t}]`).join(", ")}`];
  if (g.gateId === "delay") return [`# delay(${asciify(g.params[0] ?? "0")}) on ${q(target)}`];

  // Measurement
  if (g.gateId === "measure") return [`c.append(cirq.measure(${q(target)}, key="c${g.clbits[0]}"))`];
  if (g.gateId === "measure_x") {
    return [
      `c.append(cirq.H(${q(target)}))`,
      `c.append(cirq.measure(${q(target)}, key="c${g.clbits[0]}"))`,
      `c.append(cirq.H(${q(target)}))`,
    ];
  }
  if (g.gateId === "measure_y") {
    return [
      `c.append((cirq.S**-1)(${q(target)}))`,
      `c.append(cirq.H(${q(target)}))`,
      `c.append(cirq.measure(${q(target)}, key="c${g.clbits[0]}"))`,
      `c.append(cirq.H(${q(target)}))`,
      `c.append(cirq.S(${q(target)}))`,
    ];
  }
  if (g.gateId === "reset") return [`c.append(cirq.ResetChannel().on(${q(target)}))`];

  // State prep
  if (g.gateId === "init0") return [`c.append(cirq.ResetChannel().on(${q(target)}))`];
  if (g.gateId === "init1") return [`c.append(cirq.ResetChannel().on(${q(target)}))`, `c.append(cirq.X(${q(target)}))`];
  if (g.gateId === "initplus") return [`c.append(cirq.ResetChannel().on(${q(target)}))`, `c.append(cirq.H(${q(target)}))`];
  if (g.gateId === "initminus") return [`c.append(cirq.ResetChannel().on(${q(target)}))`, `c.append(cirq.X(${q(target)}))`, `c.append(cirq.H(${q(target)}))`];
  if (g.gateId === "initiplus") return [`c.append(cirq.ResetChannel().on(${q(target)}))`, `c.append(cirq.H(${q(target)}))`, `c.append(cirq.S(${q(target)}))`];
  if (g.gateId === "initiminus") return [`c.append(cirq.ResetChannel().on(${q(target)}))`, `c.append(cirq.H(${q(target)}))`, `c.append((cirq.S**-1)(${q(target)}))`];

  // Single-qubit fixed
  const single = (op: string) => [`c.append(${op}(${q(target)}))`];
  switch (g.gateId) {
    case "i": return single("cirq.I");
    case "x": return single("cirq.X");
    case "y": return single("cirq.Y");
    case "z": return single("cirq.Z");
    case "h": return single("cirq.H");
    case "s": return single("cirq.S");
    case "sdg": return [`c.append((cirq.S**-1)(${q(target)}))`];
    case "t": return single("cirq.T");
    case "tdg": return [`c.append((cirq.T**-1)(${q(target)}))`];
    case "sx": return [`c.append((cirq.X**0.5)(${q(target)}))`];
    case "sxdg": return [`c.append((cirq.X**-0.5)(${q(target)}))`];
  }

  // Single-qubit parameterised
  if (g.gateId === "rx") return [`c.append(cirq.rx(${asciify(g.params[0])})(${q(target)}))`];
  if (g.gateId === "ry") return [`c.append(cirq.ry(${asciify(g.params[0])})(${q(target)}))`];
  if (g.gateId === "rz") return [`c.append(cirq.rz(${asciify(g.params[0])})(${q(target)}))`];
  if (g.gateId === "p") return [`c.append(cirq.ZPowGate(exponent=(${asciify(g.params[0])})/pi)(${q(target)}))`];
  if (g.gateId === "u1") return [`c.append(cirq.ZPowGate(exponent=(${asciify(g.params[0])})/pi)(${q(target)}))`];
  if (g.gateId === "u" || g.gateId === "u3") {
    const [t, ph, la] = g.params.map(asciify);
    return [
      `# U(θ,φ,λ) decomposed: Rz(λ) Ry(θ) Rz(φ) on ${q(target)}`,
      `c.append(cirq.rz(${la})(${q(target)}))`,
      `c.append(cirq.ry(${t})(${q(target)}))`,
      `c.append(cirq.rz(${ph})(${q(target)}))`,
    ];
  }
  if (g.gateId === "u2") {
    const [ph, la] = g.params.map(asciify);
    return [
      `# U2(φ,λ) decomposed`,
      `c.append(cirq.rz(${la})(${q(target)}))`,
      `c.append(cirq.ry(pi/2)(${q(target)}))`,
      `c.append(cirq.rz(${ph})(${q(target)}))`,
    ];
  }

  // Two-qubit fixed
  if (g.gateId === "cx") return [`c.append(cirq.CNOT(${q(ctrls[0])}, ${q(target)}))`];
  if (g.gateId === "cy") return [`c.append(cirq.controlled_by(cirq.Y, num_controls=1)(${q(ctrls[0])}, ${q(target)}))`];
  if (g.gateId === "cz") return [`c.append(cirq.CZ(${q(ctrls[0])}, ${q(target)}))`];
  if (g.gateId === "ch") return [`c.append(cirq.H.controlled()(${q(ctrls[0])}, ${q(target)}))`];
  if (g.gateId === "swap") return [`c.append(cirq.SWAP(${q(g.targets[0])}, ${q(g.targets[1])}))`];
  if (g.gateId === "iswap") return [`c.append(cirq.ISWAP(${q(g.targets[0])}, ${q(g.targets[1])}))`];
  if (g.gateId === "sqrtswap") return [`c.append((cirq.SWAP**0.5)(${q(g.targets[0])}, ${q(g.targets[1])}))`];
  if (g.gateId === "sqrtswapdg") return [`c.append((cirq.SWAP**-0.5)(${q(g.targets[0])}, ${q(g.targets[1])}))`];

  // Two-qubit parameterised
  if (g.gateId === "fsim") return [`c.append(cirq.FSimGate(theta=${asciify(g.params[0])}, phi=${asciify(g.params[1])})(${q(g.targets[0])}, ${q(g.targets[1])}))`];
  if (g.gateId === "rxx") return [`c.append(cirq.XXPowGate(exponent=(${asciify(g.params[0])})/pi)(${q(g.targets[0])}, ${q(g.targets[1])}))`];
  if (g.gateId === "ryy") return [`c.append(cirq.YYPowGate(exponent=(${asciify(g.params[0])})/pi)(${q(g.targets[0])}, ${q(g.targets[1])}))`];
  if (g.gateId === "rzz") return [`c.append(cirq.ZZPowGate(exponent=(${asciify(g.params[0])})/pi)(${q(g.targets[0])}, ${q(g.targets[1])}))`];

  // Three-qubit
  if (g.gateId === "ccx") return [`c.append(cirq.CCX(${q(ctrls[0])}, ${q(ctrls[1])}, ${q(target)}))`];
  if (g.gateId === "ccz") return [`c.append(cirq.CCZ(${q(ctrls[0])}, ${q(ctrls[1])}, ${q(target)}))`];
  if (g.gateId === "cswap") return [`c.append(cirq.CSWAP(${q(ctrls[0])}, ${q(g.targets[0])}, ${q(g.targets[1])}))`];

  if (g.gateId === "mcx") {
    const operands = [...ctrls.map(q), q(target)].join(", ");
    return [`c.append(cirq.X.controlled(num_controls=${ctrls.length})(${operands}))`];
  }

  return [`# ${g.gateId}: no direct Cirq mapping in this emitter`];
}

function collectSymbols(circuit: Circuit): string[] {
  const found = new Set<string>();
  for (const g of circuit.gates) {
    for (const raw of g.params) {
      const t = asciify(raw);
      for (const n of FREE_SYMBOL_NAMES) {
        const re = new RegExp(`(^|[^A-Za-z0-9_])${n}([^A-Za-z0-9_]|$)`);
        if (re.test(t)) found.add(n);
      }
    }
  }
  return [...found].sort();
}

export function emitCirq(circuit: Circuit): string {
  const out: string[] = [];
  out.push("# Generated by Quantiom — Cirq export");
  out.push("import cirq");
  out.push("from sympy import Symbol, pi");
  out.push("");
  const symbols = collectSymbols(circuit);
  if (symbols.length > 0) {
    for (const s of symbols) out.push(`${s} = Symbol("${s}")`);
    out.push("");
  }
  out.push(`qs = cirq.LineQubit.range(${circuit.numQubits})`);
  out.push(`c = cirq.Circuit()`);
  out.push("");
  const sorted = [...circuit.gates].sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));
  for (const g of sorted) {
    for (const line of emitGate(g)) out.push(line);
  }
  out.push("");
  out.push(`# print(c)`);
  return out.join("\n");
}
