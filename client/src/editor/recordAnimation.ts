import type { ParameterValues } from "../sim/simulate";

/**
 * Record the circuit canvas as a WebM video while the `t` parameter
 * sweeps one period (0 → 2π).
 *
 * Pipeline:
 *   1. Locate the canvas SVG element.
 *   2. Allocate an offscreen <canvas> of matching pixel dimensions.
 *   3. Open a captureStream() + MediaRecorder pair.
 *   4. Step `t` across the period in `totalFrames` increments. After
 *      each step, wait one rAF for React to re-render, serialise the
 *      SVG to a data URL, paint it onto the canvas.
 *   5. Stop the recorder, blob → object URL → trigger download.
 *
 * Browser support: MediaRecorder + video/webm work in Chromium and
 * Firefox; Safari is patchier. The function throws when MediaRecorder
 * is missing so the UI can offer an alert instead of failing silently.
 */
export async function recordAnimationWebM(opts: {
  setParamValues: (v: ParameterValues) => void;
  currentParams: ParameterValues;
  duration_ms: number;
  fps: number;
  filename: string;
}): Promise<void> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }
  const svg = document.querySelector<SVGSVGElement>(".canvas__svg");
  if (!svg) throw new Error("circuit canvas not found");

  const bbox = svg.getBoundingClientRect();
  const W = Math.max(160, Math.floor(bbox.width));
  const H = Math.max(160, Math.floor(bbox.height));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  const stream = canvas.captureStream(opts.fps);
  // Prefer VP9 then VP8 then default — VP9 has noticeably smaller files.
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
      // Wait two animation frames so the simulator + render finishes.
      await waitFrame();
      await waitFrame();
      // Render SVG → canvas.
      const serialised = new XMLSerializer().serializeToString(svg);
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
