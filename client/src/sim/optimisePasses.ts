import type { Circuit, PlacedGate } from "../editor/types";
import { newGateId } from "../editor/state";

/**
 * Peephole circuit optimiser. Applies a small set of well-known rewrite
 * rules until no more changes happen:
 *
 *   • Adjacent self-inverse: G·G → ∅ for I, X, Y, Z, H, CX, CY, CZ,
 *     SWAP, CCX, CCZ, CSWAP, …
 *   • Adjacent dagger-pair: S·S† → ∅, T·T† → ∅, √X·√X† → ∅, plus reverses.
 *   • Same-axis rotation merge: Rx(a)·Rx(b) → Rx(a + b); same for Ry,
 *     Rz, P. Parameters are concatenated symbolically — the expression
 *     evaluator handles "a + b" as a string.
 *   • Pauli pair collapse: distinct Paulis on the same qubit fuse to the
 *     third (X·Y → Z, Y·Z → X, Z·X → Y, and their reverses). The global
 *     ±i phase is dropped — fine for any observable / probability measure
 *     that doesn't care about global phase, which is everything we expose.
 *   • H·CX·H fusion: H(t)·CX(c,t)·H(t) → CZ(c,t). The window is three gates
 *     on the target qubit and is detected in a separate post-pass after the
 *     pair-based passes converge (the main stack walker only sees pairs).
 *   • Adjacent-on-same-qubits-only — we don't reorder gates that touch
 *     different qubit sets, even when they'd commute. That's deliberate:
 *     unconditional commutation reordering can ruin user-curated layout,
 *     and the conservative version still finds 80% of real cancellations.
 *
 * Returns a report comparing gate counts and listing which rules fired.
 */

export type OptimiseResult = {
  circuit: Circuit;
  before: number;
  after: number;
  passes: number;
  rulesFired: Record<string, number>;
};

const SELF_INVERSE = new Set([
  "i", "x", "y", "z", "h",
  "cx", "cy", "cz", "ch",
  "swap", "iswap", "dcx",
  "ccx", "ccz", "cswap",
  "c3x", "c4x",
]);

const DAGGER_PAIRS: Record<string, string> = {
  s: "sdg", sdg: "s",
  t: "tdg", tdg: "t",
  sx: "sxdg", sxdg: "sx",
  csx: "csxdg", csxdg: "csx",
};

const ROTATION_GATES = new Set(["rx", "ry", "rz", "p", "u1", "crx", "cry", "crz", "cp", "cu1"]);

// X·Y → Z (and cyclic permutations); the reverses too. Result drops the
// ±i global phase. Lookup keyed by `${a}${b}` over the Pauli set {x,y,z}.
const PAULI_PRODUCT: Record<string, string> = {
  xy: "z", yx: "z",
  yz: "x", zy: "x",
  zx: "y", xz: "y",
};

/**
 * Same-gate adjacency power merges for non-involutory single-qubit gates:
 *   T·T   → S       (T² = diag(1, e^{iπ/2}) = S)
 *   T†·T† → S†      ((T†)² = S†)
 *   S·S   → Z       (S² = diag(1, e^{iπ}) = Z up to ignored global phase)
 *   S†·S† → Z       ((S†)² = Z)
 *   √X·√X     → X
 *   √X†·√X†   → X
 *
 * The biggest win is on T-count: every successful T·T merge saves one T,
 * which the Resources panel surfaces (T is the expensive fault-tolerant
 * primitive). T·T† → I is already handled by the dagger-pair path.
 */
const POWER_PRODUCT: Record<string, string> = {
  t: "s", tdg: "sdg",
  s: "z", sdg: "z",
  sx: "x", sxdg: "x",
};

export type OptimiseOptions = {
  /** When true, also runs the commute-through-diagonals pass that hops
   *  rotations past CZ / RZZ / Z / S / T blockers to find merges. Disabled
   *  by default — it can perturb user-curated layout. */
  deep?: boolean;
};

export function optimiseCircuit(circuit: Circuit, opts: OptimiseOptions = {}): OptimiseResult {
  const before = circuit.gates.length;
  const rulesFired: Record<string, number> = {};
  let gates = [...circuit.gates].sort(
    (a, b) => a.column - b.column || a.id.localeCompare(b.id),
  );
  let passes = 0;
  let changed = true;
  while (changed && passes < 50) {
    changed = false;
    passes++;
    // Per-qubit walk: build a per-qubit "stack" of gates and check
    // adjacency on each qubit independently. A gate that touches multiple
    // qubits is the top of every qubit's stack; only consider it for
    // cancellation when the previous gate on each of those qubits is
    // the *same* gate id with the *same* qubit set.
    const remove = new Set<string>();
    const stacks: PlacedGate[][] = Array.from({ length: circuit.numQubits }, () => []);
    const merges: Array<{ keepId: string; killId: string; mergedParams: string[] }> = [];
    const rewrites: Array<{ keepId: string; killId: string; newGateId: string }> = [];

    for (const g of gates) {
      if (remove.has(g.id)) continue;
      if (g.condition || g.controlStates?.some((s) => !s)) {
        // Don't touch conditional or anti-controlled gates — semantics
        // get tricky and the savings are marginal.
        pushAll(stacks, g);
        continue;
      }

      const qubits = qubitsOf(g);
      // Check if every involved qubit's top-of-stack is the SAME previous gate.
      let common: PlacedGate | null = null;
      let canCheck = true;
      for (const q of qubits) {
        const top = stacks[q][stacks[q].length - 1];
        if (!top) { canCheck = false; break; }
        if (common === null) common = top;
        else if (top.id !== common.id) { canCheck = false; break; }
      }
      if (canCheck && common) {
        if (sameQubitSet(common, g) && tryCancel(common, g, rulesFired)) {
          remove.add(common.id);
          remove.add(g.id);
          for (const q of qubits) stacks[q].pop();
          changed = true;
          continue;
        }
        if (sameQubitSet(common, g)) {
          const pauliResult = tryPauliCollapse(common, g, rulesFired);
          if (pauliResult) {
            rewrites.push({ keepId: common.id, killId: g.id, newGateId: pauliResult });
            remove.add(g.id);
            // Pop common so subsequent gates don't re-merge with this same
            // stack entry — chained collapses accumulate over outer passes
            // instead of double-rewriting one entry in a single pass.
            for (const q of qubits) stacks[q].pop();
            changed = true;
            continue;
          }
          const powerResult = tryPowerMerge(common, g, rulesFired);
          if (powerResult) {
            rewrites.push({ keepId: common.id, killId: g.id, newGateId: powerResult });
            remove.add(g.id);
            for (const q of qubits) stacks[q].pop();
            changed = true;
            continue;
          }
        }
        if (sameQubitSet(common, g) && tryMerge(common, g, rulesFired)) {
          // Merge: replace `common` with merged params (kept), drop `g`.
          merges.push({
            keepId: common.id,
            killId: g.id,
            mergedParams: mergeRotationParams(common, g),
          });
          remove.add(g.id);
          for (const q of qubits) stacks[q].pop();
          changed = true;
          continue;
        }
      }
      pushAll(stacks, g);
    }
    // Apply merges + rewrites + removals.
    const next: PlacedGate[] = [];
    for (const g of gates) {
      if (remove.has(g.id)) continue;
      const merge = merges.find((m) => m.keepId === g.id);
      if (merge) {
        next.push({ ...g, id: newGateId(), params: merge.mergedParams });
        continue;
      }
      const rewrite = rewrites.find((r) => r.keepId === g.id);
      if (rewrite) {
        next.push({ ...g, id: newGateId(), gateId: rewrite.newGateId, params: [] });
        continue;
      }
      next.push(g);
    }
    gates = next;
  }

  // Post-pass: H(t)·CX(c,t)·H(t) → CZ(c,t). Sweep to a fixed point so
  // chains of CZ-conjugated fragments collapse fully.
  for (let i = 0; i < 50; i++) {
    const result = fuseHCXH(gates, rulesFired);
    if (!result.changed) break;
    gates = result.gates;
  }

  // Post-pass: 3-CX → SWAP synthesis recognition.
  //   CX(a,b)·CX(b,a)·CX(a,b)  →  SWAP(a,b)
  //   CX(b,a)·CX(a,b)·CX(b,a)  →  SWAP(a,b)
  // Fires on triples that are adjacent on *both* qubits (no intervening gate
  // touches a or b). Saves 2 CX per match. Default-on like the H·CX·H pass
  // — purely a collapse, no reordering, semantics preserved exactly.
  for (let i = 0; i < 50; i++) {
    const result = fuseSwapSynthesis(gates, rulesFired);
    if (!result.changed) break;
    gates = result.gates;
  }

  // Post-pass (deep mode only): commute-through-diagonals merge. Rz/P/U1/
  // CP/CRZ rotations on the same qubit can hop past any other diagonal
  // gate (Z, S, T, CZ, RZZ, …) to find a same-id same-qubit partner to
  // merge with. Gated because the column reflow that follows changes the
  // layout the user may have curated.
  if (opts.deep) {
    for (let i = 0; i < 50; i++) {
      const result = commuteDiagonalMerge(gates, rulesFired);
      if (!result.changed) break;
      gates = result.gates;
    }
  }

  // ASAP re-pack columns.
  const nextColQ = new Array<number>(circuit.numQubits).fill(0);
  const nextColC = new Array<number>(circuit.numClbits).fill(0);
  for (const g of gates) {
    const qs = qubitsOf(g);
    let col = 0;
    for (const q of qs) col = Math.max(col, nextColQ[q] ?? 0);
    for (const c of g.clbits) col = Math.max(col, nextColC[c] ?? 0);
    g.column = col;
    for (const q of qs) nextColQ[q] = col + 1;
    for (const c of g.clbits) nextColC[c] = col + 1;
  }

  return {
    circuit: {
      numQubits: circuit.numQubits,
      numClbits: circuit.numClbits,
      name: circuit.name ? `${circuit.name} (optimised)` : "optimised",
      gates,
    },
    before,
    after: gates.length,
    passes,
    rulesFired,
  };
}

function qubitsOf(g: PlacedGate): number[] {
  return [...g.controls, ...g.targets];
}

function sameQubitSet(a: PlacedGate, b: PlacedGate): boolean {
  const aq = qubitsOf(a), bq = qubitsOf(b);
  if (aq.length !== bq.length) return false;
  for (let i = 0; i < aq.length; i++) {
    if (aq[i] !== bq[i]) return false;
  }
  // For sym (a, b) but not (b, a) on a non-symmetric gate, this still
  // correctly distinguishes — we want strict equality on role and qubit.
  for (let i = 0; i < a.controls.length; i++) {
    if (a.controls[i] !== b.controls[i]) return false;
  }
  for (let i = 0; i < a.targets.length; i++) {
    if (a.targets[i] !== b.targets[i]) return false;
  }
  return true;
}

function tryCancel(a: PlacedGate, b: PlacedGate, rules: Record<string, number>): boolean {
  if (a.gateId === b.gateId && SELF_INVERSE.has(a.gateId)) {
    rules[`${a.gateId}·${a.gateId} → I`] = (rules[`${a.gateId}·${a.gateId} → I`] ?? 0) + 1;
    return true;
  }
  if (DAGGER_PAIRS[a.gateId] === b.gateId) {
    rules[`${a.gateId}·${b.gateId} → I`] = (rules[`${a.gateId}·${b.gateId} → I`] ?? 0) + 1;
    return true;
  }
  return false;
}

function tryPowerMerge(a: PlacedGate, b: PlacedGate, rules: Record<string, number>): string | null {
  if (a.controls.length !== 0 || b.controls.length !== 0) return null;
  if (a.targets.length !== 1 || b.targets.length !== 1) return null;
  if (a.gateId !== b.gateId) return null;
  const result = POWER_PRODUCT[a.gateId];
  if (!result) return null;
  rules[`${a.gateId}·${a.gateId} → ${result}`] =
    (rules[`${a.gateId}·${a.gateId} → ${result}`] ?? 0) + 1;
  return result;
}

function tryPauliCollapse(a: PlacedGate, b: PlacedGate, rules: Record<string, number>): string | null {
  // Both must be uncontrolled single-qubit Paulis on the same qubit.
  if (a.controls.length !== 0 || b.controls.length !== 0) return null;
  if (a.targets.length !== 1 || b.targets.length !== 1) return null;
  if (!(a.gateId === "x" || a.gateId === "y" || a.gateId === "z")) return null;
  if (!(b.gateId === "x" || b.gateId === "y" || b.gateId === "z")) return null;
  if (a.gateId === b.gateId) return null; // handled by self-inverse path
  const result = PAULI_PRODUCT[`${a.gateId}${b.gateId}`];
  if (!result) return null;
  rules[`${a.gateId}·${b.gateId} → ${result}`] = (rules[`${a.gateId}·${b.gateId} → ${result}`] ?? 0) + 1;
  return result;
}

function tryMerge(a: PlacedGate, b: PlacedGate, rules: Record<string, number>): boolean {
  if (a.gateId !== b.gateId) return false;
  if (!ROTATION_GATES.has(a.gateId)) return false;
  if (a.params.length !== b.params.length) return false;
  rules[`${a.gateId}(a)·${a.gateId}(b) → ${a.gateId}(a+b)`] =
    (rules[`${a.gateId}(a)·${a.gateId}(b) → ${a.gateId}(a+b)`] ?? 0) + 1;
  return true;
}

function mergeRotationParams(a: PlacedGate, b: PlacedGate): string[] {
  return a.params.map((p, i) => combineExpr(p, b.params[i]));
}

function combineExpr(a: string, b: string): string {
  const ta = a.trim(), tb = b.trim();
  if (!ta || ta === "0") return tb;
  if (!tb || tb === "0") return ta;
  const na = parseFloat(ta), nb = parseFloat(tb);
  if (Number.isFinite(na) && Number.isFinite(nb) && ta === na.toString() && tb === nb.toString()) {
    return (na + nb).toString();
  }
  const bSign = tb.startsWith("-") ? "" : "+";
  return `${ta} ${bSign} ${tb}`;
}

/**
 * Detect H(t)·CX(c,t)·H(t) windows and replace with CZ(c,t). Returns the
 * (possibly new) gate list and whether any fusion fired.
 *
 * The "previous gate on the target qubit" check is the right adjacency
 * criterion: any other gate touching t between H and CX would have been the
 * predecessor instead. The H is uncontrolled and single-qubit so it has no
 * other dependencies to worry about.
 */
function fuseHCXH(
  gates: PlacedGate[],
  rules: Record<string, number>,
): { gates: PlacedGate[]; changed: boolean } {
  const sorted = [...gates].sort(
    (a, b) => a.column - b.column || a.id.localeCompare(b.id),
  );
  // Per-qubit lists of (index into sorted).
  const numQ = sorted.reduce(
    (m, g) => Math.max(m, ...g.controls, ...g.targets),
    -1,
  ) + 1;
  const perQ: number[][] = Array.from({ length: numQ }, () => []);
  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    for (const q of [...g.controls, ...g.targets]) {
      if (q < numQ) perQ[q].push(i);
    }
  }

  const remove = new Set<string>();
  const rewriteCXtoCZ = new Set<string>();
  let changed = false;

  const isPlainH = (g: PlacedGate, t: number) =>
    g.gateId === "h" && g.controls.length === 0 && g.targets.length === 1 && g.targets[0] === t
    && !g.condition && !g.controlStates?.some((s) => !s);

  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    if (g.gateId !== "cx") continue;
    if (g.condition || g.controlStates?.some((s) => !s)) continue;
    if (g.controls.length !== 1 || g.targets.length !== 1) continue;
    if (remove.has(g.id) || rewriteCXtoCZ.has(g.id)) continue;
    const t = g.targets[0];
    const list = perQ[t];
    if (!list) continue;
    const pos = list.indexOf(i);
    if (pos <= 0 || pos >= list.length - 1) continue;
    const prev = sorted[list[pos - 1]];
    const next = sorted[list[pos + 1]];
    if (remove.has(prev.id) || remove.has(next.id)) continue;
    if (!isPlainH(prev, t) || !isPlainH(next, t)) continue;
    // Fuse: drop both Hs, rewrite CX → CZ. The cz is symmetric so the
    // control/target roles don't matter for semantics, but keep them
    // matching the original CX's c→t for layout continuity.
    remove.add(prev.id);
    remove.add(next.id);
    rewriteCXtoCZ.add(g.id);
    rules["H·CX·H → CZ"] = (rules["H·CX·H → CZ"] ?? 0) + 1;
    changed = true;
  }

  if (!changed) return { gates, changed };
  const next: PlacedGate[] = [];
  for (const g of gates) {
    if (remove.has(g.id)) continue;
    if (rewriteCXtoCZ.has(g.id)) {
      next.push({ ...g, id: newGateId(), gateId: "cz" });
      continue;
    }
    next.push(g);
  }
  return { gates: next, changed };
}

/**
 * Detect 3-CX SWAP patterns and collapse to a single SWAP gate.
 *
 * The textbook identity:
 *   CX(a,b) · CX(b,a) · CX(a,b)  =  SWAP(a,b)
 *
 * The mirror form CX(b,a)·CX(a,b)·CX(b,a) collapses to the same SWAP.
 * We require all three CXs to be adjacent on BOTH qubits — i.e., no other
 * gate touches a or b between them. That keeps the rewrite semantically
 * sound regardless of what's happening on other qubits.
 */
function fuseSwapSynthesis(
  gates: PlacedGate[],
  rules: Record<string, number>,
): { gates: PlacedGate[]; changed: boolean } {
  const sorted = [...gates].sort(
    (a, b) => a.column - b.column || a.id.localeCompare(b.id),
  );
  const numQ = sorted.reduce(
    (m, g) => Math.max(m, ...g.controls, ...g.targets),
    -1,
  ) + 1;
  // Per-qubit gate index lists, in time order.
  const perQ: number[][] = Array.from({ length: numQ }, () => []);
  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    for (const q of [...g.controls, ...g.targets]) {
      if (q < numQ) perQ[q].push(i);
    }
  }

  const isPlainCX = (g: PlacedGate) =>
    g.gateId === "cx"
    && g.controls.length === 1 && g.targets.length === 1
    && !g.condition && !g.controlStates?.some((s) => !s);

  const remove = new Set<string>();
  const rewriteToSwap = new Set<string>();
  let changed = false;

  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    if (!isPlainCX(g)) continue;
    if (remove.has(g.id) || rewriteToSwap.has(g.id)) continue;
    const a = g.controls[0];
    const b = g.targets[0];
    if (a < 0 || b < 0 || a >= numQ || b >= numQ) continue;
    // Find this gate's positions in both qubits' adjacency lists.
    const listA = perQ[a]; const listB = perQ[b];
    const posA = listA.indexOf(i); const posB = listB.indexOf(i);
    if (posA <= 0 || posB <= 0) continue;
    if (posA >= listA.length - 1 || posB >= listB.length - 1) continue;
    // Adjacency on both qubits → prev and next must be the same gate
    // indices, otherwise some other gate is interposed.
    if (listA[posA - 1] !== listB[posB - 1]) continue;
    if (listA[posA + 1] !== listB[posB + 1]) continue;
    const prev = sorted[listA[posA - 1]];
    const next = sorted[listA[posA + 1]];
    if (!isPlainCX(prev) || !isPlainCX(next)) continue;
    if (remove.has(prev.id) || remove.has(next.id)) continue;
    if (rewriteToSwap.has(prev.id) || rewriteToSwap.has(next.id)) continue;
    // Pattern: outer = CX(b, a), middle = g = CX(a, b). The mirror
    // configuration (outer = CX(a,b), middle = CX(b,a)) is naturally caught
    // when iteration reaches *that* middle — no need to handle both here.
    const prevC = prev.controls[0], prevT = prev.targets[0];
    const nextC = next.controls[0], nextT = next.targets[0];
    if (!(prevC === b && prevT === a && nextC === b && nextT === a)) continue;
    remove.add(prev.id);
    remove.add(next.id);
    rewriteToSwap.add(g.id);
    rules["CX·CX·CX → SWAP"] = (rules["CX·CX·CX → SWAP"] ?? 0) + 1;
    changed = true;
  }

  if (!changed) return { gates, changed };
  const next: PlacedGate[] = [];
  for (const g of gates) {
    if (remove.has(g.id)) continue;
    if (rewriteToSwap.has(g.id)) {
      // SWAP is symmetric; pick a canonical (control,target) → (∅, [a, b]).
      const a = g.controls[0]; const b = g.targets[0];
      next.push({ ...g, id: newGateId(), gateId: "swap", controls: [], targets: [a, b] });
      continue;
    }
    next.push(g);
  }
  return { gates: next, changed };
}

/**
 * Diagonal gates in the computational basis commute pairwise even on
 * overlapping qubits. That lets a same-id rotation pair separated *only* by
 * other diagonals merge: e.g. `Rz(a) · CZ · Rz(b)` on the same qubit becomes
 * `CZ · Rz(a + b)`.
 *
 * To stay safe we only merge rotations from a clean class (rz, p, u1, crz,
 * cp, cu1, rzz). All listed gates are diagonal, so the "diagonal class"
 * acts as both the rotation to merge and the blocker that's allowed to
 * sit between two same-id rotations.
 */
const DIAGONAL_GATES = new Set([
  "i", "z", "s", "sdg", "t", "tdg", "rz", "p", "u1",
  "cz", "cp", "cu1", "crz", "rzz",
]);
const DIAGONAL_ROTATIONS = new Set(["rz", "p", "u1", "crz", "cp", "cu1", "rzz"]);

function isDiagonalForQubit(g: PlacedGate, q: number): boolean {
  if (g.controlStates?.some((s) => !s)) return false;
  if (g.condition) return false;
  const qs = [...g.controls, ...g.targets];
  if (!qs.includes(q)) return true; // doesn't touch q at all — trivially commutes
  return DIAGONAL_GATES.has(g.gateId);
}

function commuteDiagonalMerge(
  gates: PlacedGate[],
  rules: Record<string, number>,
): { gates: PlacedGate[]; changed: boolean } {
  const sorted = [...gates].sort(
    (a, b) => a.column - b.column || a.id.localeCompare(b.id),
  );
  const remove = new Set<string>();
  const mergedById = new Map<string, string[]>();
  let changed = false;

  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    if (remove.has(g.id)) continue;
    if (!DIAGONAL_ROTATIONS.has(g.gateId)) continue;
    if (g.condition || g.controlStates?.some((s) => !s)) continue;
    const qubits = [...g.controls, ...g.targets];

    // Walk backwards through earlier gates. Find the nearest predecessor
    // that's a same-id, same-qubit-set rotation we can commute through.
    for (let j = i - 1; j >= 0; j--) {
      const prev = sorted[j];
      if (remove.has(prev.id)) continue;
      // Does prev touch any of g's qubits?
      const prevQs = [...prev.controls, ...prev.targets];
      const overlap = prevQs.some((pq) => qubits.includes(pq));
      if (!overlap) continue; // independent, keep walking
      // If prev is the same gate id on the same qubit set with same controls/targets
      // → merge.
      if (
        prev.gateId === g.gateId
        && sameQubitSet(prev, g)
        && !prev.condition
        && !prev.controlStates?.some((s) => !s)
      ) {
        const prevParams = mergedById.get(prev.id) ?? prev.params;
        const merged = prevParams.map((p, k) => combineExpr(p, g.params[k] ?? ""));
        mergedById.set(prev.id, merged);
        remove.add(g.id);
        rules[`commute-merge ${g.gateId}`] =
          (rules[`commute-merge ${g.gateId}`] ?? 0) + 1;
        changed = true;
        break;
      }
      // Can we commute g past prev? Only if prev is diagonal on every qubit
      // g touches that prev also touches.
      const stillCommutes = qubits.every((q) => isDiagonalForQubit(prev, q));
      if (!stillCommutes) break;
    }
  }

  if (!changed) return { gates, changed: false };
  const next: PlacedGate[] = [];
  for (const g of gates) {
    if (remove.has(g.id)) continue;
    const mergedParams = mergedById.get(g.id);
    if (mergedParams) {
      next.push({ ...g, id: newGateId(), params: mergedParams });
      continue;
    }
    next.push(g);
  }
  return { gates: next, changed: true };
}

function pushAll(stacks: PlacedGate[][], g: PlacedGate): void {
  for (const q of qubitsOf(g)) {
    if (stacks[q]) stacks[q].push(g);
  }
  for (const c of g.clbits) {
    void c; // clbit stacks not tracked
  }
}
