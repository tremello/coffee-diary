import { useState, type ReactNode } from "react";
import { usePickDrag } from "./usePickDrag";

export type PickOption = { value: string; count: number };

// Picker over the bean editor. "grid" shows every option as a tile (origins); "list" filters while typing and offers
// the typed text as a new value (roasteries, varieties).
export function PickSheet({ title, value, options, layout, placeholder, onPick, onHide, onClose }: {
  title: string;
  value: string;
  options: PickOption[];
  layout: "grid" | "list";
  placeholder: string;
  onPick: (value: string) => void;
  onHide?: (value: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const pick = usePickDrag(onClose);
  const typed = query.trim();
  const shown = layout === "list" && typed ? options.filter(option => option.value.toLowerCase().includes(typed.toLowerCase())) : options;
  const exact = options.some(option => option.value === typed);
  const highlight = (text: string): ReactNode => {
    const at = typed ? text.toLowerCase().indexOf(typed.toLowerCase()) : -1;
    return at < 0 ? text : <>{text.slice(0, at)}<b>{text.slice(at, at + typed.length)}</b>{text.slice(at + typed.length)}</>;
  };
  const submitTyped = () => { if (typed) onPick(typed); };
  const submitNew = () => { if (newName.trim()) onPick(newName.trim()); };
  return <div className="be-pick-layer">
    <div className="be-pick-backdrop" style={pick.backdropStyle} onClick={pick.close} aria-hidden="true" />
    <div className="be-pick" ref={pick.sheetRef} style={pick.sheetStyle} role="dialog" aria-modal="true" aria-label={title}>
      <div className="be-pick-grab" {...pick.handleProps} aria-hidden="true" />
      <div className="be-pick-head" {...pick.handleProps}><h3>{title}</h3><div>{value && <button type="button" onClick={() => onPick("")}>지우기</button>}<button type="button" onClick={pick.close}>닫기</button></div></div>
      {layout === "list" && <label className="be-pick-search"><span className="sr-only">{title} 이름</span><input value={query} placeholder={placeholder} onFocus={pick.expand} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); submitTyped(); } }} /></label>}
      <div className="be-pick-scroll" ref={pick.scrollRef}>
        {layout === "grid" ? <>
          <p className="be-pick-label">자주 고른 순서</p>
          <div className="be-pick-grid">{options.map(option => <button type="button" key={option.value} aria-pressed={option.value === value} onClick={() => onPick(option.value)}>{option.value}</button>)}</div>
        </> : <>
          {/* Adding a new one is its own first row, so it's there even before anything is typed. */}
          <div className="be-pick-list">
            {adding ? <div className="be-pick-item be-pick-add">
              <input autoFocus value={newName} placeholder={`새 ${title} 이름`} aria-label={`새 ${title} 이름`} onFocus={pick.expand} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); submitNew(); } }} />
              <button type="button" disabled={!newName.trim()} onClick={submitNew}>추가</button>
            </div> : <div className="be-pick-item be-pick-new"><button type="button" onClick={() => setAdding(true)}>+ 새 {title} 추가</button></div>}
          </div>
          {shown.length > 0 && <p className="be-pick-label">{typed ? "예전에 쓴 것" : "자주 쓴 순서"}</p>}
          {(shown.length > 0 || (typed && !exact)) ? <div className="be-pick-list">
            {shown.map(option => <div className="be-pick-item" key={option.value} aria-current={option.value === value}>
              <button type="button" onClick={() => onPick(option.value)}><span>{highlight(option.value)}</span>{option.count > 0 && <small>원두 {option.count}개</small>}</button>
              {onHide && <button type="button" className="be-pick-hide" aria-label={`${option.value} 목록에서 숨기기`} onClick={() => onHide(option.value)}>×</button>}
            </div>)}
            {typed && !exact && <div className="be-pick-item be-pick-new"><button type="button" onClick={submitTyped}>+ ‘{typed}’ 새로 쓰기</button></div>}
          </div> : !typed && <p className="be-pick-empty">아직 등록한 것이 없어요. 위에서 추가해주세요.</p>}
        </>}
      </div>
      {layout === "grid" && <label className="be-pick-search"><span className="sr-only">새 {title}</span><input value={query} placeholder={placeholder} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); submitTyped(); } }} /><button type="button" disabled={!typed} onClick={submitTyped}>추가</button></label>}
    </div>
  </div>;
}
