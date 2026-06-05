/**
 * Share-link round-trip. A circuit is encoded into a gzip+base64url URL hash
 * and decoded back on load; the decoded circuit must equal the original, and
 * malformed / foreign payloads must fail closed (null) rather than throw or
 * return a half-parsed object.
 */
import { describe, test, expect } from "vitest";
import { encodeCircuit, decodeCircuitFromHash } from "../src/editor/shareLink";
import { circ, gate } from "./helpers";

const sample = circ(3, [
  gate("h", [0]),
  gate("cx", [1], [0]),
  gate("rx", [2], [], ["π/3"]),
  gate("measure", [0], [], []),
]);

describe("encode/decode round-trip", () => {
  test("decoding an encoded circuit returns an equal circuit", async () => {
    const enc = await encodeCircuit(sample);
    const out = await decodeCircuitFromHash("#" + enc);
    expect(out).not.toBeNull();
    expect(out).toEqual(sample);
  });

  test("an empty circuit round-trips", async () => {
    const empty = circ(1, []);
    const out = await decodeCircuitFromHash("#" + (await encodeCircuit(empty)));
    expect(out).toEqual(empty);
  });

  test("the payload is carried under the c= key", async () => {
    const enc = await encodeCircuit(sample);
    expect(enc.startsWith("c=")).toBe(true);
    expect(await decodeCircuitFromHash("#" + enc)).toEqual(sample);
  });
});

describe("decode fails closed", () => {
  test("no hash / missing key returns null", async () => {
    expect(await decodeCircuitFromHash("")).toBeNull();
    expect(await decodeCircuitFromHash("#")).toBeNull();
    expect(await decodeCircuitFromHash("#x=abc")).toBeNull();
    expect(await decodeCircuitFromHash("notahash")).toBeNull();
  });

  test("garbage payload returns null instead of throwing", async () => {
    expect(await decodeCircuitFromHash("#c=not-valid-base64-gzip!!")).toBeNull();
  });

  test("valid JSON that isn't a circuit shape returns null", async () => {
    // gzip-encode a non-circuit object via the public encoder, then tamper:
    // {foo:1} has no numQubits/gates, so the shape guard must reject it.
    const fakeCircuit = { numQubits: "three", gates: "nope" } as unknown as Parameters<typeof encodeCircuit>[0];
    const enc = await encodeCircuit(fakeCircuit);
    expect(await decodeCircuitFromHash("#" + enc)).toBeNull();
  });
});
