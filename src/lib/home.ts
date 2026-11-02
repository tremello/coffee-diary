import { type BeanPeak, effectiveStatus, peakSortKey } from "./peak";
import { addDays, parseLocalDate, toDateKey } from "./format";
import { type Bean, type Brew, isCafeBrew } from "../types";

// The dose a bean is counted in when it has never been brewed and no usual brew exists.
export const DEFAULT_DOSE = 15;

// Today's bean picked by hand from "다른 원두로"; a device convenience, not synced.
export const HOME_PICK_KEY = "coffee-home-pick";
export type HomePick = { id: number; date: string };

const newestFirst = (a: Brew, b: Brew) => b.date.localeCompare(a.date) || b.id - a.id;

// The most used own conditions (dripper, dose, water) of the last 20 brews, newest of them on a tie: what a bean never brewed starts with.
export const usualBrew = (brews: Brew[]) => {
  const recent = brews.filter(brew => !isCafeBrew(brew) && brew.amount > 0).sort(newestFirst).slice(0, 20);
  const counts = new Map<string, number>();
  const key = (brew: Brew) => [brew.method, brew.amount, brew.waterAmount ?? ""].join("|");
  recent.forEach(brew => counts.set(key(brew), (counts.get(key(brew)) ?? 0) + 1));
  return recent.reduce<Brew | undefined>((best, brew) => !best || (counts.get(key(brew)) ?? 0) > (counts.get(key(best)) ?? 0) ? brew : best, undefined);
};

// The brew a bean's next cup copies: its own latest one, else the usual brew.
export const templateFor = (beanId: number, brews: Brew[], usual = usualBrew(brews)) => {
  const own = brews.filter(brew => !isCafeBrew(brew) && brew.beanId === beanId).sort(newestFirst)[0];
  return { brew: own ?? usual, own: Boolean(own) };
};

export const cupsLeft = (bean: Bean, dose: number) => Math.floor(bean.remaining / Math.max(dose, 1));

export const isResting = (bean: Bean, peak: BeanPeak) => effectiveStatus(bean, peak) === "디개싱 중";

const monthDay = (date: string) => { const day = parseLocalDate(date); return `${day.getMonth() + 1}월 ${day.getDate()}일`; };

export type HomeBean = { bean: Bean; peak: BeanPeak; template?: Brew; ownTemplate: boolean; dose: number; cups: number; candidate: boolean; resting: boolean };

// Every bean still in the bag, with what its next cup would use and whether it can be brewed now.
export const homeBeans = (beans: Bean[], brews: Brew[], peakOf: (bean: Bean) => BeanPeak): HomeBean[] => {
  const usual = usualBrew(brews);
  return beans.filter(bean => !bean.deleted && bean.remaining > 0).map(bean => {
    const peak = peakOf(bean);
    const { brew, own } = templateFor(bean.id, brews, usual);
    const dose = brew?.amount || DEFAULT_DOSE;
    const resting = isResting(bean, peak);
    return { bean, peak, template: brew, ownTemplate: own, dose, cups: cupsLeft(bean, dose), resting, candidate: !resting && bean.remaining >= dose };
  });
};

const byPeak = (a: HomeBean, b: HomeBean) => { const ka = peakSortKey(a.peak), kb = peakSortKey(b.peak); return ka[0] - kb[0] || ka[1] - kb[1]; };

// 남은 원두: ready beans first, then resting ones, each by 맛있는 시기 끝나가는 순.
export const sortHomeBeans = (items: HomeBean[]) => [...items].sort((a, b) => Number(a.resting) - Number(b.resting) || byPeak(a, b));

export type Recommendation = { item: HomeBean; reason: string };

// Today's cup: the bean picked by hand today, else one about to run out, else the one at its best, else the last one brewed.
export const recommend = (items: HomeBean[], brews: Brew[], today: string, pick?: HomePick | null): Recommendation | null => {
  const candidates = items.filter(item => item.candidate);
  if (!candidates.length) return null;
  const picked = pick?.date === today ? candidates.find(item => item.bean.id === pick.id) : undefined;
  if (picked) return { item: picked, reason: "직접 고른 원두" };
  const low = candidates.filter(item => item.cups <= 2).sort((a, b) => a.cups - b.cups || byPeak(a, b))[0];
  if (low) return { item: low, reason: `${low.cups}잔 남아서 먼저` };
  const ripe = candidates.filter(item => item.peak.stage === "best" || item.peak.stage === "ok").sort(byPeak)[0];
  if (ripe?.peak.window && ripe.peak.age !== null) {
    const { window, age, stage } = ripe.peak;
    return { item: ripe, reason: stage === "best" ? `가장 좋은 때 · ${window.best - age}일 더` : `아직 괜찮음 · ${window.ok - age}일 남았어요` };
  }
  const lastDate = (item: HomeBean) => brews.filter(brew => !isCafeBrew(brew) && brew.beanId === item.bean.id).reduce((last, brew) => brew.date > last ? brew.date : last, "");
  const recent = [...candidates].sort((a, b) => lastDate(b).localeCompare(lastDate(a)))[0];
  const last = lastDate(recent);
  if (!last) return { item: recent, reason: "처음 내리는 원두 · 자주 쓰는 조건" };
  const yesterday = toDateKey(addDays(parseLocalDate(today), -1));
  return { item: recent, reason: last === today ? "오늘 내린 원두" : last === yesterday ? "어제 내린 원두" : `${monthDay(last)} 내린 원두` };
};

// 이번 주: cups and brewing days of the last 7 days (today included), the run of days ending today (or yesterday), and cups per day.
// Cafe cups count, as on the stats calendar.
export const weekSummary = (brews: Brew[], today: string) => {
  const end = parseLocalDate(today);
  const days = Array.from({ length: 7 }, (_, index) => toDateKey(addDays(end, index - 6)));
  const perDay = days.map(day => brews.filter(brew => brew.date === day).length);
  const dates = new Set(brews.map(brew => brew.date));
  let streak = 0;
  for (let day = dates.has(today) ? end : addDays(end, -1); dates.has(toDateKey(day)); day = addDays(day, -1)) streak++;
  return { cups: perDay.reduce((sum, cups) => sum + cups, 0), days: perDay.filter(Boolean).length, streak, perDay, dates: days };
};

// "오늘", "어제", else "10월 30일".
export const relativeDay = (date: string, today: string) => date === today ? "오늘" : date === toDateKey(addDays(parseLocalDate(today), -1)) ? "어제" : monthDay(date);

export const homeDateLine = (today: string) => { const day = parseLocalDate(today); return `${day.getMonth() + 1}월 ${day.getDate()}일 ${"일월화수목금토"[day.getDay()]}요일`; };

