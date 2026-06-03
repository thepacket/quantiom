# Tutorial — from first circuit to running VQE

This is a hands-on walkthrough. Open Quantiom in one window and this
document in another; every section ends with a "what to look at"
moment so you know whether you're on track.

The whole tour takes about thirty minutes if you don't get distracted
poking around (you will get distracted poking around). Each section
loads an example circuit from `examples/`; the file menu has a
searchable picker for all 88 of them.

Throughout the tour, **bold** is for actions you take; *italic* is for
the thing you should now see.

---

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
your-name-here all work and get their own sliders.

---

## 3. Noise (5 min)

Goal: turn on a noise model and see how it dulls the ideal state.

**Load** `ghz.qasm` (a 3-qubit GHZ — like Bell but more entangled). With
no noise, the Statevector panel shows two non-zero amplitudes
(`|000⟩` and `|111⟩`), each at 1/√2. Bloch shows three origin vectors.

**Open the Noise panel.** Drag the **1-qubit depolarising** slider up
to 0.05 (5% depolarising per gate). *The Bloch vectors stay at the
origin* — depolarising on its own can't show on individual qubits of
a GHZ.

**Drag the amplitude-damping slider** up to 0.05. *Now the Bloch
vectors drift south* — amplitude damping pulls every qubit toward
`|0⟩`. By the time it's been applied through all the CXs, the GHZ
is significantly decohered.

**Switch the Probabilities panel to Shots mode.** *You'll now see
non-zero probability mass on basis states besides `|000⟩` and `|111⟩`
— most prominently `|001⟩`, `|010⟩`, `|100⟩` — the result of
amplitude damping flipping one of the three qubits in transit.

**Try a device preset.** In the Noise panel, click **IBM Heron**. The
sliders snap to a representative profile for that device. The noise
visible on the GHZ now matches what you'd expect from a real
near-term experiment.

**Turn noise OFF** when you're done — Quantiom's default-fast
invariant means a noise-off circuit runs at full noiseless speed; an
accidentally-left-on noise model can be a surprise in the next
section if you forget.

---

## 4. ZNE: undoing some of the noise (5 min)

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

---

## 5. PEC: cancelling noise per gate (5 min)

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

---

## 6. VQE: optimising parameters to minimise energy (10 min)

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
(roughly −1.137 Hartree).

You just ran a VQE.

**Try Landscape** instead: the Landscape button sweeps `theta` across
`[-π, π]` on a 50-point grid and renders ⟨H⟩ as a curve. *The
minimum is visually unambiguous* — you can see why the optimiser
converged where it did.

**Try Plateau**: samples random `theta` values and reports
`Var(∂⟨H⟩/∂theta)`. For this 1-parameter circuit the variance is
healthy — no barren plateau here. Try it on `variational_ansatz.qasm`
(4 qubits, 16 parameters, ring of CNOTs) for a more interesting
plateau diagnostic.

---

## What's next

You've now seen every major workflow Quantiom is built around. The
remaining panels (Density matrix, Tomography, Compare, Equivalence,
Hamiltonian → Trotter, Syndrome sampling, OpenQASM 3, Chat) work the
same way: load an example, open the panel, observe.

Pick from the `examples/` library by topic:

| If you're interested in… | Try |
|---|---|
| Algorithms & speedups | `grover_3q.qasm`, `bv_8q.qasm`, `dj_6q.qasm` |
| Quantum chemistry | `vqe_h2_minimal.qasm`, `ansatz_uccsd_lite_4q.qasm` |
| Optimization | `qaoa_square_p2.qasm`, `qaoa_maxcut_triangle.qasm` |
| Error correction | `bit_flip_code.qasm`, `phase_flip_code.qasm`, `steane_encode_logical_zero.qasm`, `shor_9q_encoder.qasm` |
| Nonlocality & foundations | `chsh_test.qasm`, `mermin_ghz_test.qasm`, `no_cloning_witness.qasm` |
| Communication protocols | `teleportation.qasm`, `superdense_coding.qasm`, `bb84_round.qasm` |
| Measurement-based QC | `cluster_state_4q.qasm`, `gate_teleportation.qasm` |
| Dynamics & physics | `trotter_heisenberg_2q.qasm`, `anim_ising_trotter.qasm` |
| QFT & friends | `qft_3q.qasm`, `qft_5q.qasm`, `qft_8q.qasm`, `quantum_phase_estimation.qasm` |
| Arithmetic | `half_adder.qasm`, `draper_adder.qasm`, `cuccaro_adder_2bit.qasm` |
| Random walks | `quantum_walk_step.qasm`, `quantum_walk_8steps_3q.qasm`, `quantum_random_walk_cycle.qasm` |

Each file starts with a header explaining what it shows, what to look
at in which panel, and (where appropriate) literature references.

---

## A few keyboard shortcuts worth knowing

| Keys | What |
|---|---|
| `?` | Open the keyboard shortcuts dialog (lists everything) |
| `Cmd-Z` / `Ctrl-Z` | Undo |
| `Cmd-Shift-Z` / `Ctrl-Y` | Redo |
| `Cmd-K` | Find within circuit (gate id, qubit name, parameter) |
| `Cmd-S` | Save the current tab to a `.qasm` file |
| `Delete` / `Backspace` | Delete the selected gate |
| `Cmd-D` | Duplicate selected gate(s) |
| `Cmd-C` / `Cmd-V` | Copy / paste gate ranges across tabs |

The full list is in the `?` dialog; this is the working set.

---

## Where to look when you're stuck

- **Panel reference**: [`docs/panels.md`](panels.md) — every panel's
  controls, what it computes, when it's hidden.
- **Examples library**: the `examples/` directory has 88 circuits,
  each with an explanatory header.
- **Resources panel**: when your circuit is "doing something weird",
  open Resources and check the gate counts. Often the issue is a
  stray ancilla or a missing measurement.
- **Equivalence panel**: when an optimisation feels suspicious, save
  the before-state to a `.qasm`, run Optimise, and Equivalence-check
  the result against the saved version.
- **AI chat**: paste your current circuit's QASM and the panel
  snapshot you're confused about; the chat panel has a context-attach
  picker for exactly this. Treat its answers as suggestions, not
  truth.

That covers the basics. Open the file picker, pick something that
sounds interesting, and play.
