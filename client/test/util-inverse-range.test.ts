import { describe, test, expect } from "vitest";
import { invertGate, inverseGates } from "../src/editor/inverse";
import type { Circuit, PlacedGate } from "../src/editor/types";
import { gate } from "./helpers";

describe("inverseGates — range reversal & column re-packing", () => {
  test("reverses the column order, daggers each, appends past the last column", () => {
    const c: Circuit = {
      numQubits: 2,
      numClbits: 0,
      gates: [
        { ...gate("h", [0]), column: 0 },
        { ...gate("cx", [1], [0]), column: 1 },
        { ...gate("t", [0]), column: 2 },
      ],
    };
    const { inverted, skipped } = inverseGates(c, 0, 2);
    expect(skipped).toHaveLength(0);
    // Reverse order: t† , cx , h  — placed starting one past maxCol (2).
    expect(inverted.map((g) => g.gateId)).toEqual(["tdg", "cx", "h"]);
    expect(inverted.map((g) => g.column)).toEqual([3, 4, 5]);
  });

  test("gates sharing a column stay parallel (same target column)", () => {
    const c: Circuit = {
      numQubits: 2,
      numClbits: 0,
      gates: [
        { ...gate("h", [0]), column: 0 },
        { ...gate("x", [1]), column: 0 },
      ],
    };
    const { inverted } = inverseGates(c, 0, 0);
    expect(inverted).toHaveLength(2);
    expect(inverted[0].column).toBe(inverted[1].column);
    expect(inverted[0].column).toBe(1); // maxCol 0 → start at 1
  });

  test("only gates within [from,to] are inverted", () => {
    const c: Circuit = {
      numQubits: 1,
      numClbits: 0,
      gates: [
        { ...gate("h", [0]), column: 0 },
        { ...gate("s", [0]), column: 1 },
        { ...gate("t", [0]), column: 2 },
      ],
    };
    const { inverted } = inverseGates(c, 1, 1);
    expect(inverted.map((g) => g.gateId)).toEqual(["sdg"]);
  });

  test("non-invertible gates are reported as skipped, not inverted", () => {
    const c: Circuit = {
      numQubits: 1,
      numClbits: 1,
      gates: [
        { ...gate("h", [0]), column: 0 },
        { ...gate("measure", [0]), clbits: [0], column: 1 },
      ],
    };
    const { inverted, skipped } = inverseGates(c, 0, 1);
    expect(inverted.map((g) => g.gateId)).toEqual(["h"]);
    expect(skipped.map((g) => g.gateId)).toEqual(["measure"]);
  });

  test("an empty range yields nothing", () => {
    const c: Circuit = { numQubits: 1, numClbits: 0, gates: [{ ...gate("h", [0]), column: 0 }] };
    const { inverted, skipped } = inverseGates(c, 5, 9);
    expect(inverted).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });
});

describe("invertGate — angle-family daggers", () => {
  test("U(θ,φ,λ)† = U(−θ,−λ,−φ)", () => {
    const inv = invertGate(gate("u3", [0], [], ["a", "b", "c"]))!;
    expect(inv.params).toEqual(["-a", "-c", "-b"]);
  });

  test("CU(θ,φ,λ,γ)† negates and swaps φ↔λ, keeps the global-phase slot", () => {
    const inv = invertGate(gate("cu", [1], [0], ["a", "b", "c", "d"]))!;
    expect(inv.params).toEqual(["-a", "-c", "-b", "-d"]);
  });

  test("cu3 / mcu follow the triple-angle form", () => {
    expect(invertGate(gate("cu3", [1], [0], ["a", "b", "c"]))!.params).toEqual(["-a", "-c", "-b"]);
    expect(invertGate(gate("mcu", [1], [0], ["a", "b", "c"]))!.params).toEqual(["-a", "-c", "-b"]);
  });

  test("U2(φ,λ)† lowers to U3(−π/2,−λ,−φ)", () => {
    const inv = invertGate(gate("u2", [0], [], ["a", "b"]))!;
    expect(inv.gateId).toBe("u3");
    expect(inv.params).toEqual(["-π/2", "-b", "-a"]);
  });

  test("xx_plus_yy / xx_minus_yy negate θ but keep the phase β", () => {
    expect(invertGate(gate("xx_plus_yy", [0, 1], [], ["a", "b"]))!.params).toEqual(["-a", "b"]);
    expect(invertGate(gate("xx_minus_yy", [0, 1], [], ["a", "b"]))!.params).toEqual(["-a", "b"]);
  });

  test("MS(φ₀,φ₁,θ)† negates only θ", () => {
    expect(invertGate(gate("ms", [0, 1], [], ["a", "b", "c"]))!.params).toEqual(["a", "b", "-c"]);
  });

  test("GPi2(φ)† = GPi2(φ+π); 0 collapses to π", () => {
    expect(invertGate(gate("gpi2", [0], [], ["0"]))!.params).toEqual(["π"]);
    expect(invertGate(gate("gpi2", [0], [], ["x"]))!.params).toEqual(["(x) + π"]);
    expect(invertGate(gate("gpi2", [0], [], []))!.params).toEqual(["π"]);
  });

  test("mcp(λ)† negates the angle", () => {
    expect(invertGate(gate("mcp", [1], [0], ["a"]))!.params).toEqual(["-a"]);
  });
});

describe("invertGate — negateExpr simplifications (via rz)", () => {
  const rzInv = (p: string) => invertGate(gate("rz", [0], [], [p]))!.params[0];
  test("double-negation and paren-unwrapping", () => {
    expect(rzInv("-(x)")).toBe("x");
    expect(rzInv("-y")).toBe("y");
  });
  test("bare identifier gets a leading minus", () => {
    expect(rzInv("θ")).toBe("-θ");
  });
  test("compound expressions are wrapped to protect precedence", () => {
    expect(rzInv("a+b")).toBe("-(a+b)");
  });
  test("zero and empty stay zero", () => {
    expect(rzInv("0")).toBe("0");
    expect(rzInv("")).toBe("0");
  });
});

describe("invertGate — structure preservation & refusals", () => {
  test("conditions and anti-controls survive the dagger", () => {
    const g: PlacedGate = {
      ...gate("cx", [1], [0]),
      controlStates: [false],
      condition: { clbit: 0, value: 1 },
    };
    const inv = invertGate(g)!;
    expect(inv.controlStates).toEqual([false]);
    expect(inv.condition).toEqual({ clbit: 0, value: 1 });
    // A fresh id is allocated (it's a new gate object).
    expect(inv.id).not.toBe(g.id);
  });

  test("returns null for arbitrary unitaries and non-unitary gates", () => {
    for (const id of ["u_arb", "u_arb_2", "measure", "reset", "init0", "if"]) {
      expect(invertGate(gate(id, [0]))).toBeNull();
    }
  });
});
