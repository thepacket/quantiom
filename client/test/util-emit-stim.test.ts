import { describe, it, expect } from "vitest";
import { circ, gate } from "./helpers";
import { emitStim } from "../src/qasm/emitStim";

describe("emitStim", () => {
  it("emits a Bell pair as H + CX", () => {
    const out = emitStim(circ(2, [gate("h", [0]), gate("cx", [1], [0])]));
    expect(out).toMatch(/^H 0$/m);
    expect(out).toMatch(/^CX 0 1$/m);
  });

  it("maps the Clifford single-qubit gates", () => {
    const out = emitStim(circ(1, [gate("s", [0]), gate("sdg", [0]), gate("sx", [0]), gate("x", [0])]));
    expect(out).toMatch(/^S 0$/m);
    expect(out).toMatch(/^S_DAG 0$/m);
    expect(out).toMatch(/^SQRT_X 0$/m);
    expect(out).toMatch(/^X 0$/m);
  });

  it("emits measurement, reset and barrier", () => {
    const c = circ(1, [gate("h", [0]), { ...gate("measure", [0]), clbits: [0] }, gate("reset", [0]), gate("barrier", [0])], 1);
    const out = emitStim(c);
    expect(out).toMatch(/^M 0$/m);
    expect(out).toMatch(/^R 0$/m);
    expect(out).toMatch(/^TICK$/m);
  });

  it("comments out non-Clifford gates instead of emitting them", () => {
    const out = emitStim(circ(1, [gate("t", [0]), gate("rx", [0], [], ["pi/3"])]));
    expect(out).toMatch(/# unsupported in Stim: t/);
    expect(out).toMatch(/# unsupported in Stim: rx/);
    expect(out).not.toMatch(/^T 0$/m);
  });

  it("comments out anti-controlled and conditioned gates", () => {
    const anti = { ...gate("cx", [1], [0]), controlStates: [false] };
    const cond = { ...gate("x", [0]), condition: { clbit: 0, value: 1 } };
    const out = emitStim(circ(2, [anti, cond], 1));
    expect(out).toMatch(/# unsupported \(anti-control\)/);
    expect(out).toMatch(/# unsupported \(classical condition\)/);
  });
});
