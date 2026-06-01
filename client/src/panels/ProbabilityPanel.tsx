import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";

type Props = { state: SimState };

const BAR_H = 14;

export function ProbabilityPanel({ state }: Props) {
  const data = dataOf(state);
  if (!data) return null;

  const symbolic = data.probabilities.some((p) => p === null);
  const probs = data.probabilities.map((p) => p ?? 0);
  const maxP = Math.max(0.01, ...probs);
  const width = 280;
  const labelW = 50;

  return (
    <section className="panel panel--prob">
      <header className="panel__head">
        <h2>Probabilities</h2>
      </header>
      {symbolic ? (
        <div className="panel__placeholder">set symbolic parameters to view probabilities</div>
      ) : (
        <svg
          width={width}
          height={data.amplitudes.length * (BAR_H + 4) + 8}
          className="prob__svg"
        >
          {data.amplitudes.map((a, i) => {
            const p = probs[i];
            const barW = (width - labelW - 36) * (p / maxP);
            const y = i * (BAR_H + 4) + 4;
            return (
              <g key={a.index}>
                <text
                  x={labelW - 6}
                  y={y + BAR_H / 2 + 4}
                  className="prob__basis"
                  textAnchor="end"
                >
                  |{a.basis}⟩
                </text>
                <rect
                  x={labelW}
                  y={y}
                  width={Math.max(0, barW)}
                  height={BAR_H}
                  className={p > 1e-9 ? "prob__bar" : "prob__bar prob__bar--zero"}
                  rx={2}
                />
                <text
                  x={labelW + barW + 4}
                  y={y + BAR_H / 2 + 4}
                  className="prob__pct"
                >
                  {(p * 100).toFixed(1)}%
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}
