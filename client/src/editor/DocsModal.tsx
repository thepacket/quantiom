import { useState } from "react";
import { Markdown } from "./Markdown";
import panelsMd from "../../../docs/panels.md?raw";
import tutorialMd from "../../../docs/tutorial.md?raw";
import architectureMd from "../../../docs/architecture.md?raw";
import qasmMd from "../../../docs/qasm.md?raw";

/**
 * Docs modal — surfaces the repo's markdown documentation inside the app
 * so users don't have to leave Quantiom to learn how Quantiom works.
 *
 * Currently bundled docs: `docs/tutorial.md` (hands-on walkthrough),
 * `docs/panels.md` (per-panel reference), and `docs/architecture.md`
 * (codebase map). All are imported as raw text via Vite's `?raw` loader
 * and rendered with the minimal markdown formatter below — no extra
 * runtime dependency.
 */
type Tab = { id: string; label: string; content: string };

const TABS: Tab[] = [
  { id: "tutorial", label: "Tutorial", content: tutorialMd },
  { id: "panels", label: "Panel reference", content: panelsMd },
  { id: "architecture", label: "Architecture", content: architectureMd },
  { id: "qasm", label: "OpenQASM & export", content: qasmMd },
];

export function DocsModal({ onClose, initialTab }: { onClose: () => void; initialTab?: string }) {
  const [active, setActive] = useState(
    initialTab && TABS.some((t) => t.id === initialTab) ? initialTab : TABS[0].id,
  );
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)", border: "1px solid var(--border)",
          borderRadius: 6, padding: 0, width: "min(820px, 92vw)", height: "min(80vh, 720px)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)",
          padding: "6px 10px", gap: 4,
        }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                background: t.id === active ? "var(--accent)" : "transparent",
                color: t.id === active ? "var(--accent-fg)" : "var(--fg)",
                border: "none", borderRadius: 4, padding: "4px 10px",
                fontSize: 12, cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16 }}
            title="Close (Esc)"
          >×</button>
        </div>
        <div style={{
          flex: 1, overflowY: "auto", padding: "12px 22px",
          fontSize: 13, lineHeight: 1.55, color: "var(--fg)",
        }}>
          <Markdown source={tab.content} />
        </div>
      </div>
    </div>
  );
}
