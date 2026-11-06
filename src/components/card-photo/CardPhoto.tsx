import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { type CardPhoto } from "../../types";
import { type CardSource, cardBlob, cardUrl, closeCardSource, openCardSource } from "../../lib/cardPhoto";
import { PHOTO_ACCEPT } from "../../lib/photo";
import { CardCropper } from "./CardCropper";
import { stopBubbling } from "./stopBubbling";

// The picture icon (rounded frame, sun, hills) put right after a name when that bean or record has a card photo.
export const CardPhotoIcon = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l4.6-4.4a1.2 1.2 0 0 1 1.6 0L14 16l2.2-2a1.2 1.2 0 0 1 1.6 0L20 16" /></svg>;

// Picking a photo (or the saved one again) → corner step → upload. One hook so the editors and the viewer share it.
// For the one-photo flow, `status` (the label reading's progress) shows in the corner step, `onInfoOnly` adds
// "정보만 쓰기", and `onCancel` runs when the step is cancelled.
export function useCardFlow(onSaved: (card: CardPhoto) => void, options: { status?: ReactNode; onInfoOnly?: () => void; onCancel?: () => void } = {}) {
  const [job, setJobState] = useState<{ source: CardSource; detect: boolean } | null>(null);
  // The decoded photo is freed as soon as the corner step ends or is replaced, and when the owner goes away.
  const current = useRef<CardSource | null>(null);
  const setJob = useCallback((next: { source: CardSource; detect: boolean } | null) => {
    if (current.current && current.current !== next?.source) closeCardSource(current.current);
    current.current = next?.source ?? null;
    setJobState(next);
  }, []);
  useEffect(() => () => { closeCardSource(current.current); current.current = null; }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saved = useRef(onSaved);
  saved.current = onSaved;
  const pick = useCallback(async (file?: File | null) => {
    if (!file) return;
    setError(""); setBusy(true);
    try { setJob({ source: await openCardSource(file), detect: true }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "사진을 열지 못했어요."); }
    finally { setBusy(false); }
  }, [setJob]);
  // 다시 자르기 starts from the saved crop: no original is kept, so the corners begin at its edges.
  const recrop = useCallback(async (card: CardPhoto) => {
    setError(""); setBusy(true);
    try { setJob({ source: await openCardSource(await cardBlob(card.path)), detect: false }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "사진을 열지 못했어요."); }
    finally { setBusy(false); }
  }, [setJob]);
  const element = job ? <CardCropper key={job.source.preview} source={job.source} detect={job.detect} status={options.status}
    onInfoOnly={options.onInfoOnly && (() => { setJob(null); options.onInfoOnly?.(); })}
    onCancel={() => { setJob(null); options.onCancel?.(); }} onSaved={card => { setJob(null); saved.current(card); }} /> : null;
  return { pick, recrop, element, error, busy };
}

const useCardImage = (path: string | undefined) => {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState("");
  useEffect(() => {
    if (!path) return;
    let live = true;
    setUrl(""); setFailed("");
    cardUrl(path).then(next => { if (live) setUrl(next); }, problem => { if (live) setFailed(problem instanceof Error ? problem.message : "사진을 불러오지 못했어요."); });
    return () => { live = false; };
  }, [path]);
  return { url, failed };
};

// A file picker shaped like a pill; the album one has no capture so scans and photos from the album work too.
const FilePill = ({ label, capture, onFile, dark = false }: { label: string; capture?: boolean; onFile: (file?: File) => void; dark?: boolean }) => <label className={dark ? "cp-button" : "be-pill"}>
  <input type="file" accept={PHOTO_ACCEPT} {...(capture ? { capture: "environment" } : {})} onChange={event => { onFile(event.target.files?.[0]); event.target.value = ""; }} />{label}
</label>;

// The photo on its own: full screen on phones (dark like a photo app, whatever the theme), a large centred dialog on wider
// screens. Two fingers or the wheel zoom, double tap toggles 2×, a drag down at normal size closes it.
export function CardViewer({ card, title, onClose, onChange }: { card: CardPhoto; title: string; onClose: () => void; onChange?: (card: CardPhoto) => void }) {
  const thumb = useCardImage(card.thumb);
  const full = useCardImage(card.path);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0, drop: 0 });
  const [closing, setClosing] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; scale: number; cx: number; cy: number; x: number; y: number; sx: number; sy: number; moved: boolean; t: number } | null>(null);
  const lastTap = useRef(0);
  const flow = useCardFlow(next => onChange?.(next));
  useEffect(() => { setLoaded(false); setView({ scale: 1, x: 0, y: 0, drop: 0 }); }, [card.path]);

  const close = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onClose(); return; }
    setClosing(true);
    window.setTimeout(onClose, 200);
  }, [onClose]);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !flow.element) { event.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", onKey, true); };
  }, [close, flow.element]);

  const clampScale = (scale: number) => Math.min(5, Math.max(1, scale));
  const start = () => {
    const points = [...pointers.current.values()];
    const [a, b] = points;
    gesture.current = { dist: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0, scale: view.scale, cx: b ? (a.x + b.x) / 2 : a.x, cy: b ? (a.y + b.y) / 2 : a.y, x: view.x, y: view.y, sx: a.x, sy: a.y, moved: false, t: Date.now() };
  };
  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, label")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    start();
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    if (!g) return;
    const points = [...pointers.current.values()];
    if (points.length >= 2 && g.dist) {
      const [a, b] = points;
      const scale = clampScale(g.scale * Math.hypot(a.x - b.x, a.y - b.y) / g.dist);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      g.moved = true;
      setView({ scale, x: g.x + (cx - g.cx), y: g.y + (cy - g.cy), drop: 0 });
      return;
    }
    const dx = event.clientX - g.sx, dy = event.clientY - g.sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
    if (view.scale > 1) setView(current => ({ ...current, x: g.x + dx, y: g.y + dy }));
    else setView(current => ({ ...current, drop: Math.max(0, dy) }));
  };
  const onUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    const g = gesture.current;
    if (pointers.current.size > 0) { start(); return; }
    gesture.current = null;
    if (view.scale <= 1.01) {
      if (view.drop > 110 || (g && view.drop > 30 && view.drop / Math.max(1, Date.now() - g.t) > 0.5)) { close(); return; }
      setView({ scale: 1, x: 0, y: 0, drop: 0 });
    }
    if (g && !g.moved) {
      const now = Date.now();
      if (now - lastTap.current < 300) { setView(current => current.scale > 1 ? { scale: 1, x: 0, y: 0, drop: 0 } : { ...current, scale: 2.5 }); lastTap.current = 0; }
      else lastTap.current = now;
    }
  };
  const onWheel = (event: React.WheelEvent) => {
    const scale = clampScale(view.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
    setView(current => scale === 1 ? { scale: 1, x: 0, y: 0, drop: 0 } : { ...current, scale });
  };
  const onBackdrop = (event: MouseEvent) => { event.stopPropagation(); if (event.target === event.currentTarget) close(); };

  const src = full.url && loaded ? full.url : thumb.url;
  const fade = Math.max(0.35, 1 - view.drop / 400);
  return createPortal(<div className={`cp-layer cp-viewer${closing ? " closing" : ""}`} style={{ "--cp-fade": fade } as React.CSSProperties} role="dialog" aria-modal="true" aria-label={`${title} 원두 카드 사진`} onClick={onBackdrop} {...stopBubbling}>
    <div className="cp-dialog">
      <div className="cp-bar">
        <button type="button" className="cp-text-button" onClick={close}>닫기</button>
        <h2>{title}</h2>
        <span className="cp-text-button" aria-hidden="true" />
      </div>
      <div className="cp-zoom" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
        {src ? <img className="cp-full" src={src} alt={`${title} 원두 카드`} draggable={false} style={{ aspectRatio: `${card.w} / ${card.h}`, transform: `translate(${view.x}px, ${view.y + view.drop}px) scale(${view.scale * (1 - Math.min(0.15, view.drop / 1500))})` }} />
          : <p className="cp-hint">{thumb.failed || full.failed || "사진을 불러오는 중…"}</p>}
        {full.url && !loaded && <img src={full.url} alt="" hidden onLoad={() => setLoaded(true)} />}
      </div>
      {(onChange || flow.error) && <div className="cp-actions">
        {flow.error && <p className="cp-hint" role="alert"><strong>{flow.error}</strong></p>}
        {onChange && <>
          <button type="button" className="cp-button" disabled={flow.busy} onClick={() => flow.recrop(card)}>다시 자르기</button>
          <FilePill dark label="바꾸기" onFile={flow.pick} />
        </>}
      </div>}
    </div>
    {flow.element}
  </div>, document.body);
}

// The icon button after a name. It stops the tap so the card under it doesn't open or close.
// Inside a card that is itself a button, `inline` makes it a span with the button role, since buttons can't nest.
export function CardPhotoButton({ card, title, onChange, inline = false }: { card?: CardPhoto; title: string; onChange?: (card: CardPhoto) => void; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!card) return null;
  const props = { className: "cp-icon", "aria-label": `${title} 원두 카드 사진 보기`, title: "원두 카드 사진", onPointerDown: (event: PointerEvent) => event.stopPropagation(),
    onClick: (event: MouseEvent) => { event.stopPropagation(); event.preventDefault(); setOpen(true); } };
  return <>
    {inline ? <span role="button" tabIndex={0} {...props} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); setOpen(true); } }}><CardPhotoIcon /></span>
      : <button type="button" {...props}><CardPhotoIcon /></button>}
    {open && <CardViewer card={card} title={title} onChange={onChange} onClose={() => setOpen(false)} />}
  </>;
}

// The editor row: 찍기 / 앨범 without a photo; with one, its thumbnail (tap to view) and 바꾸기 / 지우기.
export function CardPhotoRow({ card, title, canSave, onChange }: { card?: CardPhoto; title: string; canSave: boolean; onChange: (card: CardPhoto | undefined) => void }) {
  const flow = useCardFlow(next => onChange(next));
  const thumb = useCardImage(card?.thumb);
  const [viewing, setViewing] = useState(false);
  return <>
    <div className="be-row cp-row">
      <span className="be-row-name"><CardPhotoIcon size={18} />카드 사진</span>
      {!canSave ? <span className="be-value empty"><span>Google 로그인 후 저장할 수 있어요</span></span>
        : card ? <span className="cp-row-actions">
          <button type="button" className="cp-row-thumb" onClick={() => setViewing(true)} aria-label="저장한 카드 사진 크게 보기">{thumb.url ? <img src={thumb.url} alt="" /> : <CardPhotoIcon />}</button>
          <FilePill label="바꾸기" onFile={flow.pick} />
          <button type="button" className="be-pill" onClick={() => onChange(undefined)}>지우기</button>
        </span>
        : <span className="be-quick-actions">
          {flow.busy ? <span className="be-value empty"><span>사진을 여는 중…</span></span> : <>
            <FilePill label="찍기" capture onFile={flow.pick} />
            <FilePill label="앨범" onFile={flow.pick} />
          </>}
        </span>}
    </div>
    {flow.error && <p className="be-photo-note" role="alert">{flow.error}</p>}
    {flow.element}
    {viewing && card && <CardViewer card={card} title={title} onClose={() => setViewing(false)} />}
  </>;
}
