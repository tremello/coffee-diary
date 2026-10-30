import { useEffect, useRef, type ReactNode } from "react";

// Swiping a bean card left reveals a brew button (touch only); pulling well past half the card starts the brew right away.
// Everything mid-gesture is transform-only: no React state, no layout reads, one DOM write per frame,
// and releases settle with a spring that picks up the finger's speed.
const SWIPE_ACTION_WIDTH = 92;

const SWIPE_GAP = 10;

const SWIPE_OPEN_OFFSET = SWIPE_ACTION_WIDTH + SWIPE_GAP;

// Resistance starts at 40% of the card and grows smoothly (no kink); with this curve the finger travels ~64% of the card to brew.
const RESISTANCE_START = 0.4;
const COMMIT_RATIO = 0.57;

const rubberBand = (pulled: number, width: number) => {
  const soft = width * RESISTANCE_START;
  if (pulled <= soft) return pulled;
  const limit = width - soft;
  const extra = pulled - soft;
  return soft + limit * extra / (extra + limit);
};

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

type Drag = { pointerId: number; x: number; y: number; axis: "x" | "y" | null; start: number; offset: number; frame: number; lastX: number; lastT: number; velocity: number };

export function SwipeToBrew({ beanId, beanName, disabled, open, onOpenChange, onBrew, className = "", children }: { beanId: number; beanName: string; disabled: boolean; open: boolean; onOpenChange: (open: boolean) => void; onBrew: () => void; className?: string; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const settle = useRef(0);
  const shown = useRef(0);
  const width = useRef(320);
  const committing = useRef(false);
  const swiped = useRef(false);
  // The brew button spans the card behind it and slides in from the right, its leading edge kept SWIPE_GAP behind the card.
  const paint = (offset: number) => {
    const root = rootRef.current, body = bodyRef.current, action = actionRef.current;
    if (!root || !body) return;
    shown.current = offset;
    body.style.transform = offset ? `translate3d(${offset}px, 0, 0)` : "";
    if (action) action.style.transform = `translate3d(${Math.min(width.current - SWIPE_ACTION_WIDTH, width.current + offset + SWIPE_GAP)}px, 0, 0)`;
    // Set on the button, not the card, so each frame only restyles the button's face.
    action?.style.setProperty("--swipe-reveal", (Math.min(1, Math.max(0, -offset / SWIPE_OPEN_OFFSET))).toFixed(3));
    const willCommit = -offset >= width.current * COMMIT_RATIO;
    if (willCommit !== committing.current) {
      committing.current = willCommit;
      root.classList.toggle("will-commit", willCommit);
      if (willCommit && drag.current) navigator.vibrate?.(10);
    }
  };
  const setMoving = (moving: boolean) => rootRef.current?.classList.toggle("is-moving", moving);
  const stopSettle = () => { if (settle.current) cancelAnimationFrame(settle.current); settle.current = 0; };
  // A lightly damped spring toward the target, seeded with the release velocity (px/ms).
  const springTo = (target: number, velocity: number) => {
    stopSettle();
    if (prefersReducedMotion()) { paint(target); setMoving(false); return; }
    setMoving(true);
    let position = shown.current, speed = velocity, last = performance.now();
    const step = (now: number) => {
      let elapsed = Math.min(64, now - last);
      last = now;
      while (elapsed > 0) {
        const dt = Math.min(4, elapsed);
        speed += (-0.00035 * (position - target) - 0.035 * speed) * dt;
        position += speed * dt;
        elapsed -= dt;
      }
      if (Math.abs(position - target) < 0.5 && Math.abs(speed) < 0.02) {
        paint(target);
        settle.current = 0;
        setMoving(false);
        return;
      }
      paint(position);
      settle.current = requestAnimationFrame(step);
    };
    settle.current = requestAnimationFrame(step);
  };
  // Brewing: the card slides fully out with an ease-out before the brew tab takes over.
  const slideOutThenBrew = () => {
    stopSettle();
    const target = -(width.current + SWIPE_GAP);
    if (prefersReducedMotion()) { paint(target); onBrew(); return; }
    setMoving(true);
    rootRef.current?.classList.add("is-leaving");
    const from = shown.current, start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 200);
      paint(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) { settle.current = requestAnimationFrame(step); return; }
      settle.current = 0;
      onBrew();
    };
    settle.current = requestAnimationFrame(step);
  };
  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    swiped.current = false;
    if (disabled || event.pointerType === "mouse" || event.clientX < 20) return;
    if ((event.target as HTMLElement).closest(".flavor-tags, .compact-cup-notes, input, textarea, select, .swipe-brew-action")) return;
    width.current = rootRef.current?.offsetWidth ?? width.current;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, axis: null, start: 0, offset: shown.current, frame: 0, lastX: event.clientX, lastT: event.timeStamp, velocity: 0 };
  };
  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.axis) {
      const dx = event.clientX - current.x, dy = event.clientY - current.y;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      // Only a clearly sideways gesture moves the card.
      current.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? "x" : "y";
      if (current.axis !== "x") return;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      stopSettle();
      setMoving(true);
      // Pick the card up wherever it is (even mid-spring) so grabbing it never jumps.
      current.x = event.clientX;
      current.start = shown.current;
      current.lastX = event.clientX; current.lastT = event.timeStamp;
    }
    if (current.axis !== "x") return;
    swiped.current = true;
    const elapsed = event.timeStamp - current.lastT;
    if (elapsed > 0) current.velocity = 0.7 * current.velocity + 0.3 * ((event.clientX - current.lastX) / elapsed);
    current.lastX = event.clientX; current.lastT = event.timeStamp;
    const pulled = Math.max(0, -(current.start + event.clientX - current.x));
    current.offset = -Math.min(width.current, rubberBand(pulled, width.current));
    if (!current.frame) current.frame = requestAnimationFrame(() => { if (drag.current) { drag.current.frame = 0; paint(drag.current.offset); } });
  };
  const finish = () => {
    const current = drag.current;
    drag.current = null;
    window.setTimeout(() => { swiped.current = false; });
    if (!current || current.axis !== "x") return;
    if (current.frame) cancelAnimationFrame(current.frame);
    paint(current.offset);
    // A fast leftward flick counts as a longer pull: far enough it brews, otherwise it opens.
    const flick = current.velocity < -0.9;
    if (-current.offset >= width.current * COMMIT_RATIO || (flick && -current.offset >= width.current * 0.45)) { slideOutThenBrew(); return; }
    const willOpen = current.offset < -SWIPE_OPEN_OFFSET * 0.45 || (flick && current.offset < -32);
    springTo(willOpen ? -SWIPE_OPEN_OFFSET : 0, current.velocity);
    onOpenChange(willOpen);
  };
  useEffect(() => {
    if (drag.current || settle.current) return;
    width.current = rootRef.current?.offsetWidth ?? width.current;
    if (shown.current === 0 && !open) { paint(0); return; }
    springTo(open ? -SWIPE_OPEN_OFFSET : 0, 0);
  }, [open]);
  useEffect(() => stopSettle, []);
  return <div ref={rootRef} className={`swipe-card ${className} ${open ? "is-open" : ""}`} data-swipe-id={beanId} onPointerDown={begin} onPointerMove={track} onPointerUp={finish} onPointerCancel={finish}
    onClickCapture={event => { if (swiped.current) { event.stopPropagation(); event.preventDefault(); swiped.current = false; } }}>
    {!disabled && <div className="swipe-brew-clip" aria-hidden="true"><button ref={actionRef} type="button" className="swipe-brew-action" tabIndex={-1} onClick={onBrew}><span className="swipe-brew-face"><img src="/coffee-diary-logo-brown-96.png" width="26" height="26" alt="" /><span className="swipe-brew-labels"><span className="swipe-brew-label">브루잉</span><span className="swipe-brew-commit">놓으면 브루잉</span></span></span></button></div>}
    <div ref={bodyRef} className="swipe-card-body">{children}</div>
    {!disabled && <button type="button" className="swipe-brew-a11y" onClick={onBrew}>{beanName} 브루잉 기록</button>}
  </div>;
}
