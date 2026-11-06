import { blendDetail, isBlend } from "../../lib/blend";
import { fmt, splitCupNotes } from "../../lib/format";
import { type BeanPeak } from "../../lib/peak";
import { type Bean, type BeanStatus, type Brew, type CardPhoto, isCafeBrew, type TastingNote } from "../../types";
import { brewRatio, shortDate } from "../brew-editor/brewFormat";
import { RatingStars } from "../brew-editor/RatingStars";
import { PeakBlock, PeakPill } from "../peak/PeakParts";
import { Tile } from "./Desk";
import { CardPhotoButton } from "../card-photo/CardPhoto";

const BrewIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 8h12v5a6 6 0 0 1-12 0V8Z" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2" /></svg>;
const EditIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4Z" /><path d="M13.5 6.5l4 4" /></svg>;

// The right pane of 원두 재고 on wide screens: the picked bean in full with its buttons, stock and peak side by side,
// and the brews made with it. The phone keeps opening the card in place.
export function BeanPanel({ bean, peak, brews, notes, onBrew, onEdit, onStatus, onAdjust, onShowBrews, onCard }: {
  bean: Bean;
  peak: BeanPeak;
  brews: Brew[];
  notes: TastingNote[];
  onBrew: () => void;
  onCard?: (card: CardPhoto) => void;
  onEdit: () => void;
  onStatus: (status: BeanStatus) => void;
  onAdjust: () => void;
  onShowBrews?: () => void;
}) {
  const pct = bean.purchased > 0 ? Math.max(0, Math.min(100, bean.remaining / bean.purchased * 100)) : 0;
  const own = brews.filter(brew => !isCafeBrew(brew) && brew.beanId === bean.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  // Cups left at this bean's usual dose (else the usual dose of any bean).
  const doses = (own.length ? own : brews.filter(brew => !isCafeBrew(brew) && brew.amount > 0)).map(brew => brew.amount).filter(amount => amount > 0);
  const dose = doses.length ? doses.reduce((sum, amount) => sum + amount, 0) / doses.length : 0;
  const cups = dose > 0 ? Math.floor(bean.remaining / dose) : null;
  const noteOf = (brew: Brew) => notes.find(note => note.brewId === brew.id);
  const rated = own.map(brew => noteOf(brew)?.rating ?? 0).filter(Boolean);
  const average = rated.length ? Math.round(rated.reduce((sum, rating) => sum + rating, 0) / rated.length * 10) / 10 : 0;
  const myNotes = [...notes].filter(note => note.memo || note.flavor).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const legacy = [bean.flavor, bean.memo].filter(Boolean).join(" · ");
  const priceLabel = bean.price ? (Number.isFinite(Number(bean.price)) ? `₩${fmt(bean.price)}` : bean.price) : "";
  const status = bean.status ?? "소비 중";
  const next: BeanStatus = status === "소비 중" ? "디개싱 중" : "소비 중";

  const tiles: [string, string][] = [
    ...(isBlend(bean) ? [["블렌드", blendDetail(bean.parts)] as [string, string]] : [["원산지", bean.origin] as [string, string], ["농장·지역", bean.farm ?? ""] as [string, string], ["품종", bean.variety ?? ""] as [string, string], ["가공", bean.process] as [string, string]]),
    ["로스팅 정도", bean.roastLevel ?? ""],
    ["구매", [`${fmt(bean.purchased)}g`, bean.date && shortDate(bean.date)].filter(Boolean).join(" · ")]
  ];

  return <section className="desk-panel desk-detail" aria-labelledby="desk-bean-title">
    <header className="desk-detail-head">
      <div className="desk-head-row">
        <p className="desk-kicker">{bean.roastery || "로스터리 미입력"}</p>
        <div className="stock-status-row">
          {peak.stage ? <PeakPill peak={peak} variant="long" onClick={onAdjust} />
            : bean.remaining <= 0 ? <span data-status="finished" className="stock-status">다 마셨어요</span>
            : !peak.level && <button type="button" data-status={status} className="stock-status stock-status-toggle" onClick={() => onStatus(next)} aria-label={`상태: ${status}. 눌러서 ${next}으로 변경`} title={`눌러서 ${next}으로 변경`}>{status}<span aria-hidden="true">⇄</span></button>}
        </div>
      </div>
      <h2 id="desk-bean-title">{bean.name}<CardPhotoButton card={bean.card} title={bean.name} onChange={onCard} /></h2>
      {(bean.roastDate || priceLabel || bean.quality) && <p className="desk-meta">
        {bean.roastDate && <span>로스팅 <time dateTime={bean.roastDate}>{bean.roastDate.slice(2).replace(/-/g, ".")}</time></span>}
        {priceLabel && <span>구매가 {priceLabel}</span>}
        {bean.quality && <b className={`quality-tag quality-${bean.quality}`}>{bean.quality}</b>}
      </p>}
    </header>
    <div className="desk-actions">
      <button type="button" className="primary-button" onClick={onBrew} disabled={bean.remaining <= 0}><BrewIcon />이 원두로 브루잉</button>
      <button type="button" className="quiet-button" data-desk-edit onClick={onEdit}><EditIcon />원두 정보 수정</button>
    </div>
    <div className={`desk-strip${peak.stage ? "" : " is-single"}`}>
      <div className="desk-stock">
        <div className="peak-block-row"><span>남은 원두</span><strong>{fmt(bean.remaining)}g <small>/ 구매 {fmt(bean.purchased)}g</small></strong></div>
        <div className="stock-meter" role="progressbar" aria-label={`${bean.name} 잔량`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
        <div className="peak-block-why"><span>{Math.round(pct)}% 남음</span>{cups !== null && bean.remaining > 0 && <span className="desk-cups"><b>약 {cups}잔</b> (한 잔 평균 {fmt(Math.round(dose * 10) / 10)}g)</span>}</div>
      </div>
      <PeakBlock peak={peak} onAdjust={onAdjust} />
    </div>
    <div className="desk-tiles">{tiles.filter(([, value]) => value).map(([label, value]) => <Tile key={label} label={label} value={value} />)}</div>
    {(bean.roasteryNotes || myNotes.length > 0 || legacy) && <div className="desk-notes">
      {bean.roasteryNotes && <div><h3 className="desk-label">로스터리 컵노트</h3><p className="desk-note">{splitCupNotes(bean.roasteryNotes).join(", ")}</p></div>}
      {(myNotes.length > 0 || legacy) && <div><h3 className="desk-label">내 메모</h3><div className="desk-note desk-memos">
        {myNotes.slice(0, 3).map(note => <p key={note.id}><time dateTime={note.date}>{shortDate(note.date)}</time>{[note.flavor, note.memo].filter(Boolean).join(" · ")}</p>)}
        {legacy && myNotes.length < 3 && <p><time>예전 노트</time>{legacy}</p>}
      </div></div>}
    </div>}
    <div>
      <h3 className="desk-label desk-label-row"><span>이 원두로 내린 기록{own.length ? ` · ${own.length}잔` : ""}{average ? ` · 평균 ★${average}` : ""}</span>{own.length > 0 && onShowBrews && <button type="button" className="desk-link" onClick={onShowBrews}>브루잉 기록에서 보기 →</button>}</h3>
      {own.length ? <div className="desk-table-wrap"><table className="desk-table">
        <thead><tr><th>날짜</th><th>조건</th><th>레시피</th><th className="num">별점</th></tr></thead>
        <tbody>{own.slice(0, 5).map(brew => <tr key={brew.id} className="is-static">
          <td>{shortDate(brew.date)}</td>
          <td>{[`${fmt(brew.amount)}g`, brew.waterAmount && `${fmt(brew.waterAmount)}g`, brewRatio(brew.amount, brew.waterAmount), brew.grindSize, brew.waterTemp && `${fmt(brew.waterTemp)}℃`].filter(Boolean).join(" · ")}</td>
          <td>{brew.recipe || "–"}</td>
          <td className="num"><RatingStars value={noteOf(brew)?.rating ?? 0} /></td>
        </tr>)}</tbody>
      </table></div> : <p className="desk-note desk-muted">아직 이 원두로 내린 기록이 없어요. "이 원두로 브루잉"을 누르면 바로 기록할 수 있어요.</p>}
    </div>
  </section>;
}
