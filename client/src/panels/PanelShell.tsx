import { useEffect, useState, type ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  children: ReactNode;
  /** Toolbar slot in the header, right-aligned (e.g. copy button, toggles). */
  toolbar?: ReactNode;
  /** Initial collapsed state when no preference is stored. */
  defaultCollapsed?: boolean;
  className?: string;
};

const STORAGE_KEY = "quantiom:panel-collapsed:v1";

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
        </button>
        {toolbar && <div className="panel__toolbar">{toolbar}</div>}
      </header>
      {!collapsed && <div className="panel__body">{children}</div>}
    </section>
  );
}
