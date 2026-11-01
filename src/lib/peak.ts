import { type Bean, type BeanStatus, type Brew, type PeakSettings, type PeakWindow, type RoastLevel, ROAST_LEVELS } from "../types";

// Research defaults (days since roast) per roast level; see the 맛있는 시기 research table.
export const RESEARCH_PEAK: Record<RoastLevel, PeakWindow> = {
  울트라라이트: { start: 21, best: 50, ok: 75 },
  라이트: { start: 7, best: 28, ok: 45 },
  미디엄: { start: 5, best: 21, ok: 30 },
  다크: { start: 2, best: 14, ok: 21 }
};

// Espresso wants more rest: light roasts a week more, medium and dark three days.
export const RESEARCH_ESPRESSO = { light: 7, dark: 3 };

export const ROAST_LEVEL_NOTES: Record<RoastLevel, string> = {
  울트라라이트: "노르딕·아주 약하게 볶은 원두",
  라이트: "대부분의 스페셜티 필터용",
  미디엄: "단맛·바디가 고른 원두",
  다크: "진하게 볶은 원두"
};

export type PeakSource = "bean" | "roastery" | "mine" | "research";

export type PeakStage = "rest" | "best" | "ok" | "past";

export const PEAK_STAGE_LABELS: Record<PeakStage, string> = { rest: "쉬는 중", best: "가장 좋은 때", ok: "아직 괜찮음", past: "지남" };

export const isRoastLevel = (value: unknown): value is RoastLevel => (ROAST_LEVELS as readonly unknown[]).includes(value);

export const isLightRoast = (level: RoastLevel) => level === "울트라라이트" || level === "라이트";

export const samePeak = (a?: PeakWindow, b?: PeakWindow) => Boolean(a && b && a.start === b.start && a.best === b.best && a.ok === b.ok);

// Keeps the three days in order (start < best <= ok) and within 0..365.
export const tidyPeak = ({ start, best, ok }: PeakWindow): PeakWindow => {
  const s = Math.max(0, Math.min(363, Math.round(start)));
  const b = Math.max(s + 1, Math.min(364, Math.round(best)));
  return { start: s, best: b, ok: Math.max(b, Math.min(365, Math.round(ok))) };
};

export const shiftPeak = (window: PeakWindow, days: number): PeakWindow => {
  const shift = Math.max(days, -window.start);
  return tidyPeak({ start: window.start + shift, best: window.best + shift, ok: window.ok + shift });
};

export const espressoExtra = (level: RoastLevel, settings: PeakSettings) => (settings.espresso ?? RESEARCH_ESPRESSO)[isLightRoast(level) ? "light" : "dark"];

// The settings default for a roast level: the user's own if they changed it, else research.
export const levelPeak = (level: RoastLevel, settings: PeakSettings): { window: PeakWindow; source: "mine" | "research" } => {
  const mine = settings.defaults?.[level];
  return mine ? { window: mine, source: "mine" } : { window: RESEARCH_PEAK[level], source: "research" };
};

export const roasteryPeak = (settings: PeakSettings, roastery: string | undefined, level: RoastLevel) => {
  const name = roastery?.trim();
  return name ? settings.roasteries?.find(item => item.roastery === name && item.roastLevel === level) : undefined;
};

// The window a bean would get without its own override: roastery, then settings, then research.
export const basePeak = (bean: Pick<Bean, "roastery" | "roastLevel">, settings: PeakSettings): { window: PeakWindow; source: PeakSource } | null => {
  if (!bean.roastLevel) return null;
  const roastery = roasteryPeak(settings, bean.roastery, bean.roastLevel);
  if (roastery) return { window: { start: roastery.start, best: roastery.best, ok: roastery.ok }, source: "roastery" };
  return levelPeak(bean.roastLevel, settings);
};

const ESPRESSO_METHOD = /에스프레소|espresso/i;

// Espresso extra days count when most of this bean's brews were espresso.
export const brewsMostlyEspresso = (beanId: number, brews: Brew[]) => {
  const own = brews.filter(brew => brew.beanId === beanId);
  return own.length > 0 && own.filter(brew => ESPRESSO_METHOD.test(brew.method ?? "")).length * 2 > own.length;
};

export type BeanPeak = {
  // Days since roasting, or null without a roast date.
  age: number | null;
  level?: RoastLevel;
  window?: PeakWindow;
  source?: PeakSource;
  // Espresso days already added to window.
  espresso: number;
  stage?: PeakStage;
};

export const roastAge = (roastDate: string | undefined, today: string) => {
  if (!roastDate) return null;
  const days = Math.round((Date.parse(today) - Date.parse(roastDate)) / 86_400_000);
  return Number.isFinite(days) ? days : null;
};

export const stageAt = (age: number, window: PeakWindow): PeakStage => age < window.start ? "rest" : age < window.best ? "best" : age < window.ok ? "ok" : "past";

// Window priority: bean.peak > roastery override > settings default > research default, plus espresso days on the defaults.
export const beanPeak = (bean: Bean, settings: PeakSettings, brews: Brew[], today: string): BeanPeak => {
  const age = roastAge(bean.roastDate, today);
  const base = basePeak(bean, settings);
  if (!bean.roastLevel || !base) return { age, espresso: 0 };
  const own = bean.peak;
  const espresso = !own && brewsMostlyEspresso(bean.id, brews) ? espressoExtra(bean.roastLevel, settings) : 0;
  const window = own ?? shiftPeak(base.window, espresso);
  return { age, level: bean.roastLevel, window, source: own ? "bean" : base.source, espresso, stage: age === null || age < 0 ? undefined : stageAt(age, window) };
};

// Beans with a roast level follow their stage; the rest keep the status chip the user sets.
export const effectiveStatus = (bean: Bean, peak: BeanPeak): BeanStatus => bean.roastLevel ? (peak.stage === "rest" ? "디개싱 중" : "소비 중") : bean.status ?? "소비 중";

export const autoStatus = (bean: Pick<Bean, "roastLevel">) => Boolean(bean.roastLevel);

const SHORT: Record<PeakStage, string> = { rest: "", best: "좋은 때", ok: "괜찮음", past: "지남" };

// The card pill: "17일째 · 좋은 때", "9일째 · 21일부터", or only "26일째" without a stage. long uses the full stage names.
export const peakPillLabel = (peak: BeanPeak, long = false) => {
  if (peak.age === null) return "";
  const days = peak.age < 0 ? `로스팅 ${-peak.age}일 전` : `${peak.age}일째`;
  if (!peak.stage || !peak.window) return days;
  const stage = peak.stage === "rest" ? `${peak.window.start}일부터` : long ? PEAK_STAGE_LABELS[peak.stage] : SHORT[peak.stage];
  return `${days} · ${stage}`;
};

// The stage alone, for the pill in the closed card's right column: "좋은 때", "괜찮음", "21일부터", "지남".
export const peakStageShort = (peak: BeanPeak) => !peak.stage || !peak.window ? "" : peak.stage === "rest" ? `${peak.window.start}일부터` : SHORT[peak.stage];

// The closed card's date pill: "로스팅 10-14 · 17일째".
export const roastDateLabel = (roastDate: string | undefined, age: number | null) => !roastDate ? "로스팅 : 날짜 미입력" : `로스팅 ${roastDate.slice(5)}${age !== null && age >= 0 ? ` · ${age}일째` : ""}`;

// The value beside "맛있는 시기" on the open card.
export const peakValueLabel = (peak: BeanPeak) => {
  const { age, stage, window } = peak;
  if (age === null || !stage || !window) return "";
  if (stage === "rest") return `${window.start - age}일 뒤부터`;
  if (stage === "best") return `${window.best - age}일 더 · ${window.best}일째까지`;
  if (stage === "ok") return `${window.ok - age}일 더 · ${window.ok}일째까지`;
  return `${window.ok}일째에 끝났어요`;
};

export const peakSourceLabel = (source: PeakSource | undefined) => source === "bean" ? "이 원두만" : source === "roastery" ? "로스터리 기본값" : source === "mine" ? "내 기본값" : "리서치 기본값";

export const peakRange = (window: PeakWindow) => `${window.start}~${window.best}일`;

// "맛있는 시기 끝나가는 순": 아직 괜찮음, then 가장 좋은 때 (nearest end first), 쉬는 중, 지남, no stage.
export const peakSortKey = (peak: BeanPeak): [number, number] => {
  const { age, stage, window } = peak;
  if (age === null || !stage || !window) return [4, 0];
  if (stage === "ok") return [0, window.ok - age];
  if (stage === "best") return [1, window.best - age];
  if (stage === "rest") return [2, window.start - age];
  return [3, -age];
};

// Settings with this roastery's window for a roast level set (or removed with null).
export const withRoasteryPeak = (settings: PeakSettings, roastery: string, level: RoastLevel, window: PeakWindow | null): PeakSettings => {
  const others = (settings.roasteries ?? []).filter(item => !(item.roastery === roastery && item.roastLevel === level));
  return { ...settings, roasteries: window ? [...others, { roastery, roastLevel: level, ...window }] : others };
};
