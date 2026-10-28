import { useEffect, useRef } from "react";
import { fmt, localDate, parseLocalDate, splitCupNotes } from "../../lib/format";
import { type Bean, type Brew, type TastingNote } from "../../types";
import { brewRatio, noteMemo, shortDate, tasteSummary } from "./brewFormat";
import { RatingStars } from "./RatingStars";
import { useSheet } from "./useSheet";

// One brew in full: how it was brewed, the bean it used, and every brew of that bean so the good ones are easy to repeat.
export function BrewDetail({ brew, beans, brews, notes, onSelect, onAgain, onEdit, onClose }: {
  brew: Brew;
  beans: Bean[];
  brews: Brew[];
  notes: TastingNote[];
  onSelect: (brew: Brew) => void;
  onAgain: (brew: Brew) => void;
  onEdit: (brew: Brew) => void;
  onClose: () => void;
}) {
  const sheet = useSheet(onClose);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [brew.id]);
  const bean = beans.find(item => item.id === brew.beanId);
  const noteOf = (item: Brew) => notes.find(note => note.brewId === item.id);
  const note = noteOf(brew);
  const memo = noteMemo(note);
  const taste = tasteSummary(note);
  const day = parseLocalDate(brew.date);
  const sameBean = brews.filter(item => item.beanId === brew.beanId).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const rated = sameBean.map(item => noteOf(item)?.rating ?? 0).filter(Boolean);
  const average = rated.length ? Math.round(rated.reduce((sum, rating) => sum + rating, 0) / rated.length * 10) / 10 : 0;
  const roastDays = bean?.roastDate ? Math.round((parseLocalDate(localDate()).getTime() - parseLocalDate(bean.roastDate).getTime()) / 86_400_000) : null;
  const rows = [
    ["비율", [`${fmt(brew.amount)}g${brew.waterAmount ? ` · ${fmt(brew.waterAmount)}g (${brewRatio(brew.amount, brew.waterAmount)})` : ""}`, brew.recipe].filter(Boolean).join(" · ")],
    ["드리퍼 · 분쇄도", [brew.method, brew.grindSize].filter(Boolean).join(" · ")],
    ["온도 · 시간", [brew.waterTemp && `${fmt(brew.waterTemp)}℃`, brew.brewTime].filter(Boolean).join(" · ")],
    ["맛", taste]
  ].filter(([, value]) => value);
  const beanRows = bean ? [
    ["원산지 · 가공", [[bean.origin, bean.farm].filter(Boolean).join(" "), bean.process].filter(Boolean).join(" · ")],
    ["품종", bean.variety ?? ""],
    ["로스팅 · 남은 양", [bean.roastDate && `${shortDate(bean.roastDate)}${roastDays !== null && roastDays >= 0 ? ` (${roastDays}일째)` : ""}`, bean.deleted ? "삭제된 원두" : `${fmt(bean.remaining)}g 남음`].filter(Boolean).join(" · ")],
    ["로스터리 컵노트", splitCupNotes(bean.roasteryNotes).join(", ")]
  ].filter(([, value]) => value) : [];

  return <div className={`be-layer${sheet.closing ? " closing" : ""}`}>
    <div className="be-backdrop" ref={sheet.backdropRef} aria-hidden="true" onClick={sheet.onBackdropClick} />
    <div className="be-panel bw-panel" ref={sheet.panelRef} role="dialog" aria-modal="true" aria-labelledby="bw-detail-title">
      <div className="be-top" {...sheet.dragHandlers}>
        <div className="be-grab" aria-hidden="true" />
        <div className="be-head">
          <button type="button" className="be-head-button" onClick={() => sheet.dismiss()}>닫기</button>
          <span className="bw-detail-date">{day.getMonth() + 1}월 {day.getDate()}일 기록</span>
          <button type="button" className="be-head-button save" onClick={() => onEdit(brew)}>수정</button>
        </div>
      </div>
      <div className="be-body" ref={bodyRef}><div className="be-body-inner">
        <div className="bw-detail-title">
          <div>{bean?.roastery && <p className="brew-roastery">{bean.roastery}</p>}<h2 id="bw-detail-title">{bean?.name || "삭제된 원두"}</h2></div>
          <RatingStars value={note?.rating ?? 0} />
        </div>
        {memo && <p className="bw-detail-memo">“{memo}”</p>}

        <section className="be-group" aria-labelledby="bw-this">
          <h3 className="be-group-label" id="bw-this">이번 브루잉</h3>
          <div className="be-card">{rows.map(([label, value]) => <div className="be-row bw-kv" key={label}><span className="be-row-name">{label}</span><span>{value}</span></div>)}</div>
        </section>

        {beanRows.length > 0 && <section className="be-group" aria-labelledby="bw-bean">
          <h3 className="be-group-label" id="bw-bean">원두 정보</h3>
          <div className="be-card">{beanRows.map(([label, value]) => <div className="be-row bw-kv" key={label}><span className="be-row-name">{label}</span><span>{value}</span></div>)}</div>
        </section>}

        {sameBean.length > 1 && <section className="be-group" aria-labelledby="bw-history">
          <h3 className="be-group-label" id="bw-history">이 원두로 내린 기록<span className="bw-history-sum">{sameBean.length}번{average ? ` · 평균 ★${average}` : ""}</span></h3>
          <div className="be-card">{sameBean.map(item => <button type="button" key={item.id} className="be-row bw-history-row" aria-current={item.id === brew.id} onClick={() => onSelect(item)}>
            <span className="bw-history-date">{shortDate(item.date)}</span>
            <span className="bw-history-cond">{[item.method, item.grindSize, item.waterTemp && `${fmt(item.waterTemp)}℃`, item.brewTime].filter(Boolean).join(" · ") || `${fmt(item.amount)}g${item.waterAmount ? ` · ${fmt(item.waterAmount)}g` : ""}`}</span>
            <RatingStars value={noteOf(item)?.rating ?? 0} />
          </button>)}</div>
        </section>}
      </div></div>
      <div className="bw-footer"><button type="button" className="bw-save" onClick={() => onAgain(brew)}>이대로 다시 내리기</button></div>
    </div>
  </div>;
}
