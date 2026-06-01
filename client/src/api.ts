import type { Circuit } from "./editor/types";

export type Amplitude = {
  basis: string;
  index: number;
  expr: string;
  latex: string;
  isZero: boolean;
  re: number | null;
  im: number | null;
};

export type BlochVector = { x: number; y: number; z: number };

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
  probabilities: (number | null)[];
  blochVectors: (BlochVector | null)[];
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
