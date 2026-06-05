import { describe, test, expect } from "vitest";
import { emitQiskit } from "../src/qasm/emitQiskit";
import type { Circuit, PlacedGate } from "../src/editor/types";
import { circ, gate } from "./helpers";

const one = (gates: PlacedGate[], nq = 1, nc = 0): Circuit => circ(nq, gates, nc);
const emit = (gates: PlacedGate[], nq = 1, nc = 0) => emitQiskit(one(gates, nq, nc));

describe("emitQiskit — markers & non-unitary", () => {
  test("barrier, delay, reset", () => {
    const out = emit([gate("barrier", [0]), gate("delay", [0], [], ["pi"]), gate("reset", [0])]);
    expect(out).toContain("qc.barrier(0)");
    expect(out).toContain("qc.delay(pi, 0)");
    expect(out).toContain("qc.reset(0)");
  });

  test("plain Z-measurement maps to qc.measure(q, c)", () => {
    const out = emit([{ ...gate("measure", [0]), clbits: [0] }], 1, 1);
    expect(out).toContain("qc.measure(0, 0)");
  });

  test("X- and Y-basis measurements expand to basis-change brackets", () => {
    const outX = emit([{ ...gate("measure_x", [0]), clbits: [0] }], 1, 1);
    expect(outX).toMatch(/qc\.h\(0\)[\s\S]*qc\.measure\(0, 0\)[\s\S]*qc\.h\(0\)/);
    const outY = emit([{ ...gate("measure_y", [0]), clbits: [0] }], 1, 1);
    expect(outY).toMatch(/qc\.sdg\(0\)[\s\S]*qc\.h\(0\)[\s\S]*qc\.measure\(0, 0\)[\s\S]*qc\.s\(0\)/);
  });
});

describe("emitQiskit — state preparation", () => {
  test("each init alias emits its reset + basis-change chain", () => {
    expect(emit([gate("init0", [0])])).toContain("qc.reset(0)");
    expect(emit([gate("init1", [0])])).toMatch(/qc\.reset\(0\)[\s\S]*qc\.x\(0\)/);
    expect(emit([gate("initplus", [0])])).toMatch(/qc\.reset\(0\)[\s\S]*qc\.h\(0\)/);
    expect(emit([gate("initminus", [0])])).toMatch(/qc\.x\(0\)[\s\S]*qc\.h\(0\)/);
    expect(emit([gate("initiplus", [0])])).toMatch(/qc\.h\(0\)[\s\S]*qc\.s\(0\)/);
    expect(emit([gate("initiminus", [0])])).toMatch(/qc\.h\(0\)[\s\S]*qc\.sdg\(0\)/);
  });

  test("initialize emits a commented hint with the amplitude expression", () => {
    const out = emit([gate("initialize", [0], [], ["(1/sqrt(2), 0, 0, 0)"])]);
    expect(out).toMatch(/#.*qc\.initialize/);
  });
});

describe("emitQiskit — control flow & arbitrary unitaries", () => {
  test("if/while/switch/box become 'not yet exported' comments", () => {
    for (const id of ["if", "while", "switch", "box"]) {
      expect(emit([gate(id, [0], [], ["c == 1"])])).toMatch(/control flow not yet exported/);
    }
  });

  test("u_arb / u_arb_2 emit a UnitaryGate placeholder comment", () => {
    expect(emit([gate("u_arb", [0])])).toMatch(/arbitrary matrix not yet emitted/);
    expect(emit([gate("u_arb_2", [0, 1])], 2)).toMatch(/qc\.unitary/);
  });

  test("an unknown gate id falls through to a comment", () => {
    expect(emit([gate("totally_made_up", [0])])).toMatch(/# totally_made_up: not yet exported/);
  });
});

describe("emitQiskit — multi-controlled gates", () => {
  test("mcx renders control list + target", () => {
    expect(emit([gate("mcx", [3], [0, 1, 2])], 4)).toContain("qc.mcx([0, 1, 2], 3)");
  });

  test("mcp/mcu prepend the parameter list", () => {
    expect(emit([gate("mcp", [3], [0, 1, 2], ["pi/2"])], 4)).toContain("qc.mcp(pi/2, [0, 1, 2], 3)");
    expect(emit([gate("mcu", [3], [0, 1, 2], ["a", "b", "c"])], 4)).toContain("qc.mcu(a, b, c, [0, 1, 2], 3)");
  });

  test("an anti-controlled mcx carries a ctrl_state bitstring", () => {
    const g = { ...gate("mcx", [2], [0, 1]), controlStates: [false, true] };
    const out = emit([g], 3);
    expect(out).toMatch(/qc\.mcx\(\[0, 1\], 2, ctrl_state="10"\)/); // little-endian, reversed
  });
});

describe("emitQiskit — standard gates, anti-controls, glyphs", () => {
  test("a rotation parameter's Greek glyph is transliterated to ASCII", () => {
    const out = emit([gate("rz", [0], [], ["θ/2"])]);
    expect(out).toContain("qc.rz(theta/2, 0)");
  });

  test("an anti-controlled CX emits ctrl_state on the named method", () => {
    const g = { ...gate("cx", [1], [0]), controlStates: [false] };
    expect(emit([g], 2)).toMatch(/qc\.cx\(0, 1, ctrl_state="0"\)/);
  });

  test("a two-qubit gate references both wires", () => {
    expect(emit([gate("swap", [0, 1])], 2)).toContain("qc.swap(0, 1)");
  });
});

describe("emitQiskit — preamble", () => {
  test("free symbols trigger Parameter declarations", () => {
    const out = emit([gate("rx", [0], [], ["theta"])]);
    expect(out).toContain("from qiskit.circuit import Parameter");
    expect(out).toContain('theta = Parameter("theta")');
  });

  test("no free symbols → no Parameter import; classical register sizing", () => {
    const out = emitQiskit(circ(2, [gate("h", [0]), { ...gate("measure", [0]), clbits: [0] }], 1));
    expect(out).not.toContain("import Parameter");
    expect(out).toMatch(/QuantumCircuit\(2, 1\)/);
    // No clbits → single-arg constructor.
    expect(emit([gate("h", [0])])).toMatch(/QuantumCircuit\(1\)/);
  });
});
