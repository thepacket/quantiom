# OpenQASM 3 round-trip and code export

Quantiom treats **OpenQASM 3** as its interchange format. The editor
round-trips circuits through a hand-written parser/emitter pair, and
eight one-way emitters render the same circuit as SDK code or LaTeX.

This page documents what survives a round-trip, the comment directives
Quantiom understands, and the per-emitter conventions and edge cases.
See the Panel reference and Architecture docs for the panels and the
codebase layout respectively.

---

## Round-trip overview

```
                        parse.ts
   .qasm text  ───────────────────────────►  Circuit IR
                        emit.ts
   Circuit IR  ───────────────────────────►  .qasm text  (OpenQASM 3.0)
```

The emitter/parser pair is designed so that **Download QASM → Open
QASM** returns the same circuit, including qubit names, per-gate notes,
anti-controls, conditionals, and *symbolic* parameter expressions. The
emitter never evaluates parameters — `ry(θ/2 + π/4)` is written out
verbatim (after Greek→ASCII translation) and parsed back to the same
expression.

What does **not** survive, by design:
- **Custom (user-defined) gates** — emitted as a `// … not yet
  exported` comment placeholder. Expand them first (the simulator
  inlines them) if you need portable QASM.
- **Arbitrary unitaries** (`u_arb`, `u_arb_2`) — no `stdgates.inc`
  spelling exists, so they emit as a comment. Transpile to a native
  gate set first (the IBM target KAK-decomposes them).
- **Control-flow blocks** (`if`/`while`/`switch`/`box` as multi-gate
  bodies) — emitted as comments. Single-gate classical conditionals
  *do* round-trip (see below).

---

## The parser (`qasm/parse.ts`)

### Accepted dialects

The parser is deliberately lenient and reads both OpenQASM 3 and the
common OpenQASM 2 subset:

- Version line `OPENQASM 3.0;` or `OPENQASM 2.0;` (case-insensitive) —
  recognised and skipped.
- `include "stdgates.inc";` and `include "qelib1.inc";` — skipped.
- `input` / `output` / `const` declarations — skipped.
- Register declarations in both forms:
  - modern: `qubit[5] q;` and `bit[2] c;`
  - legacy: `qreg q[5];` and `creg c[2];`

  Register *names* aren't stored — Quantiom uses a single implicit `q`
  register and a single `c`. The widths set `numQubits` / `numClbits`.

### Statement splitting

Input is split on top-level `;` (`splitTopLevel`), so multiple
statements per line parse fine:

```qasm
h q[0]; cx q[0], q[1]; c[0] = measure q[0];
```

Line comments (`// …`) are stripped before parsing — except the two
directive forms below, which are read first.

### Gate-modifier chains

Controlled / anti-controlled forms use the modifier-chain syntax:

```qasm
ctrl @ x q[0], q[1];            // = cx
negctrl @ ctrl @ x q[0], q[1], q[2];   // mixed (anti)controls
ctrl(2) @ x q[0], q[1], q[2];   // counted modifier
```

The walker matches `(ctrl|negctrl)[(n)] @` repeatedly, accumulating a
boolean chain (`true` = ctrl, `false` = negctrl), then resolves
`(base gate, total controls)` to an IR gate id. Variable-arity families
(`mcx`/`mcp`/`mcu`) take the control count directly; fixed-arity gates
(`cx`, `ccx`, …) must match an exact entry or the statement is skipped
with a warning.

### Classical conditionals

Single-bit equality conditions round-trip:

```qasm
if (c[1] == 1) x q[2];
```

Parsed as `(clbit, value, inner statement)` and attached to the inner
gate as its `condition`. Only single-bit, single-value comparisons are
supported — no ranges, no multi-bit registers.

### Measurement and state prep

```qasm
c[0] = measure q[0];     // Z-basis measure (OpenQASM 3 form)
reset q[0];
```

`measure_x` / `measure_y` aren't QASM keywords; on emit they expand to a
basis change around a Z measure (`h; measure; h` and
`sdg; h; measure; h; s`) and parse back as those primitives.

### Result shape and errors

```ts
type ParseResult =
  | { ok: true; circuit: Circuit; warnings: ParseWarning[] }
  | { ok: false; error: string; line: number };
```

Hard syntax errors return `{ ok: false }` with a human message and a
**1-based line number** (surfaced by the editor as
`Parse error on line N: …`). Recoverable problems — an unknown gate, a
barrier without operands — are collected as `warnings` and parsing
continues.

### Not supported

Gate definitions (`gate myg … { … }`), subroutines, multi-gate control
flow, complex types beyond `float`, and arbitrary state-vector
`initialize`. Gates outside the recognised `stdgates.inc` inventory
warn and skip.

---

## The OpenQASM 3 emitter (`qasm/emit.ts`)

### Header and declarations

```qasm
OPENQASM 3.0;
include "stdgates.inc";

// qubit_names: alice, bob          (only if names are set)
input float theta;                  (one per free symbol)
qubit[3] q;
bit[2] c;
```

Free symbols are detected by scanning every parameter expression for
the ASCII names of known Greek letters and declared as `input float …`.

### Anti-controls and conditionals

Anti-controlled gates emit a modifier chain matching the gate's control
order, e.g. `ctrl @ negctrl @ x q[0], q[1], q[2];`. Conditioned gates
wrap each emitted line: `if (c[1] == 1) x q[2];`.

### Comment directives (Quantiom-specific)

These two `//` comments are part of the round-trip contract — the
emitter writes them and the parser reads them back:

| Directive | Meaning | Round-trips to |
|---|---|---|
| `// qubit_names: a, b, c` | per-wire display labels | `Circuit.qubitNames` |
| `// note: …` (immediately before a gate) | per-gate annotation | `PlacedGate.annotation` |

Both are sanitised (newlines/commas → spaces) on emit. They are plain
comments to any other QASM tool, so exported files stay standards-clean.

### Parameter expressions

Parameters are emitted **symbolically**. Internally Quantiom stores
Greek glyphs (`θ`, `π`, …); the emitter translates glyph→ASCII
(`theta`, `pi`, …) and the parser translates back ASCII→glyph on word
boundaries. So `rz(2*θ + π)` ⇄ `rz(2*theta + pi)`. No arithmetic is
performed at either end.

### State prep and non-stdgates gates

The `init*` family lowers to reset + Cliffords (e.g. `initplus` →
`reset q[i]; h q[i];`). Anything with no `stdgates.inc` spelling
(`u_arb`, `u_arb_2`, custom gates, control-flow blocks) is written as a
descriptive comment rather than dropped silently.

---

## SDK code emitters

Eight one-way emitters render the IR as runnable SDK code (or LaTeX).
They are not parsed back. All share the same Greek→ASCII parameter
translation as the QASM 3 emitter, and all fall back to a `# … no
direct mapping` comment for gates a target can't express, so nothing is
silently lost.

**Export lowering.** A few gates have no direct method in most SDKs but
decompose exactly into gates every emitter supports — `qasm/exportLower.ts`
rewrites them before emission: `r(θ,φ)→Rz(−φ)·Rx(θ)·Rz(φ)`,
`√Y→Ry(π/2)` (global phase dropped), `GPi(φ)→R(π,φ)`, `GPi2(φ)→R(π/2,φ)`,
`MS(φ₀,φ₁,θ)→Rz·RXX·Rz`. Braket is the exception — it has the IonQ
natives directly, so it emits `circuit.gpi/.gpi2/.ms` and Cirq emits
native `FSimGate` / `SWAP**±0.5`.

| Export | File | Target | Angle units | Notes |
|---|---|---|---|---|
| OpenQASM 2 | `_qasm2.qasm` | OpenQASM 2.0 | radians | legacy `qreg`/`creg`; `measure q -> c` |
| Qiskit | `.py` | `QuantumCircuit` | radians | `Parameter`, `ctrl_state` for anti-controls |
| Cirq | `_cirq.py` | `cirq.Circuit` | radians (+ half-turns) | `LineQubit`, `sympy.Symbol`, U3 decomposed |
| Braket | `_braket.py` | `braket.circuits` | radians | `FreeParameter`; measure/reset implicit |
| Q# | `.qs` | `operation Main` | radians (`PI()`) | `lambda`→`lambda_`; √X via `Rx(π/2)` |
| PyQuil | `_pyquil.py` | Rigetti `Program` | radians | subset; RXX approximated |
| pytket | `_pytket.py` | Quantinuum `Circuit` | **half-turns (÷π)** | `sympy.Symbol`; angle convention below |
| quantikz | `.tex` | LaTeX diagram | symbolic | `\ctrl`/`\octrl`/`\targ`/`\swap` |

### Notable per-target conventions

**OpenQASM 2** — has no `ctrl @`/`negctrl @` modifiers, so
anti-controlled gates emit a comment. Free parameters can't be declared
symbolically; they're listed in a header comment. Conditionals only
emit when the classical register width is 1 and the condition targets
bit 0 (QASM 2's `if(creg==v)` semantics differ from QASM 3's per-bit
form).

**Cirq** — `U`/`U3` are decomposed to `Rz(λ)·Ry(θ)·Rz(φ)` (Cirq has no
direct U3). Single-qubit `rx/ry/rz` pass angles in radians, but
two-qubit Pow gates (`XXPowGate`, …) take **half-turns**, so `rxx/ryy/
rzz` divide the angle by π.

**Q#** — `π` maps to the function call `PI()` (from
`Microsoft.Quantum.Math`), not a literal. `lambda` is renamed
`lambda_` to dodge the reserved word. `sx` emits as `Rx(PI()/2.0, …)`
up to global phase.

**pytket** — the one to watch: pytket measures rotations in
**half-turns** (1 turn = 2π), so every angle is divided by π. A
Quantiom `rx(π/2)` becomes `c.Rx(0.5, q0)` (= 90°). The emitted file
carries a header comment stating this so the numbers aren't mistaken
for radians.

**PyQuil** — covers a Rigetti-flavoured subset. Several gates (`cy`,
`ch`, controlled rotations, `sx`) have no mapping and comment out;
`rxx` is approximated with `XY(...)` and flagged inline.

**quantikz** — produces a `\begin{quantikz}` block: qubits are rows
(q0 on top), ASAP-packed columns are time steps. Controls render as
`\ctrl{Δ}`, anti-controls as `\octrl{Δ}`, CX target as `\targ{}`, CZ as
`\control{}`, SWAP as `\swap{Δ}`. Gates with no special form render as
`\gate[span]{LABEL}` using a LaTeX label table (e.g. `sdg` →
`S^\dagger`, `sx` → `\sqrt{X}`).

---

## Example-file description blocks

Every file in `examples/` opens with a `//` comment block that the file
picker shows as a tooltip. `extractDescription` (in
`client/src/examples.ts`) reads the **leading run of `//` lines**,
strips the `// ` prefix, preserves blank lines as paragraph breaks, and
stops at the first non-comment line (usually `OPENQASM 3.0;`). Anything
below the header — including the `// qubit_names:` / `// note:`
directives — is parsed as circuit data, not description.

So a well-formed example looks like:

```qasm
// Bell pair
//
// Prepares |Φ+⟩ = (|00⟩ + |11⟩)/√2 and measures both qubits.

OPENQASM 3.0;
include "stdgates.inc";
// qubit_names: alice, bob
qubit[2] q;
bit[2] c;
h q[0];
cx q[0], q[1];
c[0] = measure q[0];
c[1] = measure q[1];
```

---

## Round-trip checklist

When adding a new gate to the catalog, both ends of the QASM pair must
learn about it (parser `QASM_TO_IR` table + emitter `QASM_NAME` table),
or it will warn-and-skip on parse and comment-out on emit. The SDK
emitters degrade gracefully (one comment line) but should be updated for
a clean export. The OpenQASM 3 pair is the only round-trippable one;
treat the other seven as export-only.
