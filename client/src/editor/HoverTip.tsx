import { useEffect, useState } from "react";

type Tip = { text: string; x: number; y: number };

/**
 * Instant hover tooltip. A single document-level listener shows a
 * fixed-position tooltip for any element carrying a `data-tip` attribute —
 * with *no* delay (unlike the native `title` attribute, which waits ~1 s) and
 * without being clipped by scroll containers or SVG bounds. Works for both
 * HTML (the gate palette) and SVG (the canvas gates).
 *
 * Mount once near the app root; elements opt in by setting `data-tip="…"`.
 */
export function HoverTip() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    const closestTip = (t: EventTarget | null): Element | null =>
      t instanceof Element ? t.closest("[data-tip]") : null;

    const onOver = (e: MouseEvent) => {
      const el = closestTip(e.target);
      const text = el?.getAttribute("data-tip");
      if (!el || !text) { setTip(null); return; }
      const r = el.getBoundingClientRect();
      setTip({ text, x: r.left, y: r.bottom + 6 });
    };
    const onOut = (e: MouseEvent) => {
      if (closestTip(e.target) && closestTip(e.target) !== closestTip(e.relatedTarget)) setTip(null);
    };
    const hide = () => setTip(null);

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("mousedown", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("mousedown", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  if (!tip) return null;
  // Left-anchored to the element, clamped so a 280px-max tooltip stays
  // on-screen (centering would clip tooltips on left-edge palette tiles).
  const x = Math.max(8, Math.min(window.innerWidth - 290, tip.x));
  return (
    <div className="hovertip" style={{ left: x, top: tip.y }}>
      {tip.text}
    </div>
  );
}
