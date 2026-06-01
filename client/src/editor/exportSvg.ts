/**
 * Export the current circuit canvas as a standalone SVG file.
 *
 * The on-screen SVG references CSS class selectors defined in styles.css.
 * The downloaded file has to be viewable in isolation, so we clone the
 * node, embed the relevant styles as an inline <style> block, and prepend
 * a background rect that matches the editor's dark theme.
 */

const EMBEDDED_STYLES = `
.canvas__wire { stroke: #4a5260; stroke-width: 1.5; fill: none; }
.canvas__wire--cl { stroke: #6b7384; stroke-width: 1; fill: none; }
.canvas__label { fill: #8a93a3; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; }
.canvas__label--cl { fill: #6b7384; }
.canvas__drop-preview { fill: rgba(124, 196, 255, 0.12); stroke: #7cc4ff; stroke-dasharray: 4 3; stroke-width: 1; }
.gate { --cat-color: #3a4250; }
.gate[data-cat="identity-pauli"]      { --cat-color: #7a8fa8; }
.gate[data-cat="clifford-t"]          { --cat-color: #5fa8c5; }
.gate[data-cat="phase-rotation"]      { --cat-color: #9fa3ff; }
.gate[data-cat="general-u"]           { --cat-color: #c98aff; }
.gate[data-cat="two-qubit-clifford"]  { --cat-color: #c4a96d; }
.gate[data-cat="controlled-rotation"] { --cat-color: #d99a55; }
.gate[data-cat="ising-native"]        { --cat-color: #d97560; }
.gate[data-cat="three-qubit"]         { --cat-color: #d97fb8; }
.gate[data-cat="multi-controlled"]    { --cat-color: #b85ec7; }
.gate[data-cat="state-prep"]          { --cat-color: #6dc4a4; }
.gate[data-cat="non-unitary"]         { --cat-color: #c47878; }
.gate[data-cat="control-flow"]        { --cat-color: #d4c267; }
.gate[data-cat="marker"]              { --cat-color: #6e7888; }
.gate__connector { stroke: var(--cat-color); stroke-width: 1.4; fill: none; }
.gate__control { fill: var(--cat-color); stroke: none; }
.gate__box { fill: #1c2129; stroke: var(--cat-color); stroke-width: 1.4; }
.gate__box--target { fill: transparent; stroke: var(--cat-color); stroke-width: 1.4; }
.gate__box--measure { fill: #1c2129; stroke: var(--cat-color); stroke-width: 1.4; }
.gate__box--reset { fill: #1c2129; stroke: var(--cat-color); stroke-width: 1.4; }
.gate__box--state { fill: #1c2129; stroke: var(--cat-color); stroke-width: 1.4; }
.gate__box--delay { fill: #1c2129; stroke: var(--cat-color); stroke-width: 1.4; }
.gate__cross { stroke: var(--cat-color); stroke-width: 1.5; fill: none; }
.gate__meter { stroke: var(--cat-color); stroke-width: 1.4; fill: none; }
.gate__barrier { stroke: var(--cat-color); stroke-width: 1.5; stroke-dasharray: 3 3; fill: none; }
.gate__label { fill: #e6e8ec; font-family: ui-monospace, monospace; font-size: 13px; }
.gate__cl-link { stroke: #6b7384; stroke-width: 1; fill: none; }
`;

const BG_COLOUR = "#0c0e12";

/** Slugify a name for a download filename. */
function slug(name: string | undefined): string {
  const s = (name ?? "circuit")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "circuit";
}

export function downloadCanvasSvg(circuitName: string | undefined): void {
  const svg = document.querySelector(".canvas__svg") as SVGSVGElement | null;
  if (!svg) {
    window.alert("No canvas to export.");
    return;
  }
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("version", "1.1");

  // Pull the width/height the canvas reports so the SVG is self-sized.
  const w = svg.getAttribute("width") ?? "1000";
  const h = svg.getAttribute("height") ?? "400";
  clone.setAttribute("width", w);
  clone.setAttribute("height", h);

  // Background rectangle so the dark theme survives on white-background viewers.
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", BG_COLOUR);
  clone.insertBefore(bg, clone.firstChild);

  // Inline the styles needed to render the gate visuals standalone.
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = EMBEDDED_STYLES;
  clone.insertBefore(style, clone.firstChild);

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = slug(circuitName) + ".svg";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
