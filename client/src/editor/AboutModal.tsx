import { useEffect } from "react";
import { version as APP_VERSION } from "../../package.json";

const GITHUB_URL = "https://github.com/thepacket/quantiom";

/**
 * About dialog — surfaced from the toolbar's About button (after Help).
 * Shows the app name, a one-line description, the version, the GitHub
 * link, the authorship line, and the copyright / licence notice.
 */
export function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          borderRadius: 6, width: "min(440px, 92vw)", boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--border)", padding: "6px 10px 6px 16px",
        }}>
          <strong style={{ fontSize: 14 }}>About</strong>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16 }}
            title="Close (Esc)"
          >×</button>
        </div>

        <div style={{ padding: "20px 22px", color: "var(--fg)", fontSize: 13, lineHeight: 1.6 }}>
          {/* Logo; gracefully hidden if the asset isn't present. */}
          <img
            src="/quantiom-logo.png"
            alt="Quantiom logo"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            style={{ display: "block", width: 96, height: 96, margin: "0 auto 12px", borderRadius: 12 }}
          />
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "0.5px" }}>Quantiom</div>
          <div style={{ color: "var(--muted)", fontFamily: "ui-monospace, monospace", fontSize: 11, marginTop: 2 }}>
            v{APP_VERSION}.{__GIT_COMMITS__} ({__GIT_SHA__})
          </div>

          <p style={{ margin: "14px 0 0" }}>
            A browser-native, research-grade quantum circuit editor, simulator,
            and visualizer — for users already comfortable with quantum
            computing. Build circuits, simulate them three ways, and inspect
            them through a column of researcher-grade panels, all with no
            install and no account.
          </p>

          <p style={{ margin: "14px 0 0" }}>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
              {GITHUB_URL.replace("https://", "")}
            </a>
          </p>

          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />

          <p style={{ margin: 0, color: "var(--muted)" }}>
            Developed by Claude Code in collaboration with Andre Paquette.
          </p>
          <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
            © 2026 Andre Paquette · MIT License
          </p>
        </div>
      </div>
    </div>
  );
}
