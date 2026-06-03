import type { Circuit, PlacedGate } from "../editor/types";
import { exportLower } from "./exportLower";

/**
 * Emit an Amazon Braket SDK Python program from a Circuit IR.
 *
 * Targets `braket.circuits.Circuit`. Method-style calls per gate;
 * `FreeParameter` declarations for symbolic angles.
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

function emitGate(g: PlacedGate): string[] {
  // Braket has the IonQ native gates directly — emit them rather than the
  // shared decomposition.
  if (g.gateId === "gpi") return [`circuit.gpi(${g.targets[0]}, ${asciify(g.params[0] ?? "0")})`];
  if (g.gateId === "gpi2") return [`circuit.gpi2(${g.targets[0]}, ${asciify(g.params[0] ?? "0")})`];
  if (g.gateId === "ms") {
    return [`circuit.ms(${g.targets[0]}, ${g.targets[1]}, ${asciify(g.params[0] ?? "0")}, ${asciify(g.params[1] ?? "0")}, ${asciify(g.params[2] ?? "0")})`];
  }
  const lowered = exportLower(g);
  if (lowered) return lowered.flatMap(emitGate);
  const t = g.targets[0];
  const t1 = g.targets[1];
  const c0 = g.controls[0];
  const c1 = g.controls[1];

  if (g.gateId === "barrier") return [`# barrier — Braket has no explicit barrier op`];
  if (g.gateId === "delay") return [`# delay(${asciify(g.params[0] ?? "0")}) — represented as identity in Braket`];

  if (g.gateId === "measure") return [`# measurement is implicit in Braket; results come from a Task`];
  if (g.gateId === "measure_x" || g.gateId === "measure_y") {
    return [`# basis-change measure not modelled here — call .measure(${t}) on the device task`];
  }
  if (g.gateId === "reset") return [`# reset not natively supported pre-shots in Braket`];

  if (g.gateId === "init0") return [`# init |0⟩ on q${t} (default state)`];
  if (g.gateId === "init1") return [`circuit.x(${t})`];
  if (g.gateId === "initplus") return [`circuit.h(${t})`];
  if (g.gateId === "initminus") return [`circuit.x(${t})`, `circuit.h(${t})`];
  if (g.gateId === "initiplus") return [`circuit.h(${t})`, `circuit.s(${t})`];
  if (g.gateId === "initiminus") return [`circuit.h(${t})`, `circuit.si(${t})`];

  switch (g.gateId) {
    case "i": return [`circuit.i(${t})`];
    case "x": return [`circuit.x(${t})`];
    case "y": return [`circuit.y(${t})`];
    case "z": return [`circuit.z(${t})`];
    case "h": return [`circuit.h(${t})`];
    case "s": return [`circuit.s(${t})`];
    case "sdg": return [`circuit.si(${t})`];
    case "t": return [`circuit.t(${t})`];
    case "tdg": return [`circuit.ti(${t})`];
    case "sx": return [`circuit.v(${t})`];
    case "sxdg": return [`circuit.vi(${t})`];
  }

  if (g.gateId === "rx") return [`circuit.rx(${t}, ${asciify(g.params[0])})`];
  if (g.gateId === "ry") return [`circuit.ry(${t}, ${asciify(g.params[0])})`];
  if (g.gateId === "rz") return [`circuit.rz(${t}, ${asciify(g.params[0])})`];
  if (g.gateId === "p" || g.gateId === "u1") return [`circuit.phaseshift(${t}, ${asciify(g.params[0])})`];

  if (g.gateId === "u" || g.gateId === "u3") {
    const [th, ph, la] = g.params.map(asciify);
    return [
      `# U(θ,φ,λ): Rz(λ) Ry(θ) Rz(φ)`,
      `circuit.rz(${t}, ${la})`,
      `circuit.ry(${t}, ${th})`,
      `circuit.rz(${t}, ${ph})`,
    ];
  }

  if (g.gateId === "cx") return [`circuit.cnot(${c0}, ${t})`];
  if (g.gateId === "cy") return [`circuit.cy(${c0}, ${t})`];
  if (g.gateId === "cz") return [`circuit.cz(${c0}, ${t})`];
  if (g.gateId === "swap") return [`circuit.swap(${t}, ${t1})`];
  if (g.gateId === "iswap") return [`circuit.iswap(${t}, ${t1})`];
  if (g.gateId === "ecr") return [`circuit.ecr(${t}, ${t1})`];

  if (g.gateId === "rxx") return [`circuit.xx(${t}, ${t1}, ${asciify(g.params[0])})`];
  if (g.gateId === "ryy") return [`circuit.yy(${t}, ${t1}, ${asciify(g.params[0])})`];
  if (g.gateId === "rzz") return [`circuit.zz(${t}, ${t1}, ${asciify(g.params[0])})`];

  if (g.gateId === "ccx") return [`circuit.ccnot(${c0}, ${c1}, ${t})`];
  if (g.gateId === "cswap") return [`circuit.cswap(${c0}, ${t}, ${t1})`];

  if (g.gateId === "cp" || g.gateId === "cu1") {
    return [`circuit.cphaseshift(${c0}, ${t}, ${asciify(g.params[0])})`];
  }

  return [`# ${g.gateId}: no direct Braket mapping in this emitter`];
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

export function emitBraket(circuit: Circuit): string {
  const out: string[] = [];
  out.push("# Generated by Quantiom — Amazon Braket SDK export");
  out.push("from braket.circuits import Circuit, FreeParameter");
  out.push("from math import pi, sin, cos, sqrt, exp, log as ln");
  out.push("");
  const symbols = collectSymbols(circuit);
  for (const s of symbols) out.push(`${s} = FreeParameter("${s}")`);
  if (symbols.length > 0) out.push("");
  out.push(`circuit = Circuit()`);
  out.push("");
  const sorted = [...circuit.gates].sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));
  for (const g of sorted) {
    for (const line of emitGate(g)) out.push(line);
  }
  out.push("");
  out.push(`# print(circuit)`);
  return out.join("\n");
}
