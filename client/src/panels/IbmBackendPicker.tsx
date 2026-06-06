import { useEffect, useState } from "react";
import { importIbmBackend, type NoiseModel } from "../sim/noise";

/**
 * Picker for IBM device calibration snapshots published in Qiskit's
 * fake_provider. Lists a representative set of backends; clicking a row fetches
 * that device's `props_<name>.json` from GitHub (raw, CORS-open) and runs it
 * through `importIbmBackend`. Cancel / Esc / click-outside close it.
 */

type Backend = { id: string; label: string; qubits: number; family: string };

// Curated, representative selection from Qiskit's ~80 fake backends, spanning
// 1 → 156 qubits. The actual noise comes from each device's live props file.
const BACKENDS: Backend[] = [
  { id: "armonk", label: "ibmq_armonk", qubits: 1, family: "Canary" },
  { id: "manila", label: "ibmq_manila", qubits: 5, family: "Falcon" },
  { id: "lima", label: "ibmq_lima", qubits: 5, family: "Falcon" },
  { id: "belem", label: "ibmq_belem", qubits: 5, family: "Falcon" },
  { id: "quito", label: "ibmq_quito", qubits: 5, family: "Falcon" },
  { id: "jakarta", label: "ibmq_jakarta", qubits: 7, family: "Falcon" },
  { id: "lagos", label: "ibm_lagos", qubits: 7, family: "Falcon" },
  { id: "nairobi", label: "ibm_nairobi", qubits: 7, family: "Falcon" },
  { id: "perth", label: "ibm_perth", qubits: 7, family: "Falcon" },
  { id: "oslo", label: "ibm_oslo", qubits: 7, family: "Falcon" },
  { id: "guadalupe", label: "ibmq_guadalupe", qubits: 16, family: "Falcon" },
  { id: "cairo", label: "ibm_cairo", qubits: 27, family: "Falcon" },
  { id: "hanoi", label: "ibm_hanoi", qubits: 27, family: "Falcon" },
  { id: "kolkata", label: "ibmq_kolkata", qubits: 27, family: "Falcon" },
  { id: "mumbai", label: "ibmq_mumbai", qubits: 27, family: "Falcon" },
  { id: "montreal", label: "ibmq_montreal", qubits: 27, family: "Falcon" },
  { id: "auckland", label: "ibm_auckland", qubits: 27, family: "Falcon" },
  { id: "geneva", label: "ibm_geneva", qubits: 27, family: "Falcon" },
  { id: "brooklyn", label: "ibmq_brooklyn", qubits: 65, family: "Hummingbird" },
  { id: "manhattan", label: "ibmq_manhattan", qubits: 65, family: "Hummingbird" },
  { id: "washington", label: "ibm_washington", qubits: 127, family: "Eagle" },
  { id: "sherbrooke", label: "ibm_sherbrooke", qubits: 127, family: "Eagle" },
  { id: "brisbane", label: "ibm_brisbane", qubits: 127, family: "Eagle" },
  { id: "kyoto", label: "ibm_kyoto", qubits: 127, family: "Eagle" },
  { id: "osaka", label: "ibm_osaka", qubits: 127, family: "Eagle" },
  { id: "kyiv", label: "ibm_kyiv", qubits: 127, family: "Eagle" },
  { id: "quebec", label: "ibm_quebec", qubits: 127, family: "Eagle" },
  { id: "kawasaki", label: "ibm_kawasaki", qubits: 127, family: "Eagle" },
  { id: "torino", label: "ibm_torino", qubits: 133, family: "Heron" },
  { id: "fez", label: "ibm_fez", qubits: 156, family: "Heron" },
  { id: "marrakesh", label: "ibm_marrakesh", qubits: 156, family: "Heron" },
];

const RAW = (id: string) =>
  `https://raw.githubusercontent.com/Qiskit/qiskit-ibm-runtime/main/qiskit_ibm_runtime/fake_provider/backends/${id}/props_${id}.json`;

export function IbmBackendPicker({ onPick, onClose }: { onPick: (n: NoiseModel) => void; onClose: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = async (b: Backend) => {
    if (loading) return;
    setError(null);
    setLoading(b.id);
    try {
      const res = await fetch(RAW(b.id));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const imported = importIbmBackend(await res.text());
      onPick(imported);
    } catch (e) {
      setError(`Couldn't load ${b.label}: ${e instanceof Error ? e.message : String(e)}`);
      setLoading(null);
    }
  };

  return (
    <div className="ibmpick__overlay" onClick={onClose}>
      <div className="ibmpick__card" onClick={(e) => e.stopPropagation()}>
        <div className="ibmpick__head">
          <strong>Import IBM BackendProperties from Qiskit</strong>
          <button className="ibmpick__x" onClick={onClose} title="Cancel (Esc)">×</button>
        </div>
        <p className="ibmpick__note">
          Live calibration snapshots from Qiskit's <code>fake_provider</code>. Click a
          device to fetch its props and load its noise model.
        </p>
        {error && <div className="ibmpick__err">✗ {error}</div>}
        <div className="ibmpick__scroll">
          <table className="ibmpick__table">
            <thead>
              <tr><th>Backend</th><th>Qubits</th><th>Family</th></tr>
            </thead>
            <tbody>
              {BACKENDS.map((b) => (
                <tr
                  key={b.id}
                  className={"ibmpick__row" + (loading === b.id ? " ibmpick__row--loading" : "")}
                  onClick={() => pick(b)}
                >
                  <td>{b.label}</td>
                  <td className="ibmpick__num">{b.qubits}</td>
                  <td className="ibmpick__fam">{b.family}{loading === b.id ? " · loading…" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ibmpick__foot">
          <a href="https://github.com/Qiskit/qiskit-ibm-runtime/tree/main/qiskit_ibm_runtime/fake_provider/backends" target="_blank" rel="noreferrer">all backends ↗</a>
          <button className="ibmpick__cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
