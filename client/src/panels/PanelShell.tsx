import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * "Spotlight" lets a single analysis panel render its body enlarged in a dock
 * beside the circuit. Rather than a per-panel registry, the spotlit PanelShell
 * portals its *own* body into the dock's mount node — so any panel works with
 * zero extra wiring and keeps its exact props/state.
 */
export type SpotlightState = {
  /** id of the panel currently shown in the dock, or null. */
  id: string | null;
  /** DOM node to portal the spotlit panel's card into. */
  container: HTMLElement | null;
  setId: (id: string | null) => void;
};
const SpotlightContext = createContext<SpotlightState>({ id: null, container: null, setId: () => {} });
export const SpotlightProvider = SpotlightContext.Provider;
export function useSpotlight(): SpotlightState { return useContext(SpotlightContext); }
/** Drag MIME carrying a panel id from a panel header to the spotlight dock. */
export const SPOTLIGHT_DND_MIME = "application/x-quantiom-panel";

/**
 * Collapsed-state context. PanelShell publishes its current collapsed
 * value through this context so children can short-circuit expensive
 * computations (useMemo bodies, derived sims) when they're hidden.
 *
 * Children stay mounted across collapse cycles so their local UI state
 * (toggle positions, dropdown selections, the like) survives — we only
 * hide them with display:none.
 */
const CollapsedContext = createContext<boolean>(false);

export function usePanelCollapsed(): boolean {
  return useContext(CollapsedContext);
}

/**
 * Panel-filter context: a lowercased search query. When non-empty, a
 * PanelShell whose title doesn't contain it removes itself, so the panel
 * column filters down to matches as the user types.
 */
const PanelFilterContext = createContext<string>("");
export const PanelFilterProvider = PanelFilterContext.Provider;
export function usePanelFilter(): string { return useContext(PanelFilterContext); }

type Props = {
  id: string;
  title: string;
  children: ReactNode;
  /** Toolbar slot in the header, right-aligned (e.g. toggles). */
  toolbar?: ReactNode;
  /** If provided, a copy-to-clipboard button is added; the function returns
   * the text payload (LaTeX, plain text, etc.) at the moment of the click. */
  getCopyText?: () => string;
  /** Initial collapsed state when no preference is stored. */
  defaultCollapsed?: boolean;
  className?: string;
  /** Mark the panel as not independently verifiable (its output depends on
   *  noise / approximations / unproven advanced features). Renders a small
   *  red dot in the header. */
  unverified?: boolean;
};

const STORAGE_KEY = "quantiom:panel-collapsed:v1";
const SET_ALL_EVENT = "quantiom:set-all-panels";
const SET_ONE_EVENT = "quantiom:set-one-panel";
/** Fired when a panel is revealed, so the editor can expand the whole panel
 *  column if it happens to be collapsed (otherwise the revealed panel stays
 *  hidden behind the collapsed column). */
export const PANEL_COLUMN_REVEAL_EVENT = "quantiom:reveal-panel-column";

/** Expand (collapsed=false) or collapse (collapsed=true) every mounted panel.
 *  Broadcast to all PanelShell instances via a window event, so callers don't
 *  need a shared store. */
export function setAllPanelsCollapsed(collapsed: boolean): void {
  window.dispatchEvent(new CustomEvent(SET_ALL_EVENT, { detail: { collapsed } }));
}

/** Expand or collapse a single panel by id (e.g. to reveal a panel a feature
 *  just pushed content into). No-op if no panel with that id is mounted. */
export function setPanelCollapsed(id: string, collapsed: boolean): void {
  window.dispatchEvent(new CustomEvent(SET_ONE_EVENT, { detail: { id, collapsed } }));
  // Revealing a panel is pointless if the whole column is collapsed — ask the
  // editor to open it so the panel is actually visible.
  if (!collapsed) window.dispatchEvent(new CustomEvent(PANEL_COLUMN_REVEAL_EVENT, { detail: { id } }));
}

function loadCollapsedMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function persistCollapsed(id: string, collapsed: boolean) {
  try {
    const map = loadCollapsedMap();
    map[id] = collapsed;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function PanelShell({ id, title, children, toolbar, defaultCollapsed = false, className }: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const map = loadCollapsedMap();
    return id in map ? map[id] : defaultCollapsed;
  });
  useEffect(() => {
    persistCollapsed(id, collapsed);
  }, [id, collapsed]);

  // Respond to a global "expand all / collapse all" broadcast.
  useEffect(() => {
    const onSetAll = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.collapsed === "boolean") setCollapsed(detail.collapsed);
    };
    window.addEventListener(SET_ALL_EVENT, onSetAll);
    return () => window.removeEventListener(SET_ALL_EVENT, onSetAll);
  }, []);

  // Respond to a targeted single-panel expand/collapse. When a panel is
  // revealed (e.g. by an agent's set_panel), scroll it into view so the user
  // actually sees what was just surfaced.
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const onSetOne = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.id !== id || typeof detail.collapsed !== "boolean") return;
      setCollapsed(detail.collapsed);
      if (!detail.collapsed) {
        // Defer so the column-reveal + un-collapse have laid out first.
        requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      }
    };
    window.addEventListener(SET_ONE_EVENT, onSetOne);
    return () => window.removeEventListener(SET_ONE_EVENT, onSetOne);
  }, [id]);

  const spotlight = useSpotlight();
  const isSpotlit = spotlight.id === id;
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(SPOTLIGHT_DND_MIME, id);
    e.dataTransfer.setData("text/plain", title);
    e.dataTransfer.effectAllowed = "copy";
  };

  // While spotlit, force the body to compute (not collapsed) and render it in
  // the dock via a portal; the inline slot shows a small placeholder instead.
  const bodyContext = isSpotlit ? false : collapsed;
  const inlineHidden = collapsed && !isSpotlit;

  // Panel-column filter: drop panels whose title doesn't match the query.
  // (All hooks above run unconditionally, so this early return is safe.)
  const filterQuery = useContext(PanelFilterContext);
  if (filterQuery && !title.toLowerCase().includes(filterQuery) && !isSpotlit) return null;

  return (
    <section ref={sectionRef} className={`panel${className ? " " + className : ""}${isSpotlit ? " panel--spotlit" : ""}`}>
      <header className="panel__head">
        <button
          className="panel__collapse"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand" : "Collapse"}
          aria-expanded={!collapsed}
        >
          <span className="panel__chevron">{collapsed ? "▸" : "▾"}</span>
          <h2>{title}</h2>
        </button>
        <div className="panel__toolbar">
          {toolbar}
          <span
            className="panel__spotlight-grip"
            draggable
            onDragStart={onDragStart}
            onClick={() => spotlight.setId(isSpotlit ? null : id)}
            title={isSpotlit ? "Close the enlarged view" : "Drag onto the circuit (or click) to enlarge beside it"}
            role="button"
            aria-label="Enlarge panel beside the circuit"
          >⤢</span>
        </div>
      </header>
      <CollapsedContext.Provider value={bodyContext}>
        <div className="panel__body" style={inlineHidden ? { display: "none" } : undefined} aria-hidden={inlineHidden}>
          {isSpotlit
            ? <button className="panel__spotlit-note" onClick={() => spotlight.setId(null)} title="Restore here">shown enlarged beside the circuit — click to restore</button>
            : children}
        </div>
      </CollapsedContext.Provider>
      {isSpotlit && spotlight.container && createPortal(
        <section className="spotlight-card">
          <header className="spotlight-card__head">
            <h2>{title}</h2>
            <button className="spotlight-card__close" onClick={() => spotlight.setId(null)} title="Close (restore to the panel column)">×</button>
          </header>
          <CollapsedContext.Provider value={false}>
            <div className="spotlight-card__body">{children}</div>
          </CollapsedContext.Provider>
        </section>,
        spotlight.container,
      )}
    </section>
  );
}
