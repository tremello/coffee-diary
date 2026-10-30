import { useState } from "react";
import { type BlendPart } from "../../types";
import { type PickOption } from "./PickSheet";
import { usePickDrag } from "./usePickDrag";

// One coffee of a blend: the origin grid from the origin picker, then its process, variety and share. Picking an origin
// keeps the sheet open, since the rest of the part is filled in below it. Opens tall on phones for the same reason.
export function PartSheet({ index, part, origins, processes, remainder, canRemove, onChange, onAddOrigin, onRemove, onClose }: {
  index: number;
  part: BlendPart;
  origins: PickOption[];
  processes: readonly string[];
  remainder?: number;
  canRemove: boolean;
  onChange: (part: BlendPart) => void;
  onAddOrigin: (origin: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const pick = usePickDrag(onClose, "full");
  const [typed, setTyped] = useState("");
  const [otherProcess, setOtherProcess] = useState(() => Boolean(part.process) && !processes.includes(part.process ?? ""));
  const isOther = otherProcess || (Boolean(part.process) && !processes.includes(part.process ?? ""));
  const set = (patch: Partial<BlendPart>) => onChange({ ...part, ...patch });
  const shown = part.origin && !origins.some(option => option.value === part.origin) ? [...origins, { value: part.origin, count: 0 }] : origins;
  const addTyped = () => { const origin = typed.trim(); if (!origin) return; onAddOrigin(origin); set({ origin }); setTyped(""); };
  return <div className="be-pick-layer">
    <div className="be-pick-backdrop" style={pick.backdropStyle} onClick={pick.close} aria-hidden="true" />
    <div className="be-pick be-part" ref={pick.sheetRef} style={pick.sheetStyle} role="dialog" aria-modal="true" aria-label={`구성 원두 ${index + 1}`}>
      <div className="be-pick-grab" {...pick.handleProps} aria-hidden="true" />
      <div className="be-pick-head" {...pick.handleProps}><h3>구성 원두 {index + 1}</h3><div>{canRemove && <button type="button" className="be-pick-remove" onClick={() => { onRemove(); pick.close(); }}>빼기</button>}<button type="button" className="be-pick-done" onClick={pick.close}>완료</button></div></div>
      <div className="be-pick-scroll" ref={pick.scrollRef}>
        <p className="be-pick-label">원산지 · 자주 고른 순서</p>
        <div className="be-pick-grid">{shown.map(option => <button type="button" key={option.value} aria-pressed={option.value === part.origin} onClick={() => set({ origin: option.value === part.origin ? "" : option.value })}>{option.value}</button>)}</div>
        <label className="be-pick-search"><span className="sr-only">새 원산지</span><input value={typed} placeholder="목록에 없으면 직접 쓰기" onChange={event => setTyped(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addTyped(); } }} /><button type="button" disabled={!typed.trim()} onClick={addTyped}>추가</button></label>
        <div className="be-card">
          <div className="be-row seg-row">
            <span className="be-row-name">가공</span>
            <div className="be-seg" role="group" aria-label="가공방식">
              {processes.map(process => <button type="button" key={process} aria-pressed={!isOther && part.process === process} onClick={() => { setOtherProcess(false); set({ process: part.process === process ? undefined : process }); }}>{process}</button>)}
              <button type="button" aria-pressed={isOther} onClick={() => { setOtherProcess(!isOther); set({ process: undefined }); }}>기타</button>
            </div>
          </div>
          {isOther && <label className="be-row sub"><span className="be-row-name">직접 쓰기</span><input autoFocus={!part.process} value={part.process ?? ""} placeholder="예: 무산소 내추럴" onChange={event => set({ process: event.target.value })} /></label>}
          <label className="be-row"><span className="be-row-name">품종</span><input value={part.variety ?? ""} placeholder="모르면 비워두기" onChange={event => set({ variety: event.target.value })} /></label>
          <label className="be-row"><span className="be-row-name">비율</span><input type="number" inputMode="numeric" min="1" max="100" step="1" value={part.ratio ?? ""} placeholder={remainder ? String(remainder) : "모르면 비워두기"} onChange={event => { const ratio = Math.round(Number(event.target.value)); set({ ratio: ratio > 0 ? Math.min(ratio, 100) : undefined }); }} /><span className="be-unit">%</span></label>
        </div>
        <p className="be-pick-note">가공·품종·비율은 라벨에 없으면 비워둬도 돼요. 비율을 한 칸만 비우면 남은 만큼으로 채워요.</p>
      </div>
    </div>
  </div>;
}
