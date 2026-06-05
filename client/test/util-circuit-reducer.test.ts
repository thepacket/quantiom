import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  historyReducerExport as hr,
  initialVersioned,
  loadFromStorage,
  qubitSpan,
  buildPlacedGate,
  newGateId,
  type Versioned,
  type Action,
  type HistoryAction,
} from "../src/editor/state";
import type { Circuit, PlacedGate } from "../src/editor/types";
import { gate } from "./helpers";

// Drive the inner circuit reducer through the history wrapper: a single
// non-coalescing action on a fresh `Versioned` leaves `present` equal to
// `reducer(initial, action)`.
function reduce(circuit: Circuit, action: Action): Circuit {
  const v: Versioned = { past: [], present: circuit, future: [], coalesce: null };
  return hr(v, action).present;
}

const base: Circuit = { numQubits: 5, numClbits: 2, gates: [] };

describe("circuit reducer — registers", () => {
  test("add/remove qubit", () => {
    expect(reduce(base, { type: "add-qubit" }).numQubits).toBe(6);
    expect(reduce(base, { type: "remove-qubit" }).numQubits).toBe(4);
  });

  test("remove-qubit clamps at 1 and drops gates on the last wire", () => {
    const single: Circuit = { numQubits: 1, numClbits: 0, gates: [] };
    expect(reduce(single, { type: "remove-qubit" })).toBe(single); // no-op identity

    const c: Circuit = {
      numQubits: 3,
      numClbits: 0,
      gates: [gate("h", [0]), gate("cx", [2], [1])], // touches qubit 2 (the last)
    };
    const out = reduce(c, { type: "remove-qubit" });
    expect(out.numQubits).toBe(2);
    expect(out.gates).toHaveLength(1);
    expect(out.gates[0].gateId).toBe("h");
  });

  test("add/remove clbit; remove clamps at 0 and drops gates using the last clbit", () => {
    expect(reduce(base, { type: "add-clbit" }).numClbits).toBe(3);
    const c: Circuit = {
      numQubits: 2,
      numClbits: 2,
      gates: [{ ...gate("measure", [0]), clbits: [1] }],
    };
    const out = reduce(c, { type: "remove-clbit" });
    expect(out.numClbits).toBe(1);
    expect(out.gates).toHaveLength(0);

    const noClbits: Circuit = { numQubits: 1, numClbits: 0, gates: [] };
    expect(reduce(noClbits, { type: "remove-clbit" })).toBe(noClbits);
  });
});

describe("circuit reducer — gate placement", () => {
  test("place-gate appends and relocates on collision", () => {
    const g1 = { ...gate("h", [0]), column: 0 };
    const c: Circuit = { numQubits: 3, numClbits: 0, gates: [g1] };
    // A second gate on qubit 0 in the same column must shift right.
    const g2 = { ...gate("x", [0]), column: 0 };
    const out = reduce(c, { type: "place-gate", gate: g2 });
    expect(out.gates).toHaveLength(2);
    expect(out.gates[1].column).toBe(1);
  });

  test("place-gate keeps non-colliding column", () => {
    const g1 = { ...gate("h", [0]), column: 0 };
    const c: Circuit = { numQubits: 3, numClbits: 0, gates: [g1] };
    const g2 = { ...gate("x", [2]), column: 0 }; // different wire
    const out = reduce(c, { type: "place-gate", gate: g2 });
    expect(out.gates[1].column).toBe(0);
  });

  test("relocation accounts for the vertical span of multi-qubit gates", () => {
    // A CX on (0→2) spans qubits 0,1,2. A new gate on qubit 1 in col 0 collides.
    const cx = { ...gate("cx", [2], [0]), column: 0 };
    const c: Circuit = { numQubits: 3, numClbits: 0, gates: [cx] };
    const g = { ...gate("x", [1]), column: 0 };
    const out = reduce(c, { type: "place-gate", gate: g });
    expect(out.gates[1].column).toBe(1);
  });

  test("remove-gate by id", () => {
    const g1 = gate("h", [0]);
    const c: Circuit = { numQubits: 2, numClbits: 0, gates: [g1, gate("x", [1])] };
    const out = reduce(c, { type: "remove-gate", id: g1.id });
    expect(out.gates).toHaveLength(1);
    expect(out.gates[0].gateId).toBe("x");
  });

  test("update-gate merges a patch by id", () => {
    const g1 = gate("rx", [0], [], ["theta"]);
    const c: Circuit = { numQubits: 1, numClbits: 0, gates: [g1] };
    const out = reduce(c, { type: "update-gate", id: g1.id, patch: { params: ["pi/2"] } });
    expect(out.gates[0].params).toEqual(["pi/2"]);
  });
});

describe("circuit reducer — move-gate", () => {
  test("shifts qubits by the anchor delta and updates the column", () => {
    const cx = { ...gate("cx", [1], [0]), column: 0 };
    const c: Circuit = { numQubits: 4, numClbits: 0, gates: [cx] };
    const out = reduce(c, { type: "move-gate", id: cx.id, column: 2, anchorQubit: 2 });
    const m = out.gates[0];
    expect(m.controls).toEqual([2]); // lo was 0 → anchor 2 ⇒ shift +2
    expect(m.targets).toEqual([3]);
    expect(m.column).toBe(2);
  });

  test("clamps the shift so the gate stays in range", () => {
    const cx = { ...gate("cx", [1], [0]), column: 0 };
    const c: Circuit = { numQubits: 2, numClbits: 0, gates: [cx] };
    // anchor 5 would push qubit 1 → 6 out of a 2-qubit register; clamp to fit.
    const out = reduce(c, { type: "move-gate", id: cx.id, column: 0, anchorQubit: 5 });
    const m = out.gates[0];
    expect(Math.max(...m.controls, ...m.targets)).toBeLessThan(2);
  });

  test("is a no-op for an unknown id or a span-less gate", () => {
    const c: Circuit = { numQubits: 2, numClbits: 0, gates: [gate("h", [0])] };
    expect(reduce(c, { type: "move-gate", id: "nope", column: 1, anchorQubit: 1 })).toBe(c);
  });
});

describe("circuit reducer — reassign-qubit", () => {
  test("moves a control to a new free wire", () => {
    const cx = gate("cx", [1], [0]);
    const c: Circuit = { numQubits: 4, numClbits: 0, gates: [cx] };
    const out = reduce(c, { type: "reassign-qubit", id: cx.id, role: "controls", index: 0, newQubit: 3 });
    expect(out.gates[0].controls).toEqual([3]);
  });

  test("rejects an out-of-bounds qubit", () => {
    const cx = gate("cx", [1], [0]);
    const c: Circuit = { numQubits: 4, numClbits: 0, gates: [cx] };
    expect(reduce(c, { type: "reassign-qubit", id: cx.id, role: "controls", index: 0, newQubit: 9 })).toBe(c);
  });

  test("rejects assigning the same wire to two roles", () => {
    const cx = gate("cx", [1], [0]); // control 0, target 1
    const c: Circuit = { numQubits: 4, numClbits: 0, gates: [cx] };
    // Move control onto qubit 1 — collides with the target role.
    expect(reduce(c, { type: "reassign-qubit", id: cx.id, role: "controls", index: 0, newQubit: 1 })).toBe(c);
  });
});

describe("circuit reducer — bulk column ops", () => {
  test("compact-columns ASAP-repacks gates left", () => {
    const c: Circuit = {
      numQubits: 2,
      numClbits: 0,
      gates: [
        { ...gate("h", [0]), column: 3 },
        { ...gate("x", [1]), column: 7 },
        { ...gate("cx", [1], [0]), column: 9 },
      ],
    };
    const out = reduce(c, { type: "compact-columns" });
    const byGate = Object.fromEntries(out.gates.map((g) => [g.gateId, g.column]));
    expect(byGate.h).toBe(0);
    expect(byGate.x).toBe(0); // independent wire, also column 0
    expect(byGate.cx).toBe(1); // depends on both wires from column 0
  });

  test("delete-range removes columns within [lo,hi] (order-insensitive)", () => {
    const c: Circuit = {
      numQubits: 1,
      numClbits: 0,
      gates: [
        { ...gate("h", [0]), column: 0 },
        { ...gate("x", [0]), column: 1 },
        { ...gate("z", [0]), column: 2 },
      ],
    };
    const out = reduce(c, { type: "delete-range", fromColumn: 2, toColumn: 1 });
    expect(out.gates.map((g) => g.gateId)).toEqual(["h"]);
  });

  test("duplicate-range clones with fresh ids beyond the last column", () => {
    const c: Circuit = {
      numQubits: 1,
      numClbits: 0,
      gates: [
        { ...gate("h", [0]), column: 0 },
        { ...gate("x", [0]), column: 1 },
      ],
    };
    const out = reduce(c, { type: "duplicate-range", fromColumn: 0, toColumn: 1 });
    expect(out.gates).toHaveLength(4);
    const clones = out.gates.slice(2);
    expect(clones.map((g) => g.gateId)).toEqual(["h", "x"]);
    expect(clones[0].column).toBe(2);
    expect(clones[1].column).toBe(3);
    // Cloned ids are distinct from the originals.
    const ids = new Set(out.gates.map((g) => g.id));
    expect(ids.size).toBe(4);
  });
});

describe("circuit reducer — qubit names & misc", () => {
  test("rename-qubit sets a name and trims trailing blanks", () => {
    const c: Circuit = { numQubits: 3, numClbits: 0, gates: [] };
    const out = reduce(c, { type: "rename-qubit", index: 1, name: "ancilla" });
    expect(out.qubitNames).toEqual(["", "ancilla"]); // trailing "" at idx 2 trimmed
  });

  test("rename-qubit clearing the only name drops the array", () => {
    const c: Circuit = { numQubits: 2, numClbits: 0, gates: [], qubitNames: ["a", ""] };
    const out = reduce(c, { type: "rename-qubit", index: 0, name: "" });
    expect(out.qubitNames).toBeUndefined();
  });

  test("rename-qubit rejects out-of-bounds index", () => {
    const c: Circuit = { numQubits: 2, numClbits: 0, gates: [] };
    expect(reduce(c, { type: "rename-qubit", index: 5, name: "x" })).toBe(c);
  });

  test("replace-circuit swaps wholesale", () => {
    const fresh: Circuit = { numQubits: 1, numClbits: 0, gates: [gate("h", [0])] };
    expect(reduce(base, { type: "replace-circuit", circuit: fresh })).toBe(fresh);
  });

  test("clear empties gates but keeps registers", () => {
    const c: Circuit = { numQubits: 3, numClbits: 1, gates: [gate("h", [0])] };
    const out = reduce(c, { type: "clear" });
    expect(out.gates).toHaveLength(0);
    expect(out.numQubits).toBe(3);
    expect(out.numClbits).toBe(1);
  });
});

describe("qubitSpan", () => {
  test("fills the contiguous vertical span between min and max", () => {
    expect(qubitSpan(gate("cx", [3], [0]))).toEqual([0, 1, 2, 3]);
  });
  test("single-qubit gate spans one wire; empty gate spans none", () => {
    expect(qubitSpan(gate("h", [2]))).toEqual([2]);
    expect(qubitSpan({ ...gate("barrier", []), controls: [], targets: [] } as PlacedGate)).toEqual([]);
  });
});

describe("buildPlacedGate", () => {
  test("splits qubits into controls/targets and seeds control states", () => {
    const g = buildPlacedGate("cx", 0, [0, 1]);
    expect(g.controls).toEqual([0]);
    expect(g.targets).toEqual([1]);
    expect(g.controlStates).toEqual([true]);
  });

  test("single-qubit gate has no control states and default params", () => {
    const g = buildPlacedGate("rx", 0, [0]);
    expect(g.controls).toEqual([]);
    expect(g.controlStates).toBeUndefined();
    expect(g.params).toHaveLength(1);
  });

  test("throws when the qubit count is wrong", () => {
    expect(() => buildPlacedGate("cx", 0, [0])).toThrow();
  });
});

describe("newGateId", () => {
  test("returns monotonically distinct ids", () => {
    const a = newGateId();
    const b = newGateId();
    expect(a).not.toBe(b);
  });
});

describe("history wrapper — undo/redo & coalescing", () => {
  afterEach(() => vi.useRealTimers());

  test("a non-coalescing action pushes onto past and clears future", () => {
    const v0 = initialVersioned;
    const v1 = hr(v0, { type: "add-qubit" });
    expect(v1.past).toHaveLength(1);
    expect(v1.future).toHaveLength(0);
    expect(v1.present.numQubits).toBe(v0.present.numQubits + 1);
  });

  test("undo then redo round-trips the present", () => {
    const v1 = hr(initialVersioned, { type: "add-qubit" });
    const undone = hr(v1, { type: "undo" } as HistoryAction);
    expect(undone.present).toBe(initialVersioned.present);
    expect(undone.future).toHaveLength(1);
    const redone = hr(undone, { type: "redo" } as HistoryAction);
    expect(redone.present).toBe(v1.present);
  });

  test("undo/redo are no-ops at the ends of history", () => {
    expect(hr(initialVersioned, { type: "undo" } as HistoryAction)).toBe(initialVersioned);
    expect(hr(initialVersioned, { type: "redo" } as HistoryAction)).toBe(initialVersioned);
  });

  test("a reducer no-op returns the same Versioned reference", () => {
    const single: Versioned = {
      past: [],
      present: { numQubits: 1, numClbits: 0, gates: [] },
      future: [],
      coalesce: null,
    };
    expect(hr(single, { type: "remove-qubit" })).toBe(single);
  });

  test("consecutive update-gate on the same id coalesces into one history step", () => {
    vi.useFakeTimers();
    const g = gate("rx", [0], [], ["0"]);
    const start: Versioned = {
      past: [],
      present: { numQubits: 1, numClbits: 0, gates: [g] },
      future: [],
      coalesce: null,
    };
    const v1 = hr(start, { type: "update-gate", id: g.id, patch: { params: ["a"] } });
    expect(v1.past).toHaveLength(1);
    vi.advanceTimersByTime(100); // within COALESCE_MS
    const v2 = hr(v1, { type: "update-gate", id: g.id, patch: { params: ["ab"] } });
    expect(v2.past).toHaveLength(1); // no new entry — coalesced
    expect(v2.present.gates[0].params).toEqual(["ab"]);
  });

  test("update-gate past the coalesce window starts a new history step", () => {
    vi.useFakeTimers();
    const g = gate("rx", [0], [], ["0"]);
    const start: Versioned = {
      past: [],
      present: { numQubits: 1, numClbits: 0, gates: [g] },
      future: [],
      coalesce: null,
    };
    const v1 = hr(start, { type: "update-gate", id: g.id, patch: { params: ["a"] } });
    vi.advanceTimersByTime(600); // past COALESCE_MS (500)
    const v2 = hr(v1, { type: "update-gate", id: g.id, patch: { params: ["ab"] } });
    expect(v2.past).toHaveLength(2);
  });

  test("past is capped at MAX_HISTORY (100) entries", () => {
    let v = initialVersioned;
    for (let i = 0; i < 130; i++) v = hr(v, { type: "add-qubit" });
    expect(v.past.length).toBeLessThanOrEqual(100);
  });
});

describe("loadFromStorage", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { store = {}; },
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test("empty storage returns the initial versioned state", () => {
    const v = loadFromStorage();
    expect(v.present.numQubits).toBe(initialVersioned.present.numQubits);
    expect(v.past).toEqual([]);
  });

  test("a well-formed stored circuit becomes the present state", () => {
    store["quantiom:circuit:v1"] = JSON.stringify({ numQubits: 4, numClbits: 1, gates: [] });
    expect(loadFromStorage().present.numQubits).toBe(4);
  });

  test("a malformed stored value falls back to the initial state", () => {
    store["quantiom:circuit:v1"] = JSON.stringify({ numQubits: "x" }); // no gates array
    expect(loadFromStorage().present.numQubits).toBe(initialVersioned.present.numQubits);
  });

  test("corrupted JSON falls back to the initial state", () => {
    store["quantiom:circuit:v1"] = "{not json";
    expect(loadFromStorage().present.numQubits).toBe(initialVersioned.present.numQubits);
  });
});
