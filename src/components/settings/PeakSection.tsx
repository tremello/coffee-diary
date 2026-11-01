import { useState } from "react";
import { PEAK_KEY } from "../../data/keys";
import { useStorage } from "../../data/sync";
import { levelPeak, peakRange, RESEARCH_ESPRESSO, RESEARCH_PEAK, withRoasteryPeak } from "../../lib/peak";
import { type Bean, type PeakSettings, type PeakWindow, type RoastLevel, ROAST_LEVELS } from "../../types";
import { PeakSheet } from "../peak/PeakSheet";
import { SettingsGroup } from "./parts";

type Editing = { kind: "level"; level: RoastLevel } | { kind: "roastery"; roastery: string; level: RoastLevel; isNew: boolean } | null;

// 맛있는 시기: the window per roast level, espresso extra days and roastery windows. Rows open the same adjust sheet as the bean card.
export function PeakSection({ userId, beans }: { userId: string | null; beans: Bean[] }) {
  const [settings, setSettings] = useStorage<PeakSettings>(PEAK_KEY, {}, userId);
  const [editing, setEditing] = useState<Editing>(null);
  const [adding, setAdding] = useState(false);
  const [newRoastery, setNewRoastery] = useState("");
  const [newLevel, setNewLevel] = useState<RoastLevel>("라이트");
  const espresso = settings.espresso ?? RESEARCH_ESPRESSO;
  const roasteries = settings.roasteries ?? [];
  const knownRoasteries = [...new Set(beans.filter(bean => !bean.deleted).map(bean => bean.roastery?.trim()).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, "ko"));
  const changed = Boolean(Object.keys(settings.defaults ?? {}).length || settings.espresso || roasteries.length);
  const setLevel = (level: RoastLevel, window: PeakWindow | null) => {
    const defaults = { ...settings.defaults };
    if (window) defaults[level] = window; else delete defaults[level];
    setSettings({ ...settings, defaults });
  };
  const setEspresso = (key: "light" | "dark", days: number) => setSettings({ ...settings, espresso: { ...espresso, [key]: Math.max(0, Math.min(30, days)) } });
  const resetAll = () => { if (window.confirm("로스팅 정도별 기본값, 에스프레소 추가일, 로스터리별 값을 모두 리서치 기본값으로 되돌릴까요?\n원두마다 따로 정한 값은 그대로예요.")) setSettings({}); };
  const startAdd = () => {
    const roastery = newRoastery.trim();
    if (!roastery) return;
    setEditing({ kind: "roastery", roastery, level: newLevel, isNew: true });
  };
  const stepper = (label: string, value: number, onChange: (days: number) => void) => <span className="pk-stepper">
    <button type="button" aria-label={`${label} 하루 줄이기`} onClick={() => onChange(value - 1)}>−</button>
    <b>+{value}일</b>
    <button type="button" aria-label={`${label} 하루 늘리기`} onClick={() => onChange(value + 1)}>+</button>
  </span>;

  const sheet = (() => {
    if (!editing) return null;
    const levelBase = levelPeak(editing.level, settings).window;
    if (editing.kind === "level") return <PeakSheet title={`${editing.level} 기본값`} note="이 정도로 고른 원두 전부에 써요. 원두나 로스터리마다 따로 정한 값이 먼저예요." value={levelBase} base={RESEARCH_PEAK[editing.level]}
      onSave={({ window }) => { setLevel(editing.level, window); setEditing(null); }} onClose={() => setEditing(null)} />;
    const current = roasteries.find(item => item.roastery === editing.roastery && item.roastLevel === editing.level);
    return <PeakSheet title={`${editing.roastery} · ${editing.level}`} note="이 로스터리의 이 정도 원두 전부에 써요." value={current ?? levelBase} base={levelBase}
      onSave={({ window }) => {
        // Saving the plain default for a new roastery still adds it, so the list shows what was asked for.
        setSettings(withRoasteryPeak(settings, editing.roastery, editing.level, window ?? (editing.isNew ? levelBase : null)));
        setEditing(null); setAdding(false); setNewRoastery("");
      }} onClose={() => setEditing(null)} />;
  })();

  return <SettingsGroup title="맛있는 시기">
    <p className="settings-sublabel pk-settings-label">로스팅 정도별 기본값 · 로스팅 후 며칠째</p>
    {ROAST_LEVELS.map(level => {
      const { window, source } = levelPeak(level, settings);
      return <button type="button" key={level} className="settings-row settings-row-button" onClick={() => setEditing({ kind: "level", level })}>
        <span className="settings-label">{level}</span>
        <span className={`settings-value${source === "mine" ? " pk-mine" : ""}`}>{peakRange(window)}{source === "mine" && <small>내가 바꿈</small>}<span className="settings-chevron" aria-hidden="true">›</span></span>
      </button>;
    })}
    <div className="settings-row"><div className="settings-label">에스프레소로 내리면<small>울트라라이트·라이트</small></div><div className="settings-value">{stepper("라이트 계열 에스프레소 추가일", espresso.light, days => setEspresso("light", days))}</div></div>
    <div className="settings-row"><div className="settings-label">에스프레소로 내리면<small>미디엄·다크</small></div><div className="settings-value">{stepper("미디엄·다크 에스프레소 추가일", espresso.dark, days => setEspresso("dark", days))}</div></div>
    <p className="settings-sublabel pk-settings-label">로스터리별</p>
    {roasteries.length === 0 && !adding && <p className="settings-empty">로스터리마다 다르게 정한 값이 없어요. 원두 카드의 맛있는 시기 조절에서 "같이 적용"을 고르거나 여기서 추가해요.</p>}
    {roasteries.map(item => <div className="pk-roastery-row" key={`${item.roastery}:${item.roastLevel}`}>
      <button type="button" className="settings-row settings-row-button" onClick={() => setEditing({ kind: "roastery", roastery: item.roastery, level: item.roastLevel, isNew: false })}>
        <span className="settings-label">{item.roastery} · {item.roastLevel}</span>
        <span className="settings-value pk-mine">{peakRange(item)}<span className="settings-chevron" aria-hidden="true">›</span></span>
      </button>
      <button type="button" className="pk-remove" aria-label={`${item.roastery} ${item.roastLevel} 값 지우기`} onClick={() => setSettings(withRoasteryPeak(settings, item.roastery, item.roastLevel, null))}>×</button>
    </div>)}
    {adding ? <div className="pk-add">
      <input list="pk-roastery-names" value={newRoastery} placeholder="로스터리 이름" aria-label="로스터리 이름" onChange={event => setNewRoastery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); startAdd(); } }} />
      <datalist id="pk-roastery-names">{knownRoasteries.map(name => <option key={name} value={name} />)}</datalist>
      <select className="settings-select" aria-label="로스팅 정도" value={newLevel} onChange={event => setNewLevel(event.target.value as RoastLevel)}>{ROAST_LEVELS.map(level => <option key={level}>{level}</option>)}</select>
      <button type="button" className="primary-button" disabled={!newRoastery.trim()} onClick={startAdd}>다음</button>
    </div> : <button type="button" className="settings-row settings-row-button pk-add-row" onClick={() => setAdding(true)}><span className="settings-label">+ 로스터리 추가</span></button>}
    <div className="pk-reset"><button type="button" className="quiet-button" disabled={!changed} onClick={resetAll}>모두 리서치 기본값으로</button></div>
    {sheet}
  </SettingsGroup>;
}
