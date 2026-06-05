/**
 * Endianness display helpers — pure functions, so we can pin them to exact
 * ground-truth values. These back the global big/little-endian toggle that
 * makes Quantiom's basis labels line up with IBM Qiskit/Composer; a bug here
 * silently mislabels every state in ten panels.
 */
import { describe, test, expect } from "vitest";
import {
  reverseBits,
  reverseLabel,
  reversePauliIndex,
  displayLabel,
  displayAmplitudes,
  displayProbabilities,
} from "../src/panels/endianness";

describe("reverseBits", () => {
  test("reverses the low n bits", () => {
    expect(reverseBits(0b001, 3)).toBe(0b100);
    expect(reverseBits(0b110, 3)).toBe(0b011);
    expect(reverseBits(0b101, 3)).toBe(0b101); // palindrome
    expect(reverseBits(0, 3)).toBe(0);
    expect(reverseBits(0b0001, 4)).toBe(0b1000);
  });
  test("is an involution", () => {
    for (let n = 1; n <= 6; n++)
      for (let x = 0; x < 1 << n; x++) expect(reverseBits(reverseBits(x, n), n)).toBe(x);
  });
});

describe("reverseLabel", () => {
  test("reverses a fixed-width bitstring", () => {
    expect(reverseLabel("001")).toBe("100");
    expect(reverseLabel("0101")).toBe("1010");
    expect(reverseLabel("XYZ")).toBe("ZYX"); // also used for Pauli strings
  });
});

describe("reversePauliIndex", () => {
  test("swaps base-4 (per-qubit Pauli) digits", () => {
    // n=2: digit0 (low) ↔ digit1 (high).
    expect(reversePauliIndex(1, 2)).toBe(4); // IX ↔ XI
    expect(reversePauliIndex(4, 2)).toBe(1);
    expect(reversePauliIndex(0, 2)).toBe(0);
    expect(reversePauliIndex(5, 2)).toBe(5); // XX, palindrome
  });
  test("is an involution", () => {
    for (let n = 1; n <= 3; n++)
      for (let i = 0; i < 4 ** n; i++) expect(reversePauliIndex(reversePauliIndex(i, n), n)).toBe(i);
  });
});

describe("displayLabel", () => {
  test("big-endian is the native binary label; little-endian reverses it", () => {
    expect(displayLabel(0b01, 2, "big")).toBe("01");
    expect(displayLabel(0b01, 2, "little")).toBe("10");
    expect(displayLabel(0b100, 3, "little")).toBe("001");
  });
});

describe("displayAmplitudes", () => {
  const amps = [
    { basis: "00", index: 0, re: 1, im: 0 },
    { basis: "01", index: 1, re: 2, im: 0 },
    { basis: "10", index: 2, re: 3, im: 0 },
    { basis: "11", index: 3, re: 4, im: 0 },
  ];
  test("big-endian returns the list unchanged", () => {
    expect(displayAmplitudes(amps, 2, "big")).toBe(amps);
  });
  test("little-endian relabels (bit-reverse) and re-sorts to 0..0 → 1..1", () => {
    const out = displayAmplitudes(amps, 2, "little");
    // Rows still run 0..0 → 1..1, so the labels read in natural order…
    expect(out.map((a) => a.index)).toEqual([0, 1, 2, 3]);
    expect(out.map((a) => a.basis)).toEqual(["00", "01", "10", "11"]);
    // …but the physical amplitudes are permuted by bit-reversal: display row 1
    // holds the old "10" entry (re=3), row 2 the old "01" entry (re=2).
    expect(out.map((a) => a.re)).toEqual([1, 3, 2, 4]);
  });
});

describe("displayProbabilities", () => {
  test("little-endian moves p[i] to slot reverseBits(i)", () => {
    const probs = [0.1, 0.2, 0.3, 0.4]; // indices 00,01,10,11
    expect(displayProbabilities(probs, 2, "big")).toBe(probs);
    // 0→0, 1→2, 2→1, 3→3  ⇒ [0.1, 0.3, 0.2, 0.4]
    expect(displayProbabilities(probs, 2, "little")).toEqual([0.1, 0.3, 0.2, 0.4]);
  });
  test("total probability is preserved", () => {
    const probs = [0.1, 0.2, 0.3, 0.05, 0.05, 0.1, 0.1, 0.1];
    const moved = displayProbabilities(probs, 3, "little");
    const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
    expect(sum(moved)).toBeCloseTo(sum(probs), 12);
  });
});
