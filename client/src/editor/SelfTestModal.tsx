import { useEffect, useState, useCallback } from "react";
import type { SelfTestReport } from "../selftest/diagnostics";

const ACTIONS_URL = "https://github.com/thepacket/quantiom/actions";
const PASS = "#3fb950";
const FAIL = "#f85149";
/** Size of the full Vitest suite (run in Node/CI). The in-app dialog runs a
 *  deterministic, synchronous subset of it — keep this in step with
 *  `client/test/` when the suite grows. */
const FULL_SUITE_TESTS = 970;

/**
 * Self-test dialog — surfaced from the toolbar's "Self-test" button.
 *
 * Runs a curated, live cross-section of Quantiom's numeric core (the same
 * simulator / emitter / transpiler code powering the session) against
 * analytic ground truth, right in the user's browser, and shows a pass/fail
 * report. The intent is trust: a sceptical researcher can press a button and
 * watch the engine validate itself rather than take "it's tested" on faith.
 *
 * The heavy `diagnostics` module is dynamically imported here, so it costs
 * nothing — not a byte of the initial bundle — until the dialog is opened.
 */
export function SelfTestModal({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<SelfTestReport | null>(null);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    setRunning(true);
    setReport(null);
    setError(null);
    // Defer so the "Running…" state paints before the synchronous suite runs.
    setTimeout(() => {
      // Belt-and-braces: each check already traps its own throw, but if the
      // harness itself ever fails we surface an error rather than hang on
      // "Running…". This dialog must never wedge the rest of the app.
      import("../selftest/diagnostics")
        .then(({ runSelfTest }) => { setReport(runSelfTest()); })
        .catch((e: unknown) => { setError(e instanceof Error ? e.message : String(e)); })
        .finally(() => { setRunning(false); });
    }, 30);
  }, []);

  useEffect(() => { run(); }, [run]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const allPass = report !== null && report.failed === 0;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6,
          width: "min(560px, 94vw)", height: "min(80vh, 680px)", boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", padding: "6px 10px 6px 16px" }}>
          <strong style={{ fontSize: 14 }}>Self-test</strong>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={run} disabled={running} title="Run the checks again"
              style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--fg)", cursor: running ? "default" : "pointer", fontSize: 12, padding: "2px 8px", opacity: running ? 0.5 : 1 }}>
              Re-run
            </button>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16 }} title="Close (Esc)">×</button>
          </div>
        </div>

        <div style={{ padding: "14px 18px", overflowY: "auto", color: "var(--fg)", fontSize: 13, lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 12px", color: "var(--muted)" }}>
            These checks validate Quantiom's simulator, gate matrices, OpenQASM
            round-trip, code exports, transpiler, and more — live, in your
            browser, against known-correct results. Only the deterministic
            subset that can run in-browser executes here; the full suite is{" "}
            {FULL_SUITE_TESTS} automated tests (the rest need a Node
            environment and run in CI).
          </p>

          {running && (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)" }}>Running checks…</div>
          )}

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 6, background: "rgba(248,81,73,0.12)", border: `1px solid ${FAIL}`, color: FAIL }}>
              Self-test could not run: {error}
            </div>
          )}

          {report && (
            <>
              <div style={{
                display: "flex", alignItems: "baseline", gap: 10, padding: "10px 14px", borderRadius: 6, marginBottom: 14,
                background: allPass ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)",
                border: `1px solid ${allPass ? PASS : FAIL}`,
              }}>
                <span style={{ fontSize: 22, color: allPass ? PASS : FAIL }}>{allPass ? "✓" : "✗"}</span>
                <span style={{ fontSize: 16, fontWeight: 600 }}>
                  {allPass
                    ? `All ${report.total} checks passed across ${report.groups.length} groups`
                    : `${report.failed} of ${report.total} checks failed`}
                </span>
                <span style={{ marginLeft: "auto", color: "var(--muted)", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                  {report.durationMs.toFixed(0)} ms
                </span>
              </div>
              <p style={{ margin: "-6px 0 14px", color: "var(--muted)", fontSize: 11 }}>
                {report.total} in-browser checks across {report.groups.length} groups — a subset of
                the full {FULL_SUITE_TESTS}-test suite (the remainder run in Node/CI).
              </p>

              {report.groups.map((g) => {
                const gFail = g.checks.filter((c) => !c.passed).length;
                return (
                  <div key={g.name} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, marginBottom: 3 }}>
                      <span style={{ color: gFail ? FAIL : PASS }}>{gFail ? "✗" : "✓"}</span>
                      <span>{g.name}</span>
                      <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11 }}>
                        {g.checks.length - gFail}/{g.checks.length}
                      </span>
                    </div>
                    <div style={{ paddingLeft: 18 }}>
                      {g.checks.map((c, i) => (
                        <div key={i} style={{ display: "flex", gap: 6, color: c.passed ? "var(--muted)" : FAIL, fontSize: 12 }}>
                          <span style={{ color: c.passed ? PASS : FAIL }}>{c.passed ? "✓" : "✗"}</span>
                          <span>{c.name}{!c.passed && c.detail ? ` — ${c.detail}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 18px", color: "var(--muted)", fontSize: 11, lineHeight: 1.5 }}>
          A live, in-browser subset of the engine's validation. The full
          suite — {FULL_SUITE_TESTS} automated tests — runs in continuous
          integration on every commit:{" "}
          <a href={ACTIONS_URL} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>github.com/thepacket/quantiom/actions</a>.
        </div>
      </div>
    </div>
  );
}
