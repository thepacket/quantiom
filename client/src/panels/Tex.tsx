import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

type Props = {
  latex: string;
  display?: boolean;
  className?: string;
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
      });
    } catch {
      // KaTeX shouldn't throw with throwOnError=false, but be defensive.
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex, display]);
  return <span ref={ref} className={className} />;
}
