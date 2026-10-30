import { useState } from "react";
import { isBlend, MAX_BLEND_PARTS, partRatios, ratioTotal, usedParts } from "../../lib/blend";
import { type BlendPart, type CoffeeValue } from "../../types";
import { PartSheet } from "./PartSheet";
import { type PickOption, PickSheet } from "./PickSheet";

// The open picker: origin, variety, or the index of the blend part being edited. Kept by the editor, so Escape closes it first.
export type CoffeeSheet = "origin" | "variety" | number | null;

// The 종류 switch and the rows under it (원산지 · 농장·지역 · 품종 · 가공, or a blend's name and coffees), with their pickers.
// With `required` the bean editor's rules apply (origin, variety, process, two blend coffees); without it every row may stay empty.
export function CoffeeRows({ value, onChange, required, error, processes, origins, varieties, readFields, sheet, setSheet, onAddOrigin, onHideVariety }: {
  value: CoffeeValue;
  onChange: (update: (current: CoffeeValue) => CoffeeValue) => void;
  required: boolean;
  error: string;
  processes: readonly string[];
  origins: PickOption[];
  varieties: PickOption[];
  readFields?: ReadonlySet<string>;
  sheet: CoffeeSheet;
  setSheet: (sheet: CoffeeSheet) => void;
  onAddOrigin: (origin: string) => void;
  onHideVariety: (variety: string) => void;
}) {
  const [otherProcess, setOtherProcess] = useState(() => Boolean(value.process) && !processes.includes(value.process));
  const isOther = otherProcess || (Boolean(value.process) && !processes.includes(value.process));
  const blend = isBlend(value);
  const parts = value.parts ?? [];
  const ratios = partRatios(parts);
  const total = ratioTotal(usedParts(parts));
  const missing = (filled?: string) => required && Boolean(error) && !filled?.trim();
  const read = (field: string) => readFields?.has(field) ?? false;
  const set = <K extends keyof CoffeeValue>(key: K, next: CoffeeValue[K]) => onChange(current => ({ ...current, [key]: next }));
  const rowClass = (field: string, bad = false) => `be-row${bad ? " bad" : read(field) ? " read" : ""}`;
  const rowName = (field: string, label: string, isRequired = false) => <span className="be-row-name">{read(field) && <span className="be-dot" aria-hidden="true" />}{label}{isRequired && <span className="be-req"> *</span>}</span>;
  const pickRow = (field: "origin" | "variety", label: string) => {
    const filled = (value[field] ?? "").trim(), bad = missing(filled);
    return <button type="button" className={rowClass(field, bad)} onClick={() => setSheet(field)}>
      {rowName(field, label, required)}
      <span className={`be-value${filled ? "" : " empty"}`}><span>{filled || (bad ? "골라주세요" : "선택")}</span><span className="be-chev" aria-hidden="true">›</span></span>
    </button>;
  };
  // Switching to blend starts from the single origin already entered plus an empty second row; switching back keeps the
  // rows (saving drops them) and takes the first one as the single origin.
  const setKind = (toBlend: boolean) => onChange(current => {
    if (toBlend === isBlend(current)) return current;
    if (toBlend) return { ...current, kind: "blend", parts: current.parts?.length ? current.parts : [{ origin: current.origin, process: current.process || undefined, variety: current.variety || undefined }, { origin: "" }] };
    const first = current.parts?.find(part => part.origin.trim());
    return { ...current, kind: undefined, ...(first ? { origin: first.origin, process: first.process ?? "", variety: first.variety ?? "" } : {}) };
  });
  const setPart = (index: number, part: BlendPart) => onChange(current => ({ ...current, parts: (current.parts ?? []).map((item, at) => at === index ? part : item) }));
  const removePart = (index: number) => onChange(current => ({ ...current, parts: (current.parts ?? []).filter((_, at) => at !== index) }));
  const addPart = () => { onChange(current => ({ ...current, parts: [...(current.parts ?? []), { origin: "" }] })); setSheet(parts.length); };
  const pick = (field: "origin" | "variety") => (next: string) => {
    if (field === "origin" && next) onAddOrigin(next);
    set(field, next);
    setSheet(null);
  };
  const partIndex = typeof sheet === "number" && parts[sheet] ? sheet : null;

  return <>
    <div className="be-row seg-row">
      <span className="be-row-name">종류</span>
      <div className="be-seg" role="group" aria-label="원두 종류"><button type="button" aria-pressed={!blend} onClick={() => setKind(false)}>싱글 오리진</button><button type="button" aria-pressed={blend} onClick={() => setKind(true)}>블렌드</button></div>
    </div>
    {blend ? <>
      <label className={rowClass("blendName")}>{rowName("blendName", "블렌드 이름")}<input value={value.blendName ?? ""} placeholder="비우면 원산지로 지어요" onChange={event => set("blendName", event.target.value)} /></label>
      {parts.map((part, index) => {
        const bad = required && Boolean(error) && !part.origin.trim() && usedParts(parts).length < 2;
        const ratio = part.origin.trim() ? ratios[index] : undefined;
        return <button type="button" key={index} className={rowClass("parts", bad)} onClick={() => setSheet(index)}>
          <span className="be-row-name">{read("parts") && <span className="be-dot" aria-hidden="true" />}{part.origin.trim() ? <>{part.origin}{part.process && <small className="be-part-sub">{part.process}</small>}</> : <span className="be-part-empty">원두 {index + 1}{required && index < 2 && <span className="be-req"> *</span>}</span>}</span>
          <span className={`be-value${ratio ? "" : " empty"}`}><span className={ratio && !part.ratio ? "be-part-auto" : undefined}>{ratio ? `${ratio}%` : part.origin.trim() ? "비율" : bad ? "골라주세요" : "선택"}</span><span className="be-chev" aria-hidden="true">›</span></span>
        </button>;
      })}
      {total > 0 && total !== 100 && <p className={`be-ratio-note${total > 100 ? " bad" : ""}`}>비율 합계 {total}%{total > 100 ? " · 100% 이하로 맞춰주세요" : ""}</p>}
      {parts.length < MAX_BLEND_PARTS && <button type="button" className="be-row be-add-part" onClick={addPart}>+ 구성 원두 추가</button>}
    </> : <>
      {pickRow("origin", "원산지")}
      <label className={rowClass("farm")}>{rowName("farm", "농장·지역")}<input value={value.farm ?? ""} placeholder="예: 구지" onChange={event => set("farm", event.target.value)} /></label>
      {pickRow("variety", "품종")}
      <div className={`${rowClass("process", missing(value.process) && !isOther)} seg-row`}>
        {rowName("process", "가공", required)}
        <div className="be-seg" role="group" aria-label="가공방식">
          {processes.map(process => <button type="button" key={process} aria-pressed={!isOther && value.process === process} onClick={() => { setOtherProcess(false); set("process", value.process === process ? "" : process); }}>{process}</button>)}
          <button type="button" aria-pressed={isOther} onClick={() => { setOtherProcess(!isOther); set("process", ""); }}>기타</button>
        </div>
      </div>
      {isOther && <label className={`be-row sub${missing(value.process) ? " bad" : ""}`}><span className="be-row-name">직접 쓰기</span><input autoFocus={!value.process} value={value.process} placeholder="예: 무산소 내추럴" onChange={event => set("process", event.target.value)} /></label>}
    </>}

    {sheet === "origin" && <PickSheet title="원산지" layout="grid" value={value.origin} options={origins} placeholder="목록에 없으면 직접 쓰기" onPick={pick("origin")} onClose={() => setSheet(null)} />}
    {sheet === "variety" && <PickSheet title="품종" layout="list" value={value.variety ?? ""} options={varieties} placeholder="품종 이름" onPick={pick("variety")} onHide={onHideVariety} onClose={() => setSheet(null)} />}
    {partIndex !== null && <PartSheet key={partIndex} index={partIndex} part={parts[partIndex]} origins={origins} processes={processes}
      remainder={!parts[partIndex].ratio ? partRatios(parts.map((part, at) => at === partIndex ? { ...part, ratio: undefined } : part))[partIndex] : undefined}
      canRemove={required ? parts.length > 2 : parts.length > 1} onChange={part => setPart(partIndex, part)} onAddOrigin={onAddOrigin} onRemove={() => removePart(partIndex)} onClose={() => setSheet(null)} />}
  </>;
}
