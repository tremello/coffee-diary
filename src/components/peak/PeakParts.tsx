import { type BeanPeak, type PeakStage, peakPillLabel, peakSourceLabel, peakStageShort, peakValueLabel } from "../../lib/peak";
import { type PeakWindow } from "../../types";

const pct = (days: number, max: number) => `${Math.max(0, Math.min(100, days / max * 100))}%`;

// Where the bar ends: a bit past "아직 괜찮음", or past today if the bean is older than that.
export const peakScale = (window: PeakWindow, age?: number | null) => Math.max(Math.ceil(window.ok * 1.15), age != null ? Math.ceil(age * 1.08) : 0, 10);

// Rest, best, ok and past as one thin bar, with today's mark when given.
export function PeakBar({ window, max, age, className = "" }: { window: PeakWindow; max: number; age?: number | null; className?: string }) {
  return <div className={`pk-bar ${className}`} aria-hidden="true">
    <i className="pk-seg rest" style={{ width: pct(window.start, max) }} />
    <i className="pk-seg best" style={{ width: pct(window.best - window.start, max) }} />
    <i className="pk-seg ok" style={{ width: pct(window.ok - window.best, max) }} />
    {age != null && age >= 0 && <span className="pk-now" style={{ left: pct(age, max) }} />}
  </div>;
}

// The stage pill on the bean card: the stage alone on a closed card ("stage"), days and the full stage name on an open one ("long").
// Without a stage it shows only the days.
export function PeakPill({ peak, variant = "short", onClick }: { peak: BeanPeak; variant?: "short" | "long" | "stage"; onClick?: () => void }) {
  const label = variant === "stage" ? peakStageShort(peak) : peakPillLabel(peak, variant === "long");
  if (!label) return null;
  const stage: PeakStage | "none" = peak.stage ?? "none";
  const content = <>{stage !== "none" && <span className="pk-dot" aria-hidden="true" />}{label}</>;
  if (!onClick || stage === "none") return <span className="pk-pill" data-stage={stage}>{content}</span>;
  return <button type="button" className="pk-pill" data-stage={stage} aria-label={`${label}. 눌러서 맛있는 시기 조절`} onClick={event => { event.stopPropagation(); onClick(); }}>{content}</button>;
}

// The "맛있는 시기" block under 남은 원두 on the open card (phones).
export function PeakBlock({ peak, onAdjust }: { peak: BeanPeak; onAdjust: () => void }) {
  const { window, age, level } = peak;
  if (!window || !level || age === null || !peak.stage) return null;
  const max = peakScale(window, age);
  const marks = ["로스팅", `${window.start}일`, `${window.best}일`, `${window.ok}일`];
  return <div className="peak-block">
    <div className="peak-block-row"><span>맛있는 시기</span><strong>{peakValueLabel(peak)}</strong></div>
    <PeakBar window={window} max={max} age={age} />
    <div className="pk-marks" aria-hidden="true">{marks.map((label, index) => <span key={index}>{label}</span>)}</div>
    <div className="peak-block-why"><span>기준: {peak.source === "roastery" && peak.roastery ? `${peak.roastery} 기본값 · ${level}` : `${level} · ${peakSourceLabel(peak.source)}`}{peak.espresso > 0 ? ` + 에스프레소 ${peak.espresso}일` : ""}</span><button type="button" onClick={event => { event.stopPropagation(); onAdjust(); }}>조절 ›</button></div>
  </div>;
}
