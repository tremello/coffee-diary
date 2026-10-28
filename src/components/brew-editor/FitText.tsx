import { useLayoutEffect, useRef } from "react";

// One line of text that shrinks 1px at a time until it fits its width, down to `min`; past that it wraps instead.
export function FitText({ text, min = 11, className }: { text: string; min?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      el.style.whiteSpace = "nowrap";
      for (let size = parseFloat(getComputedStyle(el).fontSize); el.scrollWidth > el.clientWidth; size -= 1) {
        if (size <= min) { el.style.whiteSpace = "normal"; return; }
        el.style.fontSize = `${size - 1}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (el.parentElement) observer.observe(el.parentElement);
    document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [text, min]);
  return <span ref={ref} className={className}>{text}</span>;
}
