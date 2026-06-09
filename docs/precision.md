# Precision & limits

What every panel can and can't tell you accurately, and where the numbers
stop being exact. Quantiom is a **numeric** simulator (IEEE-754 double
precision throughout — no symbolic algebra), so "precision" here means three
separate things:

1. **Reachable size** — exponential-cost panels refuse past a qubit cap rather
   than approximate.
2. **Statistical error** — sampling / trajectory panels fluctuate run-to-run.
3. **Model error** — a few panels are deliberate approximations (Trotter,
   Pauli-twirl, discrete Wigner, ZNE/PEC).

Pair this with [`panels.md`](panels.md) (what each panel shows) and
[`architecture.md`](architecture.md) (how the simulator paths work).

---

## Cross-cutting facts

- **Double precision.** All amplitudes are a `Float64Array` of interleaved
  re/im (≈15–16 significant digits, machine ε ≈ 2.2 × 10⁻¹⁶). Iterative
  routines (dense diagonalization, Lanczos, the optimisers) accumulate
  rounding error in the last few digits.
- **No symbolic math.** Parameter *expressions* are preserved for display and
  QASM round-trip, but every computed quantity is numeric.
- **Statevector hard cap: 20 qubits** (`sim/simulate.ts`, ~16 MB per state).
  Allocating 21 would request 32 MB and break the per-frame responsiveness
  guarantee.
- **Clifford fast path: up to 1024 qubits.** Clifford-only circuits wider than
  16 route to the Aaronson–Gottesman tableau (`sim/stabilizer.ts`); it is
  exact but only represents stabilizer states.
- **Noise mode is trajectory-averaged.** Derived quantities converge like
  1/√(trajectories); raw amplitudes from a single trajectory are not
  meaningful (the statevector/phase panels say so). The optional **WebGPU**
  path is **single precision (FP32)** and only handles 1-qubit-gate +
  depolarising circuits.
- **Mid-circuit measurement / noise** disables the statevector-only panels
  (they show a notice rather than a wrong number).

---

## 1. Exponential-cost caps (exact within the cap)

These panels are exact up to their cap and simply decline beyond it — the cap
is set by memory/compute (2ⁿ amplitudes, 4ⁿ Pauli expectations, or 2ⁿ×2ⁿ
diagonalization), not by any loss of accuracy.

| Panel | Max qubits | Cost driver |
|---|---|---|
| Statevector · Probabilities · Bloch · Phase disk · Amplitude·phase | 20 | 2ⁿ state |
| Q-sphere | 8 | 2ⁿ = 256 plotted points (legibility) |
| Husimi-Q | 7 | (θ,φ) grid × 2ⁿ overlaps |
| Magic (M₂) · Hamiltonian spectrum · Spectral form factor · Level statistics · OTOC · Unitary heatmap · Operator entanglement | 6 | 4ⁿ Paulis or O((2ⁿ)³) diagonalization |
| Entanglement spectrum (Schmidt) | 6 (smaller cut side) | diagonalize reduced ρ |
| Wigner | 4 | discrete Wigner over 4ⁿ |
| Tomography | 4 (≤2 in practice) | χ is 4ⁿ × 4ⁿ |
| Pauli transfer matrix (PTM) | 3 | 4ⁿ × 4ⁿ |
| Density matrix | 8-qubit subsystem | ρ_A is 4^\|A\| |
| Mutual information · Negativity | 12 | pairwise reduced-ρ eigenvalues |
| Concurrence | 10 | pairwise Wootters concurrence |
| ZZ correlations · Space-time ⟨Z⟩ · t-sweep · t-sweep FFT · Loschmidt | 14 | per-pair / per-column / per-sample sim |
| Bloch trajectory · Space-time entropy · Entanglement asymmetry · QGT | 12 | per-sample / per-column reduced states (QGT ≤ 8 symbols) |
| Quantum Fisher information | 14 | collective-spin variance |
| Coherence | 16 pure / 6 noisy | ρ off-diagonals (noisy uses averaged ρ) |
| Participation/IPR · Symmetry sectors · Structure factor | 16 | probability moments |
| Custom plots (per quantity) | basis 10 · matrix 12 · magic/Pauli-weight 6 · per-qubit/scalar 16 · code program 14 | each quantity inherits its own cap; the sandboxed code path clones 2ⁿ amplitudes |

Diagonalization-based panels (Hamiltonian spectrum, SFF, level statistics,
diagonal ensemble, Krylov) inherit the **O((2ⁿ)³)** dense-eigensolver cost, so
they sit at the 6-qubit end and run **on click**, not per frame.

---

## 2. Statistical error (results fluctuate)

These estimate a quantity by sampling; the error shrinks with more
shots/sequences/trajectories but is never zero.

- **Probabilities (shots mode)** and **Measurement counts** — multinomial
  sampling of the distribution.
- **Syndrome sampling** — Monte-Carlo shots through the (optionally noisy)
  stabilizer path.
- **Benchmarking suite** — Randomized Benchmarking (standard / interleaved /
  unitarity), **Quantum Volume**, **Mirror / volumetric**, **XEB**,
  **Simultaneous-RB (crosstalk)**, **QEC**: each samples circuits and **fits a
  decay or threshold**. QV/Mirror/XEB also require the **noise model enabled**
  to show anything below the ideal. RB-family error scales with the number of
  sequences; QEC/QV/Mirror/XEB with shots and circuit count.
- **Any noise-mode panel** (Decoherence, Fidelity / purity, noisy Tomography,
  noisy Coherence, noisy Expectation) is trajectory-averaged.

---

## 3. Model error (deliberate approximations)

These are biased estimators, not just noisy — understand the approximation
before trusting the number.

- **Pauli error budget** — uses the **Pauli-twirl approximation** of
  amplitude/phase damping; exact for depolarising, approximate otherwise.
- **T1 / T2** — fits an exponential to an identity-gate-chain decay; constants
  are reported in **gate-times**, not seconds.
- **Hamiltonian → Trotter** — Trotter–Suzuki error is **O(Δt^{order+1})** per
  step; qDRIFT adds its own sampling error.
- **Wigner** — the qubit discrete Wigner function is **not Clifford-covariant
  for n ≥ 2**: entangled stabilizer states can show *false* negativity. Use the
  **Magic (M₂)** panel for a rigorous non-stabilizerness measure (M₂ = 0 ⟺
  stabilizer state, exactly).
- **ZNE / PEC** (Expectation tools) — zero-noise extrapolation and
  probabilistic error cancellation are estimators with their own fit/model
  error and (for PEC) sampling overhead.
- **Fidelity / noisy Tomography** — reconstruct ρ (or an "average unitary")
  from finite trajectories; mixed-state ρ is capped near 6 qubits.
- **KAK / transpilation** — `decomposeKAK4x4` returns null on numerical edge
  cases; arbitrary-angle rotations pass through **without Solovay–Kitaev**, so
  Clifford+T transpilation of non-Clifford angles is not exact (it warns).

---

## 4. Truncation & display caps (data computed, view trimmed)

- **Statevector** — top 64 rows by default ("Show all" reveals the rest).
- **Amplitude·phase** — top 64 bars by magnitude when 2ⁿ > 64.
- **Probabilities** — 64 bars.
- **Space-time ⟨Z⟩ / entropy** — capped at 80 columns.
- **t-sweep / Loschmidt / Bloch trajectory** — a fixed **64-sample** sweep over
  one `t` period (the FFT uses 128 samples, shows the first 16 frequency bins,
  and drops the DC bin). Sampling is **not adaptive** — oscillations faster than
  the sweep can alias.
- **ZX diagram** — 12 qubits × 60 columns; it renders the diagram only (no
  PyZX-style spider-fusion / T-count reduction).
- **Interaction graph** — ~24 qubits for a readable layout.

---

## 5. Exact / structural (no precision concern)

These are either exact or non-numeric:

- **Resources**, **Interaction graph**, **Tanner / check graph**, **Causal
  cone**, **Parameters**, **QASM** round-trip — structural, no simulation.
- **Stabilizer tableau** — exact for Clifford circuits (signed Pauli
  generators); unavailable for non-Clifford.
- **Expectation** — a single Pauli string or a Pauli-sum Hamiltonian is exact
  on the statevector path; on the **stabilizer path** ⟨P⟩ returns exactly
  {−1, 0, +1}.
- **Equivalence / Compare** — **exact full-unitary** comparison up to 8 qubits;
  beyond that it switches to a **sampled-column** comparison, so the reported
  process fidelity / trace distance becomes an estimate.

---

## Quick reference: when a number is *not* exact

| You're looking at… | …and it's approximate because |
|---|---|
| Any panel in **noise mode** | trajectory averaging (+ FP32 on the GPU path) |
| **Probabilities (shots)**, **Measurement counts**, **Syndromes** | finite-shot sampling |
| **RB / QV / Mirror / XEB / Crosstalk / QEC** | sampling + curve/threshold fit |
| **Pauli error budget** | Pauli-twirl approximation |
| **T1/T2** | exponential fit, units = gate-times |
| **Trotter circuits** | O(Δt^{order+1}) Trotter error |
| **Wigner (n ≥ 2)** | non-Clifford-covariance (false negativity possible) |
| **ZNE / PEC** | extrapolation / quasi-probability estimator |
| **Equivalence / Compare (n > 8)** | sampled-column instead of full unitary |
| **Everything** | IEEE-754 double precision (≈1e-15 floor) |
