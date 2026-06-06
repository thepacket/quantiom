/**
 * Gate-block snippet library. Each snippet builds a small list of gates with
 * 0-based internal columns; the `insert-gates` reducer action appends the
 * block after the current circuit (assigning fresh ids and offsetting the
 * columns). Snippets that scale (GHZ, QFT, Trotter layer) build for the
 * circuit's current qubit count; Bell is fixed at 2 qubits.
 */

import type { PlacedGate } from "./types";

export type Snippet = {
  id: string;
  label: string;
  hint: string;
  /** Minimum qubits the circuit needs for this snippet to insert. */
  minQubits: number;
  /** Build the block for an `n`-qubit circuit (0-based columns, blank ids). */
  build: (n: number) => PlacedGate[];
};

const g = (
  gateId: string,
  column: number,
  controls: number[],
  targets: number[],
  params: string[] = [],
  clbits: number[] = [],
): PlacedGate => ({
  id: "",
  gateId: gateId as PlacedGate["gateId"],
  column,
  controls,
  targets,
  clbits,
  params,
  controlStates: controls.length > 0 ? controls.map(() => true) : undefined,
});

export const SNIPPETS: Snippet[] = [
  {
    id: "bell",
    label: "Bell pair",
    hint: "H · CX on q0,q1",
    minQubits: 2,
    build: () => [g("h", 0, [], [0]), g("cx", 1, [0], [1])],
  },
  {
    id: "ghz",
    label: "GHZ state",
    hint: "H then a CNOT ladder across all qubits",
    minQubits: 2,
    build: (n) => {
      const out = [g("h", 0, [], [0])];
      for (let i = 1; i < n; i++) out.push(g("cx", i, [i - 1], [i]));
      return out;
    },
  },
  {
    id: "qft",
    label: "QFT (all qubits)",
    hint: "Hadamards + controlled-phase ladder + bit-reversal swaps",
    minQubits: 2,
    build: (n) => {
      const out: PlacedGate[] = [];
      let col = 0;
      for (let i = 0; i < n; i++) {
        out.push(g("h", col++, [], [i]));
        for (let j = i + 1; j < n; j++) {
          out.push(g("cp", col++, [j], [i], [`pi/${2 ** (j - i)}`]));
        }
      }
      for (let i = 0; i < Math.floor(n / 2); i++) {
        out.push(g("swap", col++, [], [i, n - 1 - i]));
      }
      return out;
    },
  },
  {
    id: "iqft",
    label: "Inverse QFT",
    hint: "the QFT run backwards with negated phases",
    minQubits: 2,
    build: (n) => {
      const out: PlacedGate[] = [];
      let col = 0;
      for (let i = 0; i < Math.floor(n / 2); i++) {
        out.push(g("swap", col++, [], [i, n - 1 - i]));
      }
      for (let i = n - 1; i >= 0; i--) {
        for (let j = n - 1; j > i; j--) {
          out.push(g("cp", col++, [j], [i], [`-pi/${2 ** (j - i)}`]));
        }
        out.push(g("h", col++, [], [i]));
      }
      return out;
    },
  },
  {
    id: "trotter-ising",
    label: "Trotter Ising layer",
    hint: "RZZ(2·J) on neighbours + RX(2·h) — one TFIM step",
    minQubits: 2,
    build: (n) => {
      const out: PlacedGate[] = [];
      let col = 0;
      for (let i = 0; i < n - 1; i++) out.push(g("rzz", col++, [], [i, i + 1], ["2*J"]));
      for (let i = 0; i < n; i++) out.push(g("rx", col, [], [i], ["2*h"]));
      return out;
    },
  },
];
