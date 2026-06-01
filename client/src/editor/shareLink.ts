import type { Circuit } from "./types";

/**
 * Shareable URL encoding for a circuit.
 *
 * Pipeline: Circuit IR → JSON → gzip (CompressionStream) → base64url →
 * URL hash fragment `#c=<payload>`. Decodes the inverse on startup.
 *
 * The hash fragment is never sent to the server, so it's free in our
 * static-host deployment. Typical circuits compress to a few hundred
 * characters — well within URL length budgets.
 */

const HASH_KEY = "c";

/** Encode a circuit into a hash-fragment string (without the leading #). */
export async function encodeCircuit(circuit: Circuit): Promise<string> {
  const json = JSON.stringify(circuit);
  const bytes = new TextEncoder().encode(json);
  const compressed = await gzip(bytes);
  return `${HASH_KEY}=${b64urlEncode(compressed)}`;
}

/** Decode the hash fragment of the current URL into a circuit, if present. */
export async function decodeCircuitFromHash(hash: string): Promise<Circuit | null> {
  if (!hash || hash[0] !== "#") return null;
  const params = new URLSearchParams(hash.slice(1));
  const payload = params.get(HASH_KEY);
  if (!payload) return null;
  try {
    const compressed = b64urlDecode(payload);
    const bytes = await gunzip(compressed);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (typeof parsed.numQubits !== "number" || !Array.isArray(parsed.gates)) return null;
    return parsed as Circuit;
  } catch {
    return null;
  }
}

/** Build a full sharable URL for the current document location. */
export async function buildShareURL(circuit: Circuit): Promise<string> {
  const enc = await encodeCircuit(circuit);
  return `${location.origin}${location.pathname}#${enc}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return bytes; // fallback
  const cs = new CompressionStream("gzip");
  const blob = await new Response(
    new Blob([bytes as BlobPart]).stream().pipeThrough(cs),
  ).arrayBuffer();
  return new Uint8Array(blob);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") return bytes;
  const ds = new DecompressionStream("gzip");
  const blob = await new Response(
    new Blob([bytes as BlobPart]).stream().pipeThrough(ds),
  ).arrayBuffer();
  return new Uint8Array(blob);
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
