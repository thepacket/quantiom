import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the Quantiom test suite.
 *
 * The suite is pure-logic: the simulator core, gate matrices, the
 * parameter evaluator, the OpenQASM round-trip, the SDK emitters, the
 * peephole optimiser, the transpiler/router, and every visualiser
 * substrate. None of it touches the DOM, so the default `node`
 * environment is the fast, correct choice. The one browser-ish test
 * (the AI-chat idle timeout) mocks `globalThis.fetch` itself.
 *
 * `__GIT_SHA__` / `__GIT_COMMITS__` are injected so any module that
 * transitively references them (e.g. the version string) type-checks
 * and runs under the test runner exactly as under Vite.
 */
export default defineConfig({
  define: {
    __GIT_SHA__: JSON.stringify("test"),
    __GIT_COMMITS__: JSON.stringify("0"),
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The chat-timeout test deliberately waits ~21s for the idle timer.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/sim/**", "src/qasm/**", "src/editor/*.ts"],
      // UI-only and build-time modules carry no logic worth covering and
      // would drag in React/DOM; exclude them from the coverage denominator.
      exclude: ["src/sim/webgpuTraj.ts", "src/sim/openrouter.ts", "src/editor/recordAnimation.ts"],
    },
  },
});
