import type { ParameterValues } from "../sim/simulate";

/**
 * Record a DOM subtree as a WebM video while the `t` parameter sweeps
 * one period (0 → 2π).
 *
 * Pipeline per frame:
 *   1. Set `t`, wait two animation frames for React + simulator.
 *   2. Wrap the target element in an SVG `<foreignObject>` with the
 *      page's stylesheets inlined.
 *   3. Serialise to data URL, load through `<img>`, paint onto a
 *      capture canvas.
 *
 * The `<foreignObject>` path lets us record an arbitrary HTML tree
 * (e.g. the right-side panel column with its nested Bloch SVGs and
 * probability bars), not just a single SVG.
 *
 * Browser support: works in Chromium and Firefox. Safari's
 * `foreignObject` implementation is patchier and may produce blank
 * frames. The function throws when MediaRecorder is missing.
 */
export async function recordAnimationWebM(opts: {
  target: Element;
  setParamValues: (v: ParameterValues) => void;
  currentParams: ParameterValues;
  duration_ms: number;
  fps: number;
  filename: string;
}): Promise<void> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }

  const bbox = opts.target.getBoundingClientRect();
  const W = Math.max(160, Math.floor(bbox.width));
  const H = Math.max(160, Math.floor(bbox.height));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  const stream = canvas.captureStream(opts.fps);
  const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start(100);

  try {
    const totalFrames = Math.max(2, Math.round((opts.duration_ms / 1000) * opts.fps));
    const period = 2 * Math.PI;
    for (let frame = 0; frame < totalFrames; frame++) {
      const t = (frame / (totalFrames - 1)) * period;
      opts.setParamValues({ ...opts.currentParams, t });
      await waitFrame();
      await waitFrame();
      const serialised = serialiseElementWithStyles(opts.target, W, H);
      const encoded = encodeURIComponent(serialised);
      const dataUrl = `data:image/svg+xml,${encoded}`;
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          ctx.fillStyle = "#0d0e10";
          ctx.fillRect(0, 0, W, H);
          ctx.drawImage(img, 0, 0, W, H);
          resolve();
        };
        img.onerror = (e) => reject(e);
        img.src = dataUrl;
      });
    }
  } finally {
    recorder.stop();
  }
  await done;

  const blob = new Blob(chunks, { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function waitFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

let cachedStyles: string | null = null;

/**
 * Collect every readable CSS rule from the document's stylesheets.
 * Cross-origin sheets throw on `.cssRules` — we skip them. Cached for
 * the page's lifetime since stylesheets don't change between record
 * invocations.
 */
function collectInlineStyles(): string {
  if (cachedStyles !== null) return cachedStyles;
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      parts.push(rule.cssText);
    }
  }
  cachedStyles = parts.join("\n");
  return cachedStyles;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * Wrap a cloned DOM subtree in an SVG `<foreignObject>` carrying every
 * same-origin CSS rule inline. The resulting SVG string is suitable for
 * a `data:` URL load through `<img>`. The dark background fill matches
 * the editor theme so transparent regions don't show through.
 */
function serialiseElementWithStyles(target: Element, W: number, H: number): string {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));

  const fo = document.createElementNS(SVG_NS, "foreignObject");
  fo.setAttribute("x", "0");
  fo.setAttribute("y", "0");
  fo.setAttribute("width", String(W));
  fo.setAttribute("height", String(H));

  const xhtmlContainer = document.createElementNS(XHTML_NS, "div");
  xhtmlContainer.setAttribute(
    "style",
    `width:${W}px;height:${H}px;background:#0d0e10;overflow:hidden;`,
  );

  const styleEl = document.createElementNS(XHTML_NS, "style");
  styleEl.textContent = collectInlineStyles();
  xhtmlContainer.appendChild(styleEl);

  const clone = target.cloneNode(true) as Element;
  xhtmlContainer.appendChild(clone);

  fo.appendChild(xhtmlContainer);
  svg.appendChild(fo);

  return new XMLSerializer().serializeToString(svg);
}
