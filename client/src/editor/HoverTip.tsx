import { useEffect, useRef, useState } from "react";

type Tip = { text: string; x: number; y: number };

const SHOW_DELAY_MS = 500;

/**
 * Hover tooltip with a 500 ms delay. A single document-level listener shows a
 * fixed-position tooltip for any element carrying a `data-tip` attribute,
 * without being clipped by scroll containers or SVG bounds. Works for both
 * HTML (the gate palette) and SVG (the canvas gates).
 *
 * Mount once near the app root; elements opt in by setting `data-tip="…"`.
 */
export function HoverTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const closestTip = (t: EventTarget | null): Element | null =>
      t instanceof Element ? t.closest("[data-tip]") : null;
    const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

    const onOver = (e: MouseEvent) => {
      const el = closestTip(e.target);
      const text = el?.getAttribute("data-tip");
      clearTimer();
      if (!el || !text) { setTip(null); return; }
      const r = el.getBoundingClientRect();
      const pending: Tip = { text, x: r.left, y: r.bottom + 6 };
      // Wait SHOW_DELAY_MS before showing — a brief pass-over shouldn't pop a tip.
      timer.current = setTimeout(() => setTip(pending), SHOW_DELAY_MS);
    };
    const onOut = (e: MouseEvent) => {
      if (closestTip(e.target) && closestTip(e.target) !== closestTip(e.relatedTarget)) {
        clearTimer();
        setTip(null);
      }
    };
    const hide = () => { clearTimer(); setTip(null); };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("mousedown", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      clearTimer();
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
