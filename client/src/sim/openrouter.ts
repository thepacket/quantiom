/**
 * OpenRouter API client for the AI chat panel.
 *
 * OpenRouter exposes an OpenAI-compatible Chat Completions endpoint at
 * `https://openrouter.ai/api/v1/chat/completions` and a model catalog at
 * `https://openrouter.ai/api/v1/models`. We use both. The API key is the
 * user's OpenRouter key, stored in localStorage by the chat panel and
 * passed in here as a function argument.
 *
 * No server-side proxy — requests go straight from the browser to
 * OpenRouter. This matches the rest of Quantiom's "browser-only, no
 * backend except static hosting" architecture.
 *
 * Streaming uses SSE (`stream: true`). We consume the response body via
 * the WHATWG streams API, parse `data: {...}` lines, and call onDelta
 * with each text chunk.
 */

const BASE_URL = "https://openrouter.ai/api/v1";
// `HTTP-Referer` and `X-Title` are OpenRouter-recommended attribution
// headers; they show up in the user's OpenRouter usage dashboard and
// help with rate-limit prioritisation.
const APP_REFERER = "https://quantiom.fly.dev";
const APP_TITLE = "Quantiom";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// ─── tool-calling (Agent mode) ────────────────────────────────────────

/** OpenAI/OpenRouter function-tool schema (see `panels/agentTools.ts`). */
export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
};

/** A message in an agent loop — supports assistant tool_calls and tool results. */
export type AgentMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** Present on an assistant turn that requested tool calls. */
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  /** Present on a tool-result message. */
  tool_call_id?: string;
  name?: string;
};

export type ParsedToolCall = { id: string; name: string; arguments: string };

/**
 * Non-streaming chat completion with optional tool calling. Returns the
 * assistant's text (may be empty) and any tool calls it requested. Used by the
 * Agent loop, which executes the tools and continues the conversation. Throws
 * on HTTP / network error so the caller can surface it.
 */
export async function chatCompletion(
  apiKey: string,
  model: string,
  messages: AgentMessage[],
  tools?: ToolDef[],
  signal?: AbortSignal,
): Promise<{ content: string; toolCalls: ParsedToolCall[] }> {
  const body: Record<string, unknown> = { model, messages, stream: false };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": APP_REFERER,
      "X-Title": APP_TITLE,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await safeText(res)) || res.statusText}`);
  const json = await res.json();
  const msg = json?.choices?.[0]?.message;
  const content = typeof msg?.content === "string" ? msg.content : "";
  const rawCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
  const toolCalls: ParsedToolCall[] = rawCalls
    .filter((c: unknown): c is { id: string; function: { name: string; arguments: string } } =>
      !!c && typeof (c as { id?: unknown }).id === "string" && !!(c as { function?: unknown }).function)
    .map((c: { id: string; function: { name: string; arguments?: string } }) => ({
      id: c.id,
      name: c.function.name,
      arguments: typeof c.function.arguments === "string" ? c.function.arguments : "{}",
    }));
  return { content, toolCalls };
}

export type OpenRouterModel = {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt: string; completion: string };
};

/** Fetch the full model catalog. No auth required; cache aggressively. */
export async function listModels(): Promise<OpenRouterModel[]> {
  const res = await fetch(`${BASE_URL}/models`, {
    headers: { "HTTP-Referer": APP_REFERER, "X-Title": APP_TITLE },
  });
  if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);
  const json = await res.json();
  const data: unknown = json.data;
  if (!Array.isArray(data)) throw new Error("unexpected /models response shape");
  return data
    .filter((m): m is OpenRouterModel => !!m && typeof (m as { id?: unknown }).id === "string")
    .map((m) => ({
      id: m.id,
      name: typeof m.name === "string" ? m.name : m.id,
      description: typeof m.description === "string" ? m.description : undefined,
      context_length: typeof m.context_length === "number" ? m.context_length : undefined,
      pricing: m.pricing && typeof m.pricing === "object" ? m.pricing : undefined,
    }));
}

export type StreamCallbacks = {
  onDelta: (chunk: string) => void;
  onDone: (full: string) => void;
  onError: (message: string) => void;
};

/** Abort the stream if no *bytes* arrive for this long — catches a dead
 *  connection. Reset on every received chunk (including SSE keep-alive
 *  comments), so it does not cut a slow-but-alive stream. */
const IDLE_TIMEOUT_MS = 20_000;

/** Abort if no actual *content token* arrives for this long, even while the
 *  connection keeps sending keep-alive comments. Catches OpenRouter accepting
 *  the request but never producing output (model queued/stuck) — the case that
 *  the byte-level idle timer alone can't, since keep-alives keep resetting it.
 *  Generous so genuinely slow / reasoning models aren't cut off mid-think. */
const CONTENT_TIMEOUT_MS = 90_000;

/**
 * Stream a chat completion. Returns an `AbortController` so the caller can
 * cancel mid-stream (e.g. when the user clicks Stop). The callbacks fire in
 * order: many onDelta, then exactly one of onDone or onError.
 *
 * Two watchdogs guard against an unresponsive OpenRouter: a 20s **byte-idle**
 * timeout (no bytes at all → dead connection) and a 90s **content-stall**
 * timeout (bytes flowing — e.g. keep-alive comments — but no actual tokens).
 * Either aborts the request and reports a timeout via onError. The byte timer
 * resets on every chunk and the content timer on every real token, so a reply
 * that keeps producing output is never cut off.
 */
export function streamChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let contentTimer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const armIdleTimeout = () => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { timedOut = true; controller.abort(); }, IDLE_TIMEOUT_MS);
  };
  const armContentTimeout = () => {
    if (contentTimer !== undefined) clearTimeout(contentTimer);
    contentTimer = setTimeout(() => { timedOut = true; controller.abort(); }, CONTENT_TIMEOUT_MS);
  };
  const clearTimers = () => {
    if (idleTimer !== undefined) { clearTimeout(idleTimer); idleTimer = undefined; }
    if (contentTimer !== undefined) { clearTimeout(contentTimer); contentTimer = undefined; }
  };
  (async () => {
    let full = "";
    try {
      armIdleTimeout(); // covers a connection that never responds
      armContentTimeout(); // covers an alive-but-tokenless (keep-alive) stall
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": APP_REFERER,
          "X-Title": APP_TITLE,
        },
        body: JSON.stringify({ model, messages, stream: true }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await safeText(res);
        callbacks.onError(`OpenRouter ${res.status}: ${text || res.statusText}`);
        return;
      }
      if (!res.body) {
        callbacks.onError("OpenRouter returned no response body");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      armIdleTimeout(); // fresh 20s window for the first body chunk
      // SSE frames are separated by blank lines. Each frame has one or more
      // `data: ...` lines; OpenRouter sends `data: [DONE]` to signal the end.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        armIdleTimeout(); // progress — reset the idle timer
        buf += decoder.decode(value, { stream: true });
        // Split on double-newline (\n\n) to extract complete SSE events.
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") {
              callbacks.onDone(full);
              return;
            }
            try {
              const obj = JSON.parse(payload);
              const delta = obj?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                full += delta;
                callbacks.onDelta(delta);
                armContentTimeout(); // real progress — reset the content stall watchdog
              }
            } catch {
              // Some keep-alive frames or comments are not JSON; ignore.
            }
          }
        }
      }
      callbacks.onDone(full);
    } catch (err) {
      if (timedOut) {
        callbacks.onError(
          `Timed out waiting for the model (no output). OpenRouter may be slow ` +
          `or unresponsive — try again, or pick a different model.`,
        );
        return;
      }
      if (controller.signal.aborted) {
        // User-initiated cancel (Stop button); treat the partial as done so
        // the panel keeps what's already streamed.
        callbacks.onDone(full);
        return;
      }
      callbacks.onError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimers();
    }
  })();
  return controller;
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ""; }
}
