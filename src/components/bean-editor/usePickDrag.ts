import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useKeyboardInset } from "./useKeyboardInset";

// Picker sheets on phones open at half the screen and keep that height whatever the list holds (filtering never shrinks
// them). Dragging the handle or title row up fills the form; pulling down closes. The list drags only from its top
// (pulling down) or while half open (pushing up), and scrolls normally otherwise. Wider screens keep the centred dialog.
// While the iPhone keyboard is up the sheet stays anchored to the bottom (its background runs on behind the keyboard) and
// grows by the keyboard's height, so the part above the keyboard keeps the same size; see useKeyboardInset.
type Snap = "half" | "full";

const CLOSE_MS = 240;
const FULL_GAP = 8;
const isPhone = () => !window.matchMedia("(min-width: 760px)").matches;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Drag = { startY: number; startHeight: number; lastY: number; lastTime: number; velocity: number };

export function usePickDrag(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [phone, setPhone] = useState(isPhone);
  const [snap, setSnap] = useState<Snap>("half");
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const keyboard = useKeyboardInset();
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const update = () => setPhone(isPhone());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const heights = () => {
    const room = sheetRef.current?.parentElement?.clientHeight ?? window.innerHeight;
    return { half: Math.min(window.innerHeight / 2, room - FULL_GAP), full: room - FULL_GAP };
  };
  const close = () => {
    if (!phone || reducedMotion()) { onClose(); return; }
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  };

  const begin = (y: number) => { const height = sheetRef.current?.offsetHeight ?? heights().half; drag.current = { startY: y, startHeight: height, lastY: y, lastTime: performance.now(), velocity: 0 }; setDragHeight(height); };
  const move = (y: number) => {
    const current = drag.current;
    if (!current) return;
    const now = performance.now();
    current.velocity = (y - current.lastY) / Math.max(1, now - current.lastTime);
    current.lastY = y; current.lastTime = now;
    const { full } = heights();
    const next = current.startHeight - (y - current.startY);
    setDragHeight(Math.max(0, next > full ? full + (next - full) / 4 : next));
  };
  const end = () => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setDragHeight(null);
    // Aim where the flick was heading, then settle on the nearest of full, half and closed.
    const aim = current.startHeight - (current.lastY - current.startY) - current.velocity * 200;
    const { half, full } = heights();
    const targets: [Snap | "closed", number][] = [["full", full], ["half", half], ["closed", 0]];
    const [target] = targets.reduce((best, next) => Math.abs(next[1] - aim) < Math.abs(best[1] - aim) ? next : best);
    if (target === "closed") close(); else setSnap(target);
  };

  // The list takes over with native touch listeners: React's are passive, and the form must not scroll while the sheet moves.
  const latest = useRef({ begin, move, end, snap, phone });
  latest.current = { begin, move, end, snap, phone };
  useEffect(() => {
    const body = scrollRef.current;
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

  // Handle and title row: pointer events cover touch and mouse; taps on buttons pass through.
  const handleProps = phone ? {
    style: { touchAction: "none" } as CSSProperties,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest("button")) return; event.currentTarget.setPointerCapture(event.pointerId); begin(event.clientY); },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => move(event.clientY),
    onPointerUp: end,
    onPointerCancel: end,
  } : {};

  const restHeight = keyboard ? (snap === "full" ? heights().full : Math.min(window.innerHeight / 2 + keyboard.inset, heights().full)) : snap === "full" ? `calc(100% - ${FULL_GAP}px)` : `min(50vh, calc(100% - ${FULL_GAP}px))`;
  const sheetStyle: CSSProperties | undefined = phone ? {
    height: dragHeight ?? restHeight,
    transform: closing ? "translateY(100%)" : undefined,
    transition: dragHeight !== null || reducedMotion() ? "none" : `height ${CLOSE_MS}ms cubic-bezier(.2, .8, .2, 1), transform ${CLOSE_MS}ms cubic-bezier(.4, 0, 1, 1)`,
  } : undefined;
  const backdropStyle: CSSProperties | undefined = phone ? { opacity: closing ? 0 : 1, transition: `opacity ${CLOSE_MS}ms` } : undefined;

  return { sheetRef, scrollRef, handleProps, sheetStyle, backdropStyle, close };
}
