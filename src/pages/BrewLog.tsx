import { useEffect, useRef, useState, type CSSProperties } from "react";
import { type StorageSetter, useStorage } from "../data/sync";
import { Empty, Field, FormActions, FormCard, JourneySteps, StarRating } from "../components/ui";
import { STORAGE_KEYS } from "../data/keys";
import { fmt, FONT, localDate, scrollToEditor } from "../lib/format";
import { normalizedRecipeAction, recipeTime, recipeTimeToSeconds, recipeWater } from "../lib/recipe";
import { type Bean, type BeanStatus, type Brew, type BrewForm, type SavedRecipe, type TastingNote, type TastingNoteForm } from "../types";

const emptyBrewForm = (): BrewForm => ({ beanId: "", amount: "", waterAmount: "", method: "", date: localDate(), recipe: "", grindSize: "", waterTemp: "", brewTime: "" });

// Shown only until the user registers drippers of their own.
const DRIPPER_SUGGESTIONS = ["하리오 V60", "오리가미", "칼리타"];

// The form keeps brew time as m:ss (typed as digits, 245 → 2:45); seconds past 59 roll over into minutes.
const normalizeBrewTime = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!value.trim()) return "";
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  return total > 0 ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}` : null;
};

const brewTimeFromDigits = (value: string) => {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 4);
  return digits ? `${Number(digits.slice(0, -2) || "0")}:${digits.slice(-2).padStart(2, "0")}` : "";
};

const brewConditions = (brew: Brew) => [brew.method, brew.grindSize && `분쇄 ${brew.grindSize}`, brew.waterTemp && `${fmt(brew.waterTemp)}℃`, brew.brewTime && `${brew.brewTime} 추출`].filter(Boolean).join(" · ");

const brewRatio = (amount: number, waterAmount?: number) => waterAmount && amount > 0 ? `1:${Number((waterAmount / amount).toFixed(1)).toLocaleString()}` : "";

const TASTE_ATTRIBUTES = [
  { key: "aroma", label: "향" },
  { key: "acidity", label: "산미" },
  { key: "sweetness", label: "단맛" },
  { key: "body", label: "바디감" },
  { key: "finish", label: "여운" },
  { key: "balance", label: "밸런스" }
] as const;

type TasteKey = typeof TASTE_ATTRIBUTES[number]["key"];

type TasteScores = Partial<Record<TasteKey, number>>;

// Taste fields hold a 1–5 score as text; anything else is treated as unscored.
const tasteScore = (value?: string) => /^[1-5]$/.test(value ?? "") ? Number(value) : 0;

const tasteSummary = (note?: TastingNote) => note ? TASTE_ATTRIBUTES.filter(({ key }) => tasteScore(note[key])).map(({ key, label }) => `${label} ${note[key]}`).join(" · ") : "";

const emptyNoteForm = (): TastingNoteForm => ({
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
  const [show, setShow] = useState(openInitially);
  const brewFormRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (openInitially) { onOpened(); scrollToEditor(brewFormRef); } }, [openInitially, onOpened]);
  const [form, setForm] = useState<BrewForm>(() => initialBeanId ? { ...emptyBrewForm(), beanId: String(initialBeanId) } : emptyBrewForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [noteMemo, setNoteMemo] = useState("");
  const [noteRating, setNoteRating] = useState(0);
  const [noteTaste, setNoteTaste] = useState<TasteScores>({});
  const [drippers, setDrippers] = useStorage<string[]>(STORAGE_KEYS.drippers, [], userId);
  const [addingDripper, setAddingDripper] = useState(false);
  const [newDripper, setNewDripper] = useState("");
  const [query, setQuery] = useState("");
  const [brewSort, setBrewSort] = useState<"latest" | "oldest">("latest");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [recipeMode, setRecipeMode] = useState<"saved" | "custom">("saved");
  const [brewError, setBrewError] = useState("");
  const [deletedBrew, setDeletedBrew] = useState<{ brew: Brew; notes: TastingNote[] } | null>(null);

  const add = () => {
    const recipeReady = recipeMode === "saved" ? Boolean(selectedRecipeId) : Boolean(form.amount) && Boolean(form.waterAmount);
    if (!form.beanId || !form.amount || !form.date || (editingId === null && !recipeReady)) { setBrewError("원두와 레시피 선택을 확인해주세요."); return; }
    const nextBeanId = Number(form.beanId);
    const bean = beans.find(b => b.id === nextBeanId);
    const amt = parseFloat(form.amount);
    if (!bean) { setBrewError("선택한 원두를 찾을 수 없어요. 원두를 다시 선택해주세요."); return; }
    if (Number.isNaN(amt) || amt <= 0) { setBrewError("사용량은 0보다 큰 숫자로 입력해주세요."); return; }
    const water = form.waterAmount.trim() ? parseFloat(form.waterAmount) : undefined;
    if (water !== undefined && (Number.isNaN(water) || water <= 0)) { setBrewError("물 양은 0보다 큰 숫자로 입력해주세요."); return; }
    const temp = form.waterTemp.trim() ? parseFloat(form.waterTemp) : undefined;
    if (temp !== undefined && (Number.isNaN(temp) || temp <= 0 || temp > 100)) { setBrewError("물 온도는 0~100℃ 사이 숫자로 입력해주세요."); return; }
    const brewTime = normalizeBrewTime(form.brewTime);
    if (brewTime === null) { setBrewError("추출 시간은 2:45처럼 분:초로 입력해주세요."); return; }
    const previous = editingId === null ? null : brews.find(item => item.id === editingId) ?? null;
    const previousNote = previous ? notes.find(note => note.brewId === previous.id) : null;
    const restoredBeans = previous ? beans.map(item => item.id === previous.beanId ? { ...item, remaining: Math.round((item.remaining + previous.amount) * 10) / 10 } : item) : beans;
    const available = restoredBeans.find(item => item.id === nextBeanId);
    if (!available || available.remaining < amt) { setBrewError(`잔여량(${fmt(available?.remaining ?? 0)}g)이 부족해요.`); return; }
    const startsConsuming = available.status === "디개싱 중";
    const recipeId = recipeMode === "saved" && selectedRecipeId ? Number(selectedRecipeId) : previous && previous.recipe === form.recipe ? previous.recipeId : undefined;
    const brew: Brew = { id: editingId ?? Date.now(), beanId: nextBeanId, amount: amt, waterAmount: water, method: form.method.trim(), date: form.date, recipe: form.recipe, ...(recipeId !== undefined ? { recipeId } : {}), grindSize: form.grindSize.trim() || undefined, waterTemp: temp, brewTime: brewTime || undefined };
    setBrews(editingId === null ? [...brews, brew] : brews.map(item => item.id === editingId ? brew : item));
    if (brew.method && !drippers.includes(brew.method)) setDrippers([...drippers, brew.method]);
    setBeans(restoredBeans.map(item => item.id === nextBeanId ? { ...item, remaining: Math.round((item.remaining - amt) * 10) / 10, ...(startsConsuming ? { status: "소비 중" as BeanStatus } : {}) } : item));
    if (noteMemo.trim() || noteRating > 0 || Object.values(noteTaste).some(Boolean) || previousNote) {
      const base = previousNote ?? emptyNoteForm();
      const taste = Object.fromEntries(TASTE_ATTRIBUTES.map(({ key }) => [key, noteTaste[key] ? String(noteTaste[key]) : tasteScore(base[key]) ? "" : base[key] ?? ""]));
      const note = { ...base, ...taste, id: previousNote?.id ?? Date.now() + 1, beanId: nextBeanId, brewId: brew.id, rating: noteRating, memo: noteMemo.trim(), date: form.date };
      setNotes(previousNote ? notes.map(item => item.id === previousNote.id ? note : item) : [...notes, note]);
    }
    setForm(emptyBrewForm());
    setNoteMemo(""); setNoteRating(0); setNoteTaste({}); setEditingId(null); setSelectedRecipeId(""); setRecipeMode("saved"); setBrewError(""); setShow(false);
  };

  const remove = (brew: Brew) => {
    setBrews(brews.filter(b => b.id !== brew.id));
    setBeans(beans.map(b => b.id === brew.beanId ? { ...b, remaining: Math.round((b.remaining + brew.amount) * 10) / 10 } : b));
    setNotes(notes.filter(note => note.brewId !== brew.id));
    setDeletedBrew({ brew, notes: notes.filter(note => note.brewId === brew.id) });
  };
  const undoRemove = () => {
    if (!deletedBrew) return;
    const { brew, notes: removedNotes } = deletedBrew;
    setBrews([...brews, brew]);
    setBeans(beans.map(b => b.id === brew.beanId ? { ...b, remaining: Math.round((b.remaining - brew.amount) * 10) / 10 } : b));
    setNotes([...notes, ...removedNotes]);
    setDeletedBrew(null);
  };
  const edit = (brew: Brew) => {
    setEditingId(brew.id);
    setForm({ beanId: String(brew.beanId), amount: String(brew.amount), waterAmount: brew.waterAmount ? String(brew.waterAmount) : "", method: brew.method, date: brew.date, recipe: brew.recipe, grindSize: brew.grindSize ?? "", waterTemp: brew.waterTemp ? String(brew.waterTemp) : "", brewTime: brew.brewTime ?? "" });
    const note = notes.find(item => item.brewId === brew.id);
    setNoteMemo(note?.memo ?? ""); setNoteRating(note?.rating ?? 0); setNoteTaste(Object.fromEntries(TASTE_ATTRIBUTES.map(({ key }) => [key, tasteScore(note?.[key])]))); setSelectedRecipeId(""); setRecipeMode("custom"); setBrewError("");
    setShow(true);
    scrollToEditor(brewFormRef);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredBrews = brews.filter(brew => {
    if (!normalizedQuery) return true;
    const bean = beans.find(b => b.id === brew.beanId);
    return [bean?.name, bean?.roastery, brew.recipe, brew.method, brew.date].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
  });
  const sorted = [...filteredBrews].sort((a, b) => {
    return brewSort === "latest" ? b.date.localeCompare(a.date) || b.id - a.id : a.date.localeCompare(b.date) || a.id - b.id;
  });
  const activeBeans = beans.filter(b => !b.deleted && b.remaining > 0);
  const addDripper = (name: string) => {
    const dripper = name.trim();
    if (!dripper) return;
    if (!drippers.includes(dripper)) setDrippers([...drippers, dripper]);
    setForm(current => ({ ...current, method: dripper }));
    setNewDripper(""); setAddingDripper(false);
  };
  // An edited brew may use a dripper since removed from the list; keep it pickable.
  const dripperChoices = form.method && !drippers.includes(form.method) ? [...drippers, form.method] : drippers;
  const applySavedRecipe = (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    setRecipeMode("saved");
    setBrewError("");
    const recipe = recipes.find(item => String(item.id) === recipeId);
    if (!recipe) return;
    const water = recipeWater(recipe.steps).extraction;
    // The recipe's 마무리 step marks when the brew ends; carry it over as the extraction time when it has one.
    const finishSeconds = recipe.steps.filter(step => normalizedRecipeAction(step.action) === "마무리").reduce((latest, step) => Math.max(latest, recipeTimeToSeconds(step.time)), 0);
    setForm(current => ({ ...current, amount: String(recipe.coffee), waterAmount: water ? String(water) : "", recipe: recipe.name, ...(finishSeconds > 0 ? { brewTime: recipeTime(finishSeconds) } : {}) }));
  };

  return (
    <div className="brew-log">
      <div className="inventory-intro brew-log-heading">
        <div><p>총 {brews.length}회 브루잉을 기록했어요.</p></div>
        <div className="brew-log-heading-actions"><button type="button" className="primary-button brew-add-button" onClick={() => setShow(!show)}>+ 브루잉 추가</button></div>
      </div>
      {deletedBrew && <div className="delete-notice" role="status"><span>브루잉 기록을 삭제했어요.</span><button type="button" onClick={undoRemove}>되돌리기</button></div>}

      {show && <div ref={brewFormRef} className="editor-anchor" aria-hidden="true" />}
      {show && (
        <FormCard>
          <div className="brew-core-grid">
            <Field label="원두 선택*">
              <select value={form.beanId} onChange={e => { setForm({ ...form, beanId: e.target.value }); setBrewError(""); }} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }}>
                <option value="">선택하세요</option>
                {activeBeans.map(b => <option key={b.id} value={b.id}>{[b.roastery, b.name].filter(Boolean).join(" ")} ({fmt(b.remaining)}g 남음)</option>)}
              </select>
            </Field>
            <Field label="날짜*"><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} /></Field>
          </div>
          <div className="brew-recipe-picker"><span className="brew-recipe-picker-label">레시피 선택*</span><div className="recipe-mode-options"><button type="button" aria-pressed={recipeMode === "saved"} onClick={() => { setRecipeMode("saved"); setBrewError(""); }}>저장한 레시피</button><button type="button" aria-pressed={recipeMode === "custom"} onClick={() => { setRecipeMode("custom"); setSelectedRecipeId(""); setForm(current => ({ ...current, recipe: "" })); setBrewError(""); }}>직접 입력</button></div>{recipeMode === "saved" ? <div className="recipe-mode-content"><select value={selectedRecipeId} onChange={event => applySavedRecipe(event.target.value)}><option value="">선택하세요</option>{recipes.map(recipe => { const water = recipeWater(recipe.steps).extraction; return <option key={recipe.id} value={recipe.id}>{recipe.name} · 원두 {fmt(recipe.coffee)}g · 물 {fmt(water)}g</option>; })}</select>{selectedRecipeId && <p>레시피의 원두 양과 물 양을 적용했어요.</p>}</div> : <div className="brew-custom-recipe-fields"><Field label="사용량 (g)*"><input type="number" min="0.1" step="0.1" value={form.amount} onChange={event => { setForm({ ...form, amount: event.target.value }); setBrewError(""); }} placeholder="예: 15" /></Field><Field label="투입 물 양 (g)*"><input type="number" min="0.1" step="0.1" value={form.waterAmount} onChange={event => { setForm({ ...form, waterAmount: event.target.value }); setBrewError(""); }} placeholder="예: 220" /></Field><div className="custom-recipe-name"><Field label="레시피 이름"><input value={form.recipe} onChange={event => setForm({ ...form, recipe: event.target.value })} placeholder="예: 나만의 4:6 레시피" /></Field></div></div>}</div>
          <div className="brew-conditions"><span className="brew-recipe-picker-label">추출 조건 <small>선택 · 맛이 달랐던 이유를 찾을 때 도움이 돼요</small></span>
            <fieldset className="brew-dripper-field"><legend>내 드리퍼</legend>
              <div className="existing-purchaser-options">
                {dripperChoices.map(dripper => <span className="existing-purchaser-option brew-dripper-option" data-selected={form.method === dripper} key={dripper}><button type="button" aria-pressed={form.method === dripper} onClick={() => setForm({ ...form, method: form.method === dripper ? "" : dripper })}>{dripper}</button>{drippers.includes(dripper) && <button type="button" className="remove-purchaser" aria-label={`${dripper} 내 드리퍼에서 삭제`} onClick={() => { setDrippers(drippers.filter(item => item !== dripper)); if (form.method === dripper) setForm({ ...form, method: "" }); }}>×</button>}</span>)}
                {drippers.length === 0 && DRIPPER_SUGGESTIONS.map(dripper => <button type="button" className="brew-dripper-suggestion" key={dripper} onClick={() => addDripper(dripper)}>+ {dripper}</button>)}
                <button type="button" className="brew-dripper-suggestion" aria-expanded={addingDripper} onClick={() => setAddingDripper(!addingDripper)}>+ 직접 추가</button>
              </div>
              {drippers.length === 0 && <p className="brew-dripper-hint">가지고 있는 드리퍼를 눌러 등록하면 다음부터 바로 고를 수 있어요.</p>}
              {addingDripper && <div className="brew-dripper-add"><input autoFocus value={newDripper} onChange={event => setNewDripper(event.target.value)} placeholder="새 드리퍼 이름 (예: 하리오 스위치)" aria-label="새 드리퍼 이름" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addDripper(newDripper); } if (event.key === "Escape") { setNewDripper(""); setAddingDripper(false); } }} /><button type="button" disabled={!newDripper.trim()} onClick={() => addDripper(newDripper)}>등록</button></div>}
            </fieldset>
            <div className="brew-conditions-grid">
            <div><Field label="분쇄도"><input value={form.grindSize} onChange={event => setForm({ ...form, grindSize: event.target.value })} placeholder="예: 코만단테 24클릭" /></Field></div>
            <Field label="물 온도"><label className="brew-unit-input" style={{ "--chars": Math.max((form.waterTemp || "92").length, 1) } as CSSProperties}><input type="number" inputMode="decimal" min="1" max="100" step="0.5" value={form.waterTemp} onChange={event => { setForm({ ...form, waterTemp: event.target.value }); setBrewError(""); }} placeholder="92" aria-label="물 온도 (℃)" /><span aria-hidden="true">℃</span></label></Field>
            <Field label="추출 시간"><input className="brew-time-input" inputMode="numeric" value={form.brewTime} onFocus={event => event.target.select()} onChange={event => { setForm({ ...form, brewTime: brewTimeFromDigits(event.target.value) }); setBrewError(""); }} placeholder="2:45" aria-label="추출 시간 (분:초)" /></Field>
            </div>
            <p className="recipe-time-hint">시간은 숫자만 눌러도 돼요. 130 → 1:30</p>
          </div>
          <div className="brew-taste"><span className="brew-recipe-picker-label">맛 세부 평가 <small>선택 · 1~5단계</small></span><div className="brew-taste-grid">
            {TASTE_ATTRIBUTES.map(({ key, label }) => { const value = noteTaste[key] ?? 0; return <div className="brew-taste-row" role="group" aria-label={label} key={key}><span>{label}</span><span className="brew-taste-scale">{[1, 2, 3, 4, 5].map(step => <button type="button" key={step} aria-pressed={value >= step} aria-label={`${label} ${step}단계`} onClick={() => setNoteTaste({ ...noteTaste, [key]: value === step ? 0 : step })} />)}</span><em>{value || "–"}</em></div>; })}
          </div></div>
          <div className="brew-note-form"><Field label="컵 노트 / 느낀점"><textarea value={noteMemo} onChange={e => setNoteMemo(e.target.value)} rows={1} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: FONT }} placeholder="오늘의 맛과 느낌을 자유롭게 기록해보세요..." /></Field><div><span className="brew-rating-label">별점</span><StarRating value={noteRating} onChange={setNoteRating} /></div></div>
          {brewError && <p className="brew-form-error" role="alert">{brewError}</p>}
          <FormActions onSave={add} onCancel={() => { setShow(false); setEditingId(null); setSelectedRecipeId(""); setRecipeMode("saved"); setBrewError(""); setForm(emptyBrewForm()); setNoteMemo(""); setNoteRating(0); setNoteTaste({}); }} saveLabel={editingId === null ? "저장 (재고 차감)" : "수정 저장"} />
        </FormCard>
      )}

      <div className="brew-log-tools">
        <label className="brew-search bean-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg><span className="sr-only">브루잉 기록 검색</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="원두, 로스터리, 레시피로 검색" /></label>
        <select className="inventory-sort" aria-label="브루잉 기록 정렬" value={brewSort} onChange={event => setBrewSort(event.target.value as "latest" | "oldest")}><option value="latest">최신순</option><option value="oldest">오래된 순</option></select>
      </div>

      {sorted.length === 0 ? (brews.length === 0 ? <div className="brew-empty inventory-empty"><img className="onboarding-logo" src="/coffee-diary-logo-brown-96.png" width="38" height="38" alt="" /><h3>첫 브루잉을 기록해보세요</h3><p>원두와 레시피를 골라 오늘의 한 잔을 남겨보세요.</p><JourneySteps active="brews" /><button type="button" className="primary-button" onClick={() => setShow(true)}>첫 브루잉 기록하기</button></div> : <Empty text="검색 결과가 없어요" />) : sorted.map(brew => {
        const bean = beans.find(b => b.id === brew.beanId);
        const hasNote = notes.some(n => n.brewId === brew.id);
        return (
          <article key={brew.id} className="brew-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                {bean?.roastery && <p className="brew-roastery">{bean.roastery}</p>}
                <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 500, fontFamily: FONT }}>{bean?.name || "삭제된 원두"}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)", fontFamily: FONT }}>{brew.date}</p>
                <div className="brew-recipe-block"><p className="brew-metrics">원두 {fmt(brew.amount)}g {brew.waterAmount ? `· 물 ${fmt(brew.waterAmount)}g · ${brewRatio(brew.amount, brew.waterAmount)}` : ""}</p>{brewConditions(brew) && <p className="brew-conditions-line">{brewConditions(brew)}</p>}{brew.recipe && <p>{brew.recipe}</p>}</div>
                {hasNote && (() => { const note = notes.find(item => item.brewId === brew.id); const memo = note ? [note.memo, note.flavor].filter(Boolean).join(" · ") : ""; return memo ? <p className="brew-note-inline"><span>메모</span> {memo}</p> : null; })()}
                {hasNote && tasteSummary(notes.find(item => item.brewId === brew.id)) && <p className="brew-taste-inline">{tasteSummary(notes.find(item => item.brewId === brew.id))}</p>}
              </div>
              <div className="brew-card-actions"><button onClick={() => edit(brew)} className="brew-edit-button">수정</button><button onClick={() => remove(brew)} className="brew-delete-button">삭제</button></div>
            </div>
          </article>
        );
      })}
      {!show && <button type="button" className="bean-fab brew-fab" onClick={() => { setShow(true); scrollToEditor(brewFormRef); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>브루잉 추가</button>}
    </div>
  );
}
