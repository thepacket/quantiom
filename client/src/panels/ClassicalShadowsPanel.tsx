import { useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { buildClassicalShadows, estimateAllZ, estimatePauli, type ClassicalShadows } from "../sim/classicalShadows";
import { simulate, type ParameterValues } from "../sim/simulate";
import { paulis, type Pauli } from "../sim/expectation";
import { mulberry32 } from "../sim/measure";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

type Props = { circuit: Circuit; customGates: CustomGate[]; paramValues: ParameterValues };

const SHOT_OPTIONS = [500, 2000, 8000];

/**
 * Classical shadows (random single-qubit Pauli bases, Huang–Kueng–Preskill).
 * Samples N randomized snapshots of the circuit's output, then estimates
 * observables from them — no tailored circuit per observable. Shows the
 * per-qubit ⟨Z⟩ estimate vs the exact value, and estimates any Pauli string
 * you type. Run on click; statevector path; default-collapsed.
 */
export function ClassicalShadowsPanel(props: Props) {
  return (
    <PanelShell id="classical-shadows" title="Classical shadows" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function exactZ(circuit: Circuit, params: ParameterValues, customGates: CustomGate[], n: number): number[] {
  const st = simulate(circuit, params, customGates).state;
  return Array.from({ length: n }, (_, q) => {
    const arr: Pauli[] = new Array(n).fill("I");
    arr[q] = "Z";
    return paulis(st, n, arr);
  });
}

function Body({ circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;
  const [shots, setShots] = useState(2000);
  const [sh, setSh] = useState<ClassicalShadows | null>(null);
  const [exact, setExact] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [pauli, setPauli] = useState("");

  if (collapsed) return null;
  if (n < 1) return <div className="panel__placeholder">place some gates first</div>;
  if (n > 12) return <div className="panel__notice">{n} qubits — classical shadows capped at 12.</div>;

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      try {
        const built = buildClassicalShadows(circuit, paramValues, customGates, shots, mulberry32((Math.random() * 1e9) | 0));
        setSh(built);
        setExact(exactZ(circuit, paramValues, customGates, n));
      } finally {
        setRunning(false);
      }
    }, 10);
  };

  const est = sh ? estimateAllZ(sh) : [];
  const W = 320, rowH = 18, padL = 28, padR = 8, padT = 6;
  const H = padT + n * rowH + 4;
  const half = (W - padL - padR) / 2; // centre at the middle, ± for the [-1,1] range
  const mid = padL + half;
  const xOf = (v: number) => mid + half * Math.max(-1, Math.min(1, v));

  const customEst = sh && pauli.trim().length === n ? estimatePauli(sh, pauli) : null;
  const customExact = (() => {
    if (pauli.trim().length !== n) return null;
    const up = pauli.trim().toUpperCase();
    if (!/^[IXYZ]+$/.test(up)) return null;
    const st = simulate(circuit, paramValues, customGates).state;
    return paulis(st, n, up.split("") as Pauli[]);
  })();

  return (
    <div className="cplot">
      <div className="cshadow__head">
        <button className="cplot__add" onClick={run} disabled={running}>{running ? "sampling…" : "Sample shadows"}</button>
        <label className="cplot__field">
          <span>shots</span>
          <select value={shots} onChange={(e) => setShots(parseInt(e.target.value, 10))}>
            {SHOT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {!sh ? (
        <div className="panel__placeholder">
          randomized-measurement state estimation — sample N snapshots, then read off many observables. Click to run.
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="cplot__svg plot-fill" role="img">
            <line x1={mid} y1={padT} x2={mid} y2={H - 4} stroke="var(--border)" strokeWidth={0.5} />
            {Array.from({ length: n }, (_, q) => {
              const y = padT + q * rowH;
              const e = est[q] ?? 0;
              const x = exact[q] ?? 0;
              return (
                <g key={q}>
                  <text x={padL - 4} y={y + rowH / 2 + 3} textAnchor="end" className="cplot__tick">q{q}</text>
                  {/* exact: thin marker */}
                  <line x1={xOf(x)} y1={y + 2} x2={xOf(x)} y2={y + rowH - 3} stroke="var(--accent-2)" strokeWidth={2}>
                    <title>exact ⟨Z{q}⟩ = {x.toFixed(4)}</title>
                  </line>
                  {/* estimate: dot */}
                  <circle cx={xOf(e)} cy={y + rowH / 2} r={3} fill="#7ed957">
                    <title>shadow ⟨Z{q}⟩ = {e.toFixed(4)}</title>
                  </circle>
                </g>
              );
            })}
          </svg>
          <div className="cplot__legend">
            <span><span className="cplot__swatch" style={{ background: "var(--accent-2)", height: 9 }} /> exact ⟨Z⟩</span>
            <span><span className="cplot__swatch" style={{ background: "#7ed957" }} /> shadow estimate</span>
            <span style={{ color: "var(--muted)" }}>−1 … +1 · {sh.shots} snapshots</span>
          </div>
          <div className="cshadow__custom">
            <label className="cplot__field cplot__field--wide">
              <span>estimate ⟨P⟩ for a Pauli string</span>
              <input className="cplot__arg" value={pauli} placeholder={"Z".repeat(n)} onChange={(e) => setPauli(e.target.value)} />
            </label>
            {customEst !== null && customExact !== null && (
              <span className="cshadow__result">
                shadow <b style={{ color: "#7ed957" }}>{customEst!.toFixed(3)}</b> · exact{" "}
                <b style={{ color: "var(--accent-2)" }}>{customExact!.toFixed(3)}</b>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
