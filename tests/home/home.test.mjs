// The home tab's pick rule (src/lib/home.ts), compiled once with Vite like the sync tests.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
let home, peak;

before(async () => {
  const outDir = join(root, "node_modules", ".cache", "coffee-home-test");
  await build({ root, configFile: false, logLevel: "silent", build: { ssr: true, rollupOptions: { input: { home: "src/lib/home.ts", peak: "src/lib/peak.ts" } }, outDir, emptyOutDir: true, minify: false, copyPublicDir: false } });
  const files = await readdir(outDir);
  const load = name => import(pathToFileURL(join(outDir, files.find(file => file.startsWith(name) && /\.m?js$/.test(file)))).href);
  [home, peak] = await Promise.all([load("home"), load("peak")]);
});

const TODAY = "2026-11-02";
const daysAgo = days => { const d = new Date(2026, 10, 2 - days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
let nextId = 1;
const bean = fields => ({ id: nextId++, name: "원두", origin: "", process: "", roastery: "", date: daysAgo(30), purchased: 200, remaining: 200, price: "", status: "소비 중", ...fields });
const brew = (beanId, date, fields = {}) => ({ id: nextId++, beanId, amount: 15, waterAmount: 240, method: "V60", date, recipe: "", ...fields });
const pickFrom = (beans, brews, pick) => {
  const items = home.homeBeans(beans, brews, b => peak.beanPeak(b, {}, brews, TODAY));
  return home.recommend(items, brews, TODAY, pick);
};

test("low stock comes first, fewest cups first", () => {
  const a = bean({ name: "많음", remaining: 180 });
  const b = bean({ name: "두 잔", remaining: 34 });
  const c = bean({ name: "한 잔", remaining: 20 });
  const brews = [brew(a.id, daysAgo(1)), brew(b.id, daysAgo(2)), brew(c.id, daysAgo(3))];
  const top = pickFrom([a, b, c], brews);
  assert.equal(top.item.bean.name, "한 잔");
  assert.equal(top.reason, "1잔 남아서 먼저");
});

test("dose follows the bean's latest brew", () => {
  const a = bean({ name: "20g씩", remaining: 50 });
  const b = bean({ name: "많음", remaining: 180 });
  const brews = [brew(a.id, daysAgo(1), { amount: 20 }), brew(b.id, daysAgo(1))];
  assert.equal(pickFrom([a, b], brews).reason, "2잔 남아서 먼저");
  assert.equal(pickFrom([bean({ remaining: 60 })], [brew(a.id, daysAgo(1), { amount: 20 })]).item.dose, 20);
});

test("peak order when nothing runs low: 아직 괜찮음 ending soonest first", () => {
  const best = bean({ name: "좋은 때", roastLevel: "라이트", roastDate: daysAgo(14) });
  const ok = bean({ name: "괜찮음", roastLevel: "라이트", roastDate: daysAgo(40) });
  const top = pickFrom([best, ok], []);
  assert.equal(top.item.bean.name, "괜찮음");
  assert.equal(top.reason, "아직 괜찮음 · 5일 남았어요");
  const onlyBest = pickFrom([best], []);
  assert.equal(onlyBest.reason, "가장 좋은 때 · 14일 더");
});

test("resting beans are never picked", () => {
  const resting = bean({ name: "쉬는 중", roastLevel: "라이트", roastDate: daysAgo(2), remaining: 20 });
  const manual = bean({ name: "디개싱", status: "디개싱 중", remaining: 20 });
  const fine = bean({ name: "괜찮은 원두", remaining: 180 });
  const top = pickFrom([resting, manual, fine], []);
  assert.equal(top.item.bean.name, "괜찮은 원두");
  assert.equal(top.reason, "처음 내리는 원두 · 자주 쓰는 조건");
});

test("the last brewed bean when no stage or low stock", () => {
  const a = bean({ name: "어제" }), b = bean({ name: "지난주" });
  const brews = [brew(a.id, daysAgo(1)), brew(b.id, daysAgo(6))];
  const top = pickFrom([a, b], brews);
  assert.equal(top.item.bean.name, "어제");
  assert.equal(top.reason, "어제 내린 원두");
  assert.equal(pickFrom([b], brews).reason, "10월 27일 내린 원두");
});

test("today's own pick wins while it can still be brewed", () => {
  const low = bean({ name: "한 잔", remaining: 20 });
  const mine = bean({ name: "고른 원두", remaining: 180 });
  const resting = bean({ name: "쉬는 중", status: "디개싱 중" });
  assert.equal(pickFrom([low, mine], [], { id: mine.id, date: TODAY }).reason, "직접 고른 원두");
  assert.equal(pickFrom([low, mine], [], { id: mine.id, date: daysAgo(1) }).item.bean.name, "한 잔");
  assert.equal(pickFrom([low, resting], [], { id: resting.id, date: TODAY }).item.bean.name, "한 잔");
});

test("no candidate: empty bag, used up, deleted or all resting", () => {
  assert.equal(pickFrom([], []), null);
  assert.equal(pickFrom([bean({ remaining: 10 }), bean({ deleted: true }), bean({ status: "디개싱 중" })], []), null);
});

test("old data without roast date, level or notes still works", () => {
  const old = { id: nextId++, name: "옛 원두", origin: "", process: "", roastery: "", date: "2024-01-01", purchased: 200, remaining: 100, price: "" };
  const top = pickFrom([old], [{ id: nextId++, beanId: old.id, amount: 15, method: "", date: "2024-01-02", recipe: "" }]);
  assert.equal(top.item.bean.name, "옛 원두");
});

test("this week counts cafe cups and the run of days", () => {
  const brews = [brew(1, TODAY), brew(1, TODAY), brew(0, daysAgo(1), { kind: "cafe", amount: 0 }), brew(1, daysAgo(2)), brew(1, daysAgo(5)), brew(1, daysAgo(8))];
  const week = home.weekSummary(brews, TODAY);
  assert.equal(week.cups, 5);
  assert.equal(week.days, 4);
  assert.equal(week.streak, 3);
  assert.deepEqual(week.perDay, [0, 1, 0, 0, 1, 1, 2]);
  assert.equal(home.weekSummary([brew(1, daysAgo(1)), brew(1, daysAgo(2))], TODAY).streak, 2);
});

test("남은 원두: ready beans first, resting last", () => {
  const items = home.homeBeans([bean({ name: "쉬는 중", status: "디개싱 중" }), bean({ name: "괜찮음", roastLevel: "라이트", roastDate: daysAgo(40) }), bean({ name: "모름" })], [], b => peak.beanPeak(b, {}, [], TODAY));
  assert.deepEqual(home.sortHomeBeans(items).map(item => item.bean.name), ["괜찮음", "모름", "쉬는 중"]);
});

test("a selected row overrides the recommendation on PC", () => {
  const low = bean({ name: "한 잔", remaining: 20 });
  const other = bean({ name: "다른 원두", remaining: 180 });
  const resting = bean({ name: "쉬는 중", roastLevel: "라이트", roastDate: daysAgo(3) });
  const items = home.homeBeans([low, other, resting], [], b => peak.beanPeak(b, {}, [], TODAY));
  assert.equal(home.selectedBean(items, [], TODAY, null, null).item.bean.name, "한 잔");
  assert.equal(home.selectedBean(items, [], TODAY, null, low.id).reason, "1잔 남아서 먼저");
  assert.equal(home.selectedBean(items, [], TODAY, { id: low.id, date: TODAY }, low.id).reason, "1잔 남아서 먼저");
  const picked = home.selectedBean(items, [], TODAY, null, other.id);
  assert.equal(picked.item.bean.name, "다른 원두");
  assert.equal(picked.reason, "직접 고른 원두");
  assert.equal(home.selectedBean(items, [], TODAY, null, resting.id).reason, "아직 쉬는 중 · 4일 뒤부터");
});
