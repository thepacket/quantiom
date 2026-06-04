// Verifies the AI chat idle-timeout. Mocks global fetch with a stalling
// SSE stream and checks streamChat aborts with a timeout after ~20s, while
// healthy streams complete and user-cancel keeps the partial.
// Run with `npx tsx scripts/test-chat-timeout.ts` from client/ (~22s).

import { streamChat, type ChatMessage } from "../src/sim/openrouter";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (content: string) => `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\n`;

type Reader = { read: () => Promise<{ value?: Uint8Array; done: boolean }> };

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

async function run() {
  // ── 1. Healthy stream completes with onDone, no timeout ───────────────
  await new Promise<void>((resolve) => {
    const frames = [sse("Hello "), sse("world"), "data: [DONE]\n\n"];
    let i = 0;
    mockFetch(() => ({
      read: async () => i < frames.length
        ? { value: enc(frames[i++]), done: false }
        : { done: true },
    }));
    let got = "";
    streamChat("k", "m", msgs, {
      onDelta: (c) => { got += c; },
      onDone: (full) => {
        check("healthy stream → onDone with full text", full === "Hello world", JSON.stringify(full));
        check("healthy stream → onDelta accumulated", got === "Hello world");
        resolve();
      },
      onError: (m) => { check("healthy stream should not error", false, m); resolve(); },
    });
  });

  // ── 2. User cancel mid-stream → onDone keeps the partial ──────────────
  await new Promise<void>((resolve) => {
    let sent = false;
    mockFetch((signal) => ({
      read: () => new Promise((res, rej) => {
        if (!sent) { sent = true; res({ value: enc(sse("partial")), done: false }); return; }
        signal.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
      }),
    }));
    const ctrl = streamChat("k", "m", msgs, {
      onDelta: () => { setTimeout(() => ctrl.abort(), 50); }, // cancel after first chunk
      onDone: (full) => { check("user cancel → onDone keeps partial", full === "partial", JSON.stringify(full)); resolve(); },
      onError: (m) => { check("user cancel should not error", false, m); resolve(); },
    });
  });

  // ── 3. Idle stall → timeout error after ~20s ──────────────────────────
  console.log("  … waiting ~21s for the idle timeout to fire …");
  await new Promise<void>((resolve) => {
    const t0 = Date.now();
    let sent = false;
    mockFetch((signal) => ({
      read: () => new Promise((res, rej) => {
        if (!sent) { sent = true; res({ value: enc(sse("start")), done: false }); return; }
        signal.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
      }),
    }));
    streamChat("k", "m", msgs, {
      onDelta: () => {},
      onDone: () => { check("stalled stream should NOT onDone", false); resolve(); },
      onError: (m) => {
        const dt = (Date.now() - t0) / 1000;
        check("stalled stream → onError fires", /Timed out/.test(m), m);
        check("timeout fires at ~20s", dt > 19 && dt < 23, `${dt.toFixed(1)}s`);
        resolve();
      },
    });
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
