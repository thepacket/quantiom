import { describe, it, expect } from "vitest";
import { circ, gate } from "./helpers";
import { sanitizeColor, sanitizePathD, sanitizePlotScene, buildPlotProgramInput } from "../src/sim/plotProgram";

function input(c: Parameters<typeof buildPlotProgramInput>[0]) {
  const r = buildPlotProgramInput(c, {}, []);
  if ("error" in r) throw new Error("unexpected error: " + r.error);
  return r;
}

describe("plotProgram — buildPlotProgramInput", () => {
  it("exposes amplitudes/probabilities for a Bell pair", () => {
    const inp = input(circ(2, [gate("h", [0]), gate("cx", [1], [0])]));
    expect(inp.n).toBe(2);
    expect(inp.dim).toBe(4);
    expect(inp.prob[0]).toBeCloseTo(0.5, 8);
    expect(inp.prob[3]).toBeCloseTo(0.5, 8);
    expect(inp.clbits).toBeNull(); // no measurements
    expect(inp.counts).toBeNull();
    expect(inp.shots).toBe(0);
  });

  it("exposes clbits + a shot histogram when the circuit measures", () => {
    // H on q0, then measure q0 -> c0. (circ assigns one column per gate.)
    const c = circ(1, [gate("h", [0]), { ...gate("measure", [0]), clbits: [0] }], 1);
    const inp = input(c);
    expect(inp.numClbits).toBe(1);
    expect(inp.clbits).not.toBeNull();
    expect(inp.clbits!.length).toBe(1);
    expect(inp.counts).not.toBeNull();
    const total = Object.values(inp.counts!).reduce((a, b) => a + b, 0);
    expect(total).toBe(inp.shots);
    expect(inp.shots).toBeGreaterThan(0);
    // Both outcomes should appear for an H-measured qubit over many shots.
    expect(Object.keys(inp.counts!).sort()).toEqual(["0", "1"]);
  });
});

describe("plotProgram — sanitizeColor", () => {
  it("accepts safe literal colours", () => {
    expect(sanitizeColor("#fff")).toBe("#fff");
    expect(sanitizeColor("#1a2b3c")).toBe("#1a2b3c");
    expect(sanitizeColor("#1a2b3cff")).toBe("#1a2b3cff");
    expect(sanitizeColor("rgb(10, 20, 30)")).toBe("rgb(10, 20, 30)");
    expect(sanitizeColor("rgba(10,20,30,0.5)")).toBe("rgba(10,20,30,0.5)");
    expect(sanitizeColor("hsl(200, 50%, 40%)")).toBe("hsl(200, 50%, 40%)");
    expect(sanitizeColor("var(--accent)")).toBe("var(--accent)");
    expect(sanitizeColor("red")).toBe("red");
  });

  it("rejects injection / unknown forms and falls back", () => {
    expect(sanitizeColor("url(http://evil.com/x.png)")).toBe("var(--accent)");
    expect(sanitizeColor("expression(alert(1))")).toBe("var(--accent)");
    expect(sanitizeColor("javascript:alert(1)")).toBe("var(--accent)");
    expect(sanitizeColor("var(--not-a-theme-var)")).toBe("var(--accent)");
    expect(sanitizeColor("#xyz")).toBe("var(--accent)");
    expect(sanitizeColor(42)).toBe("var(--accent)");
    expect(sanitizeColor("a".repeat(100))).toBe("var(--accent)");
    expect(sanitizeColor(undefined, "none")).toBe("none");
  });
});

describe("plotProgram — sanitizePathD", () => {
  it("accepts valid SVG path data", () => {
    expect(sanitizePathD("M0 0 L10 10 Z")).toBe("M0 0 L10 10 Z");
    expect(sanitizePathD("M0,0 C1,2 3,4 5,6")).toBe("M0,0 C1,2 3,4 5,6");
    expect(sanitizePathD("")).toBe("");
  });

  it("rejects anything with non-path characters", () => {
    expect(sanitizePathD("M0 0 url(x)")).toBeNull(); // '(' not allowed
    expect(sanitizePathD("M0 0 <script>")).toBeNull();
    expect(sanitizePathD("M0 0 x10")).toBeNull(); // 'x' not a path command
    expect(sanitizePathD(123)).toBeNull();
    expect(sanitizePathD("M0 0" + " ".repeat(0) + "0".repeat(20001))).toBeNull(); // too long
  });
});

describe("plotProgram — sanitizePlotScene", () => {
  const ok = (raw: unknown) => {
    const r = sanitizePlotScene(raw);
    if ("error" in r) throw new Error("unexpected error: " + r.error);
    return r.scene;
  };

  it("accepts a valid scene and clamps the canvas size", () => {
    const s = ok({ width: 999999, height: 10, title: "x", elements: [{ type: "rect", x: 0, y: 0, width: 5, height: 5 }] });
    expect(s.width).toBe(2000); // clamped to max
    expect(s.height).toBe(50); // clamped to min
    expect(s.elements.length).toBe(1);
  });

  it("rejects a non-object / missing-elements scene", () => {
    expect("error" in sanitizePlotScene(null)).toBe(true);
    expect("error" in sanitizePlotScene({ width: 100 })).toBe(true);
    expect("error" in sanitizePlotScene({ elements: "nope" })).toBe(true);
  });

  it("errors when no element is drawable", () => {
    expect("error" in sanitizePlotScene({ elements: [{ type: "bogus" }, 42, null] })).toBe(true);
  });

  it("drops unknown element types but keeps valid ones", () => {
    const s = ok({ elements: [{ type: "bogus" }, { type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }] });
    expect(s.elements.length).toBe(1);
    expect(s.elements[0].type).toBe("line");
  });

  it("clamps non-finite numbers to safe defaults", () => {
    const s = ok({ elements: [{ type: "circle", cx: Infinity, cy: NaN, r: -5 }] });
    const c = s.elements[0];
    if (c.type !== "circle") throw new Error("shape");
    expect(Number.isFinite(c.cx)).toBe(true);
    expect(Number.isFinite(c.cy)).toBe(true);
    expect(c.r).toBeGreaterThanOrEqual(0);
  });

  it("sanitises element colours (injection → fallback)", () => {
    const s = ok({ elements: [{ type: "rect", x: 0, y: 0, width: 1, height: 1, fill: "url(http://evil)" }] });
    const r = s.elements[0];
    if (r.type !== "rect") throw new Error("shape");
    expect(r.fill).toBe("var(--accent)");
  });

  it("drops a path element whose data has injection", () => {
    const s = sanitizePlotScene({ elements: [{ type: "path", d: "M0 0 </path><script>" }, { type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }] });
    if ("error" in s) throw new Error("unexpected error");
    expect(s.scene.elements.every((e) => e.type !== "path")).toBe(true);
    expect(s.scene.elements.length).toBe(1);
  });

  it("truncates over-long text", () => {
    const s = ok({ elements: [{ type: "text", x: 0, y: 0, text: "z".repeat(1000) }] });
    const t = s.elements[0];
    if (t.type !== "text") throw new Error("shape");
    expect(t.text.length).toBeLessThanOrEqual(200);
  });

  it("caps the number of elements", () => {
    const many = Array.from({ length: 9000 }, () => ({ type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }));
    const s = ok({ elements: many });
    expect(s.elements.length).toBeLessThanOrEqual(4000);
  });
});
