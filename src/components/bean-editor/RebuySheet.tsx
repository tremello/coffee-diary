import { useState } from "react";
import { type Bean } from "../../types";
import { usePickDrag } from "./usePickDrag";

const shortDate = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return month && day ? `${month}월 ${day}일` : "";
};

// "예전에 산 원두 또 샀어요": one row per bean name and roastery, newest purchase first.
export function RebuySheet({ beans, onPick, onClose }: { beans: Bean[]; onPick: (bean: Bean) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const seen = new Set<string>();
  const unique = [...beans].sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id).filter(bean => {
    const key = `${bean.name}\u0000${bean.roastery ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = unique.filter(bean => terms.every(term => `${bean.name} ${bean.roastery ?? ""}`.toLowerCase().includes(term)));
  const pick = usePickDrag(onClose);
  return <div className="be-pick-layer">
    <div className="be-pick-backdrop" style={pick.backdropStyle} onClick={pick.close} aria-hidden="true" />
    <div className="be-pick" ref={pick.sheetRef} style={pick.sheetStyle} role="dialog" aria-modal="true" aria-label="예전에 산 원두">
      <div className="be-pick-grab" {...pick.handleProps} aria-hidden="true" />
      <div className="be-pick-head" {...pick.handleProps}><h3>예전에 산 원두</h3><div><button type="button" onClick={pick.close}>닫기</button></div></div>
      <label className="be-pick-search"><span className="sr-only">예전 원두 찾기</span><input type="search" value={query} placeholder="원두 이름, 로스터리로 찾기" onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} /></label>
      <div className="be-pick-scroll" ref={pick.scrollRef}>
        {shown.length > 0 ? <div className="be-pick-list">{shown.map(bean => <div className="be-pick-item" key={bean.id}>
          <button type="button" onClick={() => onPick(bean)}><span>{bean.name || bean.origin}</span><small>{[bean.roastery, bean.date && `마지막 구매 ${shortDate(bean.date)}`, `${bean.purchased}g`].filter(Boolean).join(" · ")}</small></button>
        </div>)}</div> : <p className="be-pick-empty">{unique.length ? "찾는 원두가 없어요." : "아직 등록한 원두가 없어요."}</p>}
        <p className="be-pick-note">고르면 이름, 로스터리, 컵노트, 가격이 채워져요. 날짜와 양만 새로 넣으면 돼요.</p>
      </div>
    </div>
  </div>;
}
