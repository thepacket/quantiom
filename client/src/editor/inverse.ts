import type { Circuit, PlacedGate } from "./types";
import { newGateId } from "./state";

/**
 * Generate the inverse of a circuit (or a column range within it).
 *
 * Algorithm: reverse the gate order and dagger each gate. Gate-specific
 * rules:
 *   • Self-inverse gates (X, Y, Z, H, SWAP, CX, CY, CZ, CH, CCX,
 *     CCZ, CSWAP, ECR up to phase) — unchanged.
 *   • iSWAP and DCX are NOT self-inverse (iSWAP has order 4 — iSWAP² = Z⊗Z;
 *     DCX has order 3), and neither adjoint is a single catalog gate, so
 *     they're skipped (returned as null) like u_arb rather than inverted
 *     wrongly.
 *   • Adjointable pairs (S↔S†, T↔T†, √X↔√X†, C√X↔C√X†) — swap.
 *   • Rotation gates (RX, RY, RZ, P, U1, RXX, …) — negate the angle.
 *   • U(θ,φ,λ)† = U(-θ, -λ, -φ) — and U3 the same.
 *   • CU(θ,φ,λ,γ)† swaps φ↔λ and negates all, including the global phase γ.
 *   • mcx is self-inverse; mcp(λ)† = mcp(-λ); mcu(θ,φ,λ)† same form as U.
 *   • u_arb / u_arb_2 — would need the matrix conjugate-transpose at
 *     evaluation time; we tag with a "dagger" sentinel string so the
 *     simulator can recognise it (TODO if anyone needs it). For now,
 *     these are skipped with a console warning.
 *   • Measurements / reset / markers / initialise — skipped.
 *
 * Conditions and anti-controls survive unchanged — a controlled gate's
 * inverse is the controlled inverse with the same control configuration.
 */

const SELF_INVERSE = new Set([
  "i", "x", "y", "z", "h",
  "cx", "cy", "cz", "ch",
  "swap", "ecr",
  "ccx", "ccz", "cswap",
  "c3x", "c4x", "mcx",
  "rccx", "rcccx",
  "gpi", // IonQ GPi is Hermitian ⇒ self-inverse
  "barrier",
]);

const DAGGER_PAIRS: Record<string, string> = {
  s: "sdg", sdg: "s",
  t: "tdg", tdg: "t",
  sx: "sxdg", sxdg: "sx",
  sy: "sydg", sydg: "sy",
  csx: "csxdg", csxdg: "csx",
  sqrtswap: "sqrtswapdg", sqrtswapdg: "sqrtswap",
};

const SINGLE_ANGLE_GATES = new Set([
  "rx", "ry", "rz", "p", "u1",
  "r", // R(θ,φ)† = R(−θ, φ): negate θ, keep φ
  "rxx", "ryy", "rzz", "rzx",
  "crx", "cry", "crz", "cp", "cu1",
  "mcp",
]);

const TRIPLE_ANGLE_GATES = new Set(["u", "u3", "cu3", "mcu"]);
const QUAD_ANGLE_GATES = new Set(["cu"]); // (θ, φ, λ, γ)

/** Negate a symbolic expression, simplifying common cases. */
function negateExpr(s: string): string {
  const t = s.trim();
  if (t === "" || t === "0") return "0";
  if (t.startsWith("-(") && t.endsWith(")")) return t.slice(2, -1);
  if (t.startsWith("-")) return t.slice(1);
  if (/^[A-Za-zπθφλγβτα-ω][A-Za-z0-9_]*$/.test(t)) return `-${t}`;
  // Wrap in parens to avoid precedence surprises.
  return `-(${t})`;
}

export function invertGate(g: PlacedGate): PlacedGate | null {
  const out: PlacedGate = {
    ...g,
    id: newGateId(),
    params: [...g.params],
    controls: [...g.controls],
    targets: [...g.targets],
    clbits: [...g.clbits],
    controlStates: g.controlStates ? [...g.controlStates] : undefined,
    condition: g.condition ? { ...g.condition } : undefined,
  };

  if (SELF_INVERSE.has(g.gateId)) return out;
  if (g.gateId in DAGGER_PAIRS) {
    out.gateId = DAGGER_PAIRS[g.gateId];
    return out;
  }
  if (SINGLE_ANGLE_GATES.has(g.gateId)) {
    out.params = [negateExpr(g.params[0] ?? "0"), ...g.params.slice(1)];
    return out;
  }
  if (TRIPLE_ANGLE_GATES.has(g.gateId)) {
    // U(θ,φ,λ)† = U(-θ, -λ, -φ)
    const [theta, phi, lambda] = g.params;
    out.params = [negateExpr(theta ?? "0"), negateExpr(lambda ?? "0"), negateExpr(phi ?? "0")];
    return out;
  }
  if (QUAD_ANGLE_GATES.has(g.gateId)) {
    const [theta, phi, lambda, gamma] = g.params;
    out.params = [negateExpr(theta ?? "0"), negateExpr(lambda ?? "0"), negateExpr(phi ?? "0"), negateExpr(gamma ?? "0")];
    return out;
  }
  if (g.gateId === "u2") {
    // U2(φ, λ) is not closed under simple param negation; emit U3(-π/2, -λ, -φ).
    const [phi, lambda] = g.params;
    out.gateId = "u3";
    out.params = ["-π/2", negateExpr(lambda ?? "0"), negateExpr(phi ?? "0")];
    return out;
  }
  if (g.gateId === "xx_plus_yy" || g.gateId === "xx_minus_yy") {
    out.params = [negateExpr(g.params[0] ?? "0"), g.params[1] ?? "0"];
    return out;
  }
  if (g.gateId === "fsim") {
    // fSim(θ,φ)† = fSim(−θ, −φ).
    out.params = [negateExpr(g.params[0] ?? "0"), negateExpr(g.params[1] ?? "0")];
    return out;
  }
  if (g.gateId === "ms") {
    // MS(φ₀,φ₁,θ)† = MS(φ₀,φ₁,−θ).
    out.params = [g.params[0] ?? "0", g.params[1] ?? "0", negateExpr(g.params[2] ?? "0")];
    return out;
  }
  if (g.gateId === "gpi2") {
    // GPi2(φ)† = GPi2(φ+π).
    const p = (g.params[0] ?? "0").trim();
    out.params = [p === "0" || p === "" ? "π" : `(${p}) + π`];
    return out;
  }
  // u_arb / u_arb_2 — would need conjugate transpose at sim time; not
  // attempted here. Measurements / reset / init / control-flow are not
  // invertible. State-prep init gates don't invert either.
  return null;
}

/**
 * Generate the inverse of an entire circuit, or of the gates whose
 * columns fall within [fromColumn, toColumn] inclusive. The returned
 * gates are appended to the end (columns shifted to start one past the
 * circuit's current max column).
 */
export function inverseGates(
  circuit: Circuit,
  fromColumn: number,
  toColumn: number,
): { inverted: PlacedGate[]; skipped: PlacedGate[] } {
  const selected = circuit.gates
    .filter((g) => g.column >= fromColumn && g.column <= toColumn)
    .sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));
  const inverted: PlacedGate[] = [];
  const skipped: PlacedGate[] = [];
  const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
  // Reverse order, then dagger each. We re-pack columns starting at maxCol + 1.
  let nextCol = maxCol + 1;
  // Group selected gates by column, reverse the column order, then within
  // each column, all gates run in parallel — we put them all at nextCol.
  const byColumn = new Map<number, PlacedGate[]>();
  for (const g of selected) {
    const arr = byColumn.get(g.column) ?? [];
    arr.push(g);
    byColumn.set(g.column, arr);
  }
  const columns = [...byColumn.keys()].sort((a, b) => b - a); // reverse
  for (const col of columns) {
    for (const g of byColumn.get(col)!) {
      const inv = invertGate(g);
      if (inv) {
        inv.column = nextCol;
        inverted.push(inv);
      } else {
        skipped.push(g);
      }
    }
    nextCol++;
  }
  return { inverted, skipped };
}
