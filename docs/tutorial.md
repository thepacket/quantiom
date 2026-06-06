# Tutorial — a guided tour of Quantiom

This is a hands-on walkthrough, organised as **workflows** rather than a
feature checklist. Open Quantiom in one window and this document in
another; every section ends with a "what to look at" moment so you know
whether you're on track.

It's a long tour — you don't have to do it in one sitting. Each **Part**
stands alone, so jump to whatever you need. Where a section uses a panel,
it links to [`panels.md`](panels.md) for the per-panel reference (this
doc teaches *when and why* to reach for a panel; `panels.md` is the
*what*).

Each section loads an example circuit from `examples/`; the File menu has
a searchable picker for all 93 of them, grouped by topic, each with an
explanatory header.

Throughout the tour, **bold** is for actions you take; *italic* is for
the thing you should now see.

**New to quantum computing?** Start with **Part 0** — a gentle, almost
math-free on-ramp. Parts I onward assume you're comfortable with the
basics it covers.

**Contents**

- **Part 0 — A gentle on-ramp:** qubits, gates, measurement, entanglement — no heavy math
- **Part I — Foundations:** Bell pair · parameters & animation · editing fluently
- **Part II — Reading the state:** entanglement structure · dynamics · phase space & magic · the operator · structure graphs
- **Part III — Noise & error mitigation:** noise · ZNE · PEC
- **Part IV — Optimisation & algorithms:** VQE & the optimiser toolbox · Hamiltonian → Trotter · the Clifford fast path & syndromes
- **Part V — Hardware & interop:** transpile / route / compile · OpenQASM 3 & the nine exports
- **Part VI — The AI assistant**
- Reference: gate cheat-sheet · common gotchas (FAQ) · keyboard shortcuts · where to look when you're stuck

---

# Part 0 — A gentle on-ramp (no heavy math)

This part assumes **zero** quantum background and almost no math — just
curiosity and the editor in front of you. Everything here is something
you *do* and *watch happen*. If you already know what a qubit and a gate
are, skip ahead to Part I.

There's only one piece of notation to meet: we write the two definite
answers a qubit can give as **`|0⟩`** and **`|1⟩`** — read them as just
"zero" and "one." The funny brackets are tradition; that's all.

## 0.1 The three panels to start with

The right-hand column has a lot of panels. Ignore most of them for now.
You only need three, and they're three views of the *same* thing:

- **Probabilities** — "if I looked, how likely is each answer?" Bars.
- **Statevector** — the same, but with exact numbers.
- **Bloch spheres** — a picture of each qubit as an *arrow on a ball*.

Open those three. Leave everything else (the dozens of visualisers,
noise, optimisers) collapsed — they're for later.

## 0.2 A qubit is an arrow on a ball

**Start a fresh tab** (the `+` on the tab strip). You have one qubit,
sitting in `|0⟩`.

**Look at the Bloch sphere.** *The arrow points straight up.* That's
`|0⟩`. If it pointed straight down, that's `|1⟩`. The whole trick of
quantum computing is that the arrow can also point **anywhere in
between** — and where it points decides the odds of seeing 0 vs 1 when
you finally look. Up = "definitely 0," down = "definitely 1," on the
equator = "50/50."

That's the one idea to hold onto: **a qubit is an arrow, and gates move
the arrow.**

## 0.3 Gates are moves

From the palette on the left, **drag the `X` gate onto the wire.**
*The Bloch arrow flips to point down* — `X` is a flip (0 becomes 1).
*Probabilities now shows `|1⟩` at 100%.* Delete it (click it, press
Delete).

**Drag the `H` gate on instead.** *The arrow swings to the equator.*
Now the qubit is in a 50/50 superposition — *Probabilities shows two
half-height bars.* `H` ("Hadamard") is the gate that puts a qubit
"both at once."

**Try `Z`, then the rotation gates `RX` / `RY` / `RZ`** (they take an
angle — a dial for how far to turn the arrow). Each one just moves the
arrow somewhere. Watch Bloch and Probabilities respond as you add and
delete them. There's no wrong move here — poke at it.

(A one-line-each **cheat-sheet of every common gate** is near the end of
this doc, under *Reference*.)

## 0.4 Measuring is looking

In real life you can't read the arrow directly; you can only **look**,
and looking forces the qubit to commit to 0 or 1 — at the odds the
arrow implied. The **Probabilities** panel shows those odds.

Flip Probabilities to **Shots** mode (top toolbar) and turn on the
auto-shots timer. *The bars now jiggle a little each refresh* — that's
the tool actually "rolling the dice" a few thousand times and counting.
On a 50/50 qubit you'll see roughly-but-not-exactly half each time, just
like real flips. Switch back to **Exact** to see the true odds.

## 0.5 Two qubits, and the magic word: entanglement

**Add a second qubit** (the `+` next to the qubit count). **Put an `H`
on qubit 0, then drag a `CX` (control on q0, target on q1).** You've
just built a *Bell pair* — the "hello world" of entanglement.

*Open Statevector:* **only `|00⟩` and `|11⟩` appear, each at 50%.**
Never `|01⟩` or `|10⟩`. That's the famous part: the two qubits always
agree. Look at one and get 0, and the other is *instantly* 0 too; get 1,
the other is 1 — even though each one alone is a coin flip.

*Now look at Bloch:* **both arrows have shrunk to the centre of the
ball.** That's not a bug — it's the deep weirdness. Once two qubits are
entangled, the information lives in the *pair*, not in either one alone,
so neither qubit has its own arrow anymore. (Quantiom has a whole set
of panels for *seeing* that shared information — that's Part II, for
later.)

## 0.6 The other weird thing: interference

**On a fresh single qubit, place two `H` gates in a row.** *The qubit
is back to `|0⟩` — 100%.* Two coin-flips' worth of "both at once"
didn't pile up; they **cancelled.** Quantum states behave like waves
that can add or cancel, and *that* cancellation — interference — is what
every quantum algorithm secretly exploits to make the right answer loud
and the wrong answers quiet.

You've now met the whole toolkit: superposition (`H`), flips and turns
(`X`, rotations), measurement (Probabilities), entanglement (`CX`), and
interference (`H·H`). Everything else is combinations of these.

## 0.7 What to ignore (for now)

Quantiom is a research tool, so most of what you see is built for people
doing serious work — the 30-plus visualisers, the noise model, the
optimisers, transpilation. **You don't need any of it to play and
learn.** Stick to the editor + the three beginner panels. Come back to
the rest when a question makes you curious about it.

## 0.8 Your first win, in three minutes

1. **New tab**, 2 qubits.
2. **`H` on q0**, then **`CX(0→1)`**.
3. **Open Probabilities** → two bars, `|00⟩` and `|11⟩`.

That's a Bell pair — a genuinely entangled state you built and verified
yourself. When you're ready for more, Part I picks up from exactly here
and the rest of the tour opens up the serious tools one at a time.

---

# Part I — Foundations

## 1. A Bell pair (5 min)

Goal: prepare an entangled state, see what entanglement looks like in
the various panels, and get a feel for how the editor responds.

**Load** `bell.qasm` from the file picker (File → Open example). The
canvas shows a 2-qubit circuit: an `H` on qubit 0, a `CX(0, 1)`, and
two measurements.

**Open the Statevector panel.** *You should see two non-zero rows:*

```
|00⟩   0.7071 + 0.0000i   p = 0.5
|11⟩   0.7071 + 0.0000i   p = 0.5
```

That's the Bell state `|Φ+⟩ = (|00⟩ + |11⟩)/√2`. No `|01⟩` or `|10⟩`
amplitude — those interfered to zero.

**Open the Bloch panel.** *Both spheres show the vector at the
origin* (`|r| = 0`). Single qubits of an entangled pair are maximally
mixed; you can't see the entanglement on a single qubit alone, only
in the correlations.

**Delete the CX gate** (click it, press Delete). *Bloch immediately
updates* — qubit 0 jumps to the equator (the `|+⟩` axis), qubit 1
stays at the north pole (`|0⟩`). With no entangling gate, both qubits
are pure and visible individually.

**Undo** (Cmd-Z / Ctrl-Z) to bring the CX back. Bloch returns to two
origin vectors.

**Switch to the Probabilities panel.** *You see two equal bars*
at indices 0 (`|00⟩`) and 3 (`|11⟩`), each at 0.5. Toggle the
**Shots** mode in the top toolbar. *The bars now bounce a little
each frame* — those are sampling fluctuations. Toggle the auto-shots
timer to 10 Hz and watch them ripple. Switch back to Exact when
you're done.

You've now seen: the editor, three views of the same state
(Statevector, Bloch, Probabilities), and the auto-shots timer. That
covers the basic loop — every other panel is the same idea applied to
a different quantity.

---

## 2. Parameters and animation (5 min)

Goal: drive a circuit with a free parameter and watch the state evolve.

**Load** `animated_rabi_larmor.qasm`. The circuit uses `t` — the
special "animation symbol" — as a free parameter.

**Open the Parameters panel.** *You see one row, `t`, with a slider
and a ▶ button.* Click ▶. *The slider scrubs `t` through `[0, 2π)` at
60 Hz, and every panel you have open updates in real time.*

Open the **Bloch panel** alongside Parameters. *Both Bloch vectors
oscillate* — one in a Rabi-style precession (`Ry(t)` plus `Rx(t)`
look), the other doing a slower Larmor wobble. The animation symbol
is the easiest way to feel parameterised dynamics; it works on any
circuit that uses `t` symbolically anywhere.

**Stop the animation** (▶ becomes ⏸ while playing). **Drag the slider
manually** — you'll see the state respond per pixel of drag.

**Tip.** The Parameters panel auto-detects any non-Greek symbol you
write in a gate argument as a free parameter. `theta`, `phi`, `gamma`,
your-name-here all work and get their own sliders. The `t` symbol is
special only in that it gets the play button and is what every
`t`-sweep visualiser sweeps.

---

## 3. Editing fluently (10 min)

Goal: stop fighting the editor. The features here are what make
building a non-trivial circuit fast.

**Multi-tab.** The tab strip below the header holds several circuits at
once, each with its own undo history, parameters, and step position.
**Cmd/Ctrl-T** opens a new tab, **Cmd/Ctrl-1..9** jumps to tab N,
double-click a pill to rename, drag to reorder. The custom-gate palette
and the noise model are shared across tabs; everything else is
per-tab.

**Place and wire gates.** Drag any palette tile onto a qubit wire. For
controlled gates, drag the control onto another wire; right-click a
control dot to toggle it to an **anti-control** (open circle). Click a
placed gate to select it and edit its parameters in the inspector.

**Rectangle-select.** Hold the left mouse on empty canvas and drag a
rubber band; every gate it intersects highlights. The **Edit menu**'s
Selection section then copies / cuts / pastes that block — across
tabs, too (Cmd/Ctrl-C / V).

**Append U†.** Build any sub-circuit, select a column range, and use
**Edit → Append U†** to append its exact inverse (reversed and
daggered). Handy for uncompute patterns and for "does this round-trip
to identity?" sanity checks — pair it with the Equivalence panel
(§9-bis below) to confirm.

**Save as Gate.** Select a block and use the toolbar's **Save as Gate**
to turn it into a reusable named tile in the palette. It's stored in
local storage and shared across tabs; placing it inlines the
definition at simulate time.

**The example library.** File → Open example is a searchable, grouped
picker for all 93 examples. Each entry's tooltip is its header comment
— scan the library by *what it teaches*, not by gate count.

*What to look at:* the **Resources panel** is your editing dashboard —
total / 1q / 2q / multi-qubit counts, T-count, T-depth, CX count,
parallel depth, distinct qubits, free symbols, and (when a coupling map
is imported) connectivity-violation count. When a circuit "does
something weird," Resources usually shows why (a stray ancilla, a
missing measurement). See [`panels.md`](panels.md) → Resources.

---

# Part II — Reading the state (the visualisers)

Quantiom's headline is its **24 peer visualisers** — every one a panel
with the same screen-space rights as Statevector. They're all
default-collapsed (zero cost until you open one) and capped so they
stay fast. This part tours them by *task*. Open a few side by side; the
point is to see the same state through complementary lenses.

> Most of these need the statevector path — they show a notice under
> the Clifford fast path or noise mode, because a reduced density matrix
> from a single noisy trajectory isn't meaningful.

## 4. Entanglement structure

Goal: tell *what kind* of entanglement a state has, not just that it's
entangled.

**Load** `ghz.qasm` (3-qubit GHZ) and open four panels:
**Mutual information**, **Entanglement negativity**, **Entanglement
spectrum**, and **Entropy profile**.

- *Mutual information* lights up all-to-all — every pair shares
  correlation.
- *Entanglement negativity*, though, reads **zero on every pair.** This
  is the key lesson: GHZ entanglement is **global, not pairwise**.
  Mutual information counts classical + quantum correlation together;
  negativity (PPT-exact for two qubits) only fires on genuine pairwise
  entanglement. Reading the two maps side by side is how you *see* the
  difference.
- *Entropy profile* is flat at exactly 1 bit for every cut — one shared
  bit no matter where you cut.

**Now load** `cluster_state_4q.qasm` and watch the same four panels.
*Mutual information shows a nearest-neighbour band, not all-to-all*;
*the entropy profile is no longer flat.* Different entanglement
topology, immediately visible.

**Try the Entanglement-spectrum cut selector**: tick different qubits
into subset A and watch the Schmidt coefficients and S(ρ_A) update —
the decay of the spectrum is the bond dimension an MPS would need.

See [`panels.md`](panels.md) → Mutual information / Entanglement
negativity / Entanglement spectrum / Entropy profile.

## 5. Dynamics over the `t` clock

Goal: read a circuit's *time evolution* as static pictures, without
watching the animation play.

**Load** `kicked_ising_floquet_4q.qasm` (a Floquet drive over `t`) and
open **Space–time ⟨Z⟩**, **Space–time entropy**, **t-sweep ⟨Z⟩(t)**,
and **t-sweep spectrum**.

- *Space–time ⟨Z⟩* is the many-body space–time diagram (qubits ×
  columns); a kicked drive shows period-doubling stripes.
- *Space–time entropy* shows the **entanglement-growth front** — where
  and when each qubit gets entangled.
- *t-sweep ⟨Z⟩(t)* plots each qubit's ⟨Z⟩ over one period as a line;
  *t-sweep spectrum* is its DFT, so Rabi/Larmor/Floquet frequencies
  appear as peaks (a single `rx(t)` peaks at bin 1).

**Then load** `trotter_heisenberg_2q.qasm` and open **Loschmidt echo**
and **Bloch trajectory**. *Loschmidt* traces the return probability
L(t) = |⟨ψ(0)|ψ(t)⟩|² with the DQPT rate function overlaid — cusps mark
dynamical phase transitions. *Bloch trajectory* draws the full 3-D path
each qubit's Bloch vector sweeps (not just ⟨Z⟩).

For scrambling, open **OTOC** on a coupled circuit, pick a "butterfly"
qubit and a "measure" qubit, and watch C(t) rise as the operator front
spreads between them.

See [`panels.md`](panels.md) → the Dynamics panels.

## 6. Phase space & magic

Goal: see interference, non-classicality, and "how hard is this state
to simulate classically."

**Load** `magic_state.qasm` (`T|+⟩`, the canonical magic state) and open
**Amplitude · phase**, **Wigner function**, **Husimi Q**, and
**Magic (M₂)**.

- *Amplitude · phase* shows the full state as horizontal bars (length =
  |amp|, hue = phase), one per basis state — the only view of
  *full-state* phase. Load `qft_3q.qasm` to see the QFT's phase staircase.
- *Wigner function* is the discrete phase-space quasi-probability;
  **negative cells = non-classicality.** A T-state shows negativity.
- *Husimi Q* is the always-non-negative companion — a smooth coherent-
  state projection on the sphere.
- *Magic (M₂)* is the rigorous number: the stabilizer 2-Rényi entropy.
  **M₂ = 0 exactly for any stabilizer state**, and climbs with every
  T-like gate. The `T|+⟩` state reads ≈ 0.415 bit; load `bell.qasm` and
  it reads 0 — Bell is a stabilizer state.

**Load** `ghz.qasm` and open the **Q-sphere**: *two big antipodal dots*
(|000⟩ at the north pole, |111⟩ at the south), the whole state on one
sphere with hue = phase. **Drag to orbit** the globe, scroll to zoom, and
**hover any dot** for its state, probability, and phase angle.

See [`panels.md`](panels.md) → Amplitude · phase / Wigner / Husimi /
Magic / Q-sphere.

## 7. The operator, not the state

Goal: inspect what the circuit *does* to every input, independent of
the input.

**Load** any small circuit (≤ 3 qubits) and open **Unitary heatmap**
and **Pauli transfer matrix**.

- *Unitary heatmap* is the 2ⁿ×2ⁿ operator (magnitude + phase). A
  permutation shows one lit cell per row/column; a controlled gate
  shows block structure; QFT shows uniform magnitude with a phase
  staircase.
- *Pauli transfer matrix* shows the same operator in the Pauli basis. A
  **Clifford gate is a signed permutation** (one ±1 per row/column);
  load a circuit with a `T` to see weight smear into the X–Y block.

**Process tomography (χ)** reconstructs the process matrix in heatmap or
Hinton view (and has a noise toggle for the trajectory-averaged
channel). **Hamiltonian spectrum** diagonalises a Pauli-sum H you type
and overlays the live state's ⟨H⟩ — drag a VQE ansatz and watch ⟨H⟩
descend toward the ground line.

**Equivalence** check: open two tabs, and the Equivalence panel compares
them up to global phase, reporting process fidelity and a trace-distance
bound. This is the tool for "did my optimisation change the circuit's
meaning?" — see §12.

See [`panels.md`](panels.md) → Unitary heatmap / Pauli transfer matrix /
Tomography / Hamiltonian spectrum / Equivalence.

## 8. Structure graphs

Goal: read the circuit's *structure* — connectivity, checks, causal
cones — with no simulation at all.

- **Interaction graph** — qubits as nodes, edge weight = # of
  multi-qubit gates per pair. Compare it against the hardware coupling
  map in the Noise panel to gauge how much routing a device will need.
- **Tanner / check graph** — load `surface_code_plaquette.qasm` or
  `steane_encode_logical_zero.qasm`; each measurement becomes a check
  node connected to the data qubits in its causal support (weight-4 for
  a surface plaquette). The bipartite graph a decoder consumes.
- **Causal cone** — pick a target qubit and a direction on the **canvas
  overlay**; gates outside that qubit's light cone dim. Great for "how
  far does this measurement's dependency reach."
- **ZX diagram** — the circuit as green/red spiders + Hadamard boxes.
  Load `cluster_state_4q.qasm` to see graph-state structure; the π/4
  green spiders are exactly your T-count, at a glance. (This renders the
  diagram; it does not do PyZX-style rewriting.)

See [`panels.md`](panels.md) → Interaction graph / Tanner / Causal cone /
ZX diagram.

## 8b. More analysis panels (a quick tour)

Beyond the panels above, several focused diagnostics are each one
default-collapsed panel away. They follow the same patterns (a pure tested
helper, capped, zero-cost until opened), so just expand the one whose
question matches yours:

- **Concurrence** & **Participation / IPR** — pairwise entanglement-of-
  formation (the monogamy-aware complement to negativity: W → 2/3 on every
  pair, GHZ → 0) and computational-basis localization (PR = effective # of
  occupied basis states; the Anderson/MBL diagnostic, with a per-column
  delocalization sweep).
- **Coherence** & **Symmetry sectors** — l₁ / relative-entropy coherence
  (watch it decay under phase damping in noise mode) and how the weight
  splits across excitation-number / Z₂-parity sectors (does your ansatz
  conserve particle number?).
- **Quantum Fisher info** & **Quantum geometric tensor** — metrology and
  parameter-space geometry: F_Q = 4 Var(J_α) (GHZ saturates the Heisenberg
  limit N²; F_Q/N > 1 witnesses useful entanglement) and the Fubini–Study
  metric the natural-gradient optimiser descends.
- **Spectral form factor**, **Level statistics** & **Diagonal ensemble** —
  quantum-chaos and thermalization from a Pauli-sum H: the dip→ramp→plateau
  SFF, the Poisson-vs-GOE gap-ratio histogram, and the energy-basis
  populations pₖ = |⟨Eₖ|ψ⟩|² (effective dimension d_eff) that ETH predicts
  observables relax to.
- **Dynamic branch tree** — for circuits with mid-circuit measurement, the
  full outcome tree with per-edge Born probabilities (load the dynamic
  teleportation example: two measurements → four 25 % branches).
- **Structure factor S(k)** & **Krylov complexity** — the momentum-space
  order parameter (Fourier transform of ⟨ZⱼZₗ⟩; peak at k = π ⇒ Néel order)
  and operator growth / spread complexity under a Pauli-sum H (Lanczos bₙ
  plus the C(t) curve — linear bₙ growth is the chaotic signature).
- **Operator entanglement** & **Entanglement asymmetry** — the entangling
  power of the circuit *unitary* across the middle cut (product → 0, CNOT →
  1, SWAP → 2 ebits) and the depth-swept ΔS_A symmetry-breaking curve, where
  a rise-then-fall is the quantum Mpemba effect.

See [`panels.md`](panels.md) for the per-panel reference on each.

---

# Part III — Noise & error mitigation

## 9. Noise (5 min)

Goal: turn on a noise model and see how it dulls the ideal state.

**Load** `ghz.qasm`. With no noise, the Statevector panel shows two
non-zero amplitudes (`|000⟩` and `|111⟩`), each at 1/√2. Bloch shows
three origin vectors.

**Open the Noise panel.** Drag the **1-qubit depolarising** slider up
to 0.05 (5% depolarising per gate). *The Bloch vectors stay at the
origin* — depolarising on its own can't show on individual qubits of
a GHZ.

**Drag the amplitude-damping slider** up to 0.05. *Now the Bloch
vectors drift south* — amplitude damping pulls every qubit toward
`|0⟩`. By the time it's been applied through all the CXs, the GHZ
is significantly decohered.

**Switch the Probabilities panel to Shots mode.** *You'll now see
non-zero probability mass on basis states besides `|000⟩` and `|111⟩`*
— most prominently `|001⟩`, `|010⟩`, `|100⟩` — the result of
amplitude damping flipping one of the three qubits in transit.

**Try a device import.** The Noise panel can import an IBM
`BackendProperties` JSON (T1/T2, per-gate error, readout, coupling
map) — either from a file or live from the qiskit GitHub backend list
via **Import IBM BackendProperties from Qiskit** — and it has a
coupling-graph view and a custom-Kraus editor for arbitrary 1q/2q channels.

**Quantify the damage.** With noise on, open **Fidelity & purity** for the
one-glance F = ⟨ψ|ρ|ψ⟩ / trace distance / purity / S(ρ) vs the ideal, and
**Decoherence** for the depth-stepped movie of the histogram flattening
toward uniform. Both are noise-mode only and read the trajectory-averaged ρ.
**Coherence** (noise mode) shows the off-diagonal coherence shrinking as
phase damping bites.

**Turn noise OFF** when you're done — Quantiom's default-fast
invariant means a noise-off circuit runs at full noiseless speed; an
accidentally-left-on noise model can be a surprise in the next
section if you forget.

See [`panels.md`](panels.md) → Noise model / Fidelity & purity / Decoherence.

## 10. ZNE: undoing some of the noise (5 min)

Goal: estimate a noise-free expectation value from a noisy circuit
without changing the circuit.

**Load** `ghz.qasm` again. **Open the Noise panel** and set 1q
depolarising to 0.03 (3%). **Open the Expectation panel**.

Set the Pauli selection to `Z Z Z` (three Z's). On the noiseless GHZ,
`⟨ZZZ⟩ = 1`. *The Expectation panel reads roughly 0.6–0.7* — noise
has chipped away at the coherence.

**Click ZNE** in the Expectation panel's tool row. Quantiom runs the
circuit at 1× noise, 2× noise, and 3× noise, fits a curve, and
extrapolates to γ → 0 (zero noise). *The reported value should be
much closer to 1.0* — the textbook ZNE win.

**Change the fit kind** (dropdown next to the ZNE button) to
**quadratic** (Richardson extrapolation). *The estimate sharpens
further* — quadratic Richardson cancels both linear and quadratic
error terms, at the cost of being noisier when the underlying noise
is small. For deep circuits it's worth it.

## 11. PEC: cancelling noise per gate (5 min)

Goal: try the other big mitigation tool, with its own trade-offs.

PEC inverts each gate's noise channel via a quasiprobability
decomposition. Costs more shots than ZNE (variance overhead grows
exponentially in depth × #channels) but gives you an unbiased
estimator instead of an extrapolation.

Same circuit, same noise. **Click PEC** in the Expectation panel.
*You'll see a value reported, along with a "variance overhead ≈ N"
number.* For a 3-qubit GHZ at 3% depolarising, the variance overhead
is small enough that you get a clean estimate from the default 100
shots.

**Crank noise to 10%** and click PEC again. *The variance overhead
balloons* — past ~10⁶× the panel warns you that the estimate will
be too noisy to be useful. That's the regime where ZNE is the
better choice.

Both ZNE and PEC report the SAME quantity (noise-free ⟨P⟩); they're
different statistical strategies for estimating it.

See [`panels.md`](panels.md) → Expectation ⟨P⟩ (the ZNE / PEC tool row).

---

# Part IV — Optimisation & algorithms

## 12. VQE and the optimiser toolbox (10 min)

Goal: the destination. Tune an ansatz to minimise the expectation of
a Hamiltonian — the workflow that drives every NISQ-era ground-state
calculation.

**Load** `vqe_h2_minimal.qasm`. It's a tiny 2-qubit ansatz with one
free parameter `theta`. The header explains why.

**Open the Expectation panel** and switch it to **Hamiltonian mode**.
In the text box, paste the H₂ Hamiltonian (also in the example
header):

```
-1.052 * II + 0.398 * IZ - 0.398 * ZI - 0.011 * ZZ + 0.181 * XX
```

The panel parses this into 5 Pauli terms and shows the current ⟨H⟩.

**Open the Parameters panel.** Drag `theta` slowly. *⟨H⟩ in the
Expectation panel updates as you drag* — the curve has a clear
minimum around `theta ≈ 0.2`.

**Click Optimise** in the Expectation panel. Quantiom runs Adam (the
default) with parameter-shift gradients and converges in 20–50 steps.
Watch the step counter and the running ⟨H⟩ live. *When it converges,
the slider has moved to the true minimum* and the reported energy
matches the Full-CI ground-state energy of H₂ at this bond length
(roughly −1.137 Hartree). You just ran a VQE.

**The rest of the tool row:**
- **Landscape** sweeps 1–2 symbols on a grid and renders ⟨H⟩ as a
  curve or heatmap — the minimum becomes visually unambiguous.
- **Plateau** samples random parameters and reports
  `Var(∂⟨H⟩/∂θ)`. For this 1-parameter circuit the variance is
  healthy; try it on `variational_ansatz.qasm` (4 qubits, 16
  parameters, CNOT ring) to feel a real barren-plateau diagnostic.
- **QNG** (Quantum Natural Gradient, statevector mode) preconditions
  the gradient with the Fubini–Study metric — often far fewer steps
  than plain Adam on a curved landscape.

**See the geometry itself.** Open the **Quantum geometric tensor** panel to
view that Fubini–Study metric g_ij over your free symbols (heatmap + √det g +
eigenvalues) — the curvature QNG is correcting for. The **Quantum Fisher
info** panel reports F_Q = 4 Var(J_α), the metrological sensitivity and an
entanglement witness (GHZ saturates the Heisenberg limit N²).

See [`panels.md`](panels.md) → Expectation ⟨P⟩ / Quantum geometric tensor /
Quantum Fisher info.

## 13. Hamiltonian → Trotter (5 min)

Goal: turn a Hamiltonian into the circuit that simulates its time
evolution.

**Open the Hamiltonian → Trotter panel.** Paste a Pauli-sum (or click a
preset: TFIM, XXZ, Heisenberg, H₂). Set the **order** (1, 2 = Strang,
4 = Suzuki) or switch to **qDRIFT** random compilation, pick a time `t`
and a step count, and **Generate** — the Trotter circuit opens in a new
tab, parametrised by `t` so you can immediately animate it (Part I §2)
and watch the dynamics with the Part II visualisers.

**Tip.** Run the Plateau diagnostic on the generated circuit to feel how
Trotter depth trades off against trainability.

See [`panels.md`](panels.md) → Hamiltonian → Trotter.

## 14. The Clifford fast path & syndromes (5 min)

Goal: simulate *big* circuits, and sample error-correction syndromes.

**Load** `ghz_16q.qasm`. A 16-qubit statevector would be 65 k
amplitudes; this one runs instantly because it's **Clifford-only** —
Quantiom routes it to the Aaronson–Gottesman tableau simulator (cap
1024 qubits). The Statevector/Probabilities panels show a notice (no
dense state), but **Bloch is exact** and **Expectation ⟨P⟩ works** (the
tableau computes multi-qubit Pauli expectations exactly, returning
{−1, 0, +1}).

**Load** `stabilizer_measurement.qasm` (or a code example) and open
**Syndrome sampling**: it runs N shots of the Clifford circuit and
tabulates the measured syndrome bitstrings. Flip the **noise toggle**
and it routes through a Pauli-frame tracker with per-gate depolarising
injection — realistic syndromes from a stabilizer code.

**Open Stabilizer generators** on the same circuit: it lists the n signed
Pauli generators ⟨g₁…⟩ of the stabilizer group straight from the tableau
(GHZ-4 → +XXXX / +ZZII / +IZZI / +IIZZ) — the compact description that works
far past the statevector cap.

For dynamic (mid-circuit measurement) circuits generally, the
**Measurement counts** panel is the shots view (N full simulations with the
classical-register histogram), and the **Dynamic branch tree** shows the full
outcome tree with per-edge Born probabilities — load the dynamic
teleportation example to see two measurements fan out into four 25 % leaves.

See [`panels.md`](panels.md) → Syndrome sampling / Measurement counts /
Stabilizer generators / Dynamic branch tree.

---

# Part V — Hardware & interop

## 15. Transpile / Route / Compile to a device (5 min)

Goal: turn an abstract circuit into one a real device could run.

**Load** a circuit that uses gates a device doesn't have natively —
e.g. one with an arbitrary 2-qubit gate (`u_arb_2`), `iSWAP`, or
numeric `RXX`. Open the toolbar's **Compile…** dialog.

Pick a target — **Clifford+T**, **IBM heavy-hex {RZ, SX, CX}**, or
**Rigetti {RZ, RX, CZ}** — and run. The one-click pipeline does
**Transpile → Optimise → Route → Optimise** and reports per-stage gate
counts and T-count. On the continuous targets, arbitrary two-qubit
gates are **KAK-decomposed** (Cartan magic-basis) into the native set
at machine precision.

**Routing** inserts SWAPs to satisfy a coupling map; the **Resources**
panel's connectivity-violation count (once a coupling map is imported in
the Noise panel) tells you whether routing is even needed.

To sanity-check the result, **Equivalence**-check the compiled circuit
against the original (open both as tabs) — it should report fidelity 1
up to global phase.

See [`panels.md`](panels.md) → Resources / Equivalence; and
[`qasm.md`](qasm.md) for the transpile targets.

## 16. OpenQASM 3 round-trip & the nine exports (5 min)

Goal: get your circuit out of Quantiom and into your real toolchain.

**Open the OpenQASM 3 panel.** It shows the live circuit as OpenQASM 3
and **round-trips** — edit the text and the canvas updates, edit the
canvas and the text updates. It preserves the symbolic look of
parameter expressions, anti-controls (`negctrl @`), conditional gates
(`if (c[k]==v) …`), and qubit-name / note comments. It also parses
OpenQASM 2.

**File → Export** offers nine one-way emitters: **Qiskit, Cirq, Braket,
Q#, PyQuil, pytket, OpenQASM 2, LaTeX (quantikz), JSON**. Gates without
a native method in a target are lowered to exact decompositions where
possible (e.g. `R(θ,φ) → Rz·Rx·Rz`) or emitted as a clear comment, so
nothing is silently lost. Watch the **angle conventions**: pytket uses
half-turns, the others radians (the qasm.md reference spells out each
target's quirks).

**Share link.** File → Share copies a URL whose hash is the
gzip-compressed circuit — paste it to a colleague and they open the
exact circuit, no account, no server.

See [`qasm.md`](qasm.md) for the full round-trip contract and per-emitter
conventions.

---

# Part VI — The AI assistant

## 17. Chat (optional; needs your own key)

Goal: an in-tool tutor and circuit-rewriter.

The chat panel at the bottom of the canvas talks to any
[OpenRouter](https://openrouter.ai) model (you supply the key; it's
stored only in your browser). Two things make it more than a generic
chatbot:

- **Circuit context.** Every message ships the current circuit as
  OpenQASM 3, and the **+ context** picker attaches panel snapshots
  (statevector, probabilities, Bloch, resources, noise, classical
  register) so the model reasons about the *actual* state, not your
  description.
- **Auto-open suggestions.** When a reply contains a `qasm` /
  `openqasm` fenced block, Quantiom parses it and **opens it as a new
  tab** the moment streaming finishes — "rewrite this as a Z-basis cat
  state" lands as a runnable circuit.

Replies render as **markdown + LaTeX** (KaTeX, including Dirac braket
notation), so derivations come back formatted. Treat answers as
suggestions, not truth — verify anything non-trivial by running it in
the simulator (the Equivalence panel is your friend here).

See [`panels.md`](panels.md) → Chat (AI).

---

## Gate cheat-sheet

A one-line-each reference for the gates you'll actually reach for. The
palette has 64 in all — **hover any tile for its exact definition**;
this is the working set. "Arrow" refers to the Bloch picture from
Part 0.

**Single-qubit — flips, phases, turns**

| Gate | What it does |
|---|---|
| `I` | identity — does nothing (a placeholder / timing slot) |
| `X` | bit flip (0 ↔ 1) — a half-turn of the arrow about X |
| `Y` | half-turn about Y (a bit flip *and* a phase flip) |
| `Z` | phase flip on the 1 state — invisible to probabilities, visible in interference |
| `H` | Hadamard — makes a 50/50 superposition; `H·H` cancels back to the start |
| `S` / `S†` | quarter-turn about Z (√Z) — a phase of ±i on the 1 state |
| `T` / `T†` | eighth-turn about Z (√S) — the key *non-Clifford* gate (its count sets circuit "hardness") |
| `√X` / `√Y` (+ `†`) | half an X / Y — common hardware-native single-qubit gates |
| `P(λ)` | phase gate — the general Z-axis phase (Z, S, T are special cases) |
| `RX/RY/RZ(θ)` | rotate the arrow by angle θ about X / Y / Z |
| `U(θ,φ,λ)` | the *most general* single-qubit gate (any one-qubit operation) |

**Two-qubit — entanglers**

| Gate | What it does |
|---|---|
| `CX` (CNOT) | flip the target **if** the control is set (the 1 state) — the workhorse entangler |
| `CY` / `CZ` | controlled Y / Z; `CZ` is symmetric (a phase flip when both qubits are 1) |
| `SWAP` | exchange two qubits; `iSWAP` swaps with an `i` phase |
| `√SWAP` | half a swap — a partial entangler |
| `CRX/CRY/CRZ/CP` | controlled rotations / phase |
| `RXX/RYY/RZZ(θ)` | Ising rotations `exp(−iθ/2 · XX)` etc. — the building blocks of Trotterised dynamics |

**Three-or-more**

| Gate | What it does |
|---|---|
| `CCX` (Toffoli) | flip the target if **both** controls are set |
| `CCZ` / `CSWAP` | controlled-CZ / controlled-SWAP (Fredkin) |
| `MCX` | n-controlled X (you choose how many controls) |

**Hardware-native sets** (for "design here, run there"): IBM uses
`SX` + `ECR`; Google uses `fSim(θ,φ)` / `√iSWAP`; IonQ / trapped-ion use
`GPi`, `GPi2`, `MS`, and the equatorial rotation `R(θ,φ)`.

**State prep & non-unitary**

| Item | What it does |
|---|---|
| State preps | prepare a qubit directly in 0, 1, +, −, +i or −i |
| `Initialize` | prepare an arbitrary state (amplitude tuple or label) |
| `Measure` (Z/X/Y) | look — collapse to 0 or 1 and record to a classical bit |
| `Reset` | force a qubit back to 0 mid-circuit |
| `Barrier` / `Delay` | markers — stop the optimiser from crossing / model idle time |

---

## Common gotchas (FAQ)

The questions that trip people up most, with the two-line answer.

**My Bloch arrows are stuck at the centre of the ball.** They're either
*entangled* or *noisy*. A qubit that's entangled with another has no
arrow of its own — the information lives in the pair (that's the whole
point of a Bell state). Look at the entanglement panels instead.

**The probability bars jiggle every refresh.** You're in **Shots**
mode — the tool is sampling, so the bars wobble like real measurements.
Switch to **Exact** for the true values.

**There's no Statevector — it says "Clifford fast path."** A
Clifford-only circuit past ~16 qubits routes to the tableau simulator,
which doesn't build a dense state (it couldn't — that's the point).
**Bloch and ⟨P⟩ still work**; add a non-Clifford gate (e.g. `T`) or use
fewer qubits if you need the amplitudes.

**Everything looks dull / decohered.** You left the **Noise model on.**
Toggle it off — a noise-off circuit runs at full noiseless speed.

**A visualiser shows a notice instead of a plot.** Most visualisers need
the statevector path, so they hide under Clifford or noise mode (a
single noisy trajectory isn't meaningful), or your circuit exceeds that
panel's qubit cap. The notice says which.

**My measurement did nothing / Measurement counts is empty.** You need a
**measurement gate *and* at least one classical bit** allocated (the
`clbits` control in the toolbar).

**RZ doesn't move ⟨Z⟩ / the Bloch arrow looks unchanged.** `RZ` (and
`Z`, `S`, `T`, `P`) only move *phase* — rotation about the Z axis. It's
invisible on ⟨Z⟩; look at the **Phase disk** or the X-Y plane.

**The animation won't play / there's no ▶.** The circuit needs a free
`t` symbol somewhere — write e.g. `rz(t)` or `rx(t/2)`. `t` is the
special clock symbol every time-sweep panel uses.

**I optimised / compiled — did it change what the circuit means?** Open
the before and after as two tabs and use the **Equivalence** panel; it
compares up to global phase and reports fidelity. Fidelity 1 = same
operation.

**An SDK export has a comment where a gate should be.** That gate has no
native method in that target. Quantiom lowers it to an exact
decomposition where it can, and otherwise leaves a clear comment rather
than emit something wrong — see [`qasm.md`](qasm.md).

**The AI chat stopped with a "timed out" message.** It has a 20-second
idle timeout, so a hung or stalled request fails cleanly instead of
freezing. Retry, or pick a faster model.

---

## A few keyboard shortcuts worth knowing

| Keys | What |
|---|---|
| `?` | Open the keyboard shortcuts dialog (lists everything) |
| `Cmd-Z` / `Ctrl-Z` | Undo |
| `Cmd-Shift-Z` / `Ctrl-Y` | Redo |
| `Cmd-K` | Find within circuit (gate id, qubit name, parameter) |
| `Cmd-S` | Save the current tab to a `.qasm` file |
| `Cmd-T` | New tab · `Cmd-1..9` jump to tab N |
| `Delete` / `Backspace` | Delete the selected gate |
| `Cmd-D` | Duplicate selected gate(s) |
| `Cmd-C` / `Cmd-V` | Copy / paste gate ranges across tabs |

The full list is in the `?` dialog; this is the working set.

---

## Where to look when you're stuck

- **Panel reference**: [`panels.md`](panels.md) — every panel's
  controls, what it computes, when it's hidden.
- **OpenQASM & export**: [`qasm.md`](qasm.md) — round-trip rules and
  per-emitter conventions.
- **Architecture**: [`architecture.md`](architecture.md) — how the
  pieces connect, the fast-path routing, where things live.
- **Examples library**: the `examples/` directory has 93 circuits,
  each with an explanatory header.
- **Resources panel**: when your circuit is "doing something weird,"
  open Resources and check the gate counts. Often the issue is a
  stray ancilla or a missing measurement.
- **Equivalence panel**: when an optimisation feels suspicious, save
  the before-state to a `.qasm`, run Optimise / Compile, and
  Equivalence-check the result against the saved version.
- **AI chat**: paste your circuit and attach the panel snapshot you're
  confused about. Treat its answers as suggestions, not truth.

That covers the ground. Open the file picker, pick something that
sounds interesting, and play.
