import { useEffect, useRef, type PointerEvent } from "react";

// On phones the settings sheet slides up to full height and follows the finger: drag the handle or title row down, or pull the list
// down from its top, and it closes once past about a quarter of its height or on a quick flick; otherwise it springs back.
// Positions are written straight to the element during a drag so every frame is cheap; wider screens keep the plain side panel.
const OPEN_MS = 460;
const CLOSE_MS = 340;
const SETTLE_MS = 380;
// The ease iOS uses for its own sheets: a quick start that glides into place.
const EASE = "cubic-bezier(.32, .72, 0, 1)";
const isPhone = () => !window.matchMedia("(min-width: 720px)").matches;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Drag = { startY: number; offset: number; lastY: number; lastTime: number; velocity: number };

export function useSheetDrag(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const closing = useRef(false);
  const frame = useRef(0);

  // offset is pixels below the open position, or null for fully hidden; ms 0 moves without animating.
  const place = (offset: number | null, ms: number) => {
    const sheet = sheetRef.current, backdrop = backdropRef.current;
    if (!sheet) return;
    const height = sheet.offsetHeight || 1;
    const duration = reducedMotion() ? 0 : ms;
    sheet.style.transition = duration ? `transform ${duration}ms ${EASE}` : "none";
    sheet.style.transform = offset === null ? "translateY(100%)" : `translateY(${offset}px)`;
    if (backdrop) {
      backdrop.style.transition = duration ? `opacity ${duration}ms ${EASE}` : "none";
      backdrop.style.opacity = String(offset === null ? 0 : Math.max(0, 1 - offset / height));
    }
  };

  useEffect(() => {
    if (!isPhone()) return;
    place(null, 0);
    // Two frames so the hidden position is painted before the slide starts.
    const first = requestAnimationFrame(() => { frame.current = requestAnimationFrame(() => place(0, OPEN_MS)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(frame.current); };
  }, []);

  const close = (velocity = 0) => {
    if (closing.current) return;
    if (!isPhone() || reducedMotion()) { onClose(); return; }
    closing.current = true;
    // A fast flick finishes as fast as it was thrown, never slower than the normal close.
    const sheet = sheetRef.current, height = sheet?.offsetHeight ?? 0, offset = drag.current?.offset ?? 0;
    const ms = velocity > 0 ? Math.max(180, Math.min(CLOSE_MS, (height - offset) / velocity)) : CLOSE_MS;
    place(null, ms);
    window.setTimeout(onClose, ms);
  };

  const begin = (y: number) => { if (!closing.current) drag.current = { startY: y, offset: 0, lastY: y, lastTime: performance.now(), velocity: 0 }; };
  const move = (y: number) => {
    const current = drag.current;
    if (!current) return;
    const now = performance.now();
    current.velocity = 0.8 * ((y - current.lastY) / Math.max(1, now - current.lastTime)) + 0.2 * current.velocity;
    current.lastY = y; current.lastTime = now;
    const dy = y - current.startY;
    // Above the open position it only gives a little, like a rubber band.
    current.offset = dy >= 0 ? dy : -Math.sqrt(-dy) * 2;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => place(current.offset, 0));
  };
  const end = () => {
    const current = drag.current;
    if (!current) return;
    cancelAnimationFrame(frame.current);
    const height = sheetRef.current?.offsetHeight ?? 0;
    // A finger that stopped before lifting has no flick left in it.
    const velocity = performance.now() - current.lastTime > 80 ? 0 : current.velocity;
    if (current.offset > height * 0.25 || (velocity > 0.5 && current.offset > 20)) close(velocity);
    else place(0, SETTLE_MS);
    drag.current = null;
  };

  // The list takes over with native touch listeners: React's are passive, and the list must not scroll while the sheet moves.
  const latest = useRef({ begin, move, end });
  latest.current = { begin, move, end };
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    let startY = 0, dragging = false;
    const onStart = (event: TouchEvent) => { startY = event.touches[0].clientY; dragging = false; };
    const onMove = (event: TouchEvent) => {
      if (!isPhone()) return;
      const y = event.touches[0].clientY;
      if (!dragging && body.scrollTop <= 0 && y - startY > 6) { dragging = true; latest.current.begin(startY); }
      if (dragging) { event.preventDefault(); latest.current.move(y); }
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
  const handleProps = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => { if (!isPhone() || (event.target as HTMLElement).closest("button")) return; event.currentTarget.setPointerCapture(event.pointerId); begin(event.clientY); },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => move(event.clientY),
    onPointerUp: end,
    onPointerCancel: end,
  };

  return { sheetRef, bodyRef, backdropRef, handleProps, close: () => close() };
}
