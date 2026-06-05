import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { purity, reducedDensityMatrix, type Complex } from "../sim/density";
import { useEndianness, reverseBits } from "./endianness";

type Props = { state: SimState };

const MAX_KEPT = 4;
const EPS = 1e-6;

function format(c: Complex): string {
  const re = Math.abs(c.re) < EPS ? 0 : c.re;
  const im = Math.abs(c.im) < EPS ? 0 : c.im;
  if (re === 0 && im === 0) return "0";
  if (im === 0) return re.toFixed(3);
  if (re === 0) return `${im < 0 ? "-" : ""}${Math.abs(im).toFixed(3)}i`;
  return `${re.toFixed(3)}${im < 0 ? "-" : "+"}${Math.abs(im).toFixed(3)}i`;
}

export function DensityPanel({ state }: Props) {
  return (
    <PanelShell id="density" title="Reduced density matrix" defaultCollapsed>
      <DensityBody state={state} />
    </PanelShell>
  );
}

function DensityBody({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const { endian } = useEndianness();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [kept, setKept] = useState<boolean[]>([]);

  useEffect(() => {
    setKept((prev) => {
      if (prev.length === n) return prev;
      const next = new Array<boolean>(n).fill(false);
      if (n > 0) next[0] = true;
      for (let i = 0; i < Math.min(prev.length, n); i++) next[i] = prev[i];
      return next;
    });
  }, [n]);

  const keptIndices = useMemo(() => kept.flatMap((on, i) => (on ? [i] : [])), [kept]);
  const tooMany = keptIndices.length > MAX_KEPT;

  // O(2^n · 4^|S|) partial trace. Skip while hidden.
  const rho = useMemo(() => {
    if (collapsed) return null;
    if (!data || keptIndices.length === 0 || tooMany) return null;
    return reducedDensityMatrix(data.state, n, keptIndices);
  }, [data, keptIndices, n, tooMany, collapsed]);

  const tr2 = useMemo(() => (rho ? purity(rho) : null), [rho]);

  // Little-endian display: permute rows/cols by bit-reversal over the kept
  // subset so labels match Qiskit (purity is permutation-invariant).
  const drho = useMemo(() => {
    if (!rho || endian === "big") return rho;
    const k = Math.round(Math.log2(rho.length));
    return rho.map((row, i) => row.map((_, j) => rho[reverseBits(i, k)][reverseBits(j, k)]));
  }, [rho, endian]);

  const toggle = (q: number) => {
    setKept((prev) => {
      const next = [...prev];
      next[q] = !next[q];
      return next;
    });
  };

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isNoisy) {
    return (
      <div className="panel__notice">
        Noise mode on — the reduced density matrix from a single trajectory
        is not the true mixed state. Density panel will support trajectory-
        averaged ρ in a follow-up.
      </div>
    );
  }
  if (data.isStabilizer) {
    return (
      <div className="panel__notice">
        Clifford fast path — reduced density matrix from the tableau is on
        the follow-up list. The Bloch panel gives the exact 1-qubit reduced
        ρ as (I + r·σ)/2.
      </div>
    );
  }

  return (
    <>
      <div className="density__pick">
        <span className="density__label">keep</span>
        {kept.map((on, q) => (
          <label key={q} className={"density__chip" + (on ? " density__chip--on" : "")}>
            <input type="checkbox" checked={on} onChange={() => toggle(q)} />
            q{q}
          </label>
        ))}
      </div>
      {keptIndices.length === 0 ? (
        <div className="panel__placeholder">pick at least one qubit</div>
      ) : tooMany ? (
        <div className="panel__placeholder">choose at most {MAX_KEPT} qubits (matrix is 2ⁿ × 2ⁿ)</div>
      ) : drho ? (
        <>
          <table className="density__matrix">
            <tbody>
              {drho.map((row, i) => (
                <tr key={i}>
                  <th className="density__rowlabel">
                    |{i.toString(2).padStart(keptIndices.length, "0")}⟩
                  </th>
                  {row.map((c, j) => (
                    <td
                      key={j}
                      className={i === j ? "density__cell density__cell--diag" : "density__cell"}
                    >
                      {format(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {tr2 !== null && (
            <div className="density__purity">
              Tr(ρ²) = {tr2.toFixed(4)}{" "}
              <span className="density__purity-note">
                ({tr2 > 0.9999 ? "pure" : "mixed"})
              </span>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
