/**
 * Tiny expression evaluator for gate parameters.
 *
 * The user writes things like `π/2`, `θ`, `2*t + π/4`, `sin(t)`. We map
 * Greek letters and a small set of math functions to JS, then compile the
 * expression via `new Function(...)`. Unknown identifiers become free
 * variables whose values come from a scope at call time (zero if missing).
 *
 * This is a trust-the-author tool — the user is editing their own circuit.
 * There is no untrusted input.
 */

const GREEK_TO_ASCII: Array<[string, string]> = [
  ["π", "PI"],     // π → Math.PI handled by JS_FN_REPLACE below
  ["θ", "theta"],
  ["φ", "phi"],
  ["λ", "lambda"],
  ["γ", "gamma"],
  ["β", "beta"],
  ["τ", "tau"],
  ["α", "alpha"],
  ["δ", "delta"],
  ["ω", "omega"],
];

// Names that map to JS Math.* and therefore aren't free variables.
const RESERVED = new Set<string>([
  "PI", "pi", "E", "e",
  "sin", "cos", "tan", "asin", "acos", "atan",
  "sinh", "cosh", "tanh",
  "sqrt", "abs", "exp", "ln", "log", "pow",
  "Math",
]);

const IDENT_RE = /[a-zA-Z_][a-zA-Z0-9_]*/g;

function preprocess(src: string): { js: string; freeVars: string[] } {
  let js = src.trim();
  if (!js) return { js: "0", freeVars: [] };
  for (const [glyph, ascii] of GREEK_TO_ASCII) js = js.split(glyph).join(ascii);

  // Replace math identifiers with their JS Math.* form.
  js = js
    .replace(/\bPI\b/g, "(Math.PI)")
    .replace(/\bpi\b/g, "(Math.PI)")
    .replace(/\bE\b/g, "(Math.E)")
    .replace(/\bsin\b/g, "Math.sin")
    .replace(/\bcos\b/g, "Math.cos")
    .replace(/\btan\b/g, "Math.tan")
    .replace(/\basin\b/g, "Math.asin")
    .replace(/\bacos\b/g, "Math.acos")
    .replace(/\batan\b/g, "Math.atan")
    .replace(/\bsinh\b/g, "Math.sinh")
    .replace(/\bcosh\b/g, "Math.cosh")
    .replace(/\btanh\b/g, "Math.tanh")
    .replace(/\bsqrt\b/g, "Math.sqrt")
    .replace(/\babs\b/g, "Math.abs")
    .replace(/\bexp\b/g, "Math.exp")
    .replace(/\bln\b/g, "Math.log")
    .replace(/\blog\b/g, "Math.log")
    .replace(/\bpow\b/g, "Math.pow");

  const freeVars: string[] = [];
  const seen = new Set<string>();
  for (const m of js.matchAll(IDENT_RE)) {
    const name = m[0];
    if (RESERVED.has(name)) continue;
    if (name.startsWith("Math")) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    freeVars.push(name);
  }
  return { js, freeVars };
}

export function compileExpr(src: string): {
  freeVars: string[];
  eval: (scope: Record<string, number>) => number;
} {
  const { js, freeVars } = preprocess(src);
  let fn: (...args: number[]) => number;
  try {
    fn = new Function(...freeVars, `return (${js});`) as never;
  } catch {
    return { freeVars: [], eval: () => NaN };
  }
  return {
    freeVars,
    eval: (scope) => {
      try {
        const args = freeVars.map((v) => scope[v] ?? 0);
        const r = fn(...args);
        return typeof r === "number" && Number.isFinite(r) ? r : 0;
      } catch {
        return 0;
      }
    },
  };
}

/** Convenience: evaluate once with no caching. */
export function evalExpr(src: string, scope: Record<string, number>): number {
  return compileExpr(src).eval(scope);
}

/** Identifiers referenced by an expression, after Greek and math-name pruning. */
export function detectFreeVars(src: string): string[] {
  return preprocess(src).freeVars;
}
