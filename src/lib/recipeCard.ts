import { fmt } from "./format";
import { normalizedRecipeAction, recipeTimeToSeconds, recipeWater } from "./recipe";
import { type SavedRecipe } from "../types";

// Draws a saved recipe as the shareable image card: a 4:5 portrait (1080×1350) in the app's light palette,
// taller only when the steps and memo don't fit. Laid out in 400px-wide points and drawn at 2.7× for 1080px.
const SCALE = 2.7;
const WIDTH = 400;
const MIN_HEIGHT = 500;
const FONT = '"IBM Plex Sans KR", "Apple SD Gothic Neo", sans-serif';
const C = {
  cream: "#fbf7f1", paper: "#ffffff", line: "#ede3d6", ink: "#34291f", mid: "#6b5d50", warm: "#967b5a", brown: "#7a5733",
  dot: "#b08b5d", track: "#e3d5c5", tag: "#f3ece2", time: "#806d58", step: "#5f4b35", memoBg: "#faf6f0", memo: "#7d6a55"
};
const LOGO = "/coffee-diary-logo-brown-96.png";

type Row = { time: string; title: string; chip: string; pour: string; total: string; sub: string; closed: boolean; bypass: boolean };

// One timeline row per step, in the saved card's wording: only real switch changes are marked, closed stretches drawn thick.
const recipeRows = (recipe: SavedRecipe): Row[] => {
  let closed = false;
  let closedAt = 0;
  let cumulative = 0;
  return recipe.steps.map(step => {
    const action = normalizedRecipeAction(step.action);
    const amount = Number(step.amount) || 0;
    if (action !== "가수") cumulative += amount;
    const toggled = Boolean(recipe.immersion && step.switch && (step.switch === "닫고") !== closed);
    let steep = 0;
    if (toggled) {
      closed = step.switch === "닫고";
      if (closed) closedAt = recipeTimeToSeconds(step.time); else steep = recipeTimeToSeconds(step.time) - closedAt;
    }
    const row: Row = { time: step.time, title: action, chip: "", pour: "", total: "", sub: "", closed, bypass: action === "가수" };
    if (action === "없음") {
      row.title = closed ? "스위치 닫기" : "스위치 열기";
      row.sub = closed ? "침출 시작" : `${steepLabel(steep)} 우린 뒤 드로다운`;
    } else {
      if (toggled) row.chip = closed ? "닫기" : "열기";
      if (action === "가수") row.sub = `+${fmt(amount)}g · 서버에 추가`;
      else if (action === "마무리") row.total = `${fmt(cumulative)}g`;
      else { row.pour = `+${fmt(amount)}g`; row.total = `${fmt(cumulative)}g`; }
    }
    return row;
  });
};

const steepLabel = (seconds: number) => seconds < 60 ? `${seconds}초` : seconds % 60 ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초` : `${seconds / 60}분`;

const loadImage = (src: string) => new Promise<HTMLImageElement | null>(resolve => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = src;
});

const ensureFonts = async () => {
  try { await Promise.all([400, 500, 600, 700].map(weight => document.fonts.load(`${weight} 20px ${FONT}`, "가A1"))); } catch {}
};

// Canvas letter spacing isn't available everywhere, so spaced caps are drawn a letter at a time.
const spacedText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) => {
  for (const char of text) { ctx.fillText(char, x, y); x += ctx.measureText(char).width + spacing; }
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// Splits text into lines no wider than maxWidth, breaking at spaces when it can and anywhere otherwise (Korean).
const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      if (ctx.measureText(line + word).width <= maxWidth) { line += word; continue; }
      if (line.trim()) { lines.push(line.trimEnd()); line = ""; }
      for (const char of word.trimStart()) {
        if (ctx.measureText(line + char).width > maxWidth && line) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
};

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

export async function drawRecipeCard(recipe: SavedRecipe, footer: { by?: string; date: string }): Promise<Blob> {
  await ensureFonts();
  const logo = await loadImage(LOGO);
  const measure = document.createElement("canvas").getContext("2d")!;

  const pad = 18;
  const sheetX = pad, sheetW = WIDTH - pad * 2;
  const left = sheetX + 18, contentW = sheetW - 36, right = left + contentW;

  // Name: up to two lines at 22px, shrinking to 18px before it wraps a third time.
  let nameSize = 22;
  let nameLines: string[] = [];
  for (; nameSize >= 18; nameSize -= 1) {
    measure.font = font(700, nameSize);
    nameLines = wrap(measure, recipe.name, contentW);
    if (nameLines.length <= 2) break;
  }
  nameLines = nameLines.slice(0, 2);
  measure.font = font(400, 11);
  const memoLines = recipe.memo.trim() ? wrap(measure, recipe.memo.trim(), contentW - 20) : [];

  const rows = recipeRows(recipe);
  const nameH = nameLines.length * nameSize * 1.2;
  const fixedTop = pad + 18 + 12 + 8 + nameH + 12 + 50 + 6 + 21;
  const memoH = memoLines.length ? 8 + 16 + memoLines.length * 16.5 : 0;
  const fixedBottom = 14 + pad + 28;
  const minRow = 28, maxRow = 46;
  const roomForRows = MIN_HEIGHT - fixedTop - memoH - fixedBottom - 8;
  const rowH = Math.max(minRow, Math.min(maxRow, roomForRows / Math.max(1, rows.length)));
  const height = Math.max(MIN_HEIGHT, Math.ceil(fixedTop + rows.length * rowH + 8 + memoH + fixedBottom));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(WIDTH * SCALE);
  canvas.height = Math.round(height * SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, WIDTH, height);
  const sheetBottom = height - pad - 28;
  roundRect(ctx, sheetX + 0.5, pad + 0.5, sheetW - 1, sheetBottom - pad - 1, 16);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Eyebrow and type pill.
  let y = pad + 18;
  ctx.font = font(600, 9.5);
  ctx.fillStyle = C.warm;
  spacedText(ctx, "MY COFFEE RECIPE", left, y + 9, 1.33);
  const typeLabel = recipe.immersion ? "침출형" : "기본형";
  ctx.font = font(600, 10);
  const pillW = ctx.measureText(typeLabel).width + 16;
  roundRect(ctx, right - pillW, y - 1, pillW, 19, 9.5);
  ctx.fillStyle = C.tag;
  ctx.fill();
  ctx.fillStyle = C.brown;
  ctx.fillText(typeLabel, right - pillW + 8, y + 12);
  y += 12 + 8;

  ctx.font = font(700, nameSize);
  ctx.fillStyle = C.ink;
  nameLines.forEach((line, index) => ctx.fillText(line, left, y + nameSize * (0.95 + index * 1.2)));
  y += nameH + 12;

  // Stat row: 온도 / 원두 / 물 / 비율, or three equal cells when the recipe has no temperature.
  const { extraction: water } = recipeWater(recipe.steps);
  const cells: [string, string, string][] = [
    ...(recipe.temp ? [["온도", fmt(recipe.temp), "℃"] as [string, string, string]] : []),
    ["원두", fmt(recipe.coffee), "g"],
    ["물", fmt(water), "g"],
    ["비율", water && recipe.coffee ? `1:${(water / recipe.coffee).toFixed(1)}` : "1:–", ""]
  ];
  const statH = 50;
  ctx.fillStyle = C.line;
  ctx.fillRect(left, y, contentW, 1);
  ctx.fillRect(left, y + statH - 1, contentW, 1);
  const cellW = contentW / cells.length;
  cells.forEach(([label, value, unit], index) => {
    const cx = left + cellW * (index + 0.5);
    if (index) { ctx.fillStyle = C.line; ctx.fillRect(left + cellW * index, y + 1, 1, statH - 2); }
    ctx.textAlign = "center";
    ctx.font = font(400, 9.5);
    ctx.fillStyle = C.mid;
    ctx.fillText(label, cx, y + 18);
    ctx.font = font(600, 15);
    const valueW = ctx.measureText(value).width;
    ctx.font = font(500, 10);
    const unitW = unit ? ctx.measureText(unit).width + 1 : 0;
    const start = cx - (valueW + unitW) / 2;
    ctx.textAlign = "left";
    ctx.font = font(600, 15);
    ctx.fillStyle = C.ink;
    ctx.fillText(value, start, y + 38);
    if (unit) { ctx.font = font(500, 10); ctx.fillStyle = C.mid; ctx.fillText(unit, start + valueW + 1, y + 38); }
  });
  y += statH + 6;

  // Timeline: time | dot | step … pour | running total.
  const timeRight = left + 36, dotX = left + 52.5, titleX = left + 68, pourRight = right - 54;
  ctx.font = font(400, 9);
  ctx.fillStyle = C.mid;
  ctx.fillText("단계", titleX, y + 13);
  ctx.textAlign = "right";
  ctx.fillText("붓기", pourRight, y + 13);
  ctx.fillText("누적", right, y + 13);
  ctx.textAlign = "left";
  y += 21;

  rows.forEach((row, index) => {
    const top = y + index * rowH;
    const dotY = top + 8.5;
    if (index < rows.length - 1) {
      const nextDot = dotY + rowH;
      if (row.closed) { ctx.fillStyle = C.dot; ctx.fillRect(dotX - 2, dotY, 4, nextDot - dotY); }
      else { ctx.fillStyle = C.track; ctx.fillRect(dotX - 0.5, dotY + 5.5, 1, nextDot - dotY - 11); }
    }
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = row.closed ? C.dot : C.paper;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.dot;
    if (row.bypass) ctx.setLineDash([2.2, 1.8]);
    ctx.stroke();
    ctx.setLineDash([]);

    const baseline = top + 12.5;
    ctx.textAlign = "right";
    ctx.font = font(500, 11);
    ctx.fillStyle = C.time;
    ctx.fillText(row.time, timeRight, baseline);
    ctx.textAlign = "left";
    ctx.font = font(600, 12.5);
    ctx.fillStyle = C.ink;
    ctx.fillText(row.title, titleX, baseline);
    if (row.chip) {
      const chipX = titleX + ctx.measureText(row.title).width + 5;
      ctx.font = font(600, 9.5);
      const chipW = ctx.measureText(row.chip).width + 12;
      roundRect(ctx, chipX, baseline - 11, chipW, 15, 7.5);
      ctx.fillStyle = C.tag;
      ctx.fill();
      ctx.fillStyle = C.brown;
      ctx.fillText(row.chip, chipX + 6, baseline - 0.5);
    }
    ctx.textAlign = "right";
    if (row.sub) { ctx.font = font(400, 10.5); ctx.fillStyle = C.warm; ctx.fillText(row.sub, right, baseline - 0.5); }
    if (row.pour) { ctx.font = font(400, 12); ctx.fillStyle = C.warm; ctx.fillText(row.pour, pourRight, baseline); }
    if (row.total) { ctx.font = font(600, 12); ctx.fillStyle = C.ink; ctx.fillText(row.total, right, baseline); }
    ctx.textAlign = "left";
  });
  y += rows.length * rowH + 8;

  if (memoLines.length) {
    const memoTop = sheetBottom - 14 - (memoH - 8);
    roundRect(ctx, left, memoTop, contentW, memoH - 8, 8);
    ctx.fillStyle = C.memoBg;
    ctx.fill();
    ctx.font = font(400, 11);
    ctx.fillStyle = C.memo;
    memoLines.forEach((line, index) => ctx.fillText(line, left + 10, memoTop + 8 + 12 + index * 16.5));
  }

  // Footer under the sheet: logo + COFFEE DIARY, and who shared it on which day.
  const footY = sheetBottom + 18;
  if (logo) ctx.drawImage(logo, pad + 4, footY - 9, 18, 18);
  ctx.font = font(600, 10);
  ctx.fillStyle = C.brown;
  spacedText(ctx, "COFFEE DIARY", pad + 28, footY + 3.5, 0.2);
  ctx.textAlign = "right";
  ctx.font = font(400, 10);
  ctx.fillStyle = C.mid;
  ctx.fillText([footer.by, footer.date].filter(Boolean).join(" · "), WIDTH - pad - 4, footY + 3.5);

  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("이미지를 만들지 못했어요.")), "image/png"));
}
