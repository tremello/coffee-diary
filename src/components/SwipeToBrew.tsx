import { useEffect, useRef, type ReactNode } from "react";

// Swiping a bean card left reveals a brew button (touch only); swiping past half the card starts the brew right away.
// The drag writes the transform straight to the DOM once per frame so React never re-renders mid-gesture.
const SWIPE_ACTION_WIDTH = 92;

const SWIPE_GAP = 10;

const SWIPE_OPEN_OFFSET = SWIPE_ACTION_WIDTH + SWIPE_GAP;

export function SwipeToBrew({ beanId, beanName, disabled, open, onOpenChange, onBrew, children }: { beanId: number; beanName: string; disabled: boolean; open: boolean; onOpenChange: (open: boolean) => void; onBrew: () => void; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; axis: "x" | "y" | null; pointerId: number; offset: number; frame: number; committing: boolean; lastX: number; lastT: number; velocity: number } | null>(null);
  const swiped = useRef(false);
  const commitDistance = () => (rootRef.current?.offsetWidth ?? 320) * 0.55;
  const paint = (offset: number) => {
    const root = rootRef.current, body = bodyRef.current, action = actionRef.current;
    if (!root || !body) return;
    body.style.transform = offset ? `translate3d(${offset}px, 0, 0)` : "";
    if (action) action.style.width = `${Math.max(SWIPE_ACTION_WIDTH, -offset - SWIPE_GAP)}px`;
    root.style.setProperty("--swipe-reveal", String(Math.min(1, -offset / SWIPE_OPEN_OFFSET)));
    const committing = -offset >= commitDistance();
    if (drag.current && committing && !drag.current.committing) navigator.vibrate?.(12);
    if (drag.current) drag.current.committing = committing;
    root.classList.toggle("will-commit", committing);
  };
  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    swiped.current = false;
    if (disabled || event.pointerType === "mouse" || event.clientX < 20) return;
    if ((event.target as HTMLElement).closest(".flavor-tags, .compact-cup-notes, input, textarea, select, .swipe-brew-action")) return;
    drag.current = { x: event.clientX, y: event.clientY, axis: null, pointerId: event.pointerId, offset: open ? -SWIPE_OPEN_OFFSET : 0, frame: 0, committing: false, lastX: event.clientX, lastT: event.timeStamp, velocity: 0 };
  };
  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      // Only a clearly sideways gesture moves the card.
      current.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? "x" : "y";
      if (current.axis === "x") { try { event.currentTarget.setPointerCapture(event.pointerId); } catch {} rootRef.current?.classList.add("is-dragging"); }
    }
    if (current.axis !== "x") return;
    swiped.current = true;
    const elapsed = event.timeStamp - current.lastT;
    if (elapsed > 0) current.velocity = 0.7 * current.velocity + 0.3 * ((event.clientX - current.lastX) / elapsed);
    current.lastX = event.clientX; current.lastT = event.timeStamp;
    const width = rootRef.current?.offsetWidth ?? 320;
    // Past 40% of the card the pull meets resistance, so reaching the brew point takes a deliberate drag.
    const pulled = Math.max(0, -((open ? -SWIPE_OPEN_OFFSET : 0) + dx));
    const soft = width * 0.4;
    current.offset = -Math.min(width, pulled > soft ? soft + (pulled - soft) * 0.6 : pulled);
    if (!current.frame) current.frame = requestAnimationFrame(() => { if (drag.current) { drag.current.frame = 0; paint(drag.current.offset); } });
  };
  const finish = () => {
    const current = drag.current;
    drag.current = null;
    window.setTimeout(() => { swiped.current = false; });
    if (!current || current.axis !== "x") return;
    if (current.frame) cancelAnimationFrame(current.frame);
    rootRef.current?.classList.remove("is-dragging");
    // A fast leftward flick counts as a longer pull: far enough it brews, otherwise it opens.
    const flick = current.velocity < -0.9;
    const width = rootRef.current?.offsetWidth ?? 320;
    if (-current.offset >= commitDistance() || (flick && -current.offset >= width * 0.45)) { paint(-width); onBrew(); return; }
    const willOpen = current.offset < -SWIPE_OPEN_OFFSET * 0.45 || (flick && current.offset < -32);
    paint(willOpen ? -SWIPE_OPEN_OFFSET : 0);
    onOpenChange(willOpen);
  };
  useEffect(() => { if (!drag.current) paint(open ? -SWIPE_OPEN_OFFSET : 0); }, [open]);
  return <div ref={rootRef} className={`swipe-card ${open ? "is-open" : ""}`} data-swipe-id={beanId} onPointerDown={begin} onPointerMove={track} onPointerUp={finish} onPointerCancel={finish}
    onClickCapture={event => { if (swiped.current) { event.stopPropagation(); event.preventDefault(); swiped.current = false; } }}>
    {!disabled && <button ref={actionRef} type="button" className="swipe-brew-action" tabIndex={-1} aria-hidden="true" onClick={onBrew}><img src="/coffee-diary-logo-brown-96.png" width="26" height="26" alt="" /><span className="swipe-brew-label">브루잉</span><span className="swipe-brew-commit">놓으면 브루잉</span></button>}
    <div ref={bodyRef} className="swipe-card-body">{children}</div>
    {!disabled && <button type="button" className="swipe-brew-a11y" onClick={onBrew}>{beanName} 브루잉 기록</button>}
  </div>;
}
