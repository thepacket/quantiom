"""Parse symbolic-parameter strings entered in the client into sympy expressions.

The client allows free-form expressions like `π/2`, `θ`, `2*π/3 + φ`. We map
Greek letters to canonical sympy `Symbol`s whose `latex()` output renders as
`\\theta`, `\\phi`, etc.
"""

from __future__ import annotations

import sympy as sp

# Map from input-name (Latin transliteration or Greek glyph) → canonical sympy Symbol.
# Using Latin names internally means sp.latex() outputs the Greek macro correctly.
SYMBOL_ALIASES: dict[str, sp.Symbol] = {
    name: sp.Symbol(name)
    for name in ["theta", "phi", "lambda_", "gamma", "beta", "tau", "alpha", "delta", "omega"]
}

# Greek glyph → Latin name (used by sympify's `locals=` table after string substitution).
GLYPH_TO_NAME = {
    "θ": "theta",
    "φ": "phi",
    "λ": "lambda_",  # lambda is reserved in Python
    "γ": "gamma",
    "β": "beta",
    "τ": "tau",
    "α": "alpha",
    "δ": "delta",
    "ω": "omega",
    "π": "pi",
}

# Pretty-print canonical names back as Greek when sp.latex sees them.
# sympy.latex already converts Symbol("theta") to "\theta"; for "lambda_" we
# need to rewrite to "\lambda" ourselves at render time (see latex_clean).
_LOCALS: dict[str, sp.Expr] = {
    "pi": sp.pi,
    "e": sp.E,
    "i": sp.I,
    "I": sp.I,
    **SYMBOL_ALIASES,
}


def parse_param(s: str) -> sp.Expr:
    """Parse a user-entered symbolic expression.

    Replaces Greek glyphs with Latin names, then runs through sympy's parser.
    """
    text = s.strip()
    if not text:
        return sp.Integer(0)
    for glyph, name in GLYPH_TO_NAME.items():
        text = text.replace(glyph, name)
    return sp.sympify(text, locals=_LOCALS, evaluate=True)


def latex_clean(latex: str) -> str:
    """Patch sympy's latex output to use Greek for our reserved-name symbols."""
    return latex.replace("lambda_{}", "\\lambda").replace("lambda_", "\\lambda")
