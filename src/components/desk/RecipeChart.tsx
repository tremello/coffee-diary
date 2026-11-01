import { useEffect, useRef, useState } from "react";
import { fmt } from "../../lib/format";
import { isBypassStep, normalizedRecipeAction, recipeTime, recipeTimeToSeconds } from "../../lib/recipe";
import { type RecipeStep } from "../../types";

// A pour takes about this long, so the water line rises on a slope instead of a right angle.
const POUR_SECONDS = 10;

// How the water builds up over time: a slope while pouring, flat while waiting. Immersion recipes get a switch lane on top
// (closed = steeping, open = draining). Bypass water goes straight into the cup, so its slope is dashed. The picked step is darker.
export function RecipeChart({ steps, immersion, picked }: { steps: RecipeStep[]; immersion?: boolean; picked: number | null }) {
  // The drawing is as wide as its box in real pixels, so the axis text keeps its size (11px) instead of shrinking with the half column.
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(420);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const times = steps.map(step => recipeTimeToSeconds(step.time));
  const last = Math.max(0, ...times);
  const end = Math.max(last + 15, 30);
  const total = Math.max(1, steps.reduce((sum, step) => sum + (isAmountlessStep(step) ? 0 : Number(step.amount) || 0), 0));
  const L = 44, R = 12;
  const top = immersion ? 44 : 18, H = immersion ? 236 : 206, B = H - 26;
  const x = (t: number) => L + (W - L - R) * Math.min(t, end) / end;
  const y = (v: number) => B - (B - top) * v / total;

  // Points of the water line, and the segment each pouring step draws.
  let cum = 0;
  const points: [number, number][] = [[x(0), y(0)]];
  const segments = steps.map((step, index) => {
    const amount = isAmountlessStep(step) ? 0 : Number(step.amount) || 0;
    const t = times[index];
    const next = index + 1 < steps.length ? Math.max(t, times[index + 1]) : end;
    const from: [number, number] = [x(t), y(cum)];
    if (!amount) return { from, to: null as [number, number] | null, bypass: false };
    cum += amount;
    const to: [number, number] = [x(Math.min(t + POUR_SECONDS, next)), y(cum)];
    points.push(from, to);
    return { from, to, bypass: isBypassStep(step) };
  });
  points.push([x(end), y(cum)]);
  const line = `M${points.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join(" L")}`;

  // Switch lane: starts open; each 닫고/열고 that changes the state starts a new band.
  const bands: { closed: boolean; from: number; to: number }[] = [];
  if (immersion) {
    let closed = false, from = 0;
    steps.forEach((step, index) => {
      if (step.switch === undefined || (step.switch === "닫고") === closed) return;
      if (times[index] > from) bands.push({ closed, from, to: times[index] });
      closed = step.switch === "닫고"; from = times[index];
    });
    bands.push({ closed, from, to: end });
  }

  const ticks = [...new Set([0, 60, 120, 180, 240, 300, 360, 420, 480].filter(t => t < end - 25).concat(end))];
  const pick = picked !== null ? segments[picked] : null;
  const pickedStep = picked !== null ? steps[picked] : null;
  const pickLabel = pickedStep ? `${recipeTime(times[picked!])}${!isAmountlessStep(pickedStep) && pickedStep.amount ? ` · +${fmt(pickedStep.amount)}g` : pickedStep.switch ? ` · 스위치 ${pickedStep.switch === "닫고" ? "닫기" : "열기"}` : ` · ${normalizedRecipeAction(pickedStep.action)}`}` : "";
  const labelAt = pick ? (pick.to ?? pick.from) : null;
  const labelEnd = labelAt ? labelAt[0] > W - 120 : false;

  return <figure ref={box} className="desk-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="시간에 따라 쌓이는 물 양">
      {[0, 0.5, 1].map(f => { const v = Math.round(total * f); return <g key={f}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="desk-chart-grid" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="desk-chart-axis">{fmt(v)}g</text></g>; })}
      {ticks.map(t => <text key={t} x={x(t)} y={H - 8} textAnchor={t === 0 ? "start" : t === end ? "end" : "middle"} className="desk-chart-axis">{recipeTime(t)}</text>)}
      {immersion && <>
        <text x={L - 6} y={25} textAnchor="end" className="desk-chart-lane-name">스위치</text>
        {bands.map(band => <g key={band.from}>
          {band.closed && <rect x={x(band.from)} y={top} width={x(band.to) - x(band.from)} height={B - top} className="desk-chart-steep" />}
          <rect x={x(band.from) + 1} y={12} width={Math.max(0, x(band.to) - x(band.from) - 2)} height={18} rx={5} className={band.closed ? "desk-chart-closed" : "desk-chart-open"} />
          {x(band.to) - x(band.from) > 34 && <text x={x(band.from) + 7} y={25} className={band.closed ? "desk-chart-closed-text" : "desk-chart-open-text"}>{band.closed ? "닫힘" : "열림"}</text>}
        </g>)}
      </>}
      <path d={`${line} L${x(end)} ${B} L${x(0)} ${B} Z`} className="desk-chart-area" />
      <path d={line} className="desk-chart-line" />
      {segments.map((segment, index) => segment.to && segment.bypass && <g key={index}>
        <line x1={segment.from[0]} y1={segment.from[1]} x2={segment.to[0]} y2={segment.to[1]} className="desk-chart-gap" />
        <line x1={segment.from[0]} y1={segment.from[1]} x2={segment.to[0]} y2={segment.to[1]} className="desk-chart-bypass" />
      </g>)}
      {pick && <>
        <line x1={pick.from[0]} x2={pick.from[0]} y1={top} y2={B} className="desk-chart-guide" />
        {pick.to ? <line x1={pick.from[0]} y1={pick.from[1]} x2={pick.to[0]} y2={pick.to[1]} className="desk-chart-picked" /> : <circle cx={pick.from[0]} cy={pick.from[1]} r={4.5} className="desk-chart-dot" />}
        {labelAt && <text x={labelAt[0] + (labelEnd ? -8 : 8)} y={labelAt[1] - 10 < top + 10 ? labelAt[1] + 18 : labelAt[1] - 10} textAnchor={labelEnd ? "end" : "start"} className="desk-chart-label">{pickLabel}</text>}
      </>}
    </svg>
    <figcaption className="desk-chart-legend">{immersion ? <><span>━ 커피를 지나는 물</span><span>┅ 가수 (컵에 바로)</span></> : <><span>비스듬 = 붓는 10초</span><span>평평 = 기다리기</span></>}</figcaption>
  </figure>;
}

const isAmountlessStep = (step: RecipeStep) => { const action = normalizedRecipeAction(step.action); return action === "마무리" || action === "없음"; };
