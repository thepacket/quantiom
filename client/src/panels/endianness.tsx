import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Basis-label endianness — a *display-only* convention. The simulator always
 * computes in Quantiom's native big-endian layout (qubit 0 = MSB / leftmost
 * bit); this only changes how basis-state bitstrings are LABELLED and ORDERED
 * in the panels.
 *
 *   • "big"    — qubit 0 is the leftmost bit (Quantiom / Cirq / textbooks).
 *   • "little" — qubit 0 is the rightmost bit (IBM Qiskit / Composer).
 *
 * Switching to "little" reverses each label's bits and re-sorts the rows so
 * the displayed list still runs 0…0 → 1…1 — i.e. it matches what Qiskit shows
 * for the same physical state. No amplitudes change; the export/QASM is
 * unaffected (it names qubits explicitly).
 */
export type Endianness = "big" | "little";

const STORAGE_KEY = "quantiom:endianness:v1";

function loadEndianness(): Endianness {
  try {
    return localStorage.getItem(STORAGE_KEY) === "little" ? "little" : "big";
  } catch {
    return "big";
  }
}

const EndiannessContext = createContext<{ endian: Endianness; setEndian: (e: Endianness) => void }>({
  endian: "big",
  setEndian: () => {},
});

export function EndiannessProvider({ children }: { children: ReactNode }) {
  const [endian, setEndianState] = useState<Endianness>(loadEndianness);
  const setEndian = (e: Endianness) => {
    setEndianState(e);
    try { localStorage.setItem(STORAGE_KEY, e); } catch { /* ignore */ }
  };
  useEffect(() => { /* persisted in setEndian */ }, [endian]);
  return (
    <EndiannessContext.Provider value={{ endian, setEndian }}>
      {children}
    </EndiannessContext.Provider>
  );
}

export function useEndianness() {
  return useContext(EndiannessContext);
}

/** Header control to switch the basis-label endianness (display only). */
export function EndiannessToggle() {
  const { endian, setEndian } = useEndianness();
  return (
    <select
      className="app__endianness"
      value={endian}
      onChange={(e) => setEndian(e.target.value as Endianness)}
      title="Basis-label qubit order (display only — the computation and exports are unchanged). Big-endian: qubit 0 = leftmost bit (Quantiom / Cirq / textbooks). Little-endian: qubit 0 = rightmost bit (IBM Qiskit / Composer)."
    >
      <option value="big">q₀ left · big-endian</option>
      <option value="little">q₀ right · little-endian (Qiskit)</option>
    </select>
  );
}

/** Reverse the low `n` bits of `x`. */
export function reverseBits(x: number, n: number): number {
  let r = 0;
  for (let b = 0; b < n; b++) r = (r << 1) | ((x >> b) & 1);
  return r;
}

/** Reverse a fixed-width bitstring label. */
export function reverseLabel(s: string): string {
  return s.split("").reverse().join("");
}

/** Reverse the n base-4 digits of a Pauli index (each digit = one qubit's
 *  Pauli). Used to permute Pauli-basis matrices (PTM, χ) under the endianness
 *  toggle — the canonical labels stay put, the data moves. */
export function reversePauliIndex(i: number, n: number): number {
  let r = 0, x = i;
  for (let d = 0; d < n; d++) { r = r * 4 + (x & 3); x >>= 2; }
  return r;
}

/** Map a native big-endian basis index to its label under the given endianness. */
export function displayLabel(nativeIndex: number, n: number, endian: Endianness): string {
  const big = nativeIndex.toString(2).padStart(n, "0");
  return endian === "little" ? reverseLabel(big) : big;
}

/**
 * Re-label and re-order an amplitude list for display. Entries carry a native
 * big-endian `basis`/`index`; under "little" each is relabelled (bits
 * reversed) and the list re-sorted so display row j shows the physical state
 * whose little-endian label is j.
 */
export function displayAmplitudes<T extends { basis: string; index: number }>(
  amps: readonly T[],
  n: number,
  endian: Endianness,
): T[] {
  if (endian === "big") return amps as T[];
  return amps
    .map((a) => ({ ...a, basis: reverseLabel(a.basis), index: reverseBits(a.index, n) }))
    .sort((x, y) => x.index - y.index);
}

/** Re-order a probability array (indexed by native big-endian basis) for display. */
export function displayProbabilities(probs: readonly number[], n: number, endian: Endianness): number[] {
  if (endian === "big") return probs as number[];
  const out = new Array<number>(probs.length).fill(0);
  for (let i = 0; i < probs.length; i++) out[reverseBits(i, n)] = probs[i];
  return out;
}
