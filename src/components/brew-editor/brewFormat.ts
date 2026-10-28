import { fmt, localDate, parseLocalDate } from "../../lib/format";
import { type Brew, type BrewForm, type TastingNote, type TastingNoteForm } from "../../types";

export const emptyBrewForm = (): BrewForm => ({ beanId: "", amount: "", waterAmount: "", method: "", date: localDate(), recipe: "", grindSize: "", waterTemp: "", brewTime: "" });

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

export const brewConditions = (brew: Brew) => [brew.method, brew.grindSize && `분쇄 ${brew.grindSize}`, brew.waterTemp && `${fmt(brew.waterTemp)}℃`, brew.brewTime && `${brew.brewTime} 추출`].filter(Boolean).join(" · ");

export const brewRatio = (amount: number, waterAmount?: number) => waterAmount && amount > 0 ? `1:${Number((waterAmount / amount).toFixed(1)).toLocaleString()}` : "";

// The parts of a brew worth repeating next time: dose, water, recipe and how it was brewed (not the date or the notes).
export const brewConditionsForm = (brew: Brew): Omit<BrewForm, "beanId" | "date"> => ({ amount: String(brew.amount), waterAmount: brew.waterAmount ? String(brew.waterAmount) : "", method: brew.method, recipe: brew.recipe, grindSize: brew.grindSize ?? "", waterTemp: brew.waterTemp ? String(brew.waterTemp) : "", brewTime: brew.brewTime ?? "" });

export const latestBrewOf = (brews: Brew[], beanId: number) => brews.filter(brew => brew.beanId === beanId).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];

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
