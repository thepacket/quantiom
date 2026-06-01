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
  freeSymbols: string[];
  isLarge: boolean;
};

export type ParameterValues = Record<string, number>;

export type UnitaryResponse = {
  numQubits: number;
  latex: string;
  entries: string[][];
  skipped: SkippedGate[];
};

export type SymbolicResponse = {
  ketLatex: string;
  tooLarge: boolean;
};

export async function fetchSymbolic(circuit: Circuit, signal?: AbortSignal): Promise<SymbolicResponse> {
  const res = await fetch("/api/simulate/symbolic", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ circuit, parameterValues: {} }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`symbolic ${res.status}: ${detail}`);
  }
  return res.json();
}

export async function fetchUnitary(
  circuit: Circuit,
  parameterValues: ParameterValues = {},
  signal?: AbortSignal,
): Promise<UnitaryResponse> {
  const res = await fetch("/api/simulate/unitary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ circuit, parameterValues }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`unitary ${res.status}: ${detail}`);
  }
  return res.json();
}

export async function fetchStatevector(
  circuit: Circuit,
  parameterValues: ParameterValues = {},
  signal?: AbortSignal,
): Promise<StatevectorResponse> {
  const res = await fetch("/api/simulate/statevector", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ circuit, parameterValues }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`statevector ${res.status}: ${detail}`);
  }
  return res.json();
}
