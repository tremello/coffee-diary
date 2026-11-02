import { useEffect, useMemo, useState } from "react";
import { type StorageSetter, useStorage } from "../data/sync";
import { PEAK_KEY } from "../data/keys";
import { BrewDetail } from "../components/brew-editor/BrewDetail";
import { brewNote, brewRatio, cafeTitle, takeFromBean } from "../components/brew-editor/brewFormat";
import { useSheet } from "../components/brew-editor/useSheet";
import { PeakBar, PeakBlock, PeakPill, peakScale } from "../components/peak/PeakParts";
import { StarRating } from "../components/ui";
import { RatingStars } from "../components/brew-editor/RatingStars";
import { DeskStart, DeskToolbar, Tile } from "../components/desk/Desk";
import { type BrewIntent } from "./BrewLog";
import { fmt, localDate } from "../lib/format";
import { HOME_PICK_KEY, type HomeBean, type HomePick, homeBeans, recommend, relativeDay, selectedBean, sortHomeBeans, weekSummary } from "../lib/home";
import { beanPeak } from "../lib/peak";
import { type Page } from "../lib/pages";
import { type Bean, type Brew, isCafeBrew, type PeakSettings, type TastingNote } from "../types";

const readPick = (): HomePick | null => { try { return JSON.parse(localStorage.getItem(HOME_PICK_KEY) ?? "null"); } catch { return null; } };
const writePick = (pick: HomePick) => { try { localStorage.setItem(HOME_PICK_KEY, JSON.stringify(pick)); } catch {} };

// The conditions a cup copies, as short chips: dose · water, temperature, dripper, time.
const conditionChips = (brew?: Brew) => brew ? [`${fmt(brew.amount)}g${brew.waterAmount ? ` · ${fmt(brew.waterAmount)}g` : ""}`, brew.waterTemp ? `${fmt(brew.waterTemp)}℃` : "", brew.method, brew.brewTime ?? ""].filter(Boolean) : [];

// A sheet on phones and a small centred dialog on wider screens, in the picker sheets' look.
function HomeSheet({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  const sheet = useSheet(onClose);
  return <div className={`be-layer hm-layer${sheet.closing ? " closing" : ""}`}>
    <div className="be-pick-backdrop" ref={sheet.backdropRef} aria-hidden="true" onClick={() => sheet.dismiss()} />
    <div className={`be-pick hm-sheet ${className}`} ref={sheet.panelRef} role="dialog" aria-modal="true" aria-label={title}>
      <div className="hm-sheet-top" {...sheet.dragHandlers}>
        <div className="be-pick-grab" aria-hidden="true" />
        <div className="be-pick-head"><h3>{title}</h3><div><button type="button" onClick={() => sheet.dismiss()}>닫기</button></div></div>
      </div>
      {children}
    </div>
  </div>;
}

export function HomePage({ beans, setBeans, brews, setBrews, notes, setNotes, userId, onNavigate, onOpenBrew, onOpenBean, desk = false, recipeCount = 0 }: {
  beans: Bean[];
  setBeans: StorageSetter<Bean[]>;
  brews: Brew[];
  setBrews: StorageSetter<Brew[]>;
  notes: TastingNote[];
  setNotes: StorageSetter<TastingNote[]>;
  userId: string | null;
  onNavigate: (page: Page) => void;
  onOpenBrew: (beanId: number | null, intent?: BrewIntent) => void;
  onOpenBean: (beanId: number) => void;
  desk?: boolean;
  recipeCount?: number;
}) {
  const today = localDate();
  const [peakSettings] = useStorage<PeakSettings>(PEAK_KEY, {}, userId);
  const [pick, setPick] = useState(readPick);
  const [sheet, setSheet] = useState<"save" | "other" | null>(null);
  const [rating, setRating] = useState(0);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const items = useMemo(() => homeBeans(beans, brews, bean => beanPeak(bean, peakSettings, brews, today)), [beans, brews, peakSettings, today]);
  const stock = useMemo(() => sortHomeBeans(items), [items]);
  // PC: the row picked in the list (or today's pick) fills the right pane; auto marks the rule's own choice with "추천".
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const auto = recommend(items, brews, today, null);
  const top = desk ? selectedBean(items, brews, today, pick, selectedId) : recommend(items, brews, today, pick);
  const week = weekSummary(brews, today);
  const recent = [...brews].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 4);
  const ratingOf = (brew: Brew) => notes.find(note => note.brewId === brew.id)?.rating ?? 0;
  const detailBrew = detailId === null ? undefined : brews.find(brew => brew.id === detailId);

  const closeSheet = () => { setSheet(null); setError(""); };
  const startCup = () => {
    if (!top?.item.candidate) return;
    if (!top.item.template) { onOpenBrew(top.item.bean.id); return; }
    setRating(0); setMemo(""); setError(""); setSheet("save");
  };
  const openFull = () => {
    if (!top) return;
    const { bean, template } = top.item;
    setSheet(null);
    onOpenBrew(bean.id, template ? { brewId: template.id, mode: "again", note: { rating, memo } } : { note: { rating, memo } });
  };
  // The same brew the full form would save from "이대로 다시 내리기", dated today; filter and water fall back to the last ones used.
  const save = () => {
    if (!top?.item.template) return;
    const { bean, template: t } = top.item;
    const current = beans.find(item => item.id === bean.id);
    if (!current || current.remaining < t.amount) { setError(`잔여량(${fmt(current?.remaining ?? 0)}g)이 부족해요.`); return; }
    const lastUsed = (key: "filter" | "water") => [...brews].filter(brew => !isCafeBrew(brew)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).find(brew => brew[key])?.[key];
    const brew: Brew = { id: Date.now(), beanId: bean.id, amount: t.amount, waterAmount: t.waterAmount, method: t.method, date: today, recipe: t.recipe, ...(t.recipeId !== undefined ? { recipeId: t.recipeId } : {}), grindSize: t.grindSize, waterTemp: t.waterTemp, brewTime: t.brewTime, filter: t.filter || lastUsed("filter"), water: t.water || lastUsed("water") };
    const nextBeans = takeFromBean(beans, bean.id, t.amount);
    setBrews([...brews, brew]);
    setBeans(nextBeans);
    const note = brewNote(brew, { rating, memo, taste: {} }, today);
    if (note) setNotes([...notes, note]);
    setSheet(null);
    setToast(`저장했어요 · ${bean.name} ${fmt(nextBeans.find(item => item.id === bean.id)?.remaining ?? 0)}g 남음`);
  };
  // A ready bean picked on PC is also today's pick, so the phone and a reload agree.
  const selectRow = (item: HomeBean) => { setSelectedId(item.bean.id); if (item.candidate) { const next = { id: item.bean.id, date: today }; writePick(next); setPick(next); } };
  const choose = (item: HomeBean) => { const next = { id: item.bean.id, date: today }; writePick(next); setPick(next); setSheet(null); };


  const hero = top?.item;
  const overlays = <>
      {toast && <div className="hm-toast" role="status">{toast}</div>}

      {sheet === "save" && hero?.template && <HomeSheet title="오늘 한 잔 어땠어요?" onClose={closeSheet} className="hm-save">
        <p className="hm-save-line">{[hero.bean.name, `${fmt(hero.template.amount)}g`, hero.template.waterAmount && `${fmt(hero.template.waterAmount)}g`, hero.template.method].filter(Boolean).join(" · ")}</p>
        <div className="hm-save-stars"><StarRating value={rating} onChange={value => setRating(current => current === value ? 0 : value)} /></div>
        <label className="be-pick-search hm-memo"><span className="sr-only">한 줄 메모</span><input type="text" value={memo} placeholder="한 줄 메모 (선택)" onChange={event => setMemo(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); save(); } }} /></label>
        {error && <p className="be-alert" role="alert">{error}</p>}
        <div className="hm-save-actions"><button type="button" className="quiet-button" onClick={openFull}>자세히</button><button type="button" className="primary-button" onClick={save}>저장</button></div>
      </HomeSheet>}

      {sheet === "other" && <HomeSheet title="어떤 원두로 내릴까요?" onClose={closeSheet} className="hm-other">
        <div className="be-pick-scroll"><div className="be-pick-list">{stock.map(item => {
          const why = item.candidate ? "" : item.resting ? " · 아직 쉬는 중" : " · 한 잔도 안 남음";
          return <div className="be-pick-item hm-pick-item" key={item.bean.id} aria-current={hero?.bean.id === item.bean.id}>
            <button type="button" disabled={!item.candidate} onClick={() => choose(item)}>
              <span>{item.bean.name}</span>
              <small>{[item.bean.roastery, `${fmt(item.bean.remaining)}g`].filter(Boolean).join(" · ")}{why}</small>
            </button>
            <PeakPill peak={item.peak} />
          </div>;
        })}</div></div>
      </HomeSheet>}

      {detailBrew && <BrewDetail brew={detailBrew} beans={beans} brews={brews} notes={notes} onSelect={brew => setDetailId(brew.id)} onAgain={brew => { setDetailId(null); onOpenBrew(brew.beanId, { brewId: brew.id, mode: "again" }); }} onEdit={brew => { setDetailId(null); onOpenBrew(null, { brewId: brew.id, mode: "edit" }); }} onClose={() => setDetailId(null)} />}
  </>;

  if (desk) {
    const ready = stock.filter(item => item.candidate), waiting = stock.filter(item => !item.candidate);
    const picked = top?.item;
    const own = picked ? brews.filter(brew => !isCafeBrew(brew) && brew.beanId === picked.bean.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id) : [];
    const t = picked?.template;
    const tiles: [string, string][] = t ? [["원두", `${fmt(t.amount)}g`], ["물", t.waterAmount ? `${fmt(t.waterAmount)}g · ${brewRatio(t.amount, t.waterAmount)}` : ""], ["온도", t.waterTemp ? `${fmt(t.waterTemp)}℃` : ""], ["드리퍼", t.method], ["분쇄도", t.grindSize ?? ""], ["시간", t.brewTime ?? ""], ["필터", t.filter ?? ""], ["물 종류", t.water ?? ""]] : [];
    const pct = picked && picked.bean.purchased > 0 ? Math.max(0, Math.min(100, picked.bean.remaining / picked.bean.purchased * 100)) : 0;
    const row = (item: HomeBean) => {
      const { bean, peak, cups } = item;
      return <button type="button" role="listitem" key={bean.id} data-desk-item className={`desk-row desk-bean-row hm-desk-row${item.candidate ? "" : " is-waiting"}`} aria-current={bean.id === picked?.bean.id} onClick={() => selectRow(item)}>
        <span className="desk-row-top"><span className="desk-roastery">{bean.roastery || "로스터리 미입력"}</span>{bean.id === auto?.item.bean.id && <span className="hm-tag">추천</span>}{peak.stage ? <PeakPill peak={peak} variant="stage" /> : item.resting && <span className="stock-status" data-status="디개싱 중">디개싱 중</span>}</span>
        <span className="desk-row-top"><b>{bean.name}</b></span>
        <span className="desk-row-sub"><span className="hm-track" aria-hidden="true"><i style={{ width: `${bean.purchased ? Math.max(0, Math.min(100, bean.remaining / bean.purchased * 100)) : 0}%` }} /></span><span className={`desk-row-amount${cups <= 2 ? " hm-low" : ""}`}>{fmt(bean.remaining)}g · 약 {cups}잔</span></span>
      </button>;
    };
    return (
      <main className="desk-page home-desk">
        <DeskToolbar
          search={<p className="desk-summary hm-desk-title">남은 원두 · 맛있는 시기 끝나가는 순</p>}
          middle={<button type="button" className="hm-week-line" onClick={() => onNavigate("Brew Stats")} title="브루잉 통계 보기">
            <span>이번 주 <b>{week.cups}</b>잔 · <b>{week.days}</b>일 내림{week.streak >= 2 ? ` · 연속 ${week.streak}일` : ""}</span>
            <span className="hm-heat" aria-hidden="true">{week.perDay.map((cups, index) => <i key={week.dates[index]} style={{ background: `var(--heat-${Math.min(cups, 3)})` }} />)}</span>
          </button>}
          actions={<button type="button" className="primary-button desk-add" data-desk-add onClick={() => onOpenBrew(null)}>+ 브루잉 추가</button>} />
        {beans.every(bean => bean.deleted) ? <DeskStart
          steps={[
            { label: "원두 등록", hint: "봉투 사진을 찍으면 이름·로스팅 날짜가 채워져요", done: false, action: { label: "등록하기", onClick: () => onNavigate("Beans") } },
            { label: "레시피 만들기", hint: "자주 쓰는 붓기 순서를 저장해요 (건너뛰어도 돼요)", done: recipeCount > 0, action: { label: "레시피로", onClick: () => onNavigate("Recipes") } },
            { label: "첫 브루잉 기록", hint: "원두를 고르면 남은 양이 저절로 줄어요", done: brews.length > 0, action: { label: "브루잉 기록으로", onClick: () => onNavigate("Brew Log") } }
          ]}
          extra={<>원두를 등록하면 이 화면에서 오늘 내릴 원두를 골라 드려요.</>}
          example={<>
            <header className="desk-detail-head"><p className="desk-kicker">2잔 남아서 먼저</p><h2>에티오피아 예가체프 워시드</h2><p className="desk-meta"><span>로스터리 이름</span></p></header>
            <div className="desk-actions"><span className="primary-button">그대로 내리기</span><span className="quiet-button">자세히 기록</span></div>
            <div className="desk-tiles"><Tile label="원두" value="15g" /><Tile label="물" value="240g · 1:16" /><Tile label="온도" value="92℃" /></div>
          </>} />
        : <div className="desk-split">
          <div className="desk-list desk-panel" role="list" aria-label="남은 원두">
            {ready.length > 0 && <p className="desk-group">지금 내릴 수 있어요</p>}
            {ready.map(row)}
            {waiting.length > 0 && <p className="desk-group">쉬는 중 · 한 잔이 안 되는 원두</p>}
            {waiting.map(row)}
            {stock.length === 0 && <p className="desk-detail-empty hm-desk-none">남은 원두가 없어요</p>}
          </div>
          <section className="desk-panel desk-detail" aria-labelledby="hm-desk-title">
            {picked ? <>
              <header className="desk-detail-head">
                <div className="desk-head-row"><p className="desk-kicker hm-reason"><i aria-hidden="true" />{top.reason}</p><div className="stock-status-row"><PeakPill peak={picked.peak} variant="long" /></div></div>
                <h2 id="hm-desk-title">{picked.bean.name}</h2>
                <p className="desk-meta">{picked.bean.roastery && <span>{picked.bean.roastery}</span>}{picked.bean.roastDate && <span>로스팅 {picked.bean.roastDate.slice(2).replace(/-/g, ".")}</span>}<span>{picked.bean.roastLevel ?? "로스팅 정도 모름"}</span></p>
              </header>
              <div className="desk-actions hm-desk-actions">
                <button type="button" className="primary-button" disabled={!picked.candidate} onClick={startCup}>그대로 내리기</button>
                <button type="button" className="quiet-button" disabled={picked.bean.remaining <= 0} onClick={() => onOpenBrew(picked.bean.id, t && picked.ownTemplate ? { brewId: t.id, mode: "again" } : undefined)}>자세히 기록</button>
                <button type="button" className="desk-link hm-desk-bean-link" onClick={() => onOpenBean(picked.bean.id)}>원두 탭에서 보기 →</button>
              </div>
              <div className={`desk-strip${picked.peak.stage ? "" : " is-single"}`}>
                <div className="desk-stock">
                  <div className="peak-block-row"><span>남은 원두</span><strong>{fmt(picked.bean.remaining)}g <small>/ 구매 {fmt(picked.bean.purchased)}g</small></strong></div>
                  <div className="stock-meter"><div style={{ width: `${pct}%` }} /></div>
                  <div className="peak-block-why"><span>{Math.round(pct)}% 남음</span><span className="desk-cups"><b>약 {picked.cups}잔</b> (한 잔 {fmt(picked.dose)}g)</span></div>
                </div>
                <PeakBlock peak={picked.peak} onAdjust={() => onOpenBean(picked.bean.id)} />
              </div>
              {tiles.some(([, value]) => value) && <div>
                <h3 className="desk-label">{picked.ownTemplate ? `지난번 조건 · ${relativeDay(t!.date, today)}` : "자주 쓰는 조건 · 이 원두는 처음이에요"}</h3>
                <div className="desk-tiles hm-desk-tiles">{tiles.filter(([, value]) => value).map(([label, value]) => <Tile key={label} label={label} value={value} />)}</div>
              </div>}
              <div>
                <h3 className="desk-label">이 원두로 내린 기록{own.length ? ` · ${own.length}잔` : ""}</h3>
                {own.length ? <div className="desk-table-wrap"><table className="desk-table">
                  <thead><tr><th>날짜</th><th>드리퍼</th><th>원두 · 물</th><th className="num">별점</th></tr></thead>
                  <tbody>{own.slice(0, 3).map(brew => <tr key={brew.id} onClick={() => setDetailId(brew.id)}>
                    <td>{relativeDay(brew.date, today)}</td><td>{brew.method || "–"}</td><td>{fmt(brew.amount)}g{brew.waterAmount ? ` / ${fmt(brew.waterAmount)}g` : ""}</td><td className="num"><RatingStars value={ratingOf(brew)} /></td>
                  </tr>)}</tbody>
                </table></div> : <p className="desk-note desk-muted">아직 이 원두로 내린 기록이 없어요.</p>}
              </div>
            </> : <div className="desk-detail-empty hm-desk-none"><p>지금 내릴 수 있는 원두가 없어요</p><button type="button" className="desk-link" onClick={() => onNavigate("Beans")}>원두 재고에서 보기 →</button></div>}
            {recent.length > 0 && <div>
              <h3 className="desk-label desk-label-row"><span>최근 브루잉</span><button type="button" className="desk-link" onClick={() => onNavigate("Brew Log")}>브루잉 기록에서 보기 →</button></h3>
              <div className="hm-desk-recent">{recent.map(brew => {
                const cafe = isCafeBrew(brew);
                const title = cafe ? cafeTitle(brew) : beans.find(bean => bean.id === brew.beanId)?.name || "삭제된 원두";
                return <button type="button" key={brew.id} className="desk-row" onClick={() => setDetailId(brew.id)}>
                  <span className="desk-row-top"><b>{title}</b><RatingStars value={ratingOf(brew)} /></span>
                  <span className="desk-row-sub">{cafe ? <><span className="bw-cafe-chip">카페</span>{brew.cafe?.name}</> : [relativeDay(brew.date, today), brew.method, `${fmt(brew.amount)}g${brew.waterAmount ? `/${fmt(brew.waterAmount)}g` : ""}`, brew.waterTemp && `${fmt(brew.waterTemp)}℃`].filter(Boolean).join(" · ")}</span>
                </button>;
              })}</div>
            </div>}
          </section>
        </div>}
        {overlays}
      </main>
    );
  }

  return (
    <div className="home">
      <section className="hm-hero" aria-label="오늘 추천 원두">
        {hero ? <>
          <div className="hm-hero-main">
            <p className="hm-reason"><i aria-hidden="true" />{top.reason}</p>
            <h2 className="hm-bean-name">{hero.bean.name}</h2>
            <p className="hm-bean-sub">{hero.bean.roastery && <span className="hm-roastery">{hero.bean.roastery}</span>}<PeakPill peak={hero.peak} variant="long" /></p>
            {conditionChips(hero.template).length > 0 && <div className="hm-chips">{conditionChips(hero.template).map(chip => <span key={chip}>{chip}</span>)}</div>}
          </div>
          <div className="hm-hero-actions">
            <button type="button" className="primary-button" onClick={startCup}>그대로 내리기</button>
            <button type="button" className="quiet-button" onClick={() => setSheet("other")}>다른 원두로</button>
          </div>
        </> : <div className="hm-hero-main hm-hero-empty">
          <h2 className="hm-bean-name">지금 내릴 수 있는 원두가 없어요</h2>
          <button type="button" className="hm-link" onClick={() => onNavigate("Beans")}>원두 탭에서 보기 ›</button>
        </div>}
      </section>

      <div className="hm-grid">
        {stock.length > 0 && <section className="hm-stock" aria-labelledby="hm-stock-title">
          <h3 className="hm-label" id="hm-stock-title"><span>남은 원두 · <span className="hm-phone">끝나가는 순</span><span className="hm-wide">맛있는 시기 끝나가는 순</span></span><button type="button" onClick={() => onNavigate("Beans")}><span className="hm-phone">원두 탭</span><span className="hm-wide">원두 재고</span> ›</button></h3>
          <div className="hm-stock-list">
            {stock.map(item => {
              const { bean, peak, cups } = item;
              const sub = [bean.roastery, bean.roastLevel ?? "로스팅 정도 모름"].filter(Boolean).join(" · ");
              return <button type="button" key={bean.id} className={`hm-bean${hero?.bean.id === bean.id ? " is-picked" : ""}`} onClick={() => onOpenBean(bean.id)}>
                <span className="hm-bean-text"><span className="hm-bean-title">{bean.name}</span><span className="hm-bean-meta hm-wide">{sub}</span></span>
                <span className="hm-track hm-phone" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, bean.purchased ? bean.remaining / bean.purchased * 100 : 0))}%` }} /></span>
                <span className={`hm-amount${cups <= 2 ? " is-low" : ""}`}>{fmt(bean.remaining)}g<span className="hm-phone"> · </span><span className="hm-wide"> / </span>{cups}잔</span>
                <span className="hm-peak">
                  <span className="hm-phone"><PeakPill peak={peak} /></span><span className="hm-wide"><PeakPill peak={peak} variant="long" /></span>
                  {peak.window && <PeakBar window={peak.window} max={peakScale(peak.window, peak.age)} age={peak.age} />}
                </span>
              </button>;
            })}
          </div>
        </section>}

        <div className="hm-side">
          <button type="button" className="hm-week" onClick={() => onNavigate("Brew Stats")} aria-label={`이번 주 ${week.cups}잔, ${week.days}일. 통계 보기`}>
            <span className="hm-week-label">이번 주</span>
            <span className="hm-week-count"><b>{week.cups}</b>잔 · <b>{week.days}</b>일</span>
            {week.streak >= 2 && <span className="hm-streak">연속 {week.streak}일</span>}
            <span className="hm-heat" aria-hidden="true">{week.perDay.map((cups, index) => <i key={week.dates[index]} style={{ background: `var(--heat-${Math.min(cups, 3)})` }} />)}</span>
          </button>

          {recent.length > 0 && <section className="hm-recent" aria-labelledby="hm-recent-title">
            <h3 className="hm-label" id="hm-recent-title"><span>최근 브루잉</span><button type="button" onClick={() => onNavigate("Brew Log")}>기록 ›</button></h3>
            <div className="hm-recent-list">{recent.map(brew => {
              const cafe = isCafeBrew(brew);
              const title = cafe ? brew.cafe?.name || cafeTitle(brew) : beans.find(bean => bean.id === brew.beanId)?.name || "삭제된 원두";
              const stars = ratingOf(brew);
              return <button type="button" key={brew.id} className="hm-recent-row" onClick={() => setDetailId(brew.id)}>
                <span className="hm-recent-text"><span className="hm-recent-title">{title}</span>
                  <span className="hm-recent-meta">{[relativeDay(brew.date, today), brew.method, !cafe && `${fmt(brew.amount)}g${brew.waterAmount ? `/${fmt(brew.waterAmount)}g` : ""}`].filter(Boolean).join(" · ")}{!cafe && brew.waterTemp ? <span className="hm-wide"> · {fmt(brew.waterTemp)}℃</span> : null}</span></span>
                {stars > 0 && <span className="hm-recent-stars">★ {stars}</span>}
              </button>;
            })}</div>
          </section>}
        </div>
      </div>

      {overlays}
    </div>
  );
}
