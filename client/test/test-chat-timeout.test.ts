// Verifies the AI chat idle-timeout in src/sim/openrouter.ts by mocking
// global fetch with stalling / healthy / cancelled SSE streams.
import { test, expect, afterEach } from "vitest";
import { streamChat, type ChatMessage } from "../src/sim/openrouter";

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (content: string) => `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\n`;

type Reader = { read: () => Promise<{ value?: Uint8Array; done: boolean }> };

const realFetch = globalThis.fetch;
afterEach(() => { (globalThis as { fetch: unknown }).fetch = realFetch; });

/** Install a mock fetch whose body reader is produced by `makeReader`. */
function mockFetch(makeReader: (signal: AbortSignal) => Reader) {
  (globalThis as { fetch: unknown }).fetch = async (_url: string, opts: { signal: AbortSignal }) => ({
    ok: true,
    status: 200,
    statusText: "OK",
    body: { getReader: () => makeReader(opts.signal) },
  });
}

const msgs: ChatMessage[] = [{ role: "user", content: "hi" }];

test("healthy stream resolves with the full text via onDone", async () => {
  const frames = [sse("Hello "), sse("world"), "data: [DONE]\n\n"];
  let i = 0;
  mockFetch(() => ({
    read: async () => (i < frames.length ? { value: enc(frames[i++]), done: false } : { done: true }),
  }));
  let got = "";
  const full = await new Promise<string>((resolve, reject) => {
    streamChat("k", "m", msgs, {
      onDelta: (c) => { got += c; },
      onDone: resolve,
      onError: reject,
    });
  });
  expect(full).toBe("Hello world");
  expect(got).toBe("Hello world");
});

test("user cancel mid-stream keeps the partial via onDone", async () => {
  let sent = false;
  mockFetch((signal) => ({
    read: () => new Promise((res, rej) => {
      if (!sent) { sent = true; res({ value: enc(sse("partial")), done: false }); return; }
      signal.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
    }),
  }));
  const full = await new Promise<string>((resolve, reject) => {
    const ctrl = streamChat("k", "m", msgs, {
      onDelta: () => { setTimeout(() => ctrl.abort(), 50); },
      onDone: resolve,
      onError: reject,
    });
  });
  expect(full).toBe("partial");
});

test("idle stall triggers a timeout error at ~20s", async () => {
  const t0 = Date.now();
  let sent = false;
  mockFetch((signal) => ({
    read: () => new Promise((res, rej) => {
      if (!sent) { sent = true; res({ value: enc(sse("start")), done: false }); return; }
      signal.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
    }),
  }));
  const { msg, dt } = await new Promise<{ msg: string; dt: number }>((resolve, reject) => {
    streamChat("k", "m", msgs, {
      onDelta: () => {},
      onDone: () => reject(new Error("stalled stream should not call onDone")),
      onError: (m) => resolve({ msg: m, dt: (Date.now() - t0) / 1000 }),
    });
  });
  expect(msg).toMatch(/Timed out/);
  expect(dt).toBeGreaterThan(19);
  expect(dt).toBeLessThan(23);
}, 30_000);
