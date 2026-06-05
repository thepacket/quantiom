import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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

/** Expand (collapsed=false) or collapse (collapsed=true) every mounted panel.
 *  Broadcast to all PanelShell instances via a window event, so callers don't
 *  need a shared store. */
export function setAllPanelsCollapsed(collapsed: boolean): void {
  window.dispatchEvent(new CustomEvent(SET_ALL_EVENT, { detail: { collapsed } }));
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

export function PanelShell({ id, title, children, toolbar, getCopyText, defaultCollapsed = false, className, unverified = false }: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const map = loadCollapsedMap();
    return id in map ? map[id] : defaultCollapsed;
  });
  const [copied, setCopied] = useState(false);

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

  const onCopy = async () => {
    if (!getCopyText) return;
    const text = getCopyText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <section className={`panel${className ? " " + className : ""}`}>
      <header className="panel__head">
        <button
          className="panel__collapse"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand" : "Collapse"}
          aria-expanded={!collapsed}
        >
          <span className="panel__chevron">{collapsed ? "▸" : "▾"}</span>
          <h2>{title}</h2>
          {unverified && (
            <span
              title="This panel's output is not independently verifiable — it depends on noise / approximations / unproven advanced features."
              style={{
                display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                background: "#f85149", marginLeft: 6, flex: "0 0 auto",
              }}
            />
          )}
        </button>
        <div className="panel__toolbar">
          {toolbar}
          {getCopyText && (
            <button className="panel__copy" onClick={onCopy} title="Copy to clipboard">
              {copied ? "✓" : "copy"}
            </button>
          )}
        </div>
      </header>
      <CollapsedContext.Provider value={collapsed}>
        <div
          className="panel__body"
          style={collapsed ? { display: "none" } : undefined}
          aria-hidden={collapsed}
        >
          {children}
        </div>
      </CollapsedContext.Provider>
    </section>
  );
}
