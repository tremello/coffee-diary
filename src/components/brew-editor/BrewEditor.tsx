import { useState, type Dispatch, type SetStateAction } from "react";
import { StarRating } from "../ui";
import { PickSheet, type PickOption } from "../bean-editor/PickSheet";
import { fmt } from "../../lib/format";
import { recipeWater } from "../../lib/recipe";
import { type Bean, type BrewForm, type SavedRecipe } from "../../types";
import { brewRatio, brewTimeFromDigits, TASTE_ATTRIBUTES, type TasteScores } from "./brewFormat";
import { useSheet } from "./useSheet";

type Picker = "bean" | "recipe" | "dripper" | null;

export type BrewNote = { memo: string; rating: number; taste: TasteScores };

type ListItem = { key: string; title: string; sub?: string; current: boolean; onPick: () => void };

// A plain list picker in the bean editor's sheet style, for choices that carry more than a name (beans, recipes).
function ListSheet({ title, items, empty, onClose }: { title: string; items: ListItem[]; empty: string; onClose: () => void }) {
  return <div className="be-pick-layer">
    <div className="be-pick-backdrop" onClick={onClose} aria-hidden="true" />
    <div className="be-pick" role="dialog" aria-modal="true" aria-label={title}>
      <div className="be-pick-grab" aria-hidden="true" />
      <div className="be-pick-head"><h3>{title}</h3><div><button type="button" onClick={onClose}>닫기</button></div></div>
      <div className="be-pick-scroll">
        {items.length ? <div className="be-pick-list">{items.map(item => <div className="be-pick-item" key={item.key} aria-current={item.current}>
          <button type="button" onClick={item.onPick}><span>{item.title}</span>{item.sub && <small>{item.sub}</small>}</button>
        </div>)}</div> : <p className="be-pick-empty">{empty}</p>}
      </div>
    </div>
  </div>;
}

// The brew form as "name · value" rows in a sheet over the list (a dialog on wider screens). BrewLog keeps the state and
// saving; this lays the fields out and opens the pickers.
export function BrewEditor({ editing, form, setForm, beans, recipes, selectedRecipeId, drippers, note, setNote, notice, error, onPickBean, onPickRecipe, onPickDripper, onHideDripper, onSave, onClose }: {
  editing: boolean;
  form: BrewForm;
  setForm: Dispatch<SetStateAction<BrewForm>>;
  beans: Bean[];
  recipes: SavedRecipe[];
  selectedRecipeId: string;
  drippers: PickOption[];
  note: BrewNote;
  setNote: Dispatch<SetStateAction<BrewNote>>;
  notice: { text: string; onClear: () => void } | null;
  error: string;
  onPickBean: (beanId: string) => void;
  onPickRecipe: (recipeId: string) => void;
  onPickDripper: (dripper: string) => void;
  onHideDripper: (dripper: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const [picker, setPicker] = useState<Picker>(null);
  const [tasteOpen, setTasteOpen] = useState(() => Object.values(note.taste).some(Boolean));
  const sheet = useSheet(onClose, () => { if (!picker) return false; setPicker(null); return true; });
  const set = <K extends keyof BrewForm>(key: K, value: BrewForm[K]) => setForm(current => ({ ...current, [key]: value }));
  const bean = beans.find(item => String(item.id) === form.beanId);
  const recipe = recipes.find(item => String(item.id) === selectedRecipeId);
  const amount = parseFloat(form.amount);
  const ratio = brewRatio(amount, parseFloat(form.waterAmount));
  const tasted = TASTE_ATTRIBUTES.filter(({ key }) => note.taste[key]).length;
  const missingBean = Boolean(error) && !bean;
  const missingAmount = Boolean(error) && !(amount > 0);
  const missingWater = Boolean(error) && !(parseFloat(form.waterAmount) > 0);
  const valueSpan = (value: string, placeholder: string) => <span className={`be-value${value ? "" : " empty"}`}><span>{value || placeholder}</span><span className="be-chev" aria-hidden="true">›</span></span>;

  return <div className={`be-layer${sheet.closing ? " closing" : ""}`}>
    <div className="be-backdrop" ref={sheet.backdropRef} aria-hidden="true" onClick={sheet.onBackdropClick} />
    <form className="be-panel bw-panel" ref={sheet.panelRef} role="dialog" aria-modal="true" aria-labelledby="bw-title" onSubmit={event => { event.preventDefault(); onSave(); }} noValidate>
      <div className="be-top" {...sheet.dragHandlers}>
        <div className="be-grab" aria-hidden="true" />
        <div className="be-head">
          <button type="button" className="be-head-button" onClick={() => sheet.dismiss()}>닫기</button>
          <h2 id="bw-title">{editing ? "브루잉 기록 수정" : "브루잉 기록"}</h2>
          <span />
        </div>
      </div>
      <div className="be-body"><div className="be-body-inner">
        {notice && <p className="bw-notice" role="status"><span className="be-dot" aria-hidden="true" /><span>{notice.text}</span><button type="button" onClick={notice.onClear}>비우기</button></p>}
        {error && <p className="be-alert" role="alert">{error}</p>}

        <section className="be-group" aria-labelledby="bw-what">
          <h3 className="be-group-label" id="bw-what">무엇을</h3>
          <div className="be-card">
            <button type="button" className={`be-row${missingBean ? " bad" : ""}`} onClick={() => setPicker("bean")}>
              <span className="be-row-name">원두<span className="be-req"> *</span></span>
              {valueSpan(bean ? `${[bean.roastery, bean.name].filter(Boolean).join(" · ")} (${fmt(bean.remaining)}g)` : "", missingBean ? "골라주세요" : "선택")}
            </button>
            <button type="button" className="be-row" onClick={() => setPicker("recipe")}>
              <span className="be-row-name">레시피</span>
              {valueSpan(recipe?.name ?? "", "직접 입력")}
            </button>
            {!recipe && <label className="be-row sub"><span className="be-row-name">레시피 이름</span><input value={form.recipe} placeholder="예: 나만의 4:6 (선택)" onChange={event => set("recipe", event.target.value)} /></label>}
            <label className={`be-row${missingAmount ? " bad" : ""}`}><span className="be-row-name">원두 양<span className="be-req"> *</span></span><input type="number" inputMode="decimal" min="0.1" step="0.1" value={form.amount} placeholder="15" onChange={event => set("amount", event.target.value)} /><span className="be-unit">g</span></label>
            <label className={`be-row${missingWater ? " bad" : ""}`}><span className="be-row-name">물 양<span className="be-req"> *</span></span><input type="number" inputMode="decimal" min="0.1" step="0.1" value={form.waterAmount} placeholder="240" onChange={event => set("waterAmount", event.target.value)} /><span className="be-unit">g{ratio && <small className="bw-ratio"> · {ratio}</small>}</span></label>
            <label className="be-row"><span className="be-row-name">날짜</span><input type="date" value={form.date} onChange={event => set("date", event.target.value)} /></label>
          </div>
        </section>

        <section className="be-group" aria-labelledby="bw-how">
          <h3 className="be-group-label" id="bw-how"><span>어떻게 <small className="bw-optional">선택 · 맛이 달랐던 이유를 찾을 때 도움이 돼요</small></span></h3>
          <div className="be-card">
            <button type="button" className="be-row" onClick={() => setPicker("dripper")}><span className="be-row-name">드리퍼</span>{valueSpan(form.method, "선택")}</button>
            <label className="be-row"><span className="be-row-name">분쇄도</span><input value={form.grindSize} placeholder="예: 코만단테 24클릭" onChange={event => set("grindSize", event.target.value)} /></label>
            <label className="be-row"><span className="be-row-name">물 온도</span><input type="number" inputMode="decimal" min="1" max="100" step="0.5" value={form.waterTemp} placeholder="92" onChange={event => set("waterTemp", event.target.value)} /><span className="be-unit">℃</span></label>
            <label className="be-row"><span className="be-row-name be-row-stack">추출 시간<small>숫자만: 245 → 2:45</small></span><input inputMode="numeric" value={form.brewTime} placeholder="2:45" onFocus={event => event.target.select()} onChange={event => set("brewTime", brewTimeFromDigits(event.target.value))} /></label>
          </div>
        </section>

        <section className="be-group" aria-labelledby="bw-taste">
          <h3 className="be-group-label" id="bw-taste">맛은 어땠나요</h3>
          <div className="be-card">
            <div className="be-row bw-rating-row"><span className="be-row-name">별점</span><StarRating value={note.rating} onChange={rating => setNote(current => ({ ...current, rating: current.rating === rating ? 0 : rating }))} /></div>
            <label className="be-row full bw-memo"><span className="sr-only">컵 노트 / 느낀 점</span><textarea rows={2} value={note.memo} placeholder="컵 노트 / 느낀 점을 자유롭게 적어보세요" onChange={event => setNote(current => ({ ...current, memo: event.target.value }))} /></label>
            {tasteOpen ? TASTE_ATTRIBUTES.map(({ key, label }) => { const value = note.taste[key] ?? 0; return <div className="be-row bw-taste-row" role="group" aria-label={label} key={key}>
              <span className="be-row-name">{label}</span>
              <span className="brew-taste-scale">{[1, 2, 3, 4, 5].map(step => <button type="button" key={step} aria-pressed={value >= step} aria-label={`${label} ${step}단계`} onClick={() => setNote(current => ({ ...current, taste: { ...current.taste, [key]: value === step ? 0 : step } }))} />)}</span>
              <em>{value || "–"}</em>
            </div>; }) : <button type="button" className="be-row" onClick={() => setTasteOpen(true)}><span className="be-row-name">맛 세부 평가 <small className="bw-optional">향 · 산미 · 단맛 · 바디감…</small></span><span className="be-value"><span>{tasted ? `${tasted}개 평가함` : "펼치기"}</span><span className="be-chev" aria-hidden="true">›</span></span></button>}
          </div>
        </section>
      </div></div>
      <div className="bw-footer"><button type="submit" className="bw-save">{editing ? "수정 저장" : amount > 0 ? `저장 (재고 ${fmt(amount)}g 차감)` : "저장"}</button></div>

      {picker === "bean" && <ListSheet title="원두" empty="남은 원두가 없어요. 원두 재고에서 먼저 등록해주세요." onClose={() => setPicker(null)} items={beans.map(item => ({ key: String(item.id), title: [item.roastery, item.name].filter(Boolean).join(" · "), sub: `${fmt(item.remaining)}g 남음${item.status ? ` · ${item.status}` : ""}`, current: String(item.id) === form.beanId, onPick: () => { onPickBean(String(item.id)); setPicker(null); } }))} />}
      {picker === "recipe" && <ListSheet title="레시피" empty="" onClose={() => setPicker(null)} items={[
        { key: "custom", title: "직접 입력", sub: "원두 양과 물 양을 직접 적어요", current: !recipe, onPick: () => { onPickRecipe(""); setPicker(null); } },
        ...recipes.map(item => ({ key: String(item.id), title: item.name, sub: `원두 ${fmt(item.coffee)}g · 물 ${fmt(recipeWater(item.steps).extraction)}g`, current: String(item.id) === selectedRecipeId, onPick: () => { onPickRecipe(String(item.id)); setPicker(null); } }))
      ]} />}
      {picker === "dripper" && <PickSheet title="드리퍼" layout="list" value={form.method} options={drippers} placeholder="드리퍼 이름 (예: 하리오 스위치)" onPick={dripper => { onPickDripper(dripper); setPicker(null); }} onHide={onHideDripper} onClose={() => setPicker(null)} />}
    </form>
  </div>;
}
