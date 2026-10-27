import { type Bean, type Brew, type SavedRecipe, type TastingNote } from "../types";

export type ExportData = { beans: Bean[]; brews: Brew[]; notes: TastingNote[]; recipes: SavedRecipe[]; drippers: string[] };

const download = (name: string, type: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const today = () => new Date().toLocaleDateString("sv-SE");

// Full backup in the same shape the app stores, so a later import can read it back.
export const downloadJson = (data: ExportData) => download(`coffee-diary-${today()}.json`, "application/json", JSON.stringify({ app: "coffee-diary", exportedAt: new Date().toISOString(), ...data }, null, 2));

const cell = (value: unknown) => { const text = value === undefined || value === null ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map(row => row.map(cell).join(",")).join("\r\n");

// Two sheets as one file each would be awkward on phones, so beans and brews go in one CSV with a blank line between; Excel opens it with the BOM.
export const downloadCsv = ({ beans, brews }: ExportData) => {
  const live = beans.filter(bean => !bean.deleted);
  const byId = new Map(beans.map(bean => [bean.id, bean]));
  const beanTable = toCsv(["원두", "로스터리", "원산지", "농장", "품종", "가공", "구매일", "로스팅일", "구매량(g)", "남은 양(g)", "가격", "상태", "등급", "컵노트", "메모"],
    live.map(b => [b.name, b.roastery, b.origin, b.farm, b.variety, b.process, b.date, b.roastDate, b.purchased, b.remaining, b.price, b.status, b.quality, b.roasteryNotes, b.memo]));
  const brewTable = toCsv(["날짜", "원두", "원두량(g)", "물(g)", "드리퍼", "레시피", "분쇄도", "물 온도(℃)", "추출 시간"],
    [...brews].sort((a, b) => b.date.localeCompare(a.date)).map(b => { const bean = byId.get(b.beanId); return [b.date, bean?.name ?? "", b.amount, b.waterAmount, b.method, b.recipe, b.grindSize, b.waterTemp, b.brewTime]; }));
  download(`coffee-diary-${today()}.csv`, "text/csv", `﻿[원두]\r\n${beanTable}\r\n\r\n[브루잉 기록]\r\n${brewTable}`);
};
