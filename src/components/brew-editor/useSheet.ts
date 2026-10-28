import { useEffect, useRef, useState, type PointerEvent } from "react";

// Shared behaviour of the brew sheets (same feel as the bean editor): on phones the panel slides down when closed and
// can be dragged down by its top; Escape closes it (unless onEscape handled it first) and the page behind stops scrolling.
export function useSheet(onClose: () => void, onEscape?: () => boolean) {
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement & HTMLFormElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number; v: number } | null>(null);

  const isSheet = () => window.matchMedia("(max-width: 759px)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dismiss = (then: () => void = onClose) => {
    if (closing) return;
    if (!isSheet()) { then(); return; }
    setClosing(true);
    window.setTimeout(then, 240);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (closing || !isSheet() || (event.target as HTMLElement).closest("button, input, a")) return;
    drag.current = { y: event.clientY, t: event.timeStamp, dy: 0, v: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current, panel = panelRef.current;
    if (!current || !panel) return;
    const dy = Math.max(0, event.clientY - current.y);
    current.v = (dy - current.dy) / Math.max(1, event.timeStamp - current.t);
    current.dy = dy;
    current.t = event.timeStamp;
    panel.style.transition = "none";
    panel.style.transform = `translateY(${dy}px)`;
    if (backdropRef.current) backdropRef.current.style.opacity = String(1 - Math.min(1, dy / panel.offsetHeight));
  };
  const onPointerUp = () => {
    const current = drag.current, panel = panelRef.current;
    drag.current = null;
    if (!current || !panel) return;
    panel.style.transition = "";
    panel.style.transform = "";
    if (backdropRef.current) backdropRef.current.style.opacity = "";
    if (current.dy > 120 || (current.dy > 20 && current.v > 0.6)) dismiss();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !onEscape?.()) dismiss(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, []);

  return {
    closing,
    dismiss,
    panelRef,
    backdropRef,
    onBackdropClick: () => { if (isSheet()) dismiss(); },
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }
  };
}
