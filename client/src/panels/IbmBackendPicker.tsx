import { useEffect, useState } from "react";
import { importIbmBackend, type NoiseModel } from "../sim/noise";

/**
 * Picker for IBM device calibration snapshots published in Qiskit's
 * fake_provider. The full backend list is fetched from the GitHub repo on open
 * (so it's always complete and current); clicking a row fetches that device's
 * `props_<name>.json` (raw, CORS-open) and runs it through `importIbmBackend`.
 * Cancel / Esc / click-outside close it.
 */

type Backend = { id: string; qubits?: number; family: string };

const CONTENTS_API =
  "https://api.github.com/repos/Qiskit/qiskit-ibm-runtime/contents/qiskit_ibm_runtime/fake_provider/backends";
const RAW = (id: string) =>
  `https://raw.githubusercontent.com/Qiskit/qiskit-ibm-runtime/main/qiskit_ibm_runtime/fake_provider/backends/${id}/props_${id}.json`;

// Known qubit counts (the props file is authoritative on click; this is only
// to enrich the table). Unknown backends still list, with "—".
const QUBITS: Record<string, number> = {
  armonk: 1,
  yorktown: 5, manila: 5, lima: 5, belem: 5, quito: 5, bogota: 5, santiago: 5,
  athens: 5, rome: 5, ourense: 5, valencia: 5, vigo: 5, essex: 5, london: 5, burlington: 5,
  jakarta: 7, lagos: 7, nairobi: 7, perth: 7, oslo: 7, casablanca: 7,
  guadalupe: 16,
  almaden: 20, boeblingen: 20, singapore: 20, johannesburg: 20, poughkeepsie: 20,
  cairo: 27, hanoi: 27, kolkata: 27, mumbai: 27, montreal: 27, toronto: 27,
  sydney: 27, auckland: 27, geneva: 27, paris: 27, algiers: 27,
  cambridge: 28, rochester: 53,
  brooklyn: 65, manhattan: 65,
  washington: 127, sherbrooke: 127, brisbane: 127, kyoto: 127, osaka: 127,
  kyiv: 127, quebec: 127, kawasaki: 127, cusco: 127,
  torino: 133, fez: 156, marrakesh: 156,
};

function familyFor(q: number | undefined): string {
  if (q === 1) return "Canary";
  if (q === 5 || q === 7 || q === 16 || q === 27) return "Falcon";
  if (q === 20 || q === 28 || q === 53 || q === 65) return "Hummingbird";
  if (q === 127) return "Eagle";
  if (q === 133 || q === 156) return "Heron";
  return "";
}

// Offline fallback — the known backend folders, used if the GitHub API call
// fails (rate limit / no network). The live fetch supersedes this when it works.
const FALLBACK = [
  "aachen", "algiers", "almaden", "armonk", "athens", "auckland", "belem", "berlin",
  "boeblingen", "bogota", "boston", "brisbane", "brooklyn", "brussels", "burlington",
  "cairo", "cambridge", "casablanca", "cusco", "essex", "fez", "fractional", "geneva",
  "guadalupe", "hanoi", "jakarta", "johannesburg", "kawasaki", "kingston", "kolkata",
  "kyiv", "kyoto", "lagos", "lima", "london", "manhattan", "manila", "marrakesh",
  "melbourne", "miami", "montreal", "mumbai", "nairobi", "nighthawk", "osaka", "oslo",
  "ourense", "paris", "peekskill", "perth", "pittsburgh", "poughkeepsie", "prague",
  "quebec", "quito", "rochester", "rome", "santiago", "sherbrooke", "singapore",
  "strasbourg", "sydney", "torino", "toronto", "valencia", "vigo", "washington", "yorktown",
];

function toBackends(ids: string[]): Backend[] {
  return ids
    .map((id) => ({ id, qubits: QUBITS[id], family: familyFor(QUBITS[id]) }))
    .sort((a, b) => (a.qubits ?? 9999) - (b.qubits ?? 9999) || a.id.localeCompare(b.id));
}

export function IbmBackendPicker({ onPick, onClose }: { onPick: (n: NoiseModel) => void; onClose: () => void }) {
  const [list, setList] = useState<Backend[] | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch the full backend folder list from the repo on open.
  useEffect(() => {
    let cancelled = false;
    fetch(CONTENTS_API)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((entries: Array<{ name: string; type: string }>) => {
        if (cancelled) return;
        const ids = entries.filter((e) => e.type === "dir").map((e) => e.name);
        setList(toBackends(ids.length > 0 ? ids : FALLBACK));
      })
      .catch(() => { if (!cancelled) setList(toBackends(FALLBACK)); });
    return () => { cancelled = true; };
  }, []);

  const pick = async (b: Backend) => {
    if (loading) return;
    setError(null);
    setLoading(b.id);
    try {
      const res = await fetch(RAW(b.id));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onPick(importIbmBackend(await res.text()));
    } catch (e) {
      setError(`Couldn't load ${b.id}: ${e instanceof Error ? e.message : String(e)}`);
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
          Every device in Qiskit's <code>fake_provider</code>{list ? ` (${list.length})` : ""}.
          Click one to fetch its live props and load its noise model.
        </p>
        {error && <div className="ibmpick__err">✗ {error}</div>}
        <div className="ibmpick__scroll">
          {!list ? (
            <div className="ibmpick__loading">loading device list…</div>
          ) : (
            <table className="ibmpick__table">
              <thead>
                <tr><th>Backend</th><th>Qubits</th><th>Family</th></tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr
                    key={b.id}
                    className={"ibmpick__row" + (loading === b.id ? " ibmpick__row--loading" : "")}
                    onClick={() => pick(b)}
                  >
                    <td>{b.id}</td>
                    <td className="ibmpick__num">{b.qubits ?? "—"}</td>
                    <td className="ibmpick__fam">{b.family}{loading === b.id ? " · loading…" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="ibmpick__foot">
          <a href="https://github.com/Qiskit/qiskit-ibm-runtime/tree/main/qiskit_ibm_runtime/fake_provider/backends" target="_blank" rel="noreferrer">repo ↗</a>
          <button className="ibmpick__cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
