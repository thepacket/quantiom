# Quantiom — notes for Claude

## What this is

Quantum-computing circuit editor, simulator, and visualizer
aimed at users **already comfortable with QC concepts**. A serious tool,
not a vulgarizer. IBM Quantum Composer is the floor.

## Product principles

- **Editor-first.** No tutorial system. The "educator" facet is rich
  inline math and formal derivations alongside what the user builds —
  not guided lesson paths.
- **Don't simplify the editor to accommodate beginners.** Advanced
  features are expected: arbitrary-angle rotations, custom gates,
  classical registers, mid-circuit measurement, conditional gates,
  barriers, subroutines, OpenQASM 3 round-trip, multi-circuit projects.
- **Visualizers are peer panels**, not the headline. Same update cadence
  and screen-space rights as statevector / probabilities / Bloch.

## Architecture (current)

Everything runs in the browser. The Python server is just a static
host plus `/api/health`.

- `client/` — Vite + React + TypeScript. UI, simulator, parameter
  expression evaluator, OpenQASM 3 round-trip, sonorizer.
- `client/src/sim/` — the simulator.
  - `complex.ts`: Complex helpers.
  - `expr.ts`: parameter expression evaluator. Greek glyphs map to ASCII
    names; `new Function` JIT-compiles the rest. Free variables become
    sliders in the Parameters panel.
  - `matrices.ts`: numeric gate matrices for the 53-gate catalog plus a
    `controlled()` wrapper for n-controlled forms.
  - `apply.ts`: generic k-qubit gate application on a `Float64Array` state
    with interleaved re/im.
  - `simulate.ts`: top-level `simulate(circuit, paramValues)`. Cap
    `MAX_QUBITS = 20`.
- `server/` — FastAPI shell: `/api/health` + static-file mount.
- `examples/` — bundled `.qasm` files imported via Vite `?raw`.

## Conventions

- TypeScript strict. Big-endian basis: qubit 0 is the MSB of basis index.
- The Float64Array state has `re` at even indices and `im` at odd; size
  is `2 · 2^n`.
- Greek letter ↔ ASCII map in `expr.ts` matches the inspector's display
  function in [client/src/panels/ParameterPanel.tsx](client/src/panels/ParameterPanel.tsx).
- The OpenQASM 3 emitter/parser pair preserves the symbolic look of the
  parameter expressions; it does not evaluate them.
- **Circuit name** is an optional field on the IR (`Circuit.name`). It is
  set by the FileMenu when a circuit is loaded (example label or file
  basename) and rendered in the centre of the app header. Manual edits
  preserve the name; Clear leaves it undefined ("Untitled").
- **Version** in the header is built from `package.json` semver plus the
  short git SHA injected at build time via `vite.config.ts` (`__GIT_SHA__`
  global). The Dockerfile installs git and copies `.git` in so this works
  inside the production image.
- **Probabilities panel** has two modes — `exact` (truth) and `shots`
  (sampled). The sampler is in [client/src/sim/sample.ts](client/src/sim/sample.ts);
  it normalises the exact probabilities, builds a cumulative distribution,
  and binary-searches per shot. Mode and shot count persist in
  localStorage. Real hardware always behaves like the `shots` mode.

## Earlier architecture (gone)

For history: the simulator used to run server-side with sympy. That was
removed in favor of a pure-TS `Float64Array` simulator for these reasons:

- sympy is single-threaded per call; Python's GIL blocked any concurrent
  request and any animation frame.
- A 6-qubit, 35-gate symbolic circuit could produce ~22 MB of LaTeX and
  take 32 s to render.
- The numeric path (probabilities, Bloch, sonorizer) never needed
  symbolic at all — it was running through sympy for no benefit.
- The "symbolic-native" headline was less important to the maintainer
  than scale and responsiveness. The simulator now handles 12+ qubit
  circuits at 60 fps animation.

If symbolic display is ever needed, the right path is the OpenQASM 3
view (already round-trippable) or a separate offline tool.
