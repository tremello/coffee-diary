import { type HomeBean, type Recommendation, recommend } from "./home";
import { addDays, fmt, parseLocalDate, toDateKey } from "./format";
import { type Brew, isCafeBrew } from "../types";

// The PC home's 원두 일정표: each bean's 맛있는 시기 and the day it runs out, in days from today.
export const PAST_DAYS = 7;
export const AHEAD_DAYS = 28;
export const PACE_DAYS = 14;

const DAY = 86_400_000;
export const daysFrom = (today: string, date: string) => Math.round((parseLocalDate(date).getTime() - parseLocalDate(today).getTime()) / DAY);
export const dateAfter = (today: string, days: number) => toDateKey(addDays(parseLocalDate(today), days));
export const shortDay = (date: string) => { const day = parseLocalDate(date); return `${day.getMonth() + 1}/${day.getDate()}`; };

export type Segment = { stage: "rest" | "best" | "ok"; from: number; to: number };

// Rest, best and ok as day ranges from today (roast date + the window's days). Nothing without a roast date or a window.
export const peakSegments = (item: Pick<HomeBean, "bean" | "peak">, today: string): Segment[] => {
  const { window } = item.peak;
  if (!item.bean.roastDate || !window) return [];
  const roast = daysFrom(today, item.bean.roastDate);
  return [
    { stage: "rest" as const, from: roast, to: roast + window.start },
    { stage: "best" as const, from: roast + window.start, to: roast + window.best },
    { stage: "ok" as const, from: roast + window.best, to: roast + window.ok }
  ].filter(segment => segment.to > segment.from);
};

// Grams a day of this bean over the last 14 days (today included). Zero when it wasn't brewed lately.
export const dailyPace = (beanId: number, brews: Brew[], today: string) => {
  const from = dateAfter(today, -(PACE_DAYS - 1));
  const grams = brews.filter(brew => !isCafeBrew(brew) && brew.beanId === beanId && brew.date >= from && brew.date <= today).reduce((sum, brew) => sum + brew.amount, 0);
  return grams / PACE_DAYS;
};

// Days until the bean runs out at that pace, or null when it isn't being brewed (no honest guess).
export const runOutDays = (remaining: number, pace: number) => pace > 0 ? Math.floor(remaining / pace) : null;

export type ScheduleRow = { item: HomeBean; segments: Segment[]; pace: number; runOut: number | null };

export const scheduleRows = (items: HomeBean[], brews: Brew[], today: string): ScheduleRow[] => items.map(item => {
  const pace = dailyPace(item.bean.id, brews, today);
  return { item, segments: peakSegments(item, today), pace, runOut: runOutDays(item.bean.remaining, pace) };
});

export type HomeEvent = { day: number; title: string; sub: string; kind: "runout" | "start" | "bestEnd" | "order"; beanId?: number };

const grams = (pace: number) => `${fmt(Math.round(pace * 10) / 10)}g`;

// What to keep an eye on in the next 4 weeks, soonest first (at most 5): run-outs, resting beans becoming ready, best times ending,
// and a reminder to order when the beans being brewed last under two weeks in total.
export const upcomingEvents = (rows: ScheduleRow[], limit = 5): HomeEvent[] => {
  const events: HomeEvent[] = [];
  const within = (day: number) => day >= 0 && day <= AHEAD_DAYS;
  rows.forEach(({ item, segments, pace, runOut }) => {
    const { bean, peak } = item;
    if (runOut !== null && within(runOut)) events.push({ day: runOut, title: `${bean.name} 다 떨어져요`, sub: `지금 하루 ${grams(pace)}씩`, kind: "runout", beanId: bean.id });
    const rest = segments.find(segment => segment.stage === "rest");
    if (rest && rest.to > 0 && within(rest.to) && peak.window) events.push({ day: rest.to, title: `${bean.name} 마시기 시작`, sub: `쉬는 기간 끝, ${peak.window.start}일째`, kind: "start", beanId: bean.id });
    const best = segments.find(segment => segment.stage === "best");
    if (best && within(best.to) && peak.window && (runOut === null || runOut > best.to)) events.push({ day: best.to, title: `${bean.name} 가장 좋은 때 끝`, sub: `${peak.window.best}일째부터 아직 괜찮음`, kind: "bestEnd", beanId: bean.id });
  });
  const used = rows.filter(row => row.runOut !== null);
  const total = used.reduce((sum, row) => sum + (row.runOut ?? 0), 0);
  if (used.length && total < 14) {
    const last = Math.max(...used.map(row => row.runOut ?? 0));
    events.push({ day: Math.max(0, last - 3), title: "원두 주문하면 좋아요", sub: `보유 원두가 ${total}일 안에 바닥나요`, kind: "order" });
  }
  return events.sort((a, b) => a.day - b.day).slice(0, limit);
};

// The next beans after today's pick, by the same rule, with the short part of their reason ("8일 더", "2잔 남아서 먼저").
export const nextCandidates = (items: HomeBean[], brews: Brew[], today: string, pickedId: number | undefined, count = 2): Recommendation[] => {
  const result: Recommendation[] = [];
  let rest = items.filter(item => item.bean.id !== pickedId);
  while (result.length < count) {
    const next = recommend(rest, brews, today, null);
    if (!next) break;
    result.push({ ...next, reason: next.reason.startsWith("처음") ? "처음 내리는 원두" : next.reason.includes(" · ") ? next.reason.split(" · ").slice(1).join(" · ") : next.reason });
    rest = rest.filter(item => item.bean.id !== next.item.bean.id);
  }
  return result;
};
