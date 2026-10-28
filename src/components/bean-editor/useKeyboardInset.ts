import { useEffect, useState } from "react";

// iPhone Safari doesn't shrink the page for the keyboard: it lays the keyboard over the bottom and may pan the view up.
// While a sheet is open this tracks the visible area and publishes it as CSS variables on <html>:
//   --kb-top   how far the view is panned down (the sheet layer moves with it, so its top stays on screen)
//   --kb-inset how much of the layer's bottom the keyboard covers (sheets pad their scrolling area by it)
// The sheet surface stays anchored to the bottom, so its background runs on behind the keyboard with no gap.
export type Keyboard = { inset: number; top: number; room: number };

const MARGIN = 16;
let users = 0;

// Keep the focused field clear of the keyboard inside its own scroll area, without scrolling the page.
const revealFocused = () => {
  const field = document.activeElement;
  if (!(field instanceof HTMLElement) || !field.matches("input, textarea, select")) return;
  const area = field.closest<HTMLElement>(".be-pick-scroll, .be-body");
  if (!area) return;
  const box = field.getBoundingClientRect(), view = area.getBoundingClientRect();
  if (box.bottom > view.bottom - MARGIN) area.scrollTop += box.bottom - view.bottom + MARGIN;
  else if (box.top < view.top + MARGIN) area.scrollTop -= view.top + MARGIN - box.top;
};

export function useKeyboardInset() {
  const [keyboard, setKeyboard] = useState<Keyboard | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    users += 1;
    let frame = 0;
    const update = () => {
      if (window.scrollY) window.scrollTo(0, 0);
      const open = window.innerHeight - viewport.height > 80;
      const next = open ? { inset: Math.max(0, window.innerHeight - viewport.height), top: Math.max(0, viewport.offsetTop), room: viewport.height } : null;
      root.style.setProperty("--kb-inset", `${next?.inset ?? 0}px`);
      root.style.setProperty("--kb-top", `${next?.top ?? 0}px`);
      setKeyboard(next);
      cancelAnimationFrame(frame);
      if (next) frame = requestAnimationFrame(revealFocused);
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      users -= 1;
      if (!users) { root.style.removeProperty("--kb-inset"); root.style.removeProperty("--kb-top"); }
    };
  }, []);
  return keyboard;
}
