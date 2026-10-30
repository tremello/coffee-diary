import { type BeanForm } from "../types";
import { blendName, isBlend } from "./blend";

export const localDate = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };

export const beanName = (bean: BeanForm) => isBlend(bean) ? blendName(bean) : [bean.origin, bean.farm, bean.variety, bean.process].map(value => value?.trim()).filter(Boolean).join(" ");

export const FONT = "'IBM Plex Sans KR', 'Apple SD Gothic Neo', sans-serif";

// Scroll after React has rendered the editor: scrolling first lets the inserted form shift the page and stop the scroll short.
export const scrollToEditor = (editor: { current: HTMLElement | null }) => window.setTimeout(() => editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

// Notes are separated by commas (or ·, 、, line breaks) only, so a note like "흰 꽃" stays whole.
export const splitCupNotes = (value?: string) => (value ?? "").split(/[,，·、\n]+/).map(note => note.trim()).filter(Boolean);

export const fmt = (n: number | string) => Number(n).toLocaleString();

const digitsOnly = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

export const withCommas = (value: string) => /^\d+$/.test(value) ? fmt(value) : value;

// Prices are stored as plain digits but shown with thousands commas; the caret stays after the same digit it was after.
export const handleNumericInput = (event: React.ChangeEvent<HTMLInputElement>, setValue: (value: string) => void) => {
  const input = event.target;
  const digitsBeforeCaret = digitsOnly(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
  setValue(digitsOnly(input.value));
  window.setTimeout(() => {
    let position = 0;
    for (let seen = 0; position < input.value.length && seen < digitsBeforeCaret; position++) if (/\d/.test(input.value[position])) seen++;
    if (document.activeElement === input) input.setSelectionRange(position, position);
  });
};

export const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const parseLocalDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};
