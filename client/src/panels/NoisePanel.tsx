import { useRef, useState } from "react";
import { PanelShell } from "./PanelShell";
import { CouplingMapView } from "./CouplingMapView";
import { importIbmBackend, type NoiseModel, type PerQubitRates } from "../sim/noise";

type Props = {
  noise: NoiseModel;
  onChange: (next: NoiseModel) => void;
};

/**
 * Noise model controls. Default-off; switching off restores the bare
 * statevector simulator with zero overhead. When on, the simulator runs
 * `trajectories` independent runs and inserts depolarising + amplitude/
 * phase damping channels per gate.
 *
 * The Import button accepts an IBM `BackendProperties` JSON snapshot
 * (from `backend.properties().to_dict()`) and populates per-qubit T1/T2/
 * readout/sx-error rates from real device calibration data.
 */
export function NoisePanel({ noise, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{ kind: "idle" } | { kind: "ok"; msg: string } | { kind: "err"; msg: string }>({ kind: "idle" });

  const set = (patch: Partial<NoiseModel>) => onChange({ ...noise, ...patch });
  const fmt = (v: number) =>
    v >= 0.01 ? v.toFixed(3) : v >= 0.001 ? v.toFixed(4) : v > 0 ? v.toExponential(1) : "0";

  const onImport = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const text = await f.text();
      const imported = importIbmBackend(text);
      onChange(imported);
      setImportStatus({
        kind: "ok",
        msg: `${imported.source ?? "imported"} · ${imported.perQubit?.length ?? 0} qubits`,
      });
    } catch (err) {
      setImportStatus({ kind: "err", msg: err instanceof Error ? err.message : String(err) });
    }
    setTimeout(() => setImportStatus({ kind: "idle" }), 4000);
  };

  const clearPerQubit = () => set({ perQubit: undefined, source: undefined });

  return (
    <PanelShell id="noise" title="Noise model" defaultCollapsed>
      <div className="noise">
        <label className="noise__enable">
          <input
            type="checkbox"
            checked={noise.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          <span>Enable noisy simulation</span>
        </label>
        <p className="noise__hint">
          Stochastic Pauli + amplitude/phase damping via quantum trajectories.
          Probabilities and Bloch vectors are trajectory-averaged.
          {noise.enabled && (
            <>
              {" "}
              <strong>{noise.trajectories}</strong> trajectories per simulation.
            </>
          )}
        </p>

        {noise.source && (
          <div className="noise__source">
            <span className="noise__source-tag">device</span>
            <span>{noise.source}</span>
            <button className="noise__source-clear" onClick={clearPerQubit} title="Clear per-qubit overrides">×</button>
          </div>
        )}

        <fieldset className="noise__group" disabled={!noise.enabled}>
          <legend>Globals (per-gate)</legend>
          <Slider
            label="depol 1q"
            value={noise.oneQubitDepolarising}
            max={0.1}
            step={0.0001}
            fmt={fmt}
            onChange={(v) => set({ oneQubitDepolarising: v })}
          />
          <Slider
            label="depol 2q"
            value={noise.twoQubitDepolarising}
            max={0.2}
            step={0.0005}
            fmt={fmt}
            onChange={(v) => set({ twoQubitDepolarising: v })}
          />
          <Slider
            label="amp damp γ"
            value={noise.amplitudeDamping}
            max={0.05}
            step={0.0001}
            fmt={fmt}
            onChange={(v) => set({ amplitudeDamping: v })}
            title="Per-gate amplitude damping (T1 channel)"
          />
          <Slider
            label="phase damp γ"
            value={noise.phaseDamping}
            max={0.05}
            step={0.0001}
            fmt={fmt}
            onChange={(v) => set({ phaseDamping: v })}
            title="Per-gate phase damping (T2 dephasing)"
          />
          <Slider
            label="readout"
            value={noise.readoutBitFlip}
            max={0.1}
            step={0.001}
            fmt={fmt}
            onChange={(v) => set({ readoutBitFlip: v })}
            title="Measurement readout bit-flip"
          />
          <Slider
            label="crosstalk"
            value={noise.crosstalk}
            max={0.05}
            step={0.0001}
            fmt={fmt}
            onChange={(v) => set({ crosstalk: v })}
            title={noise.coupling ? "Per-2q-gate residual depolarising on coupled neighbours" : "Inert until a coupling map is imported"}
          />
          {noise.coupling && (
            <div className="noise__coupling">
              <span className="noise__coupling-label">coupling map</span>
              <span className="noise__coupling-edges">
                {noise.coupling.reduce((sum, nbrs) => sum + nbrs.length, 0) / 2} edges, {noise.coupling.length} qubits
              </span>
            </div>
          )}
          {noise.coupling && noise.coupling.length > 1 && (
            <CouplingMapView coupling={noise.coupling} size={200} />
          )}
        </fieldset>

        <fieldset className="noise__group" disabled={!noise.enabled}>
          <legend>Trajectories</legend>
          <div className="noise__row">
            <label>count</label>
            <input
              type="number"
              min={1}
              max={8192}
              step={1}
              value={noise.trajectories}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) set({ trajectories: Math.max(1, Math.min(8192, v)) });
              }}
            />
            <div className="noise__presets">
              {[64, 256, 1024, 4096].map((t) => (
                <button
                  key={t}
                  className={"noise__preset" + (noise.trajectories === t ? " noise__preset--on" : "")}
                  onClick={() => set({ trajectories: t })}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className="noise__group">
          <legend>Calibration import</legend>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={onFile}
          />
          <button className="noise__import" onClick={onImport}>
            Import IBM BackendProperties .json
          </button>
          <p className="noise__hint">
            Loads T1, T2, sx error, cx error, and readout error per qubit.
            Get one with <code>backend.properties().to_dict()</code> in Qiskit
            and save as JSON.
          </p>
          {importStatus.kind === "ok" && (
            <div className="noise__import-ok">✓ {importStatus.msg}</div>
          )}
          {importStatus.kind === "err" && (
            <div className="noise__import-err">✗ {importStatus.msg}</div>
          )}
        </fieldset>

        <CustomKrausEditor noise={noise} onChange={onChange} />

        {noise.perQubit && noise.perQubit.length > 0 && (
          <fieldset className="noise__group">
            <legend>Per-qubit rates ({noise.perQubit.length} qubits)</legend>
            <PerQubitTable
              perQubit={noise.perQubit}
              onEdit={(q, patch) => {
                const next = noise.perQubit ? [...noise.perQubit] : [];
                next[q] = { ...next[q], ...patch };
                set({ perQubit: next });
              }}
            />
          </fieldset>
        )}
      </div>
    </PanelShell>
  );
}

function Slider({
  label,
  value,
  max,
  step,
  fmt,
  onChange,
  title,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
  title?: string;
}) {
  return (
    <div className="noise__row" title={title}>
      <label>{label}</label>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="noise__value">{fmt(value)}</span>
    </div>
  );
}

function PerQubitTable({
  perQubit,
  onEdit,
}: {
  perQubit: PerQubitRates[];
  onEdit: (q: number, patch: Partial<PerQubitRates>) => void;
}) {
  return (
    <div className="noise__pq-wrap">
      <table className="noise__pq">
        <thead>
          <tr>
            <th>q</th><th>depol</th><th>γ_AD</th><th>γ_PD</th><th>readout</th>
          </tr>
        </thead>
        <tbody>
          {perQubit.map((p, q) => (
            <tr key={q}>
              <td className="noise__pq-q">{q}</td>
              <PQCell value={p.oneQubitDepolarising} onChange={(v) => onEdit(q, { oneQubitDepolarising: v })} />
              <PQCell value={p.amplitudeDamping} onChange={(v) => onEdit(q, { amplitudeDamping: v })} />
              <PQCell value={p.phaseDamping} onChange={(v) => onEdit(q, { phaseDamping: v })} />
              <PQCell value={p.readoutBitFlip} onChange={(v) => onEdit(q, { readoutBitFlip: v })} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomKrausEditor({
  noise,
  onChange,
}: {
  noise: NoiseModel;
  onChange: (next: NoiseModel) => void;
}) {
  const kraus = noise.customKraus;
  const [text, setText] = useState(() => kraus ? formatKraus(kraus.operators) : "");
  const [err, setErr] = useState<string | null>(null);

  const toggle = (on: boolean) => {
    if (on && !kraus) {
      // Seed with the identity channel.
      onChange({ ...noise, customKraus: { enabled: true, name: "custom 1q", operators: [[1, 0, 0, 0, 0, 0, 1, 0]] } });
      setText(formatKraus([[1, 0, 0, 0, 0, 0, 1, 0]]));
    } else if (kraus) {
      onChange({ ...noise, customKraus: { ...kraus, enabled: on } });
    }
  };

  const onTextChange = (t: string) => {
    setText(t);
    try {
      const parsed = parseKraus(t);
      onChange({
        ...noise,
        customKraus: {
          enabled: kraus?.enabled ?? true,
          name: kraus?.name ?? "custom 1q",
          operators: parsed,
        },
      });
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <fieldset className="noise__group" disabled={!noise.enabled}>
      <legend>Custom 1q Kraus channel</legend>
      <label className="noise__enable" style={{ fontSize: 11 }}>
        <input
          type="checkbox"
          checked={!!kraus?.enabled}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>Apply after every 1-qubit gate</span>
      </label>
      <p className="noise__hint">
        Each operator is a 2×2 complex matrix on its own line: 8 numbers,
        row-major Re/Im pairs (Re00, Im00, Re01, Im01, Re10, Im10, Re11,
        Im11). Should satisfy Σ Kᵢ† Kᵢ = I — not enforced.
      </p>
      <textarea
        className="noise__kraus"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        rows={Math.max(2, (text.match(/\n/g) ?? []).length + 1)}
        placeholder="1 0 0 0  0 0 0.95 0&#10;0 0 0.31 0  0 0 0 0"
      />
      {err && <div className="noise__import-err">✗ {err}</div>}
    </fieldset>
  );
}

function formatKraus(operators: number[][]): string {
  return operators.map((op) => op.map((v) => v.toString()).join(" ")).join("\n");
}

function parseKraus(text: string): number[][] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: number[][] = [];
  for (const line of lines) {
    const parts = line.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length !== 8 || parts.some((v) => !Number.isFinite(v))) {
      throw new Error(`each operator needs 8 numbers (got ${parts.length})`);
    }
    out.push(parts);
  }
  if (out.length === 0) throw new Error("at least one operator required");
  if (out.length > 4) throw new Error("at most 4 operators supported");
  return out;
}

function PQCell({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const display = typeof value === "number" ? value.toExponential(1).replace("e+0", "e").replace("e-0", "e-") : "—";
  return (
    <td className="noise__pq-cell" title={typeof value === "number" ? String(value) : "fallback to global"}>
      <input
        type="text"
        value={display === "—" ? "" : display}
        placeholder="—"
        onChange={(e) => {
          const s = e.target.value.trim();
          if (!s) { onChange(undefined); return; }
          const v = parseFloat(s);
          if (Number.isFinite(v)) onChange(Math.max(0, Math.min(1, v)));
        }}
      />
    </td>
  );
}
