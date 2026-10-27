import { useRef, useState } from "react";
import { type StorageSetter } from "../data/sync";
import { Field, JourneySteps } from "../components/ui";
import { fmt, scrollToEditor } from "../lib/format";
import { basicRecipeSteps, defaultRecipeSteps, extractionCumulative, immersionActions, immersionSeconds, isAmountlessStep, isBypassStep, normalizedRecipeAction, recipeActions, recipeTime, recipeTimeFromDigits, recipeTimeToSeconds, recipeWater } from "../lib/recipe";
import { type Brew, type RecipeStep, type SavedRecipe } from "../types";

export function RecipePage({ recipes, setRecipes, brews }: { recipes: SavedRecipe[]; setRecipes: StorageSetter<SavedRecipe[]>; brews: Brew[] }) {
  return <div className="recipe-page">
    <div className="inventory-intro recipe-intro"><div><p>자주 쓰는 추출 흐름을 내 방식으로 저장해요.</p></div></div>
    <RecipeLibrary recipes={recipes} setRecipes={setRecipes} brews={brews} />
  </div>;
}

function RecipeLibrary({ recipes, setRecipes, brews }: { recipes: SavedRecipe[]; setRecipes: StorageSetter<SavedRecipe[]>; brews: Brew[] }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [coffee, setCoffee] = useState("");
  const [memo, setMemo] = useState("");
  const [immersion, setImmersion] = useState(false);
  const [steps, setSteps] = useState<RecipeStep[]>(defaultRecipeSteps);
  const [showErrors, setShowErrors] = useState(false);
  const [deletedRecipe, setDeletedRecipe] = useState<SavedRecipe | null>(null);
  const [sort, setSort] = useState<"latest" | "registered" | "recentlyUsed">("latest");
  const composerRef = useRef<HTMLElement>(null);

  const { extraction: totalWater, bypass: bypassWater } = recipeWater(steps);
  const maxSteps = immersion ? 9 : 7;
  const steepSeconds = immersion ? immersionSeconds(steps) : null;
  const explicitTimeRows = useRef(new Set<number>());
  const handleTimeInput = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = (event.nativeEvent as InputEvent).data;
    const value = event.target.value;
    // Typing ':' switches the row to literal m:ss entry, with the digits so far as minutes.
    if (typed === ":") { explicitTimeRows.current.add(index); updateStep(index, { time: `${Number(steps[index].time.replace(/\D/g, "").slice(-3)) || 0}:` }); return; }
    updateStep(index, { time: explicitTimeRows.current.has(index) ? value.replace(/[^\d:]/g, "").replace(/^(\d{0,3}:\d{0,2}).*$/, "$1") : recipeTimeFromDigits(value) });
  };
  const reset = () => {
    setEditingId(null); setName(""); setCoffee(""); setMemo(""); setImmersion(false); setSteps(defaultRecipeSteps()); setShowErrors(false);
  };
  const close = () => { reset(); setOpen(false); };
  const updateStep = (index: number, patch: Partial<RecipeStep>) => setSteps(current => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  const setStepTime = (index: number, value: string) => {
    const requested = Math.min(recipeTimeToSeconds(value), 99 * 60 + 59);
    const min = index === 0 ? 0 : recipeTimeToSeconds(steps[index - 1].time) + 5;
    const max = index === steps.length - 1 ? Infinity : recipeTimeToSeconds(steps[index + 1].time) - 5;
    updateStep(index, { time: recipeTime(Math.min(Math.max(requested, min), max)) });
  };
  const addStep = () => {
    if (steps.length >= maxSteps) return;
    const last = steps[steps.length - 1];
    setSteps([...steps, { time: recipeTime(recipeTimeToSeconds(last?.time ?? "0:00") + 30), action: "원형 푸어", amount: 0 }]);
  };
  const edit = (recipe: SavedRecipe) => {
    setEditingId(recipe.id); setName(recipe.name); setCoffee(String(recipe.coffee)); setMemo(recipe.memo ?? ""); setImmersion(Boolean(recipe.immersion)); setShowErrors(false);
    setSteps(recipe.steps.length >= 2 ? recipe.steps.map(step => ({ ...step, action: normalizedRecipeAction(step.action) })) : defaultRecipeSteps()); setOpen(true);
    scrollToEditor(composerRef);
  };
  const save = () => {
    const coffeeAmount = Number(coffee);
    if (!name.trim() || coffeeAmount <= 0 || totalWater <= 0) { setShowErrors(true); return; }
    const item: SavedRecipe = { id: editingId ?? Date.now(), name: name.trim(), coffee: coffeeAmount, memo: memo.trim(), steps: immersion ? steps : basicRecipeSteps(steps), ...(immersion ? { immersion: true } : {}), createdAt: editingId ? recipes.find(recipe => recipe.id === editingId)?.createdAt ?? Date.now() : Date.now() };
    setRecipes(editingId === null ? [...recipes, item] : recipes.map(recipe => recipe.id === editingId ? item : recipe));
    close();
  };
  const remove = (recipe: SavedRecipe) => {
    setRecipes(recipes.filter(item => item.id !== recipe.id));
    setDeletedRecipe(recipe);
  };
  const undoRemove = () => {
    if (!deletedRecipe) return;
    setRecipes([...recipes, deletedRecipe]);
    setDeletedRecipe(null);
  };
  const lastUsedByName = new Map<string, Brew>();
  brews.forEach(brew => {
    const name = brew.recipe.trim();
    if (!name) return;
    const previous = lastUsedByName.get(name);
    if (!previous || brew.date > previous.date || (brew.date === previous.date && brew.id > previous.id)) lastUsedByName.set(name, brew);
  });
  const sorted = [...recipes].sort((a, b) => {
    if (sort === "registered") return a.createdAt - b.createdAt || a.id - b.id;
    if (sort === "recentlyUsed") {
      const aLast = lastUsedByName.get(a.name)?.date ?? "";
      const bLast = lastUsedByName.get(b.name)?.date ?? "";
      return bLast.localeCompare(aLast) || b.createdAt - a.createdAt || b.id - a.id;
    }
    return b.createdAt - a.createdAt || b.id - a.id;
  });

  return <>
    <section ref={composerRef} className="recipe-composer-card" aria-label="새 레시피">
      <div className="recipe-library-head">
      <button type="button" className="recipe-library-toggle" aria-expanded={open} onClick={() => open ? close() : setOpen(true)}>
        <span><strong>{editingId === null ? "새 레시피 만들기" : "레시피 수정"}</strong><small>{editingId === null ? "시간과 붓는 양을 단계별로 저장해보세요." : "수정 후 저장하면 기존 레시피에 반영됩니다."}</small></span>
        <span className="recipe-toggle-mark" aria-hidden="true">+</span>
      </button>
      {open && <button type="button" className="recipe-type-toggle" data-type={immersion ? "침출형" : "기본형"} onClick={() => setImmersion(!immersion)} aria-label={`레시피 형식: ${immersion ? "침출형" : "기본형"}. 눌러서 ${immersion ? "기본형" : "침출형"}으로 변경`}>{immersion ? "침출형" : "기본형"}<span aria-hidden="true">⇄</span></button>}
      </div>
      {open && <div className="recipe-composer">
        <div className="recipe-top-fields">
          <Field label="레시피 이름" required invalid={showErrors && !name.trim()}><input aria-invalid={showErrors && !name.trim()} value={name} maxLength={40} onChange={event => setName(event.target.value)} placeholder="예: 484 레시피" /></Field>
          <Field label="원두 (g)" required invalid={showErrors && Number(coffee) <= 0}><input aria-invalid={showErrors && Number(coffee) <= 0} type="number" min="0.1" step="0.1" value={coffee} onChange={event => setCoffee(event.target.value)} placeholder="15" /></Field>
        </div>
        <div className="recipe-step-section">
          <div className="recipe-section-heading"><strong>푸어 타임라인</strong><span>{immersion ? "시간 · 스위치 · 붓는 양 · 누적 양" : "시간 · 붓는 양 · 누적 양"}</span></div>
          <div className={`recipe-step-editor ${immersion ? "is-immersion" : ""} ${showErrors && totalWater <= 0 ? "has-error" : ""}`}>
            <div className="recipe-step-head"><span>시간</span>{immersion && <span>스위치</span>}<span>동작</span><span>붓는 양</span><span>누적</span><span /></div>
            {(() => { let closedBefore = false; return steps.map((step, index) => {
              const cumulative = extractionCumulative(steps, index);
              // 스위치 칸은 이 단계 이후의 상태(열림/닫힘)를 보여준다. 상태가 바뀌는 단계만 진하게, 이어지는 단계는 흐리게.
              const wasClosed = closedBefore;
              const closed = immersion && step.switch ? step.switch === "닫고" : wasClosed;
              const changed = closed !== wasClosed;
              closedBefore = closed;
              const toggleSwitch = () => updateStep(index, { switch: !closed === wasClosed ? undefined : !closed ? "닫고" : "열고" });
              return <div className={`recipe-step-row${immersion && wasClosed ? " closed-top" : ""}${immersion && closed ? " closed-bottom" : ""}`} key={index}>
                {index === 0 ? <span className="recipe-fixed-time">0:00</span> : <input className="recipe-time-input" value={step.time} inputMode="numeric" placeholder="130" onFocus={event => event.target.select()} onChange={event => handleTimeInput(index, event)} onBlur={event => { explicitTimeRows.current.delete(index); setStepTime(index, event.target.value); }} onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setStepTime(index, recipeTime(recipeTimeToSeconds(step.time) + (event.key === "ArrowUp" ? 5 : -5))); } }} aria-label={`${index + 1}번째 푸어 시간`} />}
                {immersion && <button type="button" className={`recipe-switch-toggle${closed ? " is-closed" : ""}${changed ? " is-changed" : ""}`} onClick={toggleSwitch} aria-pressed={closed} aria-label={`${index + 1}번째 단계 스위치: ${closed ? "닫힘" : "열림"}. 눌러서 ${closed ? "열기" : "닫기"}`}>{closed ? "닫힘" : "열림"}</button>}
                <select value={step.action} onChange={event => { const action = event.target.value as RecipeStep["action"]; updateStep(index, { action, ...(action === "마무리" || action === "없음" ? { amount: 0 } : {}) }); }} aria-label={`${index + 1}번째 푸어 동작`}>{(immersion || step.action === "없음" ? immersionActions : recipeActions).map(action => <option key={action} value={action}>{action === "없음" ? "–" : action}</option>)}</select>
                {isAmountlessStep(step) ? <span className="recipe-no-amount">–</span> : <label className="recipe-amount-input"><input type="number" min="0" step="0.1" value={step.amount || ""} onChange={event => updateStep(index, { amount: Number(event.target.value) || 0 })} placeholder="0" aria-label={`${index + 1}번째 붓는 양`} /><span>g</span></label>}
                <span className="recipe-cumulative" aria-label={isBypassStep(step) ? `가수 ${fmt(Number(step.amount) || 0)}g, 누적에서 제외` : undefined}>{isBypassStep(step) ? `+${fmt(Number(step.amount) || 0)}g` : `${cumulative || "–"}g`}</span>
                <button type="button" className="recipe-remove-step" disabled={index < 2} aria-label={`${index + 1}번째 푸어 삭제`} onClick={() => setSteps(steps.filter((_, stepIndex) => stepIndex !== index))}>×</button>
              </div>;
            }); })()}
          </div>
          <p className="recipe-time-hint">시간은 숫자만 눌러도 돼요. 130 → 1:30</p>
          {showErrors && totalWater <= 0 && <p className="recipe-timeline-error">붓는 양을 한 번 이상 입력해주세요.</p>}
          <button type="button" className="recipe-add-step" disabled={steps.length >= maxSteps} onClick={addStep}>{steps.length >= maxSteps ? (immersion ? "9단계까지 입력 가능" : "6회 푸어까지 입력 가능") : (immersion ? "+ 단계 추가" : "+ 푸어 추가")}</button>
        </div>
        <div className="recipe-metrics"><span>최종 물 양 <b>{totalWater ? `${fmt(totalWater)}g` : "–"}</b></span><span>{immersion ? "비율" : "브루잉 비율"} <b>{Number(coffee) > 0 && totalWater > 0 ? `1:${(totalWater / Number(coffee)).toFixed(1)}` : "1:–"}</b></span>{bypassWater > 0 && <span>가수 <b>{fmt(bypassWater)}g</b></span>}{steepSeconds !== null && <span>침출 <b>{recipeTime(steepSeconds)}</b></span>}</div>
        <Field label="추출 메모"><textarea rows={1} value={memo} onChange={event => setMemo(event.target.value)} placeholder="" /></Field>
        <div className="recipe-form-actions"><button type="button" className="quiet-button" onClick={close}>취소</button><button type="button" className="primary-button" onClick={save}>{editingId === null ? "레시피 저장" : "수정 저장"}</button></div>
      </div>}
    </section>
    {deletedRecipe && <div className="delete-notice" role="status"><span>레시피를 삭제했어요.</span><button type="button" onClick={undoRemove}>되돌리기</button></div>}
    <section className="recipe-library" aria-label="저장 레시피">
      <div className="recipe-library-list-header"><div className="recipe-library-heading"><strong>저장한 레시피</strong><span>{recipes.length}개</span></div><label className="recipe-sort-control" htmlFor="recipe-sort">정렬<select id="recipe-sort" className="inventory-sort recipe-sort-select" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="latest">최신순</option><option value="registered">등록순</option><option value="recentlyUsed">최근 사용한 순</option></select></label></div>
      <div className="recipe-library-list">
      {!sorted.length ? <div className="recipe-library-empty recipe-onboarding"><img className="onboarding-logo" src="/coffee-diary-logo-brown-96.png" width="38" height="38" alt="" /><h3>첫 레시피를 만들어보세요</h3><p>자주 쓰는 드립 방식을 저장해두면 브루잉 기록에 바로 적용할 수 있어요.</p><JourneySteps active="recipes" /><button type="button" className="primary-button" onClick={() => setOpen(true)}>첫 레시피 만들기</button></div> : sorted.map(recipe => {
        const { extraction: water, bypass } = recipeWater(recipe.steps);
        const steep = recipe.immersion ? immersionSeconds(recipe.steps) : null;
        return <article className="saved-recipe-card" key={recipe.id}>
          <div className="saved-recipe-top"><div><h3>{recipe.name}{recipe.immersion && <span className="recipe-type-badge">침출식</span>}</h3><p>원두 {fmt(recipe.coffee)}g · 물 {fmt(water)}g · {water && recipe.coffee ? `1:${(water / recipe.coffee).toFixed(1)}` : "1:–"}{bypass > 0 && ` · 가수 ${fmt(bypass)}g`}{steep !== null && ` · 침출 ${recipeTime(steep)}`}</p></div><div className="saved-recipe-actions"><button type="button" onClick={() => edit(recipe)}>수정</button><button type="button" onClick={() => remove(recipe)}>삭제</button></div></div>
          <div className="saved-recipe-timeline">{(() => {
            // 스위치는 열린 상태로 시작한다. 상태가 실제로 바뀌는 단계만 표시하고, 닫힌 구간은 타임라인 선으로 보여준다.
            let closed = false;
            return recipe.steps.map((step, index) => {
              const cumulative = extractionCumulative(recipe.steps, index);
              const action = normalizedRecipeAction(step.action);
              const toggled = recipe.immersion && step.switch !== undefined && (step.switch === "닫고") !== closed;
              if (toggled) closed = step.switch === "닫고";
              const switchLabel = toggled ? (closed ? "스위치 닫기" : "스위치 열기") : "";
              const title = action === "없음" ? switchLabel : action;
              const meta = action === "없음" ? (toggled ? (closed ? "침출 시작" : "드로다운") : "–") : action === "마무리" ? "–" : action === "가수" ? `+${fmt(step.amount)}g · 추출 후 추가` : `${fmt(step.amount)}g · 누적 ${fmt(cumulative)}g`;
              return <div className={`saved-recipe-step${closed ? " is-closed" : ""}`} key={`${recipe.id}-${index}`}><span>{step.time}</span><i aria-hidden="true" /><p><b>{title}{action !== "없음" && switchLabel && <small className="recipe-switch-note">{switchLabel}</small>}</b><em>{meta}</em></p></div>;
            });
          })()}</div>
          {recipe.memo && <p className="saved-recipe-memo">{recipe.memo}</p>}
        </article>;
      })}
      </div>
    </section>
  </>;
}
