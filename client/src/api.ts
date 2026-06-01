import type { Circuit } from "./editor/types";

export type Amplitude = {
  basis: string;
  index: number;
  expr: string;
  latex: string;
  isZero: boolean;
};

export type SkippedGate = {
  id: string;
  gateId: string;
  reason: string;
};

export type StatevectorResponse = {
  numQubits: number;
  amplitudes: Amplitude[];
  ketLatex: string;
  skipped: SkippedGate[];
};

export async function fetchStatevector(circuit: Circuit, signal?: AbortSignal): Promise<StatevectorResponse> {
  const res = await fetch("/api/simulate/statevector", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(circuit),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`statevector ${res.status}: ${detail}`);
  }
  return res.json();
}
