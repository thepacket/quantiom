import { useCallback, useEffect, useReducer } from "react";
import type { Circuit } from "./types";
import type { ParameterValues } from "../sim/simulate";
import type { HistoryAction, Action } from "./state";
import {
  historyReducerExport as historyReducer,
  initialVersioned,
  type Versioned,
} from "./state";

/**
 * Multi-tab editor state.
 *
 * Each tab owns:
 *   • a versioned circuit (the existing undo/redo `Versioned` wrapper)
 *   • per-tab UI state: parameter values, selected gate, step-through slider
 *
 * Shared across tabs (handled outside this hook):
 *   • the custom-gate palette (a personal toolbox the user reuses)
 *   • the noise model (a simulator setting, not a circuit property)
 *
 * One reducer manages everything: tab-management actions create / close /
 * switch / reorder / rename tabs, and circuit-level actions (undo, place
 * gate, …) route through `historyReducer` on the *active* tab. UI-state
 * actions also live here so every tab restores its selection, params, and
 * step when the user comes back to it.
 *
 * Storage: `quantiom:tabs:v1`. On first load, an existing
 * `quantiom:circuit:v1` from the pre-tabs era is migrated to a single
 * tab so users with saved work don't lose it.
 */

export type TabUi = {
  selectedGateId: string | null;
  pickedStep: number | null;
  paramValues: ParameterValues;
};

const DEFAULT_UI: TabUi = {
  selectedGateId: null,
  pickedStep: null,
  paramValues: {},
};

export type Tab = {
  id: string;
  versioned: Versioned;
  ui: TabUi;
};

export type MultiState = {
  tabs: Tab[];
  activeId: string;
};

export type TabsAction =
  | { type: "tab:new"; circuit?: Circuit; name?: string }
  | { type: "tab:close"; id: string }
  | { type: "tab:switch"; id: string }
  | { type: "tab:reorder"; fromId: string; toId: string }
  | { type: "tab:rename"; id: string; name: string }
  | { type: "tab:duplicate"; id: string }
  | { type: "ui:set-selected"; selectedGateId: string | null }
  | { type: "ui:set-step"; pickedStep: number | null }
  | { type: "ui:set-params"; paramValues: ParameterValues }
  | HistoryAction; // routed to the active tab's `versioned`

const STORAGE_KEY = "quantiom:tabs:v1";
const LEGACY_KEY = "quantiom:circuit:v1";

let nextTabSeq = 1;
function newTabId(): string {
  return `tab-${Date.now().toString(36)}-${nextTabSeq++}`;
}

export function blankTab(circuit?: Circuit, name?: string): Tab {
  const tab: Tab = {
    id: newTabId(),
    versioned: circuit
      ? { ...initialVersioned, present: name ? { ...circuit, name } : circuit }
      : { ...initialVersioned, present: { ...initialVersioned.present } },
    ui: { ...DEFAULT_UI, paramValues: {} },
  };
  return tab;
}

function isTabAction(a: TabsAction): a is Exclude<TabsAction, HistoryAction> {
  return a.type.startsWith("tab:") || a.type.startsWith("ui:");
}

export function multiReducer(state: MultiState, action: TabsAction): MultiState {
  if (isTabAction(action)) {
    switch (action.type) {
      case "tab:new": {
        const t = blankTab(action.circuit, action.name);
        return { tabs: [...state.tabs, t], activeId: t.id };
      }
      case "tab:close": {
        if (state.tabs.length <= 1) return state; // always keep one tab open
        const idx = state.tabs.findIndex((t) => t.id === action.id);
        if (idx === -1) return state;
        const tabs = state.tabs.filter((t) => t.id !== action.id);
        // If we closed the active tab, pick a neighbour.
        let activeId = state.activeId;
        if (activeId === action.id) {
          activeId = (tabs[idx] ?? tabs[idx - 1] ?? tabs[0]).id;
        }
        return { tabs, activeId };
      }
      case "tab:switch": {
        if (!state.tabs.some((t) => t.id === action.id)) return state;
        return { ...state, activeId: action.id };
      }
      case "tab:reorder": {
        const fromIdx = state.tabs.findIndex((t) => t.id === action.fromId);
        const toIdx = state.tabs.findIndex((t) => t.id === action.toId);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return state;
        const tabs = [...state.tabs];
        const [moved] = tabs.splice(fromIdx, 1);
        tabs.splice(toIdx, 0, moved);
        return { ...state, tabs };
      }
      case "tab:rename": {
        return mapActive(state, action.id, (t) => ({
          ...t,
          versioned: {
            ...t.versioned,
            present: { ...t.versioned.present, name: action.name },
          },
        }));
      }
      case "tab:duplicate": {
        const src = state.tabs.find((t) => t.id === action.id);
        if (!src) return state;
        const dupName = (src.versioned.present.name ?? "Untitled") + " (copy)";
        const dup: Tab = {
          id: newTabId(),
          versioned: {
            past: [],
            future: [],
            coalesce: null,
            present: { ...src.versioned.present, name: dupName, gates: src.versioned.present.gates.map((g) => ({ ...g })) },
          },
          ui: { ...src.ui, paramValues: { ...src.ui.paramValues } },
        };
        const idx = state.tabs.findIndex((t) => t.id === action.id);
        const tabs = [...state.tabs];
        tabs.splice(idx + 1, 0, dup);
        return { tabs, activeId: dup.id };
      }
      case "ui:set-selected":
        return mapActive(state, state.activeId, (t) => ({
          ...t,
          ui: { ...t.ui, selectedGateId: action.selectedGateId },
        }));
      case "ui:set-step":
        return mapActive(state, state.activeId, (t) => ({
          ...t,
          ui: { ...t.ui, pickedStep: action.pickedStep },
        }));
      case "ui:set-params":
        return mapActive(state, state.activeId, (t) => ({
          ...t,
          ui: { ...t.ui, paramValues: action.paramValues },
        }));
    }
  }
  // Circuit-level action: route through historyReducer on active tab.
  return mapActive(state, state.activeId, (t) => ({
    ...t,
    versioned: historyReducer(t.versioned, action),
  }));
}

function mapActive(state: MultiState, id: string, f: (t: Tab) => Tab): MultiState {
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === id ? f(t) : t)),
  };
}

// ─── Initial / persistence ─────────────────────────────────────────────

export function buildInitial(): MultiState {
  // Prefer multi-tab storage; fall back to legacy single-circuit.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        const tabs: Tab[] = parsed.tabs.map(sanitiseTab).filter(Boolean) as Tab[];
        const activeId = typeof parsed.activeId === "string" && tabs.some((t) => t.id === parsed.activeId)
          ? parsed.activeId
          : tabs[0].id;
        if (tabs.length > 0) return { tabs, activeId };
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed && typeof parsed.numQubits === "number" && Array.isArray(parsed.gates)) {
        const t = blankTab(parsed as Circuit);
        return { tabs: [t], activeId: t.id };
      }
    }
  } catch {
    /* ignore */
  }
  const t = blankTab();
  return { tabs: [t], activeId: t.id };
}

export function sanitiseTab(raw: unknown): Tab | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const v = o.versioned as Versioned | undefined;
  if (!v || typeof v !== "object") return null;
  const present = v.present as Circuit | undefined;
  if (!present || typeof present.numQubits !== "number" || !Array.isArray(present.gates)) return null;
  return {
    id: typeof o.id === "string" ? o.id : newTabId(),
    versioned: {
      past: Array.isArray(v.past) ? (v.past as Circuit[]) : [],
      present,
      future: Array.isArray(v.future) ? (v.future as Circuit[]) : [],
      coalesce: null,
    },
    ui: {
      selectedGateId: null,
      pickedStep: null,
      paramValues:
        o.ui && typeof o.ui === "object" && (o.ui as Record<string, unknown>).paramValues
          ? ((o.ui as Record<string, unknown>).paramValues as ParameterValues)
          : {},
    },
  };
}

export function useTabs() {
  const [state, raw] = useReducer(multiReducer, undefined as unknown as MultiState, buildInitial);
  const dispatch = useCallback((a: TabsAction) => raw(a), [raw]);
  useEffect(() => {
    try {
      // Drop coalesce state; it's wall-clock only.
      const compact = {
        activeId: state.activeId,
        tabs: state.tabs.map((t) => ({
          id: t.id,
          versioned: { past: [], present: t.versioned.present, future: [], coalesce: null },
          ui: t.ui,
        })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
    } catch {
      /* ignore */
    }
  }, [state]);

  const active = state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0];

  const circuitDispatch = useCallback(
    (a: HistoryAction | Action) => dispatch(a as TabsAction),
    [dispatch],
  );

  return {
    state,
    tabs: state.tabs,
    activeId: state.activeId,
    active,
    activeCircuit: active.versioned.present,
    circuitDispatch,
    history: {
      canUndo: active.versioned.past.length > 0,
      canRedo: active.versioned.future.length > 0,
    },
    ui: active.ui,
    setSelected: useCallback(
      (id: string | null) => dispatch({ type: "ui:set-selected", selectedGateId: id }),
      [dispatch],
    ),
    setStep: useCallback(
      (step: number | null) => dispatch({ type: "ui:set-step", pickedStep: step }),
      [dispatch],
    ),
    setParams: useCallback(
      (params: ParameterValues) => dispatch({ type: "ui:set-params", paramValues: params }),
      [dispatch],
    ),
    newTab: useCallback(
      (circuit?: Circuit, name?: string) => dispatch({ type: "tab:new", circuit, name }),
      [dispatch],
    ),
    closeTab: useCallback((id: string) => dispatch({ type: "tab:close", id }), [dispatch]),
    switchTab: useCallback((id: string) => dispatch({ type: "tab:switch", id }), [dispatch]),
    reorderTab: useCallback(
      (fromId: string, toId: string) => dispatch({ type: "tab:reorder", fromId, toId }),
      [dispatch],
    ),
    renameTab: useCallback(
      (id: string, name: string) => dispatch({ type: "tab:rename", id, name }),
      [dispatch],
    ),
    duplicateTab: useCallback((id: string) => dispatch({ type: "tab:duplicate", id }), [dispatch]),
  };
}
