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
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
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
    gates.push({
      id: newId(),
      gateId: opts.gateId,
      column: col,
      controls,
      targets,
      clbits,
      params,
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    // Strip line comments.
    const code = raw.split("//")[0].trim();
    if (!code) continue;
    const stmt = code.endsWith(";") ? code.slice(0, -1).trim() : code;
    if (!stmt) continue;

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

      // ctrl(n) @ name(params) q[a], q[b], q[c];
      m = stmt.match(/^ctrl\s*\(\s*(\d+)\s*\)\s*@\s*([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s+(.+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        const baseRaw = m[2].toLowerCase();
        const paramsStr = m[3] ?? "";
        const argStr = m[4];
        const params = paramsStr
          ? splitTopLevel(paramsStr).map((p) => greekify(p.trim()))
          : [];
        const qs = splitTopLevel(argStr).map(parseReg);
        for (const r of qs) {
          if (r.kind !== "q") throw new Error("ctrl @ expects qubit operands");
          ensureQubit(r.index);
        }
        const qubits = qs.map((r) => r.index);
        // Map base gate to mcx/mcp/mcu when controlling x/p/u or fall through.
        let gateId: string;
        if (baseRaw === "x") gateId = "mcx";
        else if (baseRaw === "p") gateId = "mcp";
        else if (baseRaw === "u") gateId = "mcu";
        else {
          warnings.push({
            line: lineNo,
            message: `ctrl @ ${baseRaw} not yet mapped; skipped`,
          });
          continue;
        }
        addGate({ gateId, qubits, params, nControls: n });
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
  }

  return { ok: true, circuit: { numQubits, numClbits, gates }, warnings };
}
