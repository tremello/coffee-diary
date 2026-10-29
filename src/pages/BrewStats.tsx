import { useState } from "react";
import { BrewDetail } from "../components/brew-editor/BrewDetail";
import { brewConditions, brewRatio } from "../components/brew-editor/brewFormat";
import { RatingStars } from "../components/brew-editor/RatingStars";
import { fmt, localDate, parseLocalDate, toDateKey } from "../lib/format";
import { type Bean, type Brew, type TastingNote } from "../types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const PERIODS = [{ value: 7, label: "7일" }, { value: 30, label: "30일" }, { value: 0, label: "전체" }];
const DAY = 86_400_000;

const monthKey = (date: Date) => toDateKey(date).slice(0, 7);
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const round1 = (n: number) => Math.round(n * 10) / 10;
const won = (n: number) => `${fmt(Math.round(n / 10) * 10)}원`;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
// Price per gram from what the bag cost and weighed; null when either is missing.
const pricePerGram = (bean?: Bean) => { const price = Number(String(bean?.price ?? "").replace(/\D/g, "")); return bean && price > 0 && bean.purchased > 0 ? price / bean.purchased : null; };
// Cups 0, 1, 2 and 3 or more get darker shades on the calendar.
const heat = (cups: number) => Math.min(cups, 3);

// Longest run of consecutive brewing days among the given date keys.
const longestRun = (dates: Set<string>, from: Date, to: Date) => {
  let best = 0, run = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) { run = dates.has(toDateKey(day)) ? run + 1 : 0; best = Math.max(best, run); }
  return best;
};

export function BrewStats({ beans, brews, notes }: { beans: Bean[]; brews: Brew[]; notes: TastingNote[] }) {
  const today = localDate();
  const todayDate = parseLocalDate(today);
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [selected, setSelected] = useState(today);
  const [period, setPeriod] = useState(7);
  const [detailId, setDetailId] = useState<number | null>(null);

  const byDate = brews.reduce<Map<string, Brew[]>>((result, brew) => result.set(brew.date, [...(result.get(brew.date) ?? []), brew]), new Map());
  const brewDates = new Set(byDate.keys());
  const beanOf = (brew: Brew) => beans.find(bean => bean.id === brew.beanId);
  const ratingOf = (brew: Brew) => notes.find(note => note.brewId === brew.id)?.rating ?? 0;

  // Calendar month: leading blanks so the 1st sits under its weekday, then every day of the month.
  const monthStart = parseLocalDate(`${month}-01`);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const firstMonth = brews.reduce((first, brew) => brew.date.slice(0, 7) < first ? brew.date.slice(0, 7) : first, thisMonth);
  const days = Array.from({ length: monthEnd.getDate() }, (_, index) => addDays(monthStart, index));
  const monthBrews = brews.filter(brew => brew.date.startsWith(month));
  const prevMonth = monthKey(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1));
  const prevMonthCups = brews.filter(brew => brew.date.startsWith(prevMonth)).length;
  const brewedDays = new Set(monthBrews.map(brew => brew.date)).size;
  const isThisMonth = month === thisMonth;
  const lastDay = isThisMonth ? todayDate : monthEnd;
  let streak = 0;
  for (let day = brewDates.has(today) ? todayDate : addDays(todayDate, -1); brewDates.has(toDateKey(day)); day = addDays(day, -1)) streak++;
  const bestRun = longestRun(brewDates, monthStart, lastDay);

  const goMonth = (offset: number) => {
    const next = monthKey(new Date(monthStart.getFullYear(), monthStart.getMonth() + offset, 1));
    if (next < firstMonth || next > thisMonth) return;
    setMonth(next);
    // Land on today in this month, otherwise on the month's last brewing day.
    const lastBrewDay = brews.filter(brew => brew.date.startsWith(next)).reduce((last, brew) => brew.date > last ? brew.date : last, "");
    setSelected(next === thisMonth ? today : lastBrewDay || `${next}-01`);
  };

  const dayBrews = [...(byDate.get(selected) ?? [])].sort((a, b) => a.id - b.id);
  const selectedDate = parseLocalDate(selected);
  const detailBrew = detailId === null ? undefined : brews.find(brew => brew.id === detailId);

  // 돌아보기: the last N days (today included) by bean, with what each cup cost and how it was rated.
  const from = period ? toDateKey(addDays(todayDate, -(period - 1))) : "";
  const prevFrom = period ? toDateKey(addDays(todayDate, -(period * 2 - 1))) : "";
  const recent = brews.filter(brew => brew.date >= from && brew.date <= today);
  const previous = period ? brews.filter(brew => brew.date >= prevFrom && brew.date < from) : [];
  const ratingsOf = (list: Brew[]) => list.map(ratingOf).filter(Boolean);
  const costOf = (brew: Brew) => { const perGram = pricePerGram(beanOf(brew)); return perGram === null ? null : perGram * brew.amount; };
  const pricedCosts = recent.map(costOf).filter((cost): cost is number => cost !== null);
  const totalCost = pricedCosts.reduce((sum, cost) => sum + cost, 0);
  const avgRating = average(ratingsOf(recent));
  const prevAvgRating = average(ratingsOf(previous));
  const unpricedBeans = new Set(recent.filter(brew => costOf(brew) === null).map(brew => brew.beanId)).size;
  const unratedCups = recent.filter(brew => !ratingOf(brew)).length;

  const beanRows = [...new Set(recent.map(brew => brew.beanId))].map(beanId => {
    const bean = beans.find(item => item.id === beanId);
    const cups = recent.filter(brew => brew.beanId === beanId);
    const ratings = ratingsOf(cups);
    const perGram = pricePerGram(bean);
    const grams = cups.reduce((sum, brew) => sum + brew.amount, 0);
    return {
      beanId, bean, cups: cups.length, grams,
      rating: average(ratings), rated: ratings.length,
      cupCost: perGram === null ? null : perGram * grams / cups.length
    };
  }).sort((a, b) => b.rating - a.rating || b.cups - a.cups);

  // Beans still in the bag, and how many days they last at the pace of the chosen period.
  const spanDays = period || Math.max(1, Math.round((todayDate.getTime() - parseLocalDate(recent.reduce((first, brew) => brew.date < first ? brew.date : first, today)).getTime()) / DAY) + 1);
  const runningOut = beanRows.filter(row => row.bean && !row.bean.deleted && row.bean.remaining > 0)
    .map(row => ({ ...row, remaining: row.bean!.remaining, left: row.bean!.purchased > 0 ? Math.min(1, row.bean!.remaining / row.bean!.purchased) : 0, days: Math.round(row.bean!.remaining / (row.grams / spanDays)) }))
    .sort((a, b) => a.days - b.days).slice(0, 4);
  // How long after roasting each cup was brewed, for beans with a roast date.
  const roastAges = recent.map(brew => { const roast = beanOf(brew)?.roastDate; return roast ? Math.round((parseLocalDate(brew.date).getTime() - parseLocalDate(roast).getTime()) / DAY) : null; })
    .filter((age): age is number => age !== null && age >= 0);
  const roastBuckets = [{ label: "1주 안", min: 0, max: 7 }, { label: "2주차", min: 8, max: 14 }, { label: "3주차", min: 15, max: 21 }, { label: "4주 넘음", min: 22, max: Infinity }]
    .map(bucket => ({ ...bucket, cups: roastAges.filter(age => age >= bucket.min && age <= bucket.max).length }));
  const roastMax = Math.max(1, ...roastBuckets.map(bucket => bucket.cups));
  // The setting used most often for each part of the brew, with how many cups used it.
  const mostUsed = (values: (string | undefined)[]) => {
    const counts = values.filter((value): value is string => Boolean(value)).reduce<Map<string, number>>((result, value) => result.set(value, (result.get(value) ?? 0) + 1), new Map());
    return [...counts].sort((a, b) => b[1] - a[1])[0];
  };
  const brewSeconds = recent.map(brew => /^(\d+):(\d{2})$/.exec(brew.brewTime ?? "")).filter(Boolean).map(match => Number(match![1]) * 60 + Number(match![2]));
  const avgSeconds = Math.round(average(brewSeconds));
  const habits = [
    ["드리퍼", mostUsed(recent.map(brew => brew.method))],
    ["분쇄도", mostUsed(recent.map(brew => brew.grindSize))],
    ["비율", mostUsed(recent.map(brew => brew.waterAmount ? `1:${Math.round(brew.waterAmount / brew.amount)}` : undefined))],
    ["물 온도", mostUsed(recent.map(brew => brew.waterTemp ? `${brew.waterTemp}℃` : undefined))]
  ].filter((row): row is [string, [string, number]] => Boolean(row[1]));

  const ratedRows = beanRows.filter(row => row.rated);
  const best = ratedRows[0];
  // Value: most stars per 1,000원 a cup, among beans with both a price and a rating.
  const value = ratedRows.filter(row => row.cupCost).sort((a, b) => b.rating / b.cupCost! - a.rating / a.cupCost!)[0];
  const processRows = [...new Set(recent.map(brew => beanOf(brew)?.process?.trim()).filter((process): process is string => Boolean(process)))]
    .map(process => ({ process, rating: average(ratingsOf(recent.filter(brew => beanOf(brew)?.process?.trim() === process))) }))
    .filter(row => row.rating).sort((a, b) => b.rating - a.rating);
  const periodLabel = period ? `최근 ${period}일` : "전체 기간";
  const prevLabel = period ? `지난 ${period}일` : "";

  return <div className="brew-stats">
    <div className="inventory-intro stats-header"><div><p>날짜를 누르면 그날 내린 커피가 나와요.</p></div></div>

    <div className="stats-cards">
      <div><span>{isThisMonth ? "이번 달" : `${monthStart.getMonth() + 1}월`}</span><strong>{monthBrews.length}<small>잔</small></strong><em className={monthBrews.length > prevMonthCups ? "up" : ""}>{monthBrews.length === prevMonthCups ? "지난달과 같아요" : `지난달보다 ${monthBrews.length > prevMonthCups ? "+" : "−"}${Math.abs(monthBrews.length - prevMonthCups)}`}</em></div>
      <div><span>내린 날</span><strong>{brewedDays}<small>일</small></strong><em>{lastDay.getDate()}일 중</em></div>
      {isThisMonth
        ? <div><span>연속 기록</span><strong>{streak}<small>일째</small></strong><em>이 달 최고 {bestRun}일</em></div>
        : <div><span>가장 긴 연속</span><strong>{bestRun}<small>일</small></strong><em>{monthStart.getMonth() + 1}월 중</em></div>}
    </div>

    <div className="cal-layout">
      <section className="stats-section cal" aria-label="브루잉 캘린더">
        <div className="cal-head">
          <button type="button" className="cal-nav" aria-label="이전 달" disabled={month <= firstMonth} onClick={() => goMonth(-1)}>‹</button>
          <h3>{monthStart.getFullYear()}년 {monthStart.getMonth() + 1}월</h3>
          <button type="button" className="cal-nav" aria-label="다음 달" disabled={month >= thisMonth} onClick={() => goMonth(1)}>›</button>
        </div>
        <div className="cal-grid cal-weekdays" aria-hidden="true">{WEEKDAYS.map((label, index) => <span key={label} className={index === 0 ? "sun" : ""}>{label}</span>)}</div>
        <div className="cal-grid">
          {Array.from({ length: monthStart.getDay() }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
          {days.map(day => {
            const key = toDateKey(day);
            const cups = byDate.get(key)?.length ?? 0;
            const future = key > today;
            return <button type="button" key={key} disabled={future} onClick={() => setSelected(key)}
              className={`cal-day heat-${future ? "none" : heat(cups)}${key === selected ? " is-selected" : ""}${key === today ? " is-today" : ""}`}
              aria-pressed={key === selected} aria-label={`${day.getMonth() + 1}월 ${day.getDate()}일 ${future ? "" : cups ? `${cups}잔` : "기록 없음"}`}>
              <b>{day.getDate()}</b><small>{!future && cups ? `${cups}잔` : ""}</small>
            </button>;
          })}
        </div>
        <div className="cal-legend" aria-hidden="true"><span>안 내림</span><i className="heat-0" /><i className="heat-1" /><i className="heat-2" /><i className="heat-3" /><span>3잔 이상</span></div>
      </section>

      <section className="stats-section cal-day-list" aria-live="polite">
        <div className="cal-day-head">
          <h3>{selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 {WEEKDAYS[selectedDate.getDay()]}요일{selected === today ? " (오늘)" : ""}</h3>
          {dayBrews.length > 0 && <span>{dayBrews.length}잔 · {fmt(round1(dayBrews.reduce((sum, brew) => sum + brew.amount, 0)))}g</span>}
        </div>
        {dayBrews.length === 0 ? <p className="stats-empty">이날은 내린 기록이 없어요.</p> : dayBrews.map(brew => {
          const bean = beanOf(brew);
          return <button type="button" key={brew.id} className="cal-brew" onClick={() => setDetailId(brew.id)} aria-label={`${bean?.name || "삭제된 원두"} 기록 자세히 보기`}>
            <span className="cal-brew-title">
              <span>{bean?.roastery && <span className="brew-roastery">{bean.roastery}</span>}<b>{bean?.name || "삭제된 원두"}</b></span>
              <RatingStars value={ratingOf(brew)} />
            </span>
            <span className="cal-brew-line">원두 {fmt(brew.amount)}g{brew.waterAmount ? ` · 물 ${fmt(brew.waterAmount)}g · ${brewRatio(brew.amount, brew.waterAmount)}` : ""}</span>
            {(brewConditions(brew) || brew.recipe) && <span className="cal-brew-line">{[brewConditions(brew), brew.recipe].filter(Boolean).join(" · ")}</span>}
          </button>;
        })}
      </section>
    </div>

    <section className="stats-section recap" aria-labelledby="recap-title">
      <div className="recap-head">
        <h3 id="recap-title">{periodLabel} 돌아보기</h3>
        <div className="recap-periods" role="group" aria-label="돌아볼 기간">{PERIODS.map(item => <button type="button" key={item.value} aria-pressed={period === item.value} onClick={() => setPeriod(item.value)}>{item.label}</button>)}</div>
      </div>
      {recent.length === 0 ? <p className="stats-empty">{periodLabel} 동안 내린 기록이 없어요.</p> : <>
        <div className="recap-cards">
          <div><span>내린 잔</span><b>{recent.length}잔</b><em>{fmt(round1(recent.reduce((sum, brew) => sum + brew.amount, 0)))}g 썼어요{period ? <><br />{prevLabel} {previous.length}잔</> : null}</em></div>
          <div><span>평균 별점</span><b>{avgRating ? `★ ${round1(avgRating)}` : "—"}</b><em>{avgRating && prevAvgRating ? `${prevLabel} ★ ${round1(prevAvgRating)}` : unratedCups ? `별점 없는 ${unratedCups}잔 빼고` : ""}</em></div>
          <div><span>커피값</span><b>{pricedCosts.length ? won(totalCost) : "—"}</b><em>{pricedCosts.length ? `한 잔 평균 ${won(totalCost / pricedCosts.length)}` : "원두 가격을 적으면 보여요"}</em></div>
        </div>

        {(best || value || processRows.length > 1) && <ul className="recap-points">
          {best && <li><span>가장 맛있었던 원두</span><b>{best.bean?.name || "삭제된 원두"}</b><em>★ {round1(best.rating)} · {best.cups}잔</em></li>}
          {value && value.beanId !== best?.beanId && <li><span>값에 비해 좋았던 원두</span><b>{value.bean?.name || "삭제된 원두"}</b><em>★ {round1(value.rating)} · 한 잔 {won(value.cupCost!)}</em></li>}
          {processRows.length > 1 && <li><span>가공방식별 별점</span><b>{processRows.map(row => `${row.process} ★${round1(row.rating)}`).join(" · ")}</b></li>}
        </ul>}

        {runningOut.length > 0 && <>
          <h4 className="recap-sub">곧 떨어지는 원두<small>{period ? `최근 ${period}일` : "지금까지"} 쓴 속도로</small></h4>
          <div className="recap-left">{runningOut.map(row => <div key={row.beanId}>
            <span><b>{row.bean!.name}</b><em className={row.days <= 3 ? "soon" : ""}>약 {fmt(row.days)}일 · {fmt(round1(row.remaining))}g</em></span>
            <i aria-hidden="true"><i style={{ width: `${Math.max(3, row.left * 100)}%` }} className={row.days <= 3 ? "soon" : ""} /></i>
          </div>)}</div>
        </>}

        {roastAges.length > 0 && <>
          <h4 className="recap-sub">로스팅 며칠째에 마셨나<small>평균 {Math.round(average(roastAges))}일째</small></h4>
          <div className="recap-roast">{roastBuckets.map(bucket => <div key={bucket.label}>
            <b>{bucket.cups ? `${bucket.cups}잔` : ""}</b>
            <span className="recap-roast-track" aria-hidden="true"><i style={{ height: bucket.cups ? `${Math.max(8, bucket.cups / roastMax * 100)}%` : undefined }} /></span>
            <span>{bucket.label}</span>
          </div>)}</div>
        </>}

        {habits.length > 0 && <>
          <h4 className="recap-sub">자주 쓴 조건</h4>
          <dl className="recap-habits">
            {habits.map(([label, [value, cups]]) => <div key={label}><dt>{label}</dt><dd>{value}<small>{cups}잔</small></dd></div>)}
            {avgSeconds > 0 && <div><dt>추출 시간</dt><dd>평균 {Math.floor(avgSeconds / 60)}:{String(avgSeconds % 60).padStart(2, "0")}</dd></div>}
          </dl>
        </>}
        {unpricedBeans > 0 && <p className="recap-note">가격을 적지 않은 원두 {unpricedBeans}종은 커피값에서 빠졌어요.</p>}
      </>}
    </section>

    {detailBrew && <BrewDetail brew={detailBrew} beans={beans} brews={brews} notes={notes} onSelect={brew => setDetailId(brew.id)} onClose={() => setDetailId(null)} />}
  </div>;
}
