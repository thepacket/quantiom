/**
 * Pauli error budget — the per-qubit, per-Pauli error contribution of the
 * noise model, via the Pauli-twirl approximation (PTA).
 *
 * Each channel's diagonal Pauli-transfer-matrix entries fix the equivalent
 * Pauli channel probabilities (p_I + p_X + p_Y + p_Z = 1):
 *
 *   p_X = (1 + R_xx − R_yy − R_zz)/4,  and cyclic.
 *
 *  • Depolarising p₁:        R_xx=R_yy=R_zz = 1 − 4p₁/3  ⇒  p_X=p_Y=p_Z = p₁/3.
 *  • Amplitude damping γ:    R_xx=R_yy=√(1−γ), R_zz=1−γ ⇒ p_X=p_Y=γ/4,
 *                            p_Z = (2 − 2√(1−γ) − γ)/4  (≈ γ²/8, small).
 *  • Phase damping γ:        R_xx=R_yy=√(1−γ), R_zz=1   ⇒ pure Z,
 *                            p_Z = (1 − √(1−γ))/2.
 *
 * Summing across channels gives each qubit's X/Y/Z error budget per gate;
 * readout error is reported separately (it is a measurement, not a gate error).
 * The total error rate per qubit is p_X + p_Y + p_Z. Pure transparency over the
 * configured `NoiseModel` — no simulation, so it is exact and instant.
 */

import { rateFor, type NoiseModel } from "./noise";

export type PauliBudgetResult = {
  qubits: number[];
  /** Per-qubit Pauli error probabilities. */
  pX: number[];
  pY: number[];
  pZ: number[];
  /** Per-qubit source breakdown (summed over X/Y/Z). */
  depol: number[];
  amp: number[];
  phase: number[];
  /** Per-qubit readout (measurement) error — reported, not in the gate total. */
  readout: number[];
  /** Per-qubit total gate error p_X + p_Y + p_Z. */
  total: number[];
};

export function pauliBudget(noise: NoiseModel, numQubits: number): PauliBudgetResult {
  const n = Math.max(1, Math.min(numQubits, 16));
  const qubits = Array.from({ length: n }, (_, i) => i);
  const out: PauliBudgetResult = { qubits, pX: [], pY: [], pZ: [], depol: [], amp: [], phase: [], readout: [], total: [] };

  for (const q of qubits) {
    const p1 = rateFor(noise, "oneQubitDepolarising", q);
    const gA = rateFor(noise, "amplitudeDamping", q);
    const gP = rateFor(noise, "phaseDamping", q);

    const sA = Math.sqrt(Math.max(0, 1 - gA));
    // X/Y/Z contributions from each channel.
    const depX = p1 / 3, depY = p1 / 3, depZ = p1 / 3;
    const ampX = gA / 4, ampY = gA / 4, ampZ = (2 - 2 * sA - gA) / 4;
    const phZ = (1 - Math.sqrt(Math.max(0, 1 - gP))) / 2;

    const pX = depX + ampX;
    const pY = depY + ampY;
    const pZ = depZ + ampZ + phZ;
    out.pX.push(pX); out.pY.push(pY); out.pZ.push(pZ);
    out.depol.push(depX + depY + depZ);
    out.amp.push(ampX + ampY + ampZ);
    out.phase.push(phZ);
    out.readout.push(rateFor(noise, "readoutBitFlip", q));
    out.total.push(pX + pY + pZ);
  }
  return out;
}
