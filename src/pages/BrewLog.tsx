import { Fragment, useEffect, useState } from "react";
import { type StorageSetter, useStorage } from "../data/sync";
import { Empty, JourneySteps } from "../components/ui";
import { BrewDetail } from "../components/brew-editor/BrewDetail";
import { BrewEditor, type BrewNote } from "../components/brew-editor/BrewEditor";
import { brewConditions, brewConditionsForm, cafeBeanLine, cafeTitle, recentCafes, composeGrind, parseGrind, brewRatio, dayHeading, emptyBrewForm, emptyNoteForm, latestBrewOf, normalizeBrewTime, noteMemo, shortDate, TASTE_ATTRIBUTES, tasteScore, tasteSummary } from "../components/brew-editor/brewFormat";
import { RatingStars } from "../components/brew-editor/RatingStars";
import { STORAGE_KEYS } from "../data/keys";
import { readLocal, writeLocal } from "../data/storage";
import { fmt, localDate } from "../lib/format";
import { normalizedRecipeAction, recipeTime, recipeTimeToSeconds, recipeWater } from "../lib/recipe";
import { type Bean, type BeanStatus, type Brew, type BrewForm, isCafeBrew, type SavedRecipe, type TastingNote } from "../types";

// Shown only until the user registers drippers of their own.
const DRIPPER_SUGGESTIONS = ["하리오 V60", "오리가미", "칼리타"];
const GRINDER_SUGGESTIONS = ["코만단테", "1Zpresso K-Ultra", "타임모어 C3"];

// An unsaved new brew survives closing the sheet by accident; cf_ so it is cleared with the account's other local data.
const DRAFT_KEY = "cf_brew_draft";
type BrewDraft = { form: BrewForm; recipeId: string; note: BrewNote };

const emptyNote = (): BrewNote => ({ memo: "", rating: 0, taste: {} });

// Where the form's conditions came from, so the notice can say so and "비우기" can undo it.
type Prefill = { kind: "bean" | "again" | "draft"; text: string } | null;

const RepeatIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></svg>;

export function BrewLog({ beans, setBeans, brews, setBrews, notes, setNotes, recipes, userId, openInitially, initialBeanId, onOpened }: {
  beans: Bean[];
  setBeans: StorageSetter<Bean[]>;
  brews: Brew[];
  setBrews: StorageSetter<Brew[]>;
  notes: TastingNote[];
  setNotes: StorageSetter<TastingNote[]>;
  recipes: SavedRecipe[];
  userId: string | null;
  openInitially: boolean;
  initialBeanId: number | null;
  onOpened: () => void;
}) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<BrewForm>(emptyBrewForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [note, setNote] = useState<BrewNote>(emptyNote);
  const [prefill, setPrefill] = useState<Prefill>(null);
  const [drippers, setDrippers] = useStorage<string[]>(STORAGE_KEYS.drippers, [], userId);
  const [grinders, setGrinders] = useStorage<string[]>(STORAGE_KEYS.grinders, [], userId);
  const [query, setQuery] = useState("");
  const [brewSort, setBrewSort] = useState<"latest" | "oldest">("latest");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [brewError, setBrewError] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deletedBrew, setDeletedBrew] = useState<{ brew: Brew; notes: TastingNote[] } | null>(null);

  const activeBeans = beans.filter(b => !b.deleted && b.remaining > 0);
  // A brew being edited may have used up (or deleted) its bean; keep that bean pickable so the field isn't blank.
  const editingBean = editingId !== null ? beans.find(b => String(b.id) === form.beanId && !activeBeans.includes(b)) : undefined;
  const beanChoices = editingBean ? [editingBean, ...activeBeans] : activeBeans;
  const noteOf = (brew: Brew) => notes.find(item => item.brewId === brew.id);
  // Older brews only kept the recipe name; link them to the one saved recipe of that name so it shows as picked.
  const recipeIdFor = (brew: Brew) => {
    if (brew.recipeId !== undefined && recipes.some(recipe => recipe.id === brew.recipeId)) return String(brew.recipeId);
    const named = brew.recipe.trim() ? recipes.filter(recipe => recipe.name.trim() === brew.recipe.trim()) : [];
    return named.length === 1 ? String(named[0].id) : "";
  };

  // Grinders keep their usual setting: the click count of the newest brew made with that grinder, whatever the recipe or bean.
  const byNewest = brews.filter(brew => !isCafeBrew(brew)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const grinderOf = (brew?: Brew) => brew?.grindSize ? parseGrind(brew.grindSize, grinders).grinder : "";
  const lastClicks = (grinder: string) => {
    for (const brew of byNewest) { const grind = parseGrind(brew.grindSize ?? "", grinders); if (grinder && grind.grinder === grinder && /^\d/.test(grind.clicks)) return grind.clicks; }
    return "";
  };
  // A new brew starts with the grinder of that bean's last brew, else of the latest brew, else the first registered one.
  const defaultGrinderFor = (beanId: string) => (beanId ? grinderOf(latestBrewOf(brews, Number(beanId))) : "") || grinderOf(byNewest[0]) || grinders[0] || "";
  const autoGrind = (beanId: string) => { const grinder = defaultGrinderFor(beanId); return composeGrind(grinder, lastClicks(grinder)); };
  const withLastClicks = (grindSize: string) => { const { grinder } = parseGrind(grindSize, grinders); const clicks = grinder ? lastClicks(grinder) : ""; return clicks ? composeGrind(grinder, clicks) : grindSize; };
  const grindTouched = form.grindSize !== "" && form.grindSize !== autoGrind(form.beanId);

  // Keep the unsaved new brew while the sheet is open; saving or "비우기" removes it.
  const dirty = Boolean(form.cafe || form.menu || form.roastery || form.origin || form.process || form.beanId || form.amount || form.waterAmount || form.method || form.recipe || grindTouched || form.waterTemp || form.brewTime || note.memo.trim() || note.rating || Object.values(note.taste).some(Boolean));
  useEffect(() => {
    if (show && editingId === null && dirty) writeLocal(DRAFT_KEY, { form, recipeId: selectedRecipeId, note } satisfies BrewDraft);
  }, [show, editingId, dirty, form, selectedRecipeId, note]);
  const dropDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} };

  const resetForm = () => { setForm(emptyBrewForm()); setNote(emptyNote()); setSelectedRecipeId(""); setEditingId(null); setPrefill(null); setBrewError(""); };
  // "이대로 다시 내리기" keeps the brew's own click; a bean's last-conditions prefill takes the grinder's latest one.
  const fillFrom = (brew: Brew, beanId: string, exact = false) => {
    const conditions = brewConditionsForm(brew);
    setForm({ ...conditions, grindSize: exact ? conditions.grindSize : withLastClicks(conditions.grindSize), beanId, date: localDate() });
    setSelectedRecipeId(recipeIdFor(brew));
  };
  // A newly picked bean starts from the conditions of its latest brew, unless the user already typed conditions of their own.
  const startWithBean = (beanId: string) => {
    const last = latestBrewOf(brews, Number(beanId));
    const untouched = prefill?.kind === "bean" || !(form.amount || form.waterAmount || form.method || grindTouched || form.waterTemp || form.brewTime);
    if (last && untouched) { fillFrom(last, beanId); setPrefill({ kind: "bean", text: `지난번(${shortDate(last.date)}) 이 원두로 내린 조건을 채웠어요` }); }
    else if (prefill?.kind === "bean") { setForm(current => ({ ...emptyBrewForm(), beanId, date: current.date, grindSize: autoGrind(beanId) })); setSelectedRecipeId(""); setPrefill(null); }
    else setForm(current => ({ ...current, beanId }));
    setBrewError("");
  };
  const openNew = () => {
    resetForm();
    const draft = readLocal<BrewDraft>(DRAFT_KEY);
    if (draft?.form) {
      setForm({ ...emptyBrewForm(), ...draft.form }); setSelectedRecipeId(draft.recipeId ?? ""); setNote({ ...emptyNote(), ...draft.note });
      setPrefill({ kind: "draft", text: "적던 기록을 이어서 채웠어요" });
    } else setForm({ ...emptyBrewForm(), grindSize: autoGrind("") });
    setDetailId(null);
    setShow(true);
  };
  const openWithBean = (beanId: number) => {
    resetForm();
    const last = latestBrewOf(brews, beanId);
    if (last) { fillFrom(last, String(beanId)); setPrefill({ kind: "bean", text: `지난번(${shortDate(last.date)}) 이 원두로 내린 조건을 채웠어요` }); }
    else setForm({ ...emptyBrewForm(), beanId: String(beanId), grindSize: autoGrind(String(beanId)) });
    setShow(true);
  };
  const again = (brew: Brew) => {
    resetForm();
    fillFrom(brew, activeBeans.some(bean => bean.id === brew.beanId) ? String(brew.beanId) : "", true);
    setPrefill({ kind: "again", text: `${shortDate(brew.date)} 기록을 그대로 채웠어요` });
    setDetailId(null);
    setShow(true);
  };
  const clearPrefill = () => {
    if (prefill?.kind === "draft") { dropDraft(); resetForm(); setForm({ ...emptyBrewForm(), grindSize: autoGrind("") }); return; }
    setForm(current => ({ ...emptyBrewForm(), beanId: current.beanId, date: current.date, grindSize: autoGrind(current.beanId) }));
    setSelectedRecipeId(""); setPrefill(null);
  };
  useEffect(() => {
    if (!openInitially) return;
    if (initialBeanId) openWithBean(initialBeanId); else openNew();
    onOpened();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInitially]);

  // The tasting note rides along with the brew (linked by brewId); a cafe brew's note has beanId 0 like the brew.
  const saveNote = (brew: Brew, previousNote: TastingNote | null | undefined) => {
    if (!(note.memo.trim() || note.rating > 0 || Object.values(note.taste).some(Boolean) || previousNote)) return;
    const base = previousNote ?? emptyNoteForm();
    const taste = Object.fromEntries(TASTE_ATTRIBUTES.map(({ key }) => [key, note.taste[key] ? String(note.taste[key]) : tasteScore(base[key]) ? "" : base[key] ?? ""]));
    const saved = { ...base, ...taste, id: previousNote?.id ?? Date.now() + 1, beanId: brew.beanId, brewId: brew.id, rating: note.rating, memo: note.memo.trim(), date: form.date };
    setNotes(previousNote ? notes.map(item => item.id === previousNote.id ? saved : item) : [...notes, saved]);
  };
  const finishSave = () => {
    if (editingId === null) dropDraft();
    resetForm();
    setShow(false);
  };
  // A cafe brew never touches the beans; only an own brew turned into a cafe one while editing gives its grams back.
  const addCafe = () => {
    const cafe = form.cafe?.name.trim() ? { ...form.cafe, name: form.cafe.name.trim() } : null;
    if (!cafe || !form.date) { setBrewError("카페와 날짜를 확인해주세요."); return; }
    const previous = editingId === null ? null : brews.find(item => item.id === editingId) ?? null;
    const text = (value: string) => value.trim() || undefined;
    const brew: Brew = { id: editingId ?? Date.now(), beanId: 0, amount: 0, kind: "cafe", cafe, method: form.method.trim(), date: form.date, recipe: "", menu: text(form.menu), roastery: text(form.roastery), origin: text(form.origin), process: text(form.process) };
    setBrews(editingId === null ? [...brews, brew] : brews.map(item => item.id === editingId ? brew : item));
    if (previous && !isCafeBrew(previous)) setBeans(beans.map(item => item.id === previous.beanId ? { ...item, remaining: Math.round((item.remaining + previous.amount) * 10) / 10 } : item));
    saveNote(brew, previous ? noteOf(previous) : null);
    finishSave();
  };

  const add = () => {
    if (form.kind === "cafe") { addCafe(); return; }
    if (!form.beanId || !form.amount || !form.date || (editingId === null && !form.waterAmount)) { setBrewError("원두, 원두 양, 물 양을 확인해주세요."); return; }
    const nextBeanId = Number(form.beanId);
    const bean = beans.find(b => b.id === nextBeanId);
    const amt = parseFloat(form.amount);
    if (!bean) { setBrewError("선택한 원두를 찾을 수 없어요. 원두를 다시 선택해주세요."); return; }
    if (Number.isNaN(amt) || amt <= 0) { setBrewError("원두 양은 0보다 큰 숫자로 입력해주세요."); return; }
    const water = form.waterAmount.trim() ? parseFloat(form.waterAmount) : undefined;
    if (water !== undefined && (Number.isNaN(water) || water <= 0)) { setBrewError("물 양은 0보다 큰 숫자로 입력해주세요."); return; }
    const temp = form.waterTemp.trim() ? parseFloat(form.waterTemp) : undefined;
    if (temp !== undefined && (Number.isNaN(temp) || temp <= 0 || temp > 100)) { setBrewError("물 온도는 0~100℃ 사이 숫자로 입력해주세요."); return; }
    const brewTime = normalizeBrewTime(form.brewTime);
    if (brewTime === null) { setBrewError("추출 시간은 2:45처럼 분:초로 입력해주세요."); return; }
    const previous = editingId === null ? null : brews.find(item => item.id === editingId) ?? null;
    const previousNote = previous ? noteOf(previous) : null;
    const restoredBeans = previous && !isCafeBrew(previous) ? beans.map(item => item.id === previous.beanId ? { ...item, remaining: Math.round((item.remaining + previous.amount) * 10) / 10 } : item) : beans;
    const available = restoredBeans.find(item => item.id === nextBeanId);
    if (!available || available.remaining < amt) { setBrewError(`잔여량(${fmt(available?.remaining ?? 0)}g)이 부족해요.`); return; }
    const startsConsuming = available.status === "디개싱 중";
    const recipeId = selectedRecipeId ? Number(selectedRecipeId) : previous && previous.recipe === form.recipe ? previous.recipeId : undefined;
    const brew: Brew = { id: editingId ?? Date.now(), beanId: nextBeanId, amount: amt, waterAmount: water, method: form.method.trim(), date: form.date, recipe: form.recipe, ...(recipeId !== undefined ? { recipeId } : {}), grindSize: form.grindSize.trim() || undefined, waterTemp: temp, brewTime: brewTime || undefined };
    setBrews(editingId === null ? [...brews, brew] : brews.map(item => item.id === editingId ? brew : item));
    if (brew.method && !drippers.includes(brew.method)) setDrippers([...drippers, brew.method]);
    const savedGrinder = brew.grindSize ? parseGrind(brew.grindSize, grinders).grinder : "";
    if (savedGrinder && !grinders.includes(savedGrinder)) setGrinders([...grinders, savedGrinder]);
    setBeans(restoredBeans.map(item => item.id === nextBeanId ? { ...item, remaining: Math.round((item.remaining - amt) * 10) / 10, ...(startsConsuming ? { status: "소비 중" as BeanStatus } : {}) } : item));
    saveNote(brew, previousNote);
    finishSave();
  };

  const remove = (brew: Brew) => {
    setBrews(brews.filter(b => b.id !== brew.id));
    if (!isCafeBrew(brew)) setBeans(beans.map(b => b.id === brew.beanId ? { ...b, remaining: Math.round((b.remaining + brew.amount) * 10) / 10 } : b));
    setNotes(notes.filter(item => item.brewId !== brew.id));
    setDeletedBrew({ brew, notes: notes.filter(item => item.brewId === brew.id) });
  };
  const undoRemove = () => {
    if (!deletedBrew) return;
    const { brew, notes: removedNotes } = deletedBrew;
    setBrews([...brews, brew]);
    if (!isCafeBrew(brew)) setBeans(beans.map(b => b.id === brew.beanId ? { ...b, remaining: Math.round((b.remaining - brew.amount) * 10) / 10 } : b));
    setNotes([...notes, ...removedNotes]);
    setDeletedBrew(null);
  };
  const edit = (brew: Brew) => {
    resetForm();
    setEditingId(brew.id);
    setForm({ ...brewConditionsForm(brew), beanId: isCafeBrew(brew) ? "" : String(brew.beanId), date: brew.date });
    setSelectedRecipeId(recipeIdFor(brew));
    const saved = noteOf(brew);
    setNote({ memo: saved?.memo ?? "", rating: saved?.rating ?? 0, taste: Object.fromEntries(TASTE_ATTRIBUTES.map(({ key }) => [key, tasteScore(saved?.[key])])) });
    setDetailId(null);
    setShow(true);
  };

  const pickRecipe = (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    setBrewError("");
    const recipe = recipes.find(item => String(item.id) === recipeId);
    if (!recipe) { setForm(current => ({ ...current, recipe: "" })); return; }
    const water = recipeWater(recipe.steps).extraction;
    // The recipe's 마무리 step marks when the brew ends; carry it over as the extraction time when it has one.
    const finishSeconds = recipe.steps.filter(step => normalizedRecipeAction(step.action) === "마무리").reduce((latest, step) => Math.max(latest, recipeTimeToSeconds(step.time)), 0);
    setForm(current => ({ ...current, amount: String(recipe.coffee), waterAmount: water ? String(water) : "", recipe: recipe.name, ...(finishSeconds > 0 ? { brewTime: recipeTime(finishSeconds) } : {}), ...(recipe.temp ? { waterTemp: String(recipe.temp) } : {}) }));
  };
  const pickDripper = (dripper: string) => {
    if (dripper && !drippers.includes(dripper)) setDrippers([...drippers, dripper]);
    setForm(current => ({ ...current, method: dripper }));
  };
  const pickGrinder = (grinder: string) => { if (grinder && !grinders.includes(grinder)) setGrinders([...grinders, grinder]); };
  const defaultGrinder = defaultGrinderFor(form.beanId);
  const grinderNames = grinders.length ? grinders : GRINDER_SUGGESTIONS;
  const currentGrinder = parseGrind(form.grindSize, grinderNames).grinder;
  const grinderOptions = (currentGrinder && !grinderNames.includes(currentGrinder) ? [currentGrinder, ...grinderNames] : grinderNames).map(value => ({ value, count: 0 }));
  // An edited brew may use a dripper since removed from the list; keep it pickable.
  const dripperNames = drippers.length ? drippers : DRIPPER_SUGGESTIONS;
  const dripperOptions = (form.method && !dripperNames.includes(form.method) ? [form.method, ...dripperNames] : dripperNames).map(value => ({ value, count: 0 }));

  const normalizedQuery = query.trim().toLowerCase();
  const filteredBrews = brews.filter(brew => {
    if (!normalizedQuery) return true;
    const bean = beans.find(b => b.id === brew.beanId);
    return [bean?.name, bean?.roastery, brew.recipe, brew.method, brew.date, brew.cafe?.name, brew.menu, brew.roastery, brew.origin].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
  });
  const sorted = [...filteredBrews].sort((a, b) => {
    return brewSort === "latest" ? b.date.localeCompare(a.date) || b.id - a.id : a.date.localeCompare(b.date) || a.id - b.id;
  });
  const today = localDate();
  const days = sorted.reduce<{ date: string; brews: Brew[] }[]>((groups, brew) => {
    const last = groups[groups.length - 1];
    if (last?.date === brew.date) last.brews.push(brew); else groups.push({ date: brew.date, brews: [brew] });
    return groups;
  }, []);
  const detailBrew = detailId === null ? undefined : brews.find(brew => brew.id === detailId);

  return (
    <div className="brew-log">
      <div className="inventory-intro brew-log-heading">
        <div><p>총 {brews.length}회 브루잉을 기록했어요.</p></div>
        <div className="brew-log-heading-actions"><button type="button" className="primary-button brew-add-button" onClick={openNew}>+ 브루잉 추가</button></div>
      </div>
      {deletedBrew && <div className="delete-notice" role="status"><span>브루잉 기록을 삭제했어요.</span><button type="button" onClick={undoRemove}>되돌리기</button></div>}

      <div className="brew-log-tools">
        <label className="brew-search bean-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg><span className="sr-only">브루잉 기록 검색</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="원두, 로스터리, 레시피, 카페로 검색" /></label>
        <select className="inventory-sort" aria-label="브루잉 기록 정렬" value={brewSort} onChange={event => setBrewSort(event.target.value as "latest" | "oldest")}><option value="latest">최신순</option><option value="oldest">오래된 순</option></select>
      </div>

      {sorted.length === 0 ? (brews.length === 0 ? <div className="brew-empty inventory-empty"><img className="onboarding-logo" src="/coffee-diary-logo-brown-96.png" width="38" height="38" alt="" /><h3>첫 브루잉을 기록해보세요</h3><p>원두와 레시피를 골라 오늘의 한 잔을 남겨보세요.</p><JourneySteps active="brews" /><button type="button" className="primary-button" onClick={openNew}>첫 브루잉 기록하기</button></div> : <Empty text="검색 결과가 없어요" />) : days.map(day => <Fragment key={day.date}>
        <h3 className="bw-day">{dayHeading(day.date, today)}</h3>
        {day.brews.map(brew => {
          const cafe = isCafeBrew(brew);
          const bean = cafe ? undefined : beans.find(b => b.id === brew.beanId);
          const saved = noteOf(brew);
          const memo = noteMemo(saved);
          const taste = tasteSummary(saved);
          const title = cafe ? cafeTitle(brew) : bean?.name || "삭제된 원두";
          return (
            <article key={brew.id} className="brew-card bw-card">
              <button type="button" className="bw-card-open" onClick={() => setDetailId(brew.id)} aria-label={`${title} 기록 자세히 보기`}>
                <span className="bw-card-title">
                  <span>{cafe ? <span className="brew-roastery bw-line"><span className="bw-cafe-chip">카페</span>{brew.cafe?.name}</span> : bean?.roastery && <span className="brew-roastery bw-line">{bean.roastery}</span>}<span className="bw-card-name bw-line">{title}</span></span>
                  <RatingStars value={saved?.rating ?? 0} />
                </span>
                {cafe ? (cafeBeanLine(brew) || brew.method) && <span className="brew-recipe-block bw-line">{cafeBeanLine(brew) && <span className="brew-metrics bw-line">{cafeBeanLine(brew)}</span>}{brew.method && <span className="brew-conditions-line bw-line">{brew.method}</span>}</span>
                  : <span className="brew-recipe-block bw-line"><span className="brew-metrics bw-line">원두 {fmt(brew.amount)}g {brew.waterAmount ? `· 물 ${fmt(brew.waterAmount)}g · ${brewRatio(brew.amount, brew.waterAmount)}` : ""}</span>{brewConditions(brew) && <span className="brew-conditions-line bw-line">{brewConditions(brew)}</span>}{brew.recipe && <span className="bw-line">{brew.recipe}</span>}</span>}
                {memo && <span className="brew-note-inline bw-line"><span>메모</span> {memo}</span>}
                {taste && <span className="brew-taste-inline bw-line">{taste}</span>}
              </button>
              <div className="bw-card-foot">
                {cafe ? <span /> : <button type="button" className="bw-again" onClick={() => again(brew)}><RepeatIcon />이대로 다시 내리기</button>}
                <div className="brew-card-actions"><button type="button" onClick={() => edit(brew)} className="brew-edit-button">수정</button><button type="button" onClick={() => remove(brew)} className="brew-delete-button">삭제</button></div>
              </div>
            </article>
          );
        })}
      </Fragment>)}
      {!show && <button type="button" className="bean-fab brew-fab" onClick={openNew}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>브루잉 추가</button>}

      {show && <BrewEditor editing={editingId !== null} form={form} setForm={setForm} recentCafes={recentCafes(brews)} beans={beanChoices} recipes={recipes} selectedRecipeId={selectedRecipeId} drippers={dripperOptions} grinders={grinderOptions} defaultGrinder={defaultGrinder} lastClicks={lastClicks} note={note} setNote={setNote}
        notice={prefill && editingId === null ? { text: prefill.text, onClear: clearPrefill } : null} error={brewError}
        onPickBean={beanId => editingId === null ? startWithBean(beanId) : setForm(current => ({ ...current, beanId }))} onPickRecipe={pickRecipe} onPickDripper={pickDripper}
        onHideDripper={dripper => { setDrippers(drippers.filter(item => item !== dripper)); if (form.method === dripper) setForm(current => ({ ...current, method: "" })); }}
        onPickGrinder={pickGrinder} onHideGrinder={grinder => setGrinders(grinders.filter(item => item !== grinder))}
        onSave={add} onClose={() => { setShow(false); if (editingId !== null) resetForm(); }} />}
      {detailBrew && <BrewDetail brew={detailBrew} beans={beans} brews={brews} notes={notes} onSelect={brew => setDetailId(brew.id)} onAgain={again} onEdit={edit} onClose={() => setDetailId(null)} />}
    </div>
  );
}
