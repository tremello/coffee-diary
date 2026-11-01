import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { samePeak, shiftPeak, tidyPeak } from "../../lib/peak";
import { type PeakWindow } from "../../types";
import { PeakBar, peakScale } from "./PeakParts";

export type PeakSave = { window: PeakWindow | null; applyRoastery: boolean };

const STEPS: { key: keyof PeakWindow; label: string }[] = [
  { key: "start", label: "마시기 시작" },
  { key: "best", label: "가장 좋은 때 끝" },
  { key: "ok", label: "아직 괜찮음 끝" }
];

// Adjusts one peak window: a bottom sheet on phones, a centred dialog from 760px like the bean editor's pickers.
// base is what "기본값으로" goes back to (drawn as the dashed box); saving the base itself saves null, so the default keeps following settings.
export function PeakSheet({ title, note, value, base, age, roasteryLabel, onSave, onClose }: {
  title: string;
  note?: string;
  value: PeakWindow;
  base: PeakWindow;
  // Today's days since roast, for "지금부터 마실게요" and the bar's today mark.
  age?: number | null;
  // "모모스커피 라이트": offers saving the window for every bean of that roastery and roast level.
  roasteryLabel?: string;
  onSave: (save: PeakSave) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [applyRoastery, setApplyRoastery] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const set = (key: keyof PeakWindow, days: number) => setDraft(current => {
    const next = { ...current, [key]: Math.max(0, days) };
    // Moving one end pushes the others along instead of refusing the step.
    if (key === "start") { next.best = Math.max(next.best, next.start + 1); next.ok = Math.max(next.ok, next.best); }
    if (key === "best") { next.start = Math.min(next.start, Math.max(0, next.best - 1)); next.best = Math.max(next.best, 1); next.ok = Math.max(next.ok, next.best); }
    if (key === "ok") { next.best = Math.min(next.best, next.ok); next.start = Math.min(next.start, Math.max(0, next.best - 1)); }
    return tidyPeak(next);
  });
  const max = Math.max(peakScale(draft, age), peakScale(base, age));
  const at = (days: number) => `${Math.min(100, days / max * 100)}%`;
  const canStartNow = age != null && age >= 0 && age < draft.ok;
  const chips: { label: string; pressed?: boolean; disabled?: boolean; run: () => void }[] = [
    { label: "빨리 피는 편 −3일", disabled: draft.start === 0, run: () => setDraft(current => shiftPeak(current, -3)) },
    { label: "늦게 피는 편 +7일", run: () => setDraft(current => shiftPeak(current, 7)) },
    ...(age != null ? [{ label: "지금부터 마실게요", disabled: !canStartNow || draft.start === age, run: () => set("start", age) }] : []),
    { label: "기본값으로", disabled: samePeak(draft, base), run: () => setDraft(base) }
  ];
  const save = () => onSave({ window: samePeak(draft, base) && !applyRoastery ? null : draft, applyRoastery });
  return createPortal(<div className="pk-layer">
    <div className="be-pick-backdrop" onClick={onClose} aria-hidden="true" />
    <div className="be-pick pk-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="be-pick-grab" aria-hidden="true" />
      <div className="be-pick-head"><h3>{title}</h3><div><button type="button" onClick={onClose}>닫기</button></div></div>
      {note && <p className="be-pick-note">{note}</p>}
      <div className="pk-range">
        <div className="pk-range-bar">
          <span className="pk-ghost" style={{ left: at(base.start), width: `calc(${at(base.ok)} - ${at(base.start)})` }} title="기본값" />
          <PeakBar window={draft} max={max} age={age} />
        </div>
        <div className="pk-marks pk-scale" aria-hidden="true">{[0, 1, 2, 3, 4].map(step => <span key={step}>{Math.round(max * step / 4)}{step === 4 ? "일" : ""}</span>)}</div>
        <p className="pk-legend"><span className="pk-key rest" />쉬는 중<span className="pk-key best" />가장 좋은 때<span className="pk-key ok" />아직 괜찮음<span className="pk-key ghost" />기본값</p>
      </div>
      <div className="be-card pk-steps">
        {STEPS.map(({ key, label }) => <div className="be-row" key={key}>
          <span className="be-row-name">{label}</span>
          <span className="pk-stepper">
            <button type="button" aria-label={`${label} 하루 줄이기`} onClick={() => set(key, draft[key] - 1)}>−</button>
            <b aria-live="polite">{draft[key]}일</b>
            <button type="button" aria-label={`${label} 하루 늘리기`} onClick={() => set(key, draft[key] + 1)}>+</button>
          </span>
        </div>)}
      </div>
      <div className="pk-chips">{chips.map(chip => <button type="button" key={chip.label} disabled={chip.disabled} onClick={chip.run}>{chip.label}</button>)}</div>
      {roasteryLabel && <button type="button" className="pk-apply" aria-pressed={applyRoastery} onClick={() => setApplyRoastery(!applyRoastery)}>
        <span className="pk-check" aria-hidden="true">{applyRoastery ? "✓" : ""}</span><span>같이 적용: {roasteryLabel} 원두 전부</span>
      </button>}
      <div className="pk-actions"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button type="button" className="primary-button" onClick={save}>저장</button></div>
    </div>
  </div>, document.body);
}
