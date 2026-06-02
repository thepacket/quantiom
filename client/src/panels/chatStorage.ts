import type { ChatMessage } from "../sim/openrouter";
import type { AttachKey } from "./chatContext";

/**
 * localStorage glue for the AI chat panel. All keys are namespaced under
 * `quantiom:chat:`. The API key is intentionally browser-local — Quantiom
 * has no backend, so there's nowhere else to put it.
 *
 * Failure mode: every read/write is wrapped in try/catch so storage
 * unavailability (Safari private mode, quota, etc.) degrades to "no
 * persistence" rather than crashing the panel.
 */

const KEY_API = "quantiom:chat:key";
const KEY_MODEL = "quantiom:chat:model";
const KEY_HEIGHT = "quantiom:chat:height";
const KEY_HISTORY = "quantiom:chat:history";
const KEY_OPEN = "quantiom:chat:open";
const KEY_ATTACHED = "quantiom:chat:attached";

export function loadApiKey(): string {
  try { return localStorage.getItem(KEY_API) ?? ""; } catch { return ""; }
}
export function saveApiKey(key: string): void {
  try { localStorage.setItem(KEY_API, key); } catch { /* ignore */ }
}

export function loadModel(): string {
  try { return localStorage.getItem(KEY_MODEL) ?? ""; } catch { return ""; }
}
export function saveModel(model: string): void {
  try { localStorage.setItem(KEY_MODEL, model); } catch { /* ignore */ }
}

export function loadHeight(): number {
  try {
    const v = parseInt(localStorage.getItem(KEY_HEIGHT) ?? "", 10);
    return Number.isFinite(v) && v >= 120 && v <= 800 ? v : 260;
  } catch { return 260; }
}
export function saveHeight(h: number): void {
  try { localStorage.setItem(KEY_HEIGHT, String(Math.round(h))); } catch { /* ignore */ }
}

export function loadOpen(): boolean {
  try { return localStorage.getItem(KEY_OPEN) !== "0"; } catch { return true; }
}
export function saveOpen(open: boolean): void {
  try { localStorage.setItem(KEY_OPEN, open ? "1" : "0"); } catch { /* ignore */ }
}

/** Bounded history persistence. Old chats get truncated to the last N
 *  messages so localStorage doesn't slowly fill up. */
const MAX_PERSISTED_MESSAGES = 100;

const VALID_ATTACH_KEYS: AttachKey[] = [
  "statevector", "probabilities", "bloch", "resources", "noise", "classicalRegister",
];

export function loadAttached(): Set<AttachKey> {
  try {
    const raw = localStorage.getItem(KEY_ATTACHED);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    const valid = new Set<AttachKey>();
    for (const k of arr) {
      if (typeof k === "string" && VALID_ATTACH_KEYS.includes(k as AttachKey)) {
        valid.add(k as AttachKey);
      }
    }
    return valid;
  } catch { return new Set(); }
}
export function saveAttached(attached: ReadonlySet<AttachKey>): void {
  try { localStorage.setItem(KEY_ATTACHED, JSON.stringify([...attached])); } catch { /* ignore */ }
}

export function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(KEY_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is ChatMessage =>
        m && typeof m === "object" &&
        (m.role === "system" || m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
      );
  } catch { return []; }
}
export function saveHistory(history: ChatMessage[]): void {
  try {
    const tail = history.slice(-MAX_PERSISTED_MESSAGES);
    localStorage.setItem(KEY_HISTORY, JSON.stringify(tail));
  } catch { /* ignore */ }
}
