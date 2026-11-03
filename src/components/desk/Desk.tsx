import { type ReactNode, useEffect, useState } from "react";

// Wide desktop windows get the two-pane layout (list on the left, the picked item on the right); narrower ones keep the phone layout.
export const DESK_QUERY = "(min-width: 1100px)";

export function useDesk() {
  const [desk, setDesk] = useState(() => window.matchMedia(DESK_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(DESK_QUERY);
    const onChange = () => setDesk(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return desk;
}

// Keyboard on the desk layout: / search, N add, E edit, ↑↓ move through the list. Never while typing or while a sheet is open.
export function useDeskKeys(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector(".be-layer, [role='dialog']")) return;
      const key = event.key;
      if (key === "/") {
        const input = document.querySelector<HTMLInputElement>(".desk-search input");
        if (input) { event.preventDefault(); input.focus(); }
      } else if (key === "n" || key === "N") {
        const add = document.querySelector<HTMLButtonElement>("[data-desk-add]");
        if (add) { event.preventDefault(); add.click(); }
      } else if (key === "e" || key === "E") {
        const edit = document.querySelector<HTMLButtonElement>("[data-desk-edit]");
        if (edit) { event.preventDefault(); edit.click(); }
      } else if (key === "ArrowDown" || key === "ArrowUp") {
        const items = [...document.querySelectorAll<HTMLButtonElement>(".desk-list [data-desk-item]")];
        if (!items.length) return;
        event.preventDefault();
        const at = items.findIndex(item => item.getAttribute("aria-current") === "true");
        const next = items[Math.min(items.length - 1, Math.max(0, at < 0 ? 0 : at + (key === "ArrowDown" ? 1 : -1)))];
        next.click();
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: "nearest" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

export const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>;

// The row above the two panes: a short search box over the list, a summary or filter beside it, and the page's buttons at the right.
export function DeskToolbar({ search, middle, actions }: { search: ReactNode; middle?: ReactNode; actions: ReactNode }) {
  return <div className="desk-toolbar">
    <div className="desk-toolbar-search">{search}</div>
    <div className="desk-toolbar-middle">{middle}</div>
    <div className="desk-toolbar-actions">{actions}</div>
  </div>;
}

export function DeskSearch({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return <label className="desk-search bean-search">
    <SearchIcon />
    <span className="sr-only">{label}</span>
    <input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    {!value && <kbd aria-hidden="true">/</kbd>}
  </label>;
}

export type StartStep = { label: string; hint: string; done: boolean; action?: { label: string; onClick: () => void } };

// What a first-time user sees in place of an empty list: three steps on the left, a faded example of the filled page on the right.
export function DeskStart({ steps, extra, example }: { steps: StartStep[]; extra?: ReactNode; example: ReactNode }) {
  const current = steps.findIndex(step => !step.done);
  return <div className="desk-split desk-start">
    <div className="desk-start-steps">
      <div>
        <h2>커피 다이어리를 시작해요</h2>
        <p>세 단계만 하면 기록이 쌓이기 시작해요.</p>
      </div>
      <ol>
        {steps.map((step, index) => <li key={step.label} className={step.done ? "is-done" : index === current ? "is-current" : undefined}>
          <span className="desk-start-num" aria-hidden="true">{step.done ? "✓" : index + 1}</span>
          <span className="desk-start-text"><b>{step.label}</b><span>{step.hint}</span></span>
          {step.action && !step.done && <button type="button" className={index === current ? "primary-button" : "quiet-button"} onClick={step.action.onClick}>{step.action.label}</button>}
        </li>)}
      </ol>
      {extra && <div className="desk-start-extra">{extra}</div>}
    </div>
    <div className="desk-panel desk-start-example" aria-hidden="true">
      <span className="desk-start-badge">예시 · 등록하면 이렇게 보여요</span>
      <div className="desk-start-ghost" aria-hidden="true">{example}</div>
    </div>
  </div>;
}

// A label/value tile in the detail pane's grid.
export function Tile({ label, value }: { label: string; value: ReactNode }) {
  return <div className="desk-tile"><small>{label}</small><b>{value}</b></div>;
}

/* Ref callback: keep a desk list to `count` rows tall (rest scrolls inside). Sets --desk-list-cap on the list; CSS still caps it to the window. */
export function capListRows(count: number) {
  return (list: HTMLElement | null) => {
    if (!list) return;
    const fit = () => {
      const rows = list.querySelectorAll<HTMLElement>("[data-desk-item]");
      rows.forEach(row => resize.observe(row)); // rows can grow after fonts load while the capped list keeps its size
      if (rows.length <= count) { list.style.removeProperty("--desk-list-cap"); return; }
      const style = getComputedStyle(list);
      const edge = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + list.offsetHeight - list.clientHeight;
      const last = rows[count - 1];
      list.style.setProperty("--desk-list-cap", `${Math.ceil(last.offsetTop + last.offsetHeight - rows[0].offsetTop + edge)}px`);
    };
    const resize = new ResizeObserver(() => fit());
    resize.observe(list);
    fit();
    const mutate = new MutationObserver(fit);
    mutate.observe(list, { childList: true });
    return () => { resize.disconnect(); mutate.disconnect(); };
  };
}
