import { useRef, useState } from "react";
import { useKeyboardInset } from "../bean-editor/useKeyboardInset";
import { useSheet } from "../brew-editor/useSheet";
import { fmt } from "../../lib/format";
import { basicRecipeSteps, defaultRecipeSteps, extractionCumulative, immersionActions, immersionSeconds, isAmountlessStep, isBypassStep, normalizedRecipeAction, recipeActions, recipeTime, recipeTimeFromDigits, recipeTimeToSeconds, recipeWater } from "../../lib/recipe";
import { type RecipeStep, type SavedRecipe } from "../../types";

export type RecipeDraft = Pick<SavedRecipe, "name" | "coffee" | "memo" | "steps" | "immersion">;

// The recipe form as a sheet over the list (a dialog on wider screens), in the bean and brew editors' be-* layout.
// `recipe` is the one being edited, or null for a new recipe.
export function RecipeEditor({ recipe, onSave, onClose }: { recipe: SavedRecipe | null; onSave: (draft: RecipeDraft) => void; onClose: () => void }) {
  const editing = recipe !== null;
  useKeyboardInset();
  const sheet = useSheet(onClose);
  const [name, setName] = useState(recipe?.name ?? "");
  const [coffee, setCoffee] = useState(recipe ? String(recipe.coffee) : "");
  const [memo, setMemo] = useState(recipe?.memo ?? "");
  const [immersion, setImmersion] = useState(Boolean(recipe?.immersion));
  const [steps, setSteps] = useState<RecipeStep[]>(() => recipe && recipe.steps.length >= 2 ? recipe.steps.map(step => ({ ...step, action: normalizedRecipeAction(step.action) })) : defaultRecipeSteps());
  const [showErrors, setShowErrors] = useState(false);

  const { extraction: totalWater, bypass: bypassWater } = recipeWater(steps);
  const maxSteps = immersion ? 9 : 7;
  const steepSeconds = immersion ? immersionSeconds(steps) : null;
  const missingName = showErrors && !name.trim();
  const missingCoffee = showErrors && !(Number(coffee) > 0);
  const missingWater = showErrors && totalWater <= 0;

  const explicitTimeRows = useRef(new Set<number>());
  const updateStep = (index: number, patch: Partial<RecipeStep>) => setSteps(current => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  const handleTimeInput = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = (event.nativeEvent as InputEvent).data;
    const value = event.target.value;
    // Typing ':' switches the row to literal m:ss entry, with the digits so far as minutes.
    if (typed === ":") { explicitTimeRows.current.add(index); updateStep(index, { time: `${Number(steps[index].time.replace(/\D/g, "").slice(-3)) || 0}:` }); return; }
    updateStep(index, { time: explicitTimeRows.current.has(index) ? value.replace(/[^\d:]/g, "").replace(/^(\d{0,3}:\d{0,2}).*$/, "$1") : recipeTimeFromDigits(value) });
  };
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
  const save = () => {
    const coffeeAmount = Number(coffee);
    if (!name.trim() || !(coffeeAmount > 0) || totalWater <= 0) { setShowErrors(true); return; }
    onSave({ name: name.trim(), coffee: coffeeAmount, memo: memo.trim(), steps: immersion ? steps : basicRecipeSteps(steps), ...(immersion ? { immersion: true } : {}) });
    sheet.dismiss();
  };

  return <div className={`be-layer${sheet.closing ? " closing" : ""}`}>
    <div className="be-backdrop" ref={sheet.backdropRef} aria-hidden="true" onClick={sheet.onBackdropClick} />
    <form className="be-panel bw-panel rc-panel" ref={sheet.panelRef} role="dialog" aria-modal="true" aria-labelledby="rc-title" onSubmit={event => { event.preventDefault(); save(); }} noValidate>
      <div className="be-top" {...sheet.dragHandlers}>
        <div className="be-grab" aria-hidden="true" />
        <div className="be-head">
          <button type="button" className="be-head-button" onClick={() => sheet.dismiss()}>닫기</button>
          <h2 id="rc-title">{editing ? "레시피 수정" : "새 레시피"}</h2>
          <span />
        </div>
      </div>
      <div className="be-body"><div className="be-body-inner">
        {showErrors && (missingName || missingCoffee || missingWater) && <p className="be-alert" role="alert">{[missingName && "이름", missingCoffee && "원두 양", missingWater && "붓는 양"].filter(Boolean).join(", ")}을 채워주세요.</p>}

        <section className="be-group" aria-labelledby="rc-basic">
          <h3 className="be-group-label" id="rc-basic">기본</h3>
          <div className="be-card">
            <label className={`be-row${missingName ? " bad" : ""}`}><span className="be-row-name">이름<span className="be-req"> *</span></span><input value={name} maxLength={40} placeholder="예: 4:6 레시피" onChange={event => setName(event.target.value)} enterKeyHint="next" /></label>
            <label className={`be-row${missingCoffee ? " bad" : ""}`}><span className="be-row-name">원두 양<span className="be-req"> *</span></span><input type="number" inputMode="decimal" min="0.1" step="0.1" value={coffee} placeholder="15" onChange={event => setCoffee(event.target.value)} /><span className="be-unit">g</span></label>
            <div className="be-row seg-row">
              <span className="be-row-name">방식</span>
              <div className="be-seg" role="group" aria-label="레시피 방식">
                <button type="button" aria-pressed={!immersion} onClick={() => setImmersion(false)}>기본형</button>
                <button type="button" aria-pressed={immersion} onClick={() => setImmersion(true)}>침출형 (스위치)</button>
              </div>
            </div>
          </div>
        </section>

        <section className="be-group" aria-labelledby="rc-steps">
          <h3 className="be-group-label" id="rc-steps">{immersion ? "단계" : "푸어 타임라인"}<span className="rc-hint">시간은 숫자만: 130 → 1:30</span></h3>
          <div className={`be-card recipe-step-editor rc-steps ${immersion ? "is-immersion" : ""} ${missingWater ? "has-error" : ""}`}>
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
                {index === 0 ? <span className="recipe-fixed-time">0:00</span> : <input className="recipe-time-input" value={step.time} inputMode="numeric" placeholder="130" onFocus={event => event.target.select()} onChange={event => handleTimeInput(index, event)} onBlur={event => { explicitTimeRows.current.delete(index); setStepTime(index, event.target.value); }} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setStepTime(index, recipeTime(recipeTimeToSeconds(step.time) + (event.key === "ArrowUp" ? 5 : -5))); } }} aria-label={`${index + 1}번째 푸어 시간`} />}
                {immersion && <button type="button" className={`recipe-switch-toggle${closed ? " is-closed" : ""}${changed ? " is-changed" : ""}`} onClick={toggleSwitch} aria-pressed={closed} aria-label={`${index + 1}번째 단계 스위치: ${closed ? "닫힘" : "열림"}. 눌러서 ${closed ? "열기" : "닫기"}`}>{closed ? "닫힘" : "열림"}</button>}
                <select value={step.action} onChange={event => { const action = event.target.value as RecipeStep["action"]; updateStep(index, { action, ...(action === "마무리" || action === "없음" ? { amount: 0 } : {}) }); }} aria-label={`${index + 1}번째 푸어 동작`}>{(immersion || step.action === "없음" ? immersionActions : recipeActions).map(action => <option key={action} value={action}>{action === "없음" ? "–" : action}</option>)}</select>
                {isAmountlessStep(step) ? <span className="recipe-no-amount">–</span> : <label className="recipe-amount-input"><input type="number" inputMode="decimal" min="0" step="0.1" value={step.amount || ""} onChange={event => updateStep(index, { amount: Number(event.target.value) || 0 })} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} placeholder="0" aria-label={`${index + 1}번째 붓는 양`} /><span>g</span></label>}
                <span className="recipe-cumulative" aria-label={isBypassStep(step) ? `가수 ${fmt(Number(step.amount) || 0)}g, 누적에서 제외` : undefined}>{isBypassStep(step) ? `+${fmt(Number(step.amount) || 0)}g` : `${cumulative || "–"}g`}</span>
                <button type="button" className="recipe-remove-step" disabled={index < 2} aria-label={`${index + 1}번째 푸어 삭제`} onClick={() => setSteps(steps.filter((_, stepIndex) => stepIndex !== index))}>×</button>
              </div>;
            }); })()}
            <button type="button" className="rc-add-step" disabled={steps.length >= maxSteps} onClick={addStep}>{steps.length >= maxSteps ? (immersion ? "9단계까지 입력할 수 있어요" : "6회 푸어까지 입력할 수 있어요") : <><span aria-hidden="true">+</span>{immersion ? "단계 추가" : "푸어 추가"}</>}</button>
          </div>
          {missingWater && <p className="recipe-timeline-error">붓는 양을 한 번 이상 입력해주세요.</p>}
          <div className="recipe-metrics rc-metrics"><span>최종 물 양 <b>{totalWater ? `${fmt(totalWater)}g` : "–"}</b></span><span>{immersion ? "비율" : "브루잉 비율"} <b>{Number(coffee) > 0 && totalWater > 0 ? `1:${(totalWater / Number(coffee)).toFixed(1)}` : "1:–"}</b></span>{bypassWater > 0 && <span>가수 <b>{fmt(bypassWater)}g</b></span>}{steepSeconds !== null && <span>침출 <b>{recipeTime(steepSeconds)}</b></span>}</div>
        </section>

        <section className="be-group" aria-labelledby="rc-memo">
          <h3 className="be-group-label" id="rc-memo">메모</h3>
          <div className="be-card">
            <label className="be-row full bw-memo"><span className="sr-only">추출 메모</span><textarea rows={1} value={memo} placeholder="예: 앞 두 번으로 단맛, 뒤 세 번으로 농도" onChange={event => setMemo(event.target.value)} /></label>
          </div>
        </section>
      </div></div>
      <div className="bw-footer"><button type="submit" className="bw-save">{editing ? "수정 저장" : "레시피 저장"}</button></div>
    </form>
  </div>;
}
