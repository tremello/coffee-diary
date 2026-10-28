import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

// On phones the settings sheet follows the finger: it opens covering about two thirds of the screen, drags up to full height,
// and closes when pulled down. The handle and title row always drag; the list drags only from its top (pulling down)
// or while the sheet is not yet full (pushing up), and scrolls normally otherwise. Wider screens keep the plain side panel.
type Snap = "half" | "full";

const HALF_SHARE = 0.66;
const CLOSE_MS = 240;
const isPhone = () => !window.matchMedia("(min-width: 720px)").matches;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Drag = { startY: number; startOffset: number; lastY: number; lastTime: number; velocity: number };

export function useSheetDrag(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [phone, setPhone] = useState(isPhone);
  const [snap, setSnap] = useState<Snap>("half");
  const [halfOffset, setHalfOffset] = useState(0);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const drag = useRef<Drag | null>(null);

  // How far the sheet sits below full height when half open; measured after layout and on resize or rotation.
  useLayoutEffect(() => {
    const measure = () => {
      setPhone(isPhone());
      const height = sheetRef.current?.offsetHeight ?? 0;
      setHalfOffset(Math.max(0, height - window.innerHeight * HALF_SHARE));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => { const frame = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(frame); }, []);

  const restOffset = snap === "full" ? 0 : halfOffset;
  const close = () => {
    if (!phone || reducedMotion()) { onClose(); return; }
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  };

  const begin = (y: number) => { drag.current = { startY: y, startOffset: restOffset, lastY: y, lastTime: performance.now(), velocity: 0 }; setDragOffset(restOffset); };
  const move = (y: number) => {
    const current = drag.current;
    if (!current) return;
    const now = performance.now();
    current.velocity = (y - current.lastY) / Math.max(1, now - current.lastTime);
    current.lastY = y; current.lastTime = now;
    const next = current.startOffset + y - current.startY;
    setDragOffset(next < 0 ? next / 4 : next);
  };
  const end = () => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setDragOffset(null);
    // Aim where the flick was heading, then settle on the nearest of full, half and closed.
    const aim = current.startOffset + current.lastY - current.startY + current.velocity * 200;
    const height = sheetRef.current?.offsetHeight ?? 0;
    const targets: [Snap | "closed", number][] = [["full", 0], ["half", halfOffset], ["closed", height]];
    const [target] = targets.reduce((best, next) => Math.abs(next[1] - aim) < Math.abs(best[1] - aim) ? next : best);
    if (target === "closed") close(); else setSnap(target);
  };

  // The list takes over with native touch listeners: React's are passive, and the page must not scroll while the sheet moves.
  const latest = useRef({ begin, move, end, snap, phone });
  latest.current = { begin, move, end, snap, phone };
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    let startY = 0, dragging = false;
    const onStart = (event: TouchEvent) => { startY = event.touches[0].clientY; dragging = false; };
    const onMove = (event: TouchEvent) => {
      const { begin, move, snap, phone } = latest.current;
      if (!phone) return;
      const y = event.touches[0].clientY, dy = y - startY;
      if (!dragging && ((body.scrollTop <= 0 && dy > 6) || (snap === "half" && dy < -6))) { dragging = true; begin(startY); }
      if (dragging) { event.preventDefault(); move(y); }
    };
    const onEnd = () => { if (dragging) { dragging = false; latest.current.end(); } };
    body.addEventListener("touchstart", onStart, { passive: true });
    body.addEventListener("touchmove", onMove, { passive: false });
    body.addEventListener("touchend", onEnd);
    body.addEventListener("touchcancel", onEnd);
    return () => {
      body.removeEventListener("touchstart", onStart);
      body.removeEventListener("touchmove", onMove);
      body.removeEventListener("touchend", onEnd);
      body.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  // Handle and title row: pointer events cover touch and mouse; taps on the close button pass through.
  const handleProps = phone ? {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest("button")) return; event.currentTarget.setPointerCapture(event.pointerId); begin(event.clientY); },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => move(event.clientY),
    onPointerUp: end,
    onPointerCancel: end,
  } : {};

  const sheetStyle: CSSProperties | undefined = phone ? {
    transform: !shown || closing ? "translateY(100%)" : `translateY(${dragOffset ?? restOffset}px)`,
    transition: dragOffset !== null || reducedMotion() ? "none" : `transform ${CLOSE_MS}ms cubic-bezier(.2, .8, .2, 1)`,
  } : undefined;
  const backdropStyle: CSSProperties | undefined = phone ? { opacity: !shown || closing ? 0 : 1, transition: `opacity ${CLOSE_MS}ms` } : undefined;

  return { sheetRef, bodyRef, handleProps, sheetStyle, backdropStyle, close, expanded: !phone || snap === "full" };
}
