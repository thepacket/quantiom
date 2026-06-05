import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  multiReducer,
  blankTab,
  sanitiseTab,
  buildInitial,
  type MultiState,
  type Tab,
} from "../src/editor/tabs";
import type { Circuit } from "../src/editor/types";
import { gate } from "./helpers";

function freshState(): MultiState {
  const t = blankTab();
  return { tabs: [t], activeId: t.id };
}

const sample: Circuit = { numQubits: 3, numClbits: 0, gates: [gate("h", [0])], name: "Bell" };

describe("tabs reducer — lifecycle", () => {
  test("tab:new appends and activates the new tab", () => {
    const s = freshState();
    const out = multiReducer(s, { type: "tab:new", circuit: sample, name: "Bell" });
    expect(out.tabs).toHaveLength(2);
    expect(out.activeId).toBe(out.tabs[1].id);
    expect(out.tabs[1].versioned.present.name).toBe("Bell");
  });

  test("tab:close removes a tab and keeps at least one", () => {
    let s = freshState();
    s = multiReducer(s, { type: "tab:new" });
    const second = s.tabs[1].id;
    const out = multiReducer(s, { type: "tab:close", id: second });
    expect(out.tabs).toHaveLength(1);

    // Cannot close the final tab.
    expect(multiReducer(out, { type: "tab:close", id: out.tabs[0].id })).toBe(out);
  });

  test("closing the active tab activates a neighbour", () => {
    let s = freshState();
    s = multiReducer(s, { type: "tab:new" }); // tab B, now active
    s = multiReducer(s, { type: "tab:new" }); // tab C, now active
    const [a, b, c] = s.tabs.map((t) => t.id);
    expect(s.activeId).toBe(c);
    // Close the middle (B) while C is active — active stays C.
    let out = multiReducer(s, { type: "tab:close", id: b });
    expect(out.activeId).toBe(c);
    // Now close active C — neighbour at the same index (or previous) takes over.
    out = multiReducer(out, { type: "tab:close", id: c });
    expect(out.activeId).toBe(a);
    expect(out.tabs.map((t) => t.id)).toEqual([a]);
  });

  test("tab:close of an unknown id is a no-op", () => {
    let s = freshState();
    s = multiReducer(s, { type: "tab:new" });
    expect(multiReducer(s, { type: "tab:close", id: "ghost" })).toBe(s);
  });

  test("tab:switch changes active only for a known id", () => {
    let s = freshState();
    s = multiReducer(s, { type: "tab:new" });
    const first = s.tabs[0].id;
    expect(multiReducer(s, { type: "tab:switch", id: first }).activeId).toBe(first);
    expect(multiReducer(s, { type: "tab:switch", id: "ghost" })).toBe(s);
  });

  test("tab:reorder moves a tab; no-op on equal or unknown ids", () => {
    let s = freshState();
    s = multiReducer(s, { type: "tab:new" });
    s = multiReducer(s, { type: "tab:new" });
    const [a, b, c] = s.tabs.map((t) => t.id);
    const out = multiReducer(s, { type: "tab:reorder", fromId: a, toId: c });
    expect(out.tabs.map((t) => t.id)).toEqual([b, c, a]);
    expect(multiReducer(s, { type: "tab:reorder", fromId: a, toId: a })).toBe(s);
    expect(multiReducer(s, { type: "tab:reorder", fromId: a, toId: "ghost" })).toBe(s);
  });

  test("tab:rename sets the circuit name on the targeted tab", () => {
    const s = freshState();
    const out = multiReducer(s, { type: "tab:rename", id: s.tabs[0].id, name: "Renamed" });
    expect(out.tabs[0].versioned.present.name).toBe("Renamed");
  });

  test("tab:duplicate inserts a deep copy right after the source", () => {
    let s = freshState();
    s = multiReducer(s, { type: "tab:new", circuit: sample, name: "Bell" });
    const srcId = s.activeId;
    const out = multiReducer(s, { type: "tab:duplicate", id: srcId });
    const srcIdx = out.tabs.findIndex((t) => t.id === srcId);
    const dup = out.tabs[srcIdx + 1];
    expect(dup.versioned.present.name).toBe("Bell (copy)");
    expect(out.activeId).toBe(dup.id);
    // Deep copy: mutating a clone gate doesn't touch the source.
    dup.versioned.present.gates[0].column = 99;
    const src = out.tabs.find((t) => t.id === srcId)!;
    expect(src.versioned.present.gates[0].column).not.toBe(99);
  });

  test("tab:duplicate of an unknown id is a no-op", () => {
    const s = freshState();
    expect(multiReducer(s, { type: "tab:duplicate", id: "ghost" })).toBe(s);
  });
});

describe("tabs reducer — per-tab UI state", () => {
  test("ui:set-selected / set-step / set-params target the active tab", () => {
    let s = freshState();
    s = multiReducer(s, { type: "ui:set-selected", selectedGateId: "g7" });
    expect(s.tabs[0].ui.selectedGateId).toBe("g7");
    s = multiReducer(s, { type: "ui:set-step", pickedStep: 3 });
    expect(s.tabs[0].ui.pickedStep).toBe(3);
    s = multiReducer(s, { type: "ui:set-params", paramValues: { theta: 1.5 } });
    expect(s.tabs[0].ui.paramValues).toEqual({ theta: 1.5 });
  });

  test("UI state is independent per tab", () => {
    let s = freshState();
    s = multiReducer(s, { type: "ui:set-selected", selectedGateId: "gA" });
    const a = s.tabs[0].id;
    s = multiReducer(s, { type: "tab:new" }); // B active
    s = multiReducer(s, { type: "ui:set-selected", selectedGateId: "gB" });
    expect(s.tabs.find((t) => t.id === a)!.ui.selectedGateId).toBe("gA");
    expect(s.tabs[1].ui.selectedGateId).toBe("gB");
  });
});

describe("tabs reducer — circuit actions route to the active tab", () => {
  test("place-gate / add-qubit hit only the active tab's circuit", () => {
    let s = freshState();
    s = multiReducer(s, { type: "tab:new" }); // B active
    const a = s.tabs[0].id;
    s = multiReducer(s, { type: "add-qubit" });
    expect(s.tabs[1].versioned.present.numQubits).toBe(6); // active B grew
    expect(s.tabs.find((t) => t.id === a)!.versioned.present.numQubits).toBe(5); // A untouched
  });

  test("undo on the active tab walks its own history", () => {
    let s = freshState();
    const before = s.tabs[0].versioned.present.numQubits;
    s = multiReducer(s, { type: "add-qubit" });
    expect(s.tabs[0].versioned.present.numQubits).toBe(before + 1);
    s = multiReducer(s, { type: "undo" });
    expect(s.tabs[0].versioned.present.numQubits).toBe(before);
  });
});

describe("sanitiseTab", () => {
  test("accepts a well-formed persisted tab", () => {
    const raw = {
      id: "tab-x",
      versioned: { past: [], present: sample, future: [], coalesce: null },
      ui: { paramValues: { a: 1 } },
    };
    const out = sanitiseTab(raw) as Tab;
    expect(out.id).toBe("tab-x");
    expect(out.versioned.present.name).toBe("Bell");
    expect(out.ui.paramValues).toEqual({ a: 1 });
    expect(out.ui.selectedGateId).toBeNull(); // UI selection not persisted
  });

  test("rejects malformed input", () => {
    expect(sanitiseTab(null)).toBeNull();
    expect(sanitiseTab({})).toBeNull();
    expect(sanitiseTab({ versioned: {} })).toBeNull();
    expect(sanitiseTab({ versioned: { present: { numQubits: "x", gates: [] } } })).toBeNull();
  });

  test("fills a fresh id and empty params when absent", () => {
    const out = sanitiseTab({
      versioned: { present: sample },
    }) as Tab;
    expect(typeof out.id).toBe("string");
    expect(out.ui.paramValues).toEqual({});
    expect(out.versioned.past).toEqual([]);
  });
});

describe("buildInitial — storage load & migration", () => {
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

  const TABS_KEY = "quantiom:tabs:v1";
  const LEGACY_KEY = "quantiom:circuit:v1";

  test("no storage yields a single blank tab", () => {
    const s = buildInitial();
    expect(s.tabs).toHaveLength(1);
    expect(s.activeId).toBe(s.tabs[0].id);
  });

  test("restores multi-tab storage including the active id", () => {
    store[TABS_KEY] = JSON.stringify({
      activeId: "tab-b",
      tabs: [
        { id: "tab-a", versioned: { present: { numQubits: 2, numClbits: 0, gates: [] } }, ui: {} },
        { id: "tab-b", versioned: { present: { numQubits: 3, numClbits: 0, gates: [] } }, ui: {} },
      ],
    });
    const s = buildInitial();
    expect(s.tabs.map((t) => t.id)).toEqual(["tab-a", "tab-b"]);
    expect(s.activeId).toBe("tab-b");
  });

  test("an unknown activeId falls back to the first tab", () => {
    store[TABS_KEY] = JSON.stringify({
      activeId: "ghost",
      tabs: [{ id: "tab-a", versioned: { present: { numQubits: 1, numClbits: 0, gates: [] } }, ui: {} }],
    });
    expect(buildInitial().activeId).toBe("tab-a");
  });

  test("migrates a legacy single-circuit entry into one tab", () => {
    store[LEGACY_KEY] = JSON.stringify({ numQubits: 4, numClbits: 1, gates: [] });
    const s = buildInitial();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].versioned.present.numQubits).toBe(4);
  });

  test("corrupted tabs storage falls through to a blank tab", () => {
    store[TABS_KEY] = "{not json";
    expect(buildInitial().tabs).toHaveLength(1);
  });
});
