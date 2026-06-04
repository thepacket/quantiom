import { describe, test, expect } from "vitest";
import { emitQiskit } from "../src/qasm/emitQiskit";
import { emitCirq } from "../src/qasm/emitCirq";
import { emitBraket } from "../src/qasm/emitBraket";
import { emitQSharp } from "../src/qasm/emitQSharp";
import { emitPyQuil } from "../src/qasm/emitPyQuil";
import { emitPytket } from "../src/qasm/emitPytket";
import { emitQasm2 } from "../src/qasm/emitQasm2";
import { emitQuantikz } from "../src/qasm/emitQuantikz";
import { circ, gate } from "./helpers";
import type { Circuit } from "../src/editor/types";

// A circuit exercising 1q gates, a rotation, a 2q gate, a Toffoli, and a
// measurement — enough to drive every emitter's main code paths.
const sample: Circuit = circ(3, [
  gate("h", [0]),
  gate("rz", [1], [], ["pi/4"]),
  gate("cx", [1], [0]),
  gate("ccx", [2], [0, 1]),
  { ...gate("measure", [0]), clbits: [0] },
], 1);

const EMITTERS: Array<{ name: string; fn: (c: Circuit) => string; expect: RegExp }> = [
  { name: "Qiskit", fn: emitQiskit, expect: /QuantumCircuit/ },
  { name: "Cirq", fn: emitCirq, expect: /cirq/ },
  { name: "Braket", fn: emitBraket, expect: /Circuit/ },
  { name: "Q#", fn: emitQSharp, expect: /operation/ },
  { name: "PyQuil", fn: emitPyQuil, expect: /Program/ },
  { name: "pytket", fn: emitPytket, expect: /Circuit/ },
  { name: "OpenQASM 2", fn: emitQasm2, expect: /OPENQASM 2/ },
  { name: "quantikz", fn: emitQuantikz, expect: /\\/ },
];

describe("SDK emitters produce plausible, non-empty output", () => {
  for (const e of EMITTERS) {
    test(`${e.name} emits and contains its signature token`, () => {
      const out = e.fn(sample);
      expect(out.length).toBeGreaterThan(20);
      expect(out).toMatch(e.expect);
    });

    test(`${e.name} handles an empty circuit without throwing`, () => {
      expect(() => e.fn(circ(1, []))).not.toThrow();
    });
  }
});

describe("emitter content sanity", () => {
  test("Qiskit references all three qubits and a classical bit", () => {
    const out = emitQiskit(sample);
    expect(out).toMatch(/QuantumCircuit\(\s*3\s*,\s*1\s*\)/);
  });

  test("OpenQASM 2 declares qreg/creg", () => {
    const out = emitQasm2(sample);
    expect(out).toMatch(/qreg/);
    expect(out).toMatch(/creg/);
  });
});
