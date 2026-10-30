import { blendFields, blendName, isBlend } from "../../lib/blend";
import { fmt, localDate, parseLocalDate } from "../../lib/format";
import { type Brew, type BrewForm, type CoffeeValue, isCafeBrew, type TastingNote, type TastingNoteForm } from "../../types";

export const emptyBrewForm = (): BrewForm => ({ beanId: "", amount: "", waterAmount: "", method: "", date: localDate(), recipe: "", grindSize: "", waterTemp: "", brewTime: "", ...emptyCafeFields() });

// A new cafe cup starts as 핸드드립, the usual order.
export const emptyCafeFields = (): Pick<BrewForm, "kind" | "cafe" | "menu" | "beanName" | "coffee" | "roasteryNotes" | "price"> => ({ kind: "own", cafe: null, menu: "핸드드립", beanName: "", coffee: { origin: "", process: "" }, roasteryNotes: "", price: "" });

// A cafe brew's coffee fields back in the shape the bean rows edit, and out again for saving (a blend keeps its summary
// in origin, process and variety like a bean does; it may have no coffees at all).
export const brewCoffee = (brew: Brew): CoffeeValue => ({ kind: brew.beanKind, blendName: brew.blendName, parts: brew.parts, origin: brew.origin ?? "", farm: brew.farm, variety: brew.variety, process: brew.process ?? "" });
export const coffeeFields = (coffee: CoffeeValue): Partial<Brew> => {
  const text = (value?: string) => value?.trim() || undefined;
  if (!isBlend(coffee)) return { origin: text(coffee.origin), farm: text(coffee.farm), variety: text(coffee.variety), process: text(coffee.process) };
  const blend = blendFields(coffee);
  return { beanKind: "blend", blendName: text(blend.blendName), parts: blend.parts, origin: text(blend.origin), variety: text(blend.variety), process: text(blend.process) };
};

// The form keeps brew time as m:ss (typed as digits, 245 → 2:45); seconds past 59 roll over into minutes.
export const normalizeBrewTime = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!value.trim()) return "";
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  return total > 0 ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}` : null;
};

export const brewTimeFromDigits = (value: string) => {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 4);
  return digits ? `${Number(digits.slice(0, -2) || "0")}:${digits.slice(-2).padStart(2, "0")}` : "";
};

export const brewConditions = (brew: Brew) => [brew.method, brew.grindSize, brew.waterTemp && `${fmt(brew.waterTemp)}℃`, brew.brewTime && `${brew.brewTime} 추출 완료`].filter(Boolean).join(" · ");

export const brewRatio = (amount: number, waterAmount?: number) => waterAmount && amount > 0 ? `1:${Number((waterAmount / amount).toFixed(1)).toLocaleString()}` : "";

// The parts of a brew worth repeating next time: dose, water, recipe and how it was brewed (not the date or the notes).
// A cafe brew carries its cafe and what was in the cup instead.
export const brewConditionsForm = (brew: Brew): Omit<BrewForm, "beanId" | "date"> => ({
  amount: isCafeBrew(brew) ? "" : String(brew.amount), waterAmount: brew.waterAmount ? String(brew.waterAmount) : "", method: brew.method, recipe: brew.recipe, grindSize: brew.grindSize ?? "", waterTemp: brew.waterTemp ? String(brew.waterTemp) : "", brewTime: brew.brewTime ?? "",
  ...(isCafeBrew(brew) ? { kind: "cafe", cafe: brew.cafe ?? null, ...cafeCup(brew), coffee: brewCoffee(brew), roasteryNotes: brew.roasteryNotes ?? "", price: brew.price ?? "" } : emptyCafeFields())
});

// The cafes of past cafe brews, newest first, one per place (Kakao id, else the name).
export const recentCafes = (brews: Brew[]) => {
  const seen = new Set<string>();
  return [...brews].filter(brew => isCafeBrew(brew) && brew.cafe?.name).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .map(brew => brew.cafe!).filter(cafe => { const key = cafe.placeId || cafe.name; if (seen.has(key)) return false; seen.add(key); return true; });
};

// The menu and the coffee of a cafe cup. The first cafe records had one 메뉴·원두 box saved as menu and no beanName; that text was the coffee.
export const cafeCup = (brew: Brew) => brew.beanName === undefined ? { menu: "", beanName: brew.menu ?? "" } : { menu: brew.menu ?? "", beanName: brew.beanName };

// Card and detail titles: the coffee's name, else the blend's, else the menu, else the cafe.
export const cafeTitle = (brew: Brew) => { const cup = cafeCup(brew); return cup.beanName.trim() || (brew.beanKind === "blend" ? blendName({ blendName: brew.blendName, parts: brew.parts }) : "") || cup.menu || brew.cafe?.name || "카페"; };
// The card line under the title: the menu (unless it is the title), 블렌드, then where the coffee is from and how it was processed.
export const cafeBeanLine = (brew: Brew) => { const cup = cafeCup(brew); return [cafeTitle(brew) !== cup.menu && cup.menu, brew.beanKind === "blend" && "블렌드", brew.roastery, brew.origin, brew.process].filter(Boolean).join(" · "); };

// 분쇄도 is stored as one string ("코만단테 25클릭"); the form splits it into a grinder and a click count. A registered
// grinder name wins (longest first), then any text before the first number; text with no number stays as the count.
export const parseGrind = (grindSize: string, grinders: string[]) => {
  const text = grindSize.trim();
  const known = [...grinders].sort((a, b) => b.length - a.length).find(name => name && text.startsWith(name));
  const rest = known ? text.slice(known.length).trim() : text;
  const match = rest.match(/\d+(?:\.\d+)?/);
  if (known) return { grinder: known, clicks: match ? match[0] : rest };
  if (!match || match.index === undefined) return { grinder: "", clicks: text };
  return { grinder: text.slice(0, match.index).trim(), clicks: match[0] };
};

export const composeGrind = (grinder: string, clicks: string) => clicks.trim() ? `${grinder.trim() ? `${grinder.trim()} ` : ""}${clicks.trim()}클릭` : "";

export const latestBrewOf = (brews: Brew[], beanId: number) => brews.filter(brew => !isCafeBrew(brew) && brew.beanId === beanId).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];

export const shortDate = (date: string) => { const day = parseLocalDate(date); return `${day.getMonth() + 1}/${day.getDate()}`; };

// List headings: 오늘 / 어제 with the date, otherwise the date and weekday (and the year when it isn't this year).
export const dayHeading = (date: string, today: string) => {
  const day = parseLocalDate(date), now = parseLocalDate(today);
  const diff = Math.round((now.getTime() - day.getTime()) / 86_400_000);
  const label = `${day.getFullYear() !== now.getFullYear() ? `${day.getFullYear()}년 ` : ""}${day.getMonth() + 1}월 ${day.getDate()}일`;
  return diff === 0 ? `오늘 · ${label}` : diff === 1 ? `어제 · ${label}` : `${label} (${"일월화수목금토"[day.getDay()]})`;
};

export const TASTE_ATTRIBUTES = [
  { key: "aroma", label: "향" },
  { key: "acidity", label: "산미" },
  { key: "sweetness", label: "단맛" },
  { key: "body", label: "바디감" },
  { key: "finish", label: "여운" },
  { key: "balance", label: "밸런스" }
] as const;

export type TasteKey = typeof TASTE_ATTRIBUTES[number]["key"];

export type TasteScores = Partial<Record<TasteKey, number>>;

// Taste fields hold a 1–5 score as text; anything else is treated as unscored.
export const tasteScore = (value?: string) => /^[1-5]$/.test(value ?? "") ? Number(value) : 0;

export const tasteSummary = (note?: TastingNote) => note ? TASTE_ATTRIBUTES.filter(({ key }) => tasteScore(note[key])).map(({ key, label }) => `${label} ${note[key]}`).join(" · ") : "";

export const noteMemo = (note?: TastingNote) => note ? [note.memo, note.flavor].filter(Boolean).join(" · ") : "";

export const emptyNoteForm = (): TastingNoteForm => ({
  beanId: "",
  brewId: null,
  rating: 3,
  flavor: "",
  aroma: "",
  acidity: "",
  body: "",
  finish: "",
  memo: "",
  date: localDate()
});
