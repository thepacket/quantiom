/**
 * Export lowering for the SDK code emitters. A handful of gates have no
 * direct method in most target SDKs but decompose exactly into gates every
 * emitter already supports. Each emitter calls this first; if it returns a
 * non-null list, the emitter emits those sub-gates instead.
 *
 *   r(θ,φ)  = Rz(−φ)·Rx(θ)·Rz(φ)         (exact)
 *   √Y      = Ry(π/2)                     (exact up to a global phase e^{iπ/4})
 *   √Y†     = Ry(−π/2)                    (exact up to a global phase)
 *   gpi(φ)  = R(π, φ)                     (exact up to a global phase)
 *   gpi2(φ) = R(π/2, φ)                   (exact)
 *   ms(φ₀,φ₁,θ) = Rz(φ₀)⊗Rz(φ₁) · RXX(θ) · Rz(−φ₀)⊗Rz(−φ₁)   (exact)
 *
 * The √Y global phase is unobservable for an uncontrolled gate, so dropping
 * it is standard practice for export. Gates with no good decomposition
 * (fsim, √SWAP) return null and fall through to the emitter's own handling
 * (a native method where the SDK has one, else a graceful comment).
 */

import type { PlacedGate } from "../editor/types";
import { newGateId } from "../editor/state";

function neg(expr: string): string {
  const t = (expr ?? "0").trim();
  if (t === "" || t === "0") return "0";
  if (t.startsWith("-")) return t.slice(1);
  return `-(${t})`;
}

function make(g: PlacedGate, gateId: string, targets: number[], params: string[]): PlacedGate {
  return {
    id: newGateId(),
    gateId: gateId as PlacedGate["gateId"],
    column: g.column,
    controls: [],
    targets,
    clbits: [],
    params,
    condition: g.condition ? { ...g.condition } : undefined,
  };
}

function single(g: PlacedGate, gateId: string, params: string[]): PlacedGate {
  return make(g, gateId, [...g.targets], params);
}

export function exportLower(g: PlacedGate): PlacedGate[] | null {
  // Only lower plain (uncontrolled) placements; controlled forms aren't
  // produced by these gates in the editor.
  if (g.controls.length > 0) return null;
  switch (g.gateId) {
    case "r": {
      const theta = g.params[0] ?? "0";
      const phi = g.params[1] ?? "0";
      return [
        single(g, "rz", [neg(phi)]),
        single(g, "rx", [theta]),
        single(g, "rz", [phi]),
      ];
    }
    case "sy":
      return [single(g, "ry", ["π/2"])];
    case "sydg":
      return [single(g, "ry", ["-π/2"])];
    case "gpi":
      // GPi(φ) = R(π, φ) up to global phase.
      return [single(g, "r", ["π", g.params[0] ?? "0"])];
    case "gpi2":
      // GPi2(φ) = R(π/2, φ) exactly.
      return [single(g, "r", ["π/2", g.params[0] ?? "0"])];
    case "ms": {
      // MS(φ₀,φ₁,θ) = (Rz(φ₀)⊗Rz(φ₁)) RXX(θ) (Rz(−φ₀)⊗Rz(−φ₁)).
      const [p0, p1, th] = [g.params[0] ?? "0", g.params[1] ?? "0", g.params[2] ?? "0"];
      const a = g.targets[0], b = g.targets[1];
      if (a === undefined || b === undefined) return null;
      return [
        make(g, "rz", [a], [neg(p0)]),
        make(g, "rz", [b], [neg(p1)]),
        make(g, "rxx", [a, b], [th]),
        make(g, "rz", [a], [p0]),
        make(g, "rz", [b], [p1]),
      ];
    }
    default:
      return null;
  }
}
