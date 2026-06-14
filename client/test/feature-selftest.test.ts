import { describe, test, expect } from "vitest";
import { runSelfTest } from "../src/selftest/diagnostics";

// The in-app "Self-test" button must always report all-green: it's a trust
// signal shown to users, so a regression there is as bad as a silent bug.
// This guards every check the dialog runs.
describe("in-app self-test diagnostics", () => {
  const report = runSelfTest();

  test("every check passes", () => {
    const failures = report.groups.flatMap((g) =>
      g.checks.filter((c) => !c.passed).map((c) => `[${g.name}] ${c.name}: ${c.detail ?? ""}`),
    );
    expect(failures, failures.join("\n")).toHaveLength(0);
    expect(report.failed).toBe(0);
  });

  test("covers a meaningful breadth of checks and groups", () => {
    expect(report.groups.length).toBeGreaterThanOrEqual(48);
    // The live suite sweeps the gate catalog and covers every analysis-panel
    // helper plus the visualiser / metrology / spectrum substrates, so it runs
    // 550+ checks; guard against a regression that silently collapses it.
    expect(report.total).toBeGreaterThanOrEqual(520);
  });
});
