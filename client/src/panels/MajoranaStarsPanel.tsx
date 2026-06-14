import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { majoranaStars, type MajoranaResult } from "../sim/majoranaStars";

type Props = { state: SimState };
const MAX_QUBITS = 6;

/**
 * Majorana stellar representation — the n-qubit state projected onto the
 * symmetric (spin-J = n/2) subspace, drawn as n "stars" on the Bloch sphere
 * (the roots of the Majorana polynomial). The constellation is rotation-
 * covariant: |0…0⟩ stacks all stars at the north pole, GHZ spreads them in a
 * ring, Dicke states sit on a latitude. n ≤ 6, default-collapsed.
 */
export function MajoranaStarsPanel({ state }: Props) {
  return (
    <PanelShell id="majorana-stars" title="Majorana stars" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    return majoranaStars(data.state, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 1) return <div className="panel__placeholder">build a circuit</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — needs the statevector amplitudes.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — the stellar representation is for a pure state.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!result) return null;
  return <Sphere r={result} />;
}

const S = 200;
const R = 80;
const CX = S / 2;
const CY = S / 2;

function Sphere({ r }: { r: MajoranaResult }) {
  const { stars, symmetricWeight } = r;
  // Orthographic projection viewed slightly from above the equator.
  const project = (theta: number, phi: number) => {
    const x = Math.sin(theta) * Math.sin(phi);
    const z = Math.cos(theta);
    const depth = Math.sin(theta) * Math.cos(phi); // +front
    return { sx: CX + R * x, sy: CY - R * z, front: depth >= 0 };
  };
  return (
    <div className="maj__out">
      <div className="maj__stats">
        <span>{stars.length} stars</span>
        <span>sym. weight = <b>{symmetricWeight.toFixed(3)}</b></span>
      </div>
      <svg viewBox={`0 0 ${S} ${S}`} className="maj__svg plot-fill" role="img">
        <circle cx={CX} cy={CY} r={R} className="maj__globe" />
        <ellipse cx={CX} cy={CY} rx={R} ry={R * 0.32} className="maj__grid" />
        <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} className="maj__grid" />
        <circle cx={CX} cy={CY - R} r={2} className="maj__pole" />
        <circle cx={CX} cy={CY + R} r={2} className="maj__pole" />
        {stars.map((st, i) => {
          const p = project(st.theta, st.phi);
          return (
            <circle key={i} cx={p.sx} cy={p.sy} r={p.front ? 5 : 3.2} className={p.front ? "maj__star" : "maj__star maj__star--back"}>
              <title>star {i}: θ={(st.theta * 180 / Math.PI).toFixed(1)}°, φ={(st.phi * 180 / Math.PI).toFixed(1)}°</title>
            </circle>
          );
        })}
      </svg>
      <div className="maj__legend">spin-J constellation · north pole = |0…0⟩ · {symmetricWeight < 0.999 ? "state is partly non-symmetric (weight < 1)" : "fully symmetric state"}</div>
    </div>
  );
}
