import { blendDetail } from "../../lib/blend";
import { fmt, localDate, parseLocalDate, splitCupNotes } from "../../lib/format";
import { type Bean, type Brew, isCafeBrew, type TastingNote } from "../../types";
import { brewRatio, cafeCup, cafeTitle, noteMemo, shortDate, tasteSummary } from "../brew-editor/brewFormat";
import { RatingStars } from "../brew-editor/RatingStars";
import { Tile } from "./Desk";

const RepeatIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></svg>;

// The columns of the same-bean comparison; a value that differs from the open brew is shown darker.
const COMPARE: { label: string; value: (brew: Brew) => string }[] = [
  { label: "원두", value: brew => `${fmt(brew.amount)}g` },
  { label: "비율", value: brew => brewRatio(brew.amount, brew.waterAmount) || "–" },
  { label: "드리퍼", value: brew => brew.method || "–" },
  { label: "분쇄", value: brew => brew.grindSize || "–" },
  { label: "온도", value: brew => brew.waterTemp ? `${fmt(brew.waterTemp)}℃` : "–" },
  { label: "시간", value: brew => brew.brewTime || "–" }
];

// The right pane of the brew log on wide screens: the picked brew in full, its buttons, and the bean's earlier brews beside it.
export function BrewPanel({ brew, beans, brews, notes, onSelect, onAgain, onEdit, onRemove }: {
  brew: Brew;
  beans: Bean[];
  brews: Brew[];
  notes: TastingNote[];
  onSelect: (brew: Brew) => void;
  onAgain: (brew: Brew) => void;
  onEdit: (brew: Brew) => void;
  onRemove: (brew: Brew) => void;
}) {
  const cafe = isCafeBrew(brew);
  const bean = cafe ? undefined : beans.find(item => item.id === brew.beanId);
  const noteOf = (item: Brew) => notes.find(note => note.brewId === item.id);
  const note = noteOf(brew);
  const memo = noteMemo(note);
  const taste = tasteSummary(note);
  const roastDays = bean?.roastDate ? Math.round((parseLocalDate(brew.date).getTime() - parseLocalDate(bean.roastDate).getTime()) / 86_400_000) : null;
  const day = parseLocalDate(brew.date);
  const when = `${brew.date === localDate() ? "오늘" : `${day.getMonth() + 1}월 ${day.getDate()}일`}`;
  const title = cafe ? cafeTitle(brew) : bean?.name || "삭제된 원두";
  const others = (cafe
    ? brews.filter(item => isCafeBrew(item) && item.cafe?.name && item.cafe.name === brew.cafe?.name)
    : brews.filter(item => !isCafeBrew(item) && item.beanId === brew.beanId)
  ).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const rated = others.map(item => noteOf(item)?.rating ?? 0).filter(Boolean);
  const average = rated.length ? Math.round(rated.reduce((sum, rating) => sum + rating, 0) / rated.length * 10) / 10 : 0;
  // The open brew and up to four of the same bean around it, newest first.
  const at = others.findIndex(item => item.id === brew.id);
  const start = Math.max(0, Math.min(at - 1, others.length - 5));
  const compared = others.slice(start, start + 5);
  const cup = cafeCup(brew);

  const tiles: [string, string][] = cafe ? [
    ["메뉴", cup.menu],
    ["원두 이름", cup.beanName],
    brew.beanKind === "blend" ? ["블렌드", blendDetail(brew.parts)] : ["원산지 · 가공", [[brew.origin, brew.farm].filter(Boolean).join(" "), brew.process].filter(Boolean).join(" · ")],
    ["품종", brew.beanKind === "blend" ? "" : brew.variety ?? ""],
    ["가격", brew.price ? `${fmt(brew.price)}원` : ""],
    ["추출", brew.method]
  ] : [
    ["원두 · 물", `${fmt(brew.amount)}g${brew.waterAmount ? ` · ${fmt(brew.waterAmount)}g` : ""}`],
    ["비율", brewRatio(brew.amount, brew.waterAmount)],
    ["드리퍼 · 필터", [brew.method, brew.filter].filter(Boolean).join(" · ")],
    ["분쇄도", brew.grindSize ?? ""],
    ["물 온도 · 물", [brew.waterTemp && `${fmt(brew.waterTemp)}℃`, brew.water].filter(Boolean).join(" · ")],
    ["추출 시간", brew.brewTime ?? ""]
  ];
  const shownTiles = tiles.filter(([, value]) => value);
  const cupNotes = splitCupNotes(cafe ? brew.roasteryNotes : undefined).join(", ");

  return <section className="desk-panel desk-detail" aria-labelledby="desk-brew-title">
    <header className="desk-detail-head">
      <p className="desk-kicker">{cafe
        ? <><span className="bw-cafe-chip">카페</span>{brew.cafe?.name} · {when}</>
        : [bean?.roastery, when, roastDays !== null && roastDays >= 0 ? `로스팅 ${roastDays}일째` : ""].filter(Boolean).join(" · ")}</p>
      <h2 id="desk-brew-title">{title}</h2>
      <RatingStars value={note?.rating ?? 0} />
    </header>
    <div className="desk-actions">
      {!cafe && <button type="button" className="primary-button" onClick={() => onAgain(brew)}><RepeatIcon />이대로 다시 내리기</button>}
      <button type="button" className="quiet-button" data-desk-edit onClick={() => onEdit(brew)}>수정</button>
      <button type="button" className="quiet-button desk-danger" onClick={() => onRemove(brew)}>삭제</button>
    </div>
    {shownTiles.length > 0 && <div className="desk-tiles">{shownTiles.map(([label, value]) => <Tile key={label} label={label} value={value} />)}</div>}
    {(taste || memo || cupNotes || brew.recipe) && <div className="desk-notes">
      {brew.recipe && !cafe && <div><h3 className="desk-label">레시피</h3><p className="desk-note">{brew.recipe}</p></div>}
      {cupNotes && <div><h3 className="desk-label">로스터리 컵노트</h3><p className="desk-note">{cupNotes}</p></div>}
      {taste && <div><h3 className="desk-label">맛 노트</h3><p className="desk-note">{taste}</p></div>}
      {memo && <div><h3 className="desk-label">메모</h3><p className="desk-note">{memo}</p></div>}
    </div>}
    {cafe && brew.cafe && <div><h3 className="desk-label">카페</h3><p className="desk-note">{brew.cafe.name}{brew.cafe.address ? ` · ${brew.cafe.address}` : ""}{brew.cafe.mapUrl && <> · <a className="bw-map-link" href={brew.cafe.mapUrl} target="_blank" rel="noopener noreferrer">지도 열기</a></>}</p></div>}
    {!cafe && others.length > 1 && <div>
      <h3 className="desk-label desk-label-row"><span>같은 원두 지난 기록과 비교</span><span>{others.length}번{average ? ` · 평균 ★${average}` : ""}</span></h3>
      <div className="desk-table-wrap"><table className="desk-table">
        <thead><tr><th>날짜</th>{COMPARE.map(column => <th key={column.label} className="num">{column.label}</th>)}<th className="num">별점</th></tr></thead>
        <tbody>{compared.map(item => {
          const current = item.id === brew.id;
          return <tr key={item.id} className={current ? "is-current" : undefined} onClick={() => onSelect(item)}>
            <td>{current ? "이 기록" : shortDate(item.date)}</td>
            {COMPARE.map(column => { const value = column.value(item); return <td key={column.label} className={`num${!current && value !== column.value(brew) ? " is-diff" : ""}`}>{value}</td>; })}
            <td className="num"><RatingStars value={noteOf(item)?.rating ?? 0} /></td>
          </tr>;
        })}</tbody>
      </table></div>
      <p className="desk-foot">이 기록과 다른 칸은 진하게 보여요. 줄을 누르면 그 기록으로 바뀌어요.</p>
    </div>}
    {cafe && others.length > 1 && <div>
      <h3 className="desk-label desk-label-row"><span>이 카페에서 마신 기록</span><span>{others.length}번{average ? ` · 평균 ★${average}` : ""}</span></h3>
      <div className="desk-table-wrap"><table className="desk-table"><tbody>{others.slice(0, 6).map(item => <tr key={item.id} className={item.id === brew.id ? "is-current" : undefined} onClick={() => onSelect(item)}>
        <td>{shortDate(item.date)}</td><td>{cafeTitle(item)}</td><td className="num"><RatingStars value={noteOf(item)?.rating ?? 0} /></td>
      </tr>)}</tbody></table></div>
    </div>}
  </section>;
}
