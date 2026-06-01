import type { Circuit, PlacedGate } from "../editor/types";
import { GATES_BY_ID, totalQubits } from "../editor/gates";

/**
 * Parse a subset of OpenQASM 3 — the subset our emitter produces, plus
 * reasonable variations a user might hand-write.
 *
 * Supported:
 *   - declarations: qubit[N] q;  bit[N] c;  input float NAME;
 *   - boilerplate: OPENQASM 3.0;  include "stdgates.inc";
 *   - standard gates: name(params) q[i], q[j];
 *   - measure:        c[i] = measure q[j];
 *   - reset:          reset q[i];
 *   - barrier:        barrier q[i], q[j], ...;
 *   - delay:          delay[expr] q[i];
 *   - ctrl modifier:  ctrl(n) @ name(params) q[a], q[b], q[c];
 *   - line comments:  // …
 *
 * Not supported in this iteration: gate definitions, custom subroutines,
 * `if (cond) gate;`, for/while/switch, complex types beyond float.
 *
 * Columns are assigned by greedy ASAP scheduling so a sequence of single-
 * qubit gates on disjoint qubits packs into the same column.
 */

type ParseWarning = { line: number; message: string };

export type ParseResult =
  | { ok: true; circuit: Circuit; warnings: ParseWarning[] }
  | { ok: false; error: string; line: number };

// QASM gate name → our IR gate id. Names are lowercased before lookup so the
// QASM 3 reserved-style identifiers (U, U1, U2, U3) still match.
const QASM_TO_IR: Record<string, string> = {
  id: "i",
  i: "i",
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
  u: "u",
  u1: "u1",
  u2: "u2",
  u3: "u3",
  cx: "cx",
  cnot: "cx",
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
  toffoli: "ccx",
  ccz: "ccz",
  cswap: "cswap",
  fredkin: "cswap",
  rccx: "rccx",
  rcccx: "rcccx",
  c3x: "c3x",
  c4x: "c4x",
};

const ASCII_TO_GREEK: Array<[RegExp, string]> = [
  [/\bpi\b/g, "π"],
  [/\btheta\b/g, "θ"],
  [/\bphi\b/g, "φ"],
  [/\blambda\b/g, "λ"],
  [/\bgamma\b/g, "γ"],
  [/\bbeta\b/g, "β"],
  [/\btau\b/g, "τ"],
];

function greekify(s: string): string {
  let out = s;
  for (const [re, g] of ASCII_TO_GREEK) out = out.replace(re, g);
  return out;
}

// ─── Tokenization helpers ──────────────────────────────────────────────────

/** Split a comma-separated argument list, respecting nested parens/brackets. */
function splitTopLevel(s: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === sep && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = s.slice(start).trim();
  if (last) out.push(last);
  return out;
}

type Reg = { kind: "q" | "c"; index: number };

function parseReg(s: string): Reg {
  const m = s.match(/^([qc])\s*\[\s*(\d+)\s*\]$/);
  if (!m) throw new Error(`expected register reference like q[i] or c[i], got "${s}"`);
  return { kind: m[1] as "q" | "c", index: parseInt(m[2], 10) };
}

// ─── Main parser ───────────────────────────────────────────────────────────

export function parseQasm3(text: string): ParseResult {
  const lines = text.split("\n");
  let numQubits = 0;
  let numClbits = 0;
  const gates: PlacedGate[] = [];
  const warnings: ParseWarning[] = [];

  // ASAP column scheduler.
  const nextColForQ: number[] = [];
  const nextColForC: number[] = [];

  function ensureQubit(i: number) {
    if (i + 1 > numQubits) numQubits = i + 1;
    while (nextColForQ.length < numQubits) nextColForQ.push(0);
  }
  function ensureClbit(i: number) {
    if (i + 1 > numClbits) numClbits = i + 1;
    while (nextColForC.length < numClbits) nextColForC.push(0);
  }
  function schedule(qubits: number[], clbits: number[] = []): number {
    let col = 0;
    for (const q of qubits) col = Math.max(col, nextColForQ[q] ?? 0);
    for (const c of clbits) col = Math.max(col, nextColForC[c] ?? 0);
    for (const q of qubits) nextColForQ[q] = col + 1;
    for (const c of clbits) nextColForC[c] = col + 1;
    return col;
  }

  let idCounter = 1;
  const newId = () => `pg${idCounter++}`;

  function addGate(opts: {
    gateId: string;
    qubits: number[];
    clbits?: number[];
    params?: string[];
    nControls?: number;
    controlStates?: boolean[];
  }) {
    const def = GATES_BY_ID[opts.gateId];
    if (!def) throw new Error(`unknown gate "${opts.gateId}"`);
    const clbits = opts.clbits ?? [];
    const params = opts.params ?? [];
    const need = totalQubits(def);
    let controls: number[];
    let targets: number[];
    if (def.variableControls && opts.nControls !== undefined) {
      // For mcx/mcp/mcu, qubits = controls (n) then targets (1).
      controls = opts.qubits.slice(0, opts.nControls);
      targets = opts.qubits.slice(opts.nControls);
    } else {
      if (opts.qubits.length !== need) {
        throw new Error(`gate "${opts.gateId}" expects ${need} qubits, got ${opts.qubits.length}`);
      }
      controls = opts.qubits.slice(0, def.numControls);
      targets = opts.qubits.slice(def.numControls);
    }
    const col = schedule(opts.qubits, clbits);
    const placed: PlacedGate = {
      id: newId(),
      gateId: opts.gateId,
      column: col,
      controls,
      targets,
      clbits,
      params,
    };
    if (opts.controlStates && opts.controlStates.length === controls.length) {
      placed.controlStates = [...opts.controlStates];
    }
    gates.push(placed);
  }

  /**
   * Given a base stdgate name (lowercased) and the number of controls on a
   * `ctrl/negctrl @ … @ base` chain, pick the IR gate id that represents the
   * resulting controlled gate. Falls back to mcx/mcp/mcu for the x/p/U
   * families when N is larger than the fixed-arity entries.
   */
  function resolveControlled(base: string, n: number): string | null {
    const xFamily: Record<number, string> = { 1: "cx", 2: "ccx", 3: "c3x", 4: "c4x" };
    const zFamily: Record<number, string> = { 1: "cz", 2: "ccz" };
    switch (base) {
      case "x":
        return xFamily[n] ?? "mcx";
      case "y":
        return n === 1 ? "cy" : null;
      case "z":
        return zFamily[n] ?? null;
      case "h":
        return n === 1 ? "ch" : null;
      case "sx":
        return n === 1 ? "csx" : null;
      case "sxdg":
        return n === 1 ? "csxdg" : null;
      case "rx":
        return n === 1 ? "crx" : null;
      case "ry":
        return n === 1 ? "cry" : null;
      case "rz":
        return n === 1 ? "crz" : null;
      case "p":
        return n === 1 ? "cp" : "mcp";
      case "u":
      case "u3":
        return n === 1 ? "cu3" : "mcu";
      case "u1":
        return n === 1 ? "cu1" : null;
      case "swap":
        return n === 1 ? "cswap" : null;
      default:
        return null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    // Strip line comments.
    const code = raw.split("//")[0].trim();
    if (!code) continue;

    // Multiple statements per line are valid QASM 3 — split on top-level `;`.
    const lineStatements = splitTopLevel(code, ";");
    for (const stmt of lineStatements) {
      if (!stmt) continue;
      // Stray trailing `;` already consumed by splitTopLevel; leftover after
      // a final `;` becomes an empty string and is skipped above.

    try {
      // Boilerplate / declarations to ignore.
      if (/^OPENQASM\b/i.test(stmt)) continue;
      if (/^include\b/i.test(stmt)) continue;
      if (/^input\s+/.test(stmt)) continue; // free symbol declarations
      if (/^output\s+/.test(stmt)) continue;
      if (/^const\b/.test(stmt)) continue;

      // qubit[N] q;
      let m = stmt.match(/^qubit\s*\[\s*(\d+)\s*\]\s+\w+$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > numQubits) numQubits = n;
        while (nextColForQ.length < numQubits) nextColForQ.push(0);
        continue;
      }
      // bit[N] c;
      m = stmt.match(/^bit\s*\[\s*(\d+)\s*\]\s+\w+$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > numClbits) numClbits = n;
        while (nextColForC.length < numClbits) nextColForC.push(0);
        continue;
      }
      // legacy: qreg q[N];  creg c[N];
      m = stmt.match(/^qreg\s+\w+\s*\[\s*(\d+)\s*\]$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > numQubits) numQubits = n;
        while (nextColForQ.length < numQubits) nextColForQ.push(0);
        continue;
      }
      m = stmt.match(/^creg\s+\w+\s*\[\s*(\d+)\s*\]$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > numClbits) numClbits = n;
        while (nextColForC.length < numClbits) nextColForC.push(0);
        continue;
      }

      // c[i] = measure q[j];
      m = stmt.match(/^([cq])\s*\[\s*(\d+)\s*\]\s*=\s*measure\s+(.+)$/);
      if (m) {
        const dest = parseInt(m[2], 10);
        const src = parseReg(m[3].trim());
        if (src.kind !== "q") throw new Error("measure expects a qubit operand");
        ensureQubit(src.index);
        ensureClbit(dest);
        addGate({ gateId: "measure", qubits: [src.index], clbits: [dest] });
        continue;
      }

      // reset q[i];  reset q[i], q[j];
      m = stmt.match(/^reset\s+(.+)$/);
      if (m) {
        const args = splitTopLevel(m[1]).map(parseReg);
        for (const r of args) {
          if (r.kind !== "q") throw new Error("reset expects qubit operands");
          ensureQubit(r.index);
          addGate({ gateId: "reset", qubits: [r.index] });
        }
        continue;
      }

      // barrier q[i], q[j], ...;
      m = stmt.match(/^barrier(?:\s+(.+))?$/);
      if (m) {
        if (!m[1]) {
          warnings.push({ line: lineNo, message: "barrier without operands not supported" });
          continue;
        }
        const args = splitTopLevel(m[1]).map(parseReg);
        for (const r of args) {
          if (r.kind !== "q") throw new Error("barrier expects qubit operands");
          ensureQubit(r.index);
          addGate({ gateId: "barrier", qubits: [r.index] });
        }
        continue;
      }

      // delay[expr] q[i];
      m = stmt.match(/^delay\s*\[\s*(.+?)\s*\]\s+(.+)$/);
      if (m) {
        const tau = greekify(m[1].trim());
        const r = parseReg(m[2].trim());
        if (r.kind !== "q") throw new Error("delay expects a qubit operand");
        ensureQubit(r.index);
        addGate({ gateId: "delay", qubits: [r.index], params: [tau] });
        continue;
      }

      // Modifier chain: (ctrl|negctrl)[(n)] @ ... base(params) operands;
      // Walks the chain from the front, accumulating per-control "fires on |1⟩"
      // booleans. Each modifier consumes 1 or N controls from the front of
      // the operand list. Maps the (base, totalControls) pair to an IR gate id.
      if (/^(ctrl|negctrl)\b/i.test(stmt)) {
        const chain: boolean[] = []; // true = ctrl, false = negctrl
        let rest = stmt;
        const modRe = /^(ctrl|negctrl)\s*(?:\(\s*(\d+)\s*\))?\s*@\s*/i;
        for (;;) {
          const mm = rest.match(modRe);
          if (!mm) break;
          const isCtrl = mm[1].toLowerCase() === "ctrl";
          const count = mm[2] ? parseInt(mm[2], 10) : 1;
          for (let k = 0; k < count; k++) chain.push(isCtrl);
          rest = rest.slice(mm[0].length);
        }
        const baseM = rest.match(/^([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s+(.+)$/);
        if (!baseM) {
          warnings.push({ line: lineNo, message: `modifier chain without base: "${stmt}"` });
          continue;
        }
        const baseRaw = baseM[1].toLowerCase();
        const paramsStr = baseM[2] ?? "";
        const argStr = baseM[3];
        const params = paramsStr
          ? splitTopLevel(paramsStr).map((p) => greekify(p.trim()))
          : [];
        const qs = splitTopLevel(argStr).map(parseReg);
        for (const r of qs) {
          if (r.kind !== "q") throw new Error("modifier chain expects qubit operands");
          ensureQubit(r.index);
        }
        const qubits = qs.map((r) => r.index);
        const nCtrl = chain.length;
        // Pick the right IR gate id for (base, nCtrl).
        const gateId = resolveControlled(baseRaw, nCtrl);
        if (!gateId) {
          warnings.push({
            line: lineNo,
            message: `ctrl/negctrl chain on "${baseRaw}" with ${nCtrl} control(s) — no IR mapping; skipped`,
          });
          continue;
        }
        const variableControls = gateId === "mcx" || gateId === "mcp" || gateId === "mcu";
        const hasAnti = chain.some((s) => !s);
        addGate({
          gateId,
          qubits,
          params,
          nControls: variableControls ? nCtrl : undefined,
          controlStates: hasAnti ? chain : undefined,
        });
        continue;
      }

      // Standard gate: name(params) q[i], q[j];
      m = stmt.match(/^([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s+(.+)$/);
      if (m) {
        const nameRaw = m[1].toLowerCase();
        const irId = QASM_TO_IR[nameRaw];
        if (!irId) {
          warnings.push({ line: lineNo, message: `unknown gate "${m[1]}" — skipped` });
          continue;
        }
        const paramsStr = m[2] ?? "";
        const argStr = m[3];
        const params = paramsStr
          ? splitTopLevel(paramsStr).map((p) => greekify(p.trim()))
          : [];
        const qs = splitTopLevel(argStr).map(parseReg);
        for (const r of qs) {
          if (r.kind !== "q") throw new Error(`${nameRaw} expects qubit operands`);
          ensureQubit(r.index);
        }
        const qubits = qs.map((r) => r.index);
        addGate({ gateId: irId, qubits, params });
        continue;
      }

      warnings.push({ line: lineNo, message: `unrecognized statement: "${stmt}"` });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message, line: lineNo };
    }
    } // end statement loop
  }

  return { ok: true, circuit: { numQubits, numClbits, gates }, warnings };
}
