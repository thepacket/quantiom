import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

type Props = {
  latex: string;
  display?: boolean;
  className?: string;
};

// Dirac / braket notation isn't standard LaTeX — KaTeX has no \ket etc. by
// default. Define the common quantum macros so AI replies and inline math
// using them render correctly everywhere Tex is used.
const QUANTUM_MACROS: Record<string, string> = {
  "\\ket": "\\left|#1\\right\\rangle",
  "\\bra": "\\left\\langle#1\\right|",
  "\\braket": "\\left\\langle#1\\middle|#2\\right\\rangle",
  "\\ketbra": "\\left|#1\\middle\\rangle\\middle\\langle#2\\right|",
  "\\expval": "\\left\\langle#1\\right\\rangle",
  "\\tr": "\\operatorname{Tr}",
};

export function Tex({ latex, display, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, {
        displayMode: display ?? false,
        throwOnError: false,
        strict: "ignore",
        macros: QUANTUM_MACROS,
      });
    } catch {
      // KaTeX shouldn't throw with throwOnError=false, but be defensive.
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex, display]);
  return <span ref={ref} className={className} />;
}
