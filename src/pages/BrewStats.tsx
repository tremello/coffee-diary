import { useEffect, useRef, useState } from "react";
import { readStatsPeriod, type StatsPeriod } from "../data/settings";
import { fmt, localDate, parseLocalDate, toDateKey } from "../lib/format";
import { type Bean, type Brew } from "../types";

export function BrewStats({ beans, brews }: { beans: Bean[]; brews: Brew[] }) {
  const [period, setPeriod] = useState<StatsPeriod>(readStatsPeriod);
  const days = period === "all" ? null : Number(period);
  const cutoff = days === null ? null : Date.parse(localDate()) - (days - 1) * 86_400_000;
  const filtered = brews.filter(brew => cutoff === null || Date.parse(brew.date) >= cutoff);
  const totalAmount = filtered.reduce((sum, brew) => sum + brew.amount, 0);
  const beanUsage = [...new Set(filtered.map(brew => brew.beanId))].map(beanId => {
    const bean = beans.find(item => item.id === beanId);
    return { name: bean?.name || "삭제된 원두", amount: filtered.filter(brew => brew.beanId === beanId).reduce((sum, brew) => sum + brew.amount, 0) };
  }).sort((a, b) => b.amount - a.amount);
  // One bar per day from the period start (or first brew for 전체) through today, empty days included; at least a week.
  const dailyTotals = filtered.reduce<Record<string, number>>((result, brew) => ({ ...result, [brew.date]: (result[brew.date] || 0) + brew.amount }), {});
  const todayDate = parseLocalDate(localDate());
  const firstBrewDate = filtered.reduce<string | null>((first, brew) => !first || brew.date < first ? brew.date : first, null);
  const spanDays = Math.max(7, days ?? (firstBrewDate ? Math.round((todayDate.getTime() - parseLocalDate(firstBrewDate).getTime()) / 86_400_000) + 1 : 7));
  const dailyUsage = Array.from({ length: spanDays }, (_, index) => {
    const date = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - (spanDays - 1 - index));
    return { date, amount: dailyTotals[toDateKey(date)] || 0 };
  });
  const dailyMax = Math.max(...dailyUsage.map(day => day.amount), 1);
  const dailyChartRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const chart = dailyChartRef.current; if (chart) chart.scrollLeft = chart.scrollWidth; }, [period, spanDays, filtered.length]);
  return <div className="brew-stats">
    <div className="inventory-intro stats-header"><div><p>기간을 골라 내 기록을 가볍게 돌아봐요.</p></div><select aria-label="통계 기간" value={period} onChange={event => setPeriod(event.target.value as "all" | "7" | "30" | "90")}><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option><option value="all">전체 기간</option></select></div>
    <div className="stats-cards"><div><span>브루잉 횟수</span><strong>{filtered.length}<small>회</small></strong></div><div><span>사용한 원두</span><strong>{beanUsage.length}<small>종</small></strong></div><div><span>사용량</span><strong>{fmt(Math.round(totalAmount * 10) / 10)}<small>g</small></strong></div></div>
    <section className="stats-section"><h3>원두별 사용량</h3>{beanUsage.length === 0 ? <p className="stats-empty">선택한 기간에 브루잉 기록이 없어요.</p> : <div className="usage-list">{beanUsage.map(item => <div className="usage-row" key={item.name}><span>{item.name}</span><b>{fmt(Math.round(item.amount * 10) / 10)}g</b></div>)}</div>}</section>
    <section className="stats-section"><h3>일별 사용량</h3>{filtered.length === 0 ? <p className="stats-empty">선택한 기간에 브루잉 기록이 없어요.</p> : <div className="daily-chart" ref={dailyChartRef} role="list" aria-label="일별 사용량, 왼쪽으로 끌면 이전 날짜">{dailyUsage.map(({ date, amount }) => {
      const grams = fmt(Math.round(amount * 10) / 10);
      return <div className={`daily-bar ${amount ? "" : "is-empty"}`} role="listitem" key={toDateKey(date)} aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일 ${amount ? `${grams}g` : "기록 없음"}`}>
        <b aria-hidden="true">{amount ? `${grams}g` : ""}</b>
        <div className="daily-bar-track" aria-hidden="true"><i style={{ height: amount ? `${Math.max(4, amount / dailyMax * 100)}%` : undefined }} /></div>
        <span aria-hidden="true">{date.getMonth() + 1}/{date.getDate()}</span>
      </div>;
    })}</div>}</section>
  </div>;
}
