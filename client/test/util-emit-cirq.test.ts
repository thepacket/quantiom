import { describe, test, expect } from "vitest";
import { emitCirq } from "../src/qasm/emitCirq";
import type { PlacedGate } from "../src/editor/types";
import { circ, gate } from "./helpers";

const emit = (gates: PlacedGate[], nq = 1) => emitCirq(circ(nq, gates, nq > 0 ? 1 : 0));

describe("emitCirq — markers, measurement, reset", () => {
  test("barrier and delay become comments", () => {
    expect(emit([gate("barrier", [0])])).toMatch(/# barrier on qs\[0\]/);
    expect(emit([gate("delay", [0], [], ["pi"])])).toMatch(/# delay\(pi\) on qs\[0\]/);
  });

  test("Z/X/Y-basis measurements", () => {
    expect(emit([{ ...gate("measure", [0]), clbits: [0] }])).toContain('cirq.measure(qs[0], key="c0")');
    expect(emit([{ ...gate("measure_x", [0]), clbits: [0] }])).toMatch(/cirq\.H\(qs\[0\]\)[\s\S]*cirq\.measure/);
    expect(emit([{ ...gate("measure_y", [0]), clbits: [0] }])).toMatch(/cirq\.S\*\*-1[\s\S]*cirq\.measure[\s\S]*cirq\.S\(qs\[0\]\)/);
  });

  test("reset uses a ResetChannel", () => {
    expect(emit([gate("reset", [0])])).toContain("cirq.ResetChannel().on(qs[0])");
  });
});

describe("emitCirq — state prep aliases", () => {
  test("each init alias lowers to reset + basis change", () => {
    expect(emit([gate("init0", [0])])).toContain("cirq.ResetChannel().on(qs[0])");
    expect(emit([gate("init1", [0])])).toMatch(/ResetChannel[\s\S]*cirq\.X/);
    expect(emit([gate("initplus", [0])])).toMatch(/ResetChannel[\s\S]*cirq\.H/);
    expect(emit([gate("initminus", [0])])).toMatch(/cirq\.X[\s\S]*cirq\.H/);
    expect(emit([gate("initiplus", [0])])).toMatch(/cirq\.H[\s\S]*cirq\.S\(qs\[0\]\)/);
    expect(emit([gate("initiminus", [0])])).toMatch(/cirq\.H[\s\S]*cirq\.S\*\*-1/);
  });
});

describe("emitCirq — single-qubit gates", () => {
  test("fixed gates map to their Cirq ops", () => {
    expect(emit([gate("i", [0])])).toContain("cirq.I(qs[0])");
    expect(emit([gate("x", [0])])).toContain("cirq.X(qs[0])");
    expect(emit([gate("y", [0])])).toContain("cirq.Y(qs[0])");
    expect(emit([gate("z", [0])])).toContain("cirq.Z(qs[0])");
    expect(emit([gate("h", [0])])).toContain("cirq.H(qs[0])");
    expect(emit([gate("s", [0])])).toContain("cirq.S(qs[0])");
    expect(emit([gate("sdg", [0])])).toContain("(cirq.S**-1)(qs[0])");
    expect(emit([gate("t", [0])])).toContain("cirq.T(qs[0])");
    expect(emit([gate("tdg", [0])])).toContain("(cirq.T**-1)(qs[0])");
    expect(emit([gate("sx", [0])])).toContain("(cirq.X**0.5)(qs[0])");
    expect(emit([gate("sxdg", [0])])).toContain("(cirq.X**-0.5)(qs[0])");
  });

  test("parameterised single-qubit gates", () => {
    expect(emit([gate("rx", [0], [], ["0.5"])])).toContain("cirq.rx(0.5)(qs[0])");
    expect(emit([gate("ry", [0], [], ["0.5"])])).toContain("cirq.ry(0.5)(qs[0])");
    expect(emit([gate("rz", [0], [], ["0.5"])])).toContain("cirq.rz(0.5)(qs[0])");
    expect(emit([gate("p", [0], [], ["0.5"])])).toMatch(/ZPowGate\(exponent=\(0\.5\)\/pi\)/);
    expect(emit([gate("u1", [0], [], ["0.5"])])).toMatch(/ZPowGate\(exponent=\(0\.5\)\/pi\)/);
  });

  test("U / U3 / U2 decompose to Rz·Ry·Rz", () => {
    const u = emit([gate("u3", [0], [], ["a", "b", "c"])]);
    expect(u).toMatch(/cirq\.rz\(c\)[\s\S]*cirq\.ry\(a\)[\s\S]*cirq\.rz\(b\)/);
    const u2 = emit([gate("u2", [0], [], ["b", "c"])]);
    expect(u2).toMatch(/cirq\.ry\(pi\/2\)/);
  });
});

describe("emitCirq — two- and three-qubit gates", () => {
  test("fixed two-qubit gates", () => {
    expect(emit([gate("cx", [1], [0])], 2)).toContain("cirq.CNOT(qs[0], qs[1])");
    expect(emit([gate("cy", [1], [0])], 2)).toMatch(/controlled_by\(cirq\.Y/);
    expect(emit([gate("cz", [1], [0])], 2)).toContain("cirq.CZ(qs[0], qs[1])");
    expect(emit([gate("ch", [1], [0])], 2)).toMatch(/cirq\.H\.controlled\(\)/);
    expect(emit([gate("swap", [0, 1])], 2)).toContain("cirq.SWAP(qs[0], qs[1])");
    expect(emit([gate("iswap", [0, 1])], 2)).toContain("cirq.ISWAP(qs[0], qs[1])");
    expect(emit([gate("sqrtswap", [0, 1])], 2)).toContain("(cirq.SWAP**0.5)(qs[0], qs[1])");
    expect(emit([gate("sqrtswapdg", [0, 1])], 2)).toContain("(cirq.SWAP**-0.5)(qs[0], qs[1])");
  });

  test("parameterised two-qubit gates", () => {
    expect(emit([gate("fsim", [0, 1], [], ["a", "b"])], 2)).toMatch(/FSimGate\(theta=a, phi=b\)/);
    expect(emit([gate("rxx", [0, 1], [], ["a"])], 2)).toMatch(/XXPowGate/);
    expect(emit([gate("ryy", [0, 1], [], ["a"])], 2)).toMatch(/YYPowGate/);
    expect(emit([gate("rzz", [0, 1], [], ["a"])], 2)).toMatch(/ZZPowGate/);
  });

  test("three-qubit gates and mcx", () => {
    expect(emit([gate("ccx", [2], [0, 1])], 3)).toContain("cirq.CCX(qs[0], qs[1], qs[2])");
    expect(emit([gate("ccz", [2], [0, 1])], 3)).toContain("cirq.CCZ(qs[0], qs[1], qs[2])");
    expect(emit([gate("cswap", [1, 2], [0])], 3)).toContain("cirq.CSWAP(qs[0], qs[1], qs[2])");
    expect(emit([gate("mcx", [3], [0, 1, 2])], 4)).toMatch(/cirq\.X\.controlled\(num_controls=3\)/);
  });
});

describe("emitCirq — exportLower & fallbacks", () => {
  test("R(θ,φ) lowers through exportLower to Rz·Rx·Rz", () => {
    const out = emit([gate("r", [0], [], ["a", "b"])]);
    expect(out).toMatch(/cirq\.rz[\s\S]*cirq\.rx\(a\)[\s\S]*cirq\.rz/);
  });

  test("a gate with no Cirq mapping falls through to a comment", () => {
    expect(emit([gate("dcx", [0, 1])], 2)).toMatch(/# dcx: no direct Cirq mapping/);
  });

  test("free symbols emit sympy Symbol declarations", () => {
    const out = emit([gate("rx", [0], [], ["theta"])]);
    expect(out).toContain('theta = Symbol("theta")');
    expect(out).toContain("from sympy import Symbol, pi");
  });
});
