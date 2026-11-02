import { useEffect, useMemo, useState } from "react";
import { type StorageSetter, useStorage } from "../data/sync";
import { PEAK_KEY } from "../data/keys";
import { BrewDetail } from "../components/brew-editor/BrewDetail";
import { brewNote, cafeTitle, takeFromBean } from "../components/brew-editor/brewFormat";
import { useSheet } from "../components/brew-editor/useSheet";
import { PeakBar, PeakPill, peakScale } from "../components/peak/PeakParts";
import { StarRating } from "../components/ui";
import { RatingStars } from "../components/brew-editor/RatingStars";
import { DeskStart } from "../components/desk/Desk";
import { type BrewIntent } from "./BrewLog";
import { fmt, localDate } from "../lib/format";
import { AHEAD_DAYS, dateAfter, nextCandidates, PAST_DAYS, type ScheduleRow, scheduleRows, shortDay, upcomingEvents } from "../lib/homeSchedule";
import { HOME_PICK_KEY, type HomeBean, type HomePick, homeBeans, recommend, relativeDay, sortHomeBeans, weekSummary } from "../lib/home";
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
  const top = recommend(items, brews, today, pick);
  const week = weekSummary(brews, today);
  const recent = [...brews].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 4);
  const ratingOf = (brew: Brew) => notes.find(note => note.brewId === brew.id)?.rating ?? 0;
  const detailBrew = detailId === null ? undefined : brews.find(brew => brew.id === detailId);

  const closeSheet = () => { setSheet(null); setError(""); };
  const startCup = () => {
    if (!top) return;
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
    const picked = top?.item;
    const next = nextCandidates(items, brews, today, picked?.bean.id);
    const rows = scheduleRows(stock, brews, today);
    const events = upcomingEvents(rows);
    const span = PAST_DAYS + AHEAD_DAYS;
    const at = (day: number) => `${(Math.max(-PAST_DAYS, Math.min(AHEAD_DAYS, day)) + PAST_DAYS) / span * 100}%`;
    const ticks = Array.from({ length: Math.floor(span / 7) + 1 }, (_, index) => index * 7 - PAST_DAYS);
    const STAGE_WORDS = { rest: "쉬는 중", best: "가장 좋은 때", ok: "아직 괜찮음" };
    const rowTitle = ({ item, segments, runOut }: ScheduleRow) => [item.bean.name, ...segments.map(segment => `${STAGE_WORDS[segment.stage]} ${shortDay(dateAfter(today, segment.from))}~${shortDay(dateAfter(today, segment.to))}`), runOut !== null ? `다 떨어질 날 ${shortDay(dateAfter(today, runOut))} 쯤` : "요즘 안 내려서 다 떨어질 날은 몰라요"].join(" · ");
    const chips = conditionChips(picked?.template);
    return (
      <main className="desk-page home-desk">
        {beans.every(bean => bean.deleted) ? <DeskStart
          steps={[
            { label: "원두 등록", hint: "봉투 사진을 찍으면 이름·로스팅 날짜가 채워져요", done: false, action: { label: "등록하기", onClick: () => onNavigate("Beans") } },
            { label: "레시피 만들기", hint: "자주 쓰는 붓기 순서를 저장해요 (건너뛰어도 돼요)", done: recipeCount > 0, action: { label: "레시피로", onClick: () => onNavigate("Recipes") } },
            { label: "첫 브루잉 기록", hint: "원두를 고르면 남은 양이 저절로 줄어요", done: brews.length > 0, action: { label: "브루잉 기록으로", onClick: () => onNavigate("Brew Log") } }
          ]}
          extra={<>원두를 등록하면 이 화면에서 오늘 내릴 원두와 4주 일정표를 보여드려요.</>}
          example={<>
            <header className="desk-detail-head"><p className="desk-kicker">2잔 남아서 먼저</p><h2>에티오피아 예가체프 워시드</h2></header>
            <div className="hm-chips"><span>15g · 240g</span><span>92℃</span><span>하리오 V60</span></div>
            <div className="hm-lane"><i className="hm-seg" data-stage="rest" style={{ left: "0%", width: "20%" }} /><i className="hm-seg" data-stage="best" style={{ left: "20%", width: "45%" }} /><i className="hm-seg" data-stage="ok" style={{ left: "65%", width: "25%" }} /></div>
          </>} />
        : <>
          <section className="desk-panel hm-band" aria-label="오늘 추천 원두">
            {picked ? <>
              <div className="hm-band-main">
                <p className="hm-reason"><i aria-hidden="true" />{top.reason}</p>
                <h2 className="hm-bean-name">{picked.bean.name}</h2>
                <div className="hm-bean-sub">{picked.bean.roastery && <span className="hm-roastery">{picked.bean.roastery}</span>}<PeakPill peak={picked.peak} variant="long" />{chips.map(chip => <span className="hm-chip" key={chip}>{chip}</span>)}</div>
                {next.length > 0 && <p className="hm-next"><span>다음 후보</span>{next.map(({ item, reason }) => <button type="button" key={item.bean.id} onClick={() => choose(item)}>{item.bean.name} · {reason}</button>)}</p>}
              </div>
              <div className="hm-band-actions">
                <button type="button" className="quiet-button" onClick={() => setSheet("other")}>다른 원두로</button>
                <button type="button" className="primary-button" onClick={startCup}>그대로 내리기</button>
              </div>
            </> : <div className="hm-band-main"><h2 className="hm-bean-name">지금 내릴 수 있는 원두가 없어요</h2><button type="button" className="desk-link" onClick={() => onNavigate("Beans")}>원두 재고에서 보기 →</button></div>}
          </section>

          <div className="hm-board">
            <section className="desk-panel hm-plan" aria-labelledby="hm-plan-title">
              <header className="hm-plan-head"><h3 id="hm-plan-title">원두 일정표</h3><span>오늘부터 4주 · 맛있는 시기 끝나가는 순</span></header>
              {rows.length ? <div className="hm-gantt">
                <div className="hm-gantt-axis" aria-hidden="true"><span /><div className="hm-gantt-ticks">{ticks.map(day => <span key={day} style={{ left: at(day) }}>{day === 0 ? "" : shortDay(dateAfter(today, day))}</span>)}<b style={{ left: at(0) }}>오늘</b></div><span /></div>
                {rows.map(row => {
                  const { item, segments, runOut } = row;
                  const { bean } = item;
                  return <button type="button" key={bean.id} className={`hm-gantt-row${bean.id === picked?.bean.id ? " is-picked" : ""}`} title={rowTitle(row)} onClick={() => onOpenBean(bean.id)}>
                    <span className="hm-gantt-name"><b>{bean.name}</b><small>{[bean.roastery, bean.roastLevel ?? "로스팅 정도 모름"].filter(Boolean).join(" · ")}</small></span>
                    <span className="hm-lane" aria-hidden="true">
                      {segments.length ? segments.filter(segment => segment.to > -PAST_DAYS && segment.from < AHEAD_DAYS).map(segment => <i key={segment.stage} className="hm-seg" data-stage={segment.stage} style={{ left: at(segment.from), width: `calc(${at(segment.to)} - ${at(segment.from)})` }} />)
                        : <i className="hm-seg" data-stage="plain" style={{ left: at(-PAST_DAYS), width: "100%" }} />}
                      {runOut !== null && runOut <= AHEAD_DAYS && <><i className="hm-hatch" style={{ left: at(runOut), right: 0 }} /><i className="hm-runout" style={{ left: at(runOut) }} /></>}
                      <i className="hm-today-line" style={{ left: at(0) }} />
                    </span>
                    <span className="hm-gantt-amount">{fmt(bean.remaining)}g / {runOut === null ? "—" : `약 ${runOut}일`}</span>
                  </button>;
                })}
              </div> : <p className="desk-note desk-muted">남은 원두가 없어요.</p>}
              <div className="hm-legend" aria-hidden="true"><span><i data-stage="rest" />쉬는 중</span><span><i data-stage="best" />가장 좋은 때</span><span><i data-stage="ok" />아직 괜찮음</span><span><i className="hm-legend-runout" />다 떨어질 날(지금 속도로)</span><span><i className="hm-legend-today" />오늘</span></div>
              <p className="desk-foot">다 떨어질 날은 최근 2주 동안 이 원두를 내린 양으로 셈해요. 요즘 안 내린 원두는 '—'로 보여요.</p>
            </section>

            <div className="hm-side">
              <section className="desk-panel hm-events" aria-labelledby="hm-events-title">
                <h3 className="desk-label" id="hm-events-title">다가오는 일</h3>
                {events.length ? <ol>{events.map((event, index) => <li key={`${event.kind}-${event.beanId ?? "all"}-${index}`}>
                  <time dateTime={dateAfter(today, event.day)}>{event.day === 0 ? "오늘" : shortDay(dateAfter(today, event.day))}</time>
                  <span><b>{event.title}</b><small>{event.sub}</small></span>
                </li>)}</ol> : <p className="desk-note desk-muted">앞으로 4주 동안 챙길 일이 없어요</p>}
              </section>
              <section className="desk-panel hm-week-card" aria-labelledby="hm-week-title">
                <h3 className="desk-label desk-label-row" id="hm-week-title"><span>이번 주</span><button type="button" className="desk-link" onClick={() => onNavigate("Brew Stats")}>통계 ›</button></h3>
                <div className="hm-week-body">
                  <span className="hm-week-count"><b>{week.cups}</b>잔 · <b>{week.days}</b>일</span>
                  {week.streak >= 2 && <span className="hm-streak">연속 {week.streak}일</span>}
                  <span className="hm-heat" aria-hidden="true">{week.perDay.map((cups, index) => <i key={week.dates[index]} style={{ background: `var(--heat-${Math.min(cups, 3)})` }} />)}</span>
                </div>
              </section>
            </div>
          </div>
        </>}
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
