import { useMemo, useState } from "react";
import type { GateDef, GateCategory } from "./types";
import { CATEGORY_LABELS, CATEGORY_ORDER, GATES } from "./gates";
import type { CustomGate } from "./customGates";
import { CUSTOM_PREFIX } from "./customGates";

export const DND_MIME = "application/x-quantiom-gate";

/** Common alias shown as a secondary id on the palette tile (e.g. CX ≡ CNOT). */
const SECONDARY_ID: Record<string, string> = {
  cx: "CNOT",
};

/** Friendlier display labels for a few gates, overriding the uppercase id. */
const DISPLAY_ID: Record<string, string> = {
  init0: "|0>",
  init1: "|1>",
  initplus: "|+>",
  initminus: "|->",
  initiplus: "|+i>",
  initiminus: "|-i>",
  initialize: "INITA",
  measure: "MZ",
  measure_x: "MX",
  measure_y: "MY",
  u_arb: "AU2",
  u_arb_2: "AU4",
  xx_plus_yy: "XX+YY",
  xx_minus_yy: "XX-YY",
  sqrtswap: "SSWAP",
  sqrtswapdg: "SSWAPDG",
  sqrtiswap: "SISWAP",
};

/** Shrink the tile font for long labels so they fit the button width. */
function labelFontSize(label: string): string | undefined {
  if (label.length <= 5) return undefined; // default (16px)
  if (label.length <= 7) return "13px";
  return "11px";
}

type Props = {
  customGates?: CustomGate[];
  onRemoveCustomGate?: (id: string) => void;
};

/**
 * Spawn a small DOM element styled like a placed gate to use as the drag
 * image, then schedule its removal once the browser has snapshotted it.
 */
export function makeDragGhost(symbol: string): HTMLDivElement {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = symbol;
  ghost.style.position = "absolute";
  ghost.style.top = "-1000px";
  ghost.style.left = "-1000px";
  document.body.appendChild(ghost);
  return ghost;
}

export function GatePalette({ customGates = [], onRemoveCustomGate }: Props) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<GateCategory | "custom">>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GATES;
    return GATES.filter(
      (g) =>
        g.id.includes(q) ||
        g.name.toLowerCase().includes(q) ||
        g.symbol.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const m = new Map<GateCategory, GateDef[]>();
    for (const g of filtered) {
      const arr = m.get(g.category) ?? [];
      arr.push(g);
      m.set(g.category, arr);
    }
    return m;
  }, [filtered]);

  const toggle = (cat: GateCategory | "custom") => {
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(cat)) n.delete(cat);
      else n.add(cat);
      return n;
    });
  };

  // Search filter for custom gates.
  const filteredCustom = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customGates;
    return customGates.filter((g) => g.id.includes(q) || g.name.toLowerCase().includes(q));
  }, [customGates, query]);

  const onDragStart = (e: React.DragEvent<HTMLDivElement>, gateId: string, symbol: string) => {
    e.dataTransfer.setData(DND_MIME, gateId);
    e.dataTransfer.setData("text/plain", gateId);
    e.dataTransfer.effectAllowed = "copy";
    const ghost = makeDragGhost(symbol);
    e.dataTransfer.setDragImage(ghost, 20, 14);
    // Cleanup once the browser has captured the image.
    setTimeout(() => ghost.remove(), 0);
  };

  return (
    <aside className="palette">
      <div className="palette__search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search gates…"
          aria-label="Search gates"
        />
      </div>
      <div className="palette__groups">
        {filteredCustom.length > 0 && (
          <section className="palette__group">
            <button className="palette__group-header" onClick={() => toggle("custom")}>
              <span className="palette__chevron">{collapsed.has("custom") ? "▸" : "▾"}</span>
              Your gates
              <span className="palette__count">{filteredCustom.length}</span>
            </button>
            {!collapsed.has("custom") && (
              <div className="palette__grid">
                {filteredCustom.map((g) => (
                  <div
                    key={g.id}
                    className="palette__tile palette__tile--custom"
                    draggable
                    onDragStart={(e) => onDragStart(e, `${CUSTOM_PREFIX}${g.id}`, g.name.slice(0, 3))}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (onRemoveCustomGate && window.confirm(`Delete custom gate "${g.name}"?`)) {
                        onRemoveCustomGate(g.id);
                      }
                    }}
                    data-tip={`${g.name} — ${g.numQubits} qubit${g.numQubits === 1 ? "" : "s"} · right-click to delete`}
                  >
                    <span className="palette__symbol">{g.name.slice(0, 4)}</span>
                    <span className="palette__id">{g.numQubits}q</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {CATEGORY_ORDER.map((cat) => {
          const gates = grouped.get(cat);
          if (!gates || gates.length === 0) return null;
          const isOpen = !collapsed.has(cat);
          return (
            <section key={cat} className="palette__group">
              <button className="palette__group-header" onClick={() => toggle(cat)}>
                <span className="palette__chevron">{isOpen ? "▾" : "▸"}</span>
                {CATEGORY_LABELS[cat]}
                <span className="palette__count">{gates.length}</span>
              </button>
              {isOpen && (
                <div className="palette__grid">
                  {gates.map((g) => (
                    <div
                      key={g.id}
                      className="palette__tile"
                      data-cat={g.category}
                      draggable
                      onDragStart={(e) => onDragStart(e, g.id, g.symbol)}
                      data-tip={`${g.name}${g.description ? " — " + g.description : ""}`}
                    >
                      {(() => {
                        const label = DISPLAY_ID[g.id] ?? g.id.toUpperCase();
                        return <span className="palette__symbol" style={{ fontSize: labelFontSize(label) }}>{label}</span>;
                      })()}
                      {SECONDARY_ID[g.id] && <span className="palette__id">{SECONDARY_ID[g.id]}</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
