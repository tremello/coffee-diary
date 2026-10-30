import { useState, type Dispatch, type SetStateAction } from "react";
import { StarRating } from "../ui";
import { PickSheet, type PickOption } from "../bean-editor/PickSheet";
import { useKeyboardInset } from "../bean-editor/useKeyboardInset";
import { usePickDrag } from "../bean-editor/usePickDrag";
import { fmt, handleNumericInput, withCommas } from "../../lib/format";
import { recipeWater } from "../../lib/recipe";
import { type Bean, BEAN_PROCESSES, type BrewForm, type CafePlace, type SavedRecipe } from "../../types";
import { brewRatio, brewTimeFromDigits, composeGrind, parseGrind, TASTE_ATTRIBUTES, type TasteScores } from "./brewFormat";
import { type CoffeeSheet, CoffeeRows } from "../bean-editor/CoffeeRows";
import { CafeSheet } from "./CafeSheet";
import { FitText } from "./FitText";
import { useSheet } from "./useSheet";

type Picker = "bean" | "recipe" | "dripper" | "grinder" | "cafe" | null;

export type BrewNote = { memo: string; rating: number; taste: TasteScores };

type ListItem = { key: string; title: string; sub?: string; keywords?: string; current: boolean; onPick: () => void };

// A plain list picker in the bean editor's sheet style, for choices that carry more than a name (beans, recipes).
// With `search`, a box on top filters the list: every typed word must appear in the title, sub line or keywords.
function ListSheet({ title, items, empty, search, noMatch, onClose }: { title: string; items: ListItem[]; empty: string; search?: string; noMatch?: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const pick = usePickDrag(onClose);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? items.filter(item => { const text = [item.title, item.sub, item.keywords].join(" ").toLowerCase(); return words.every(word => text.includes(word)); }) : items;
  return <div className="be-pick-layer">
    <div className="be-pick-backdrop" style={pick.backdropStyle} onClick={pick.close} aria-hidden="true" />
    <div className="be-pick" ref={pick.sheetRef} style={pick.sheetStyle} role="dialog" aria-modal="true" aria-label={title}>
      <div className="be-pick-grab" {...pick.handleProps} aria-hidden="true" />
      <div className="be-pick-head" {...pick.handleProps}><h3>{title}</h3><div><button type="button" onClick={pick.close}>닫기</button></div></div>
      {search && items.length > 0 && <label className="be-pick-search"><span className="sr-only">{title} 검색</span><input type="search" value={query} placeholder={search} autoFocus={window.matchMedia("(min-width: 760px)").matches} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} /></label>}
      <div className="be-pick-scroll" ref={pick.scrollRef}>
        {shown.length ? <div className="be-pick-list">{shown.map(item => <div className="be-pick-item" key={item.key} aria-current={item.current}>
          <button type="button" onClick={item.onPick}><span>{item.title}</span>{item.sub && <small>{item.sub}</small>}</button>
        </div>)}</div> : <p className="be-pick-empty">{items.length ? noMatch : empty}</p>}
      </div>
    </div>
  </div>;
}

// The brew form as "name · value" rows in a sheet over the list (a dialog on wider screens). BrewLog keeps the state and
// saving; this lays the fields out and opens the pickers.
export function BrewEditor({ editing, form, setForm, recentCafes, origins, varieties, onAddOrigin, onHideVariety, beans, recipes, selectedRecipeId, drippers, grinders, defaultGrinder, lastClicks, note, setNote, notice, error, onPickBean, onPickRecipe, onPickDripper, onHideDripper, onPickGrinder, onHideGrinder, onSave, onClose }: {
  editing: boolean;
  form: BrewForm;
  setForm: Dispatch<SetStateAction<BrewForm>>;
  recentCafes: CafePlace[];
  origins: PickOption[];
  varieties: PickOption[];
  onAddOrigin: (origin: string) => void;
  onHideVariety: (variety: string) => void;
  beans: Bean[];
  recipes: SavedRecipe[];
  selectedRecipeId: string;
  drippers: PickOption[];
  grinders: PickOption[];
  defaultGrinder: string;
  lastClicks: (grinder: string) => string;
  note: BrewNote;
  setNote: Dispatch<SetStateAction<BrewNote>>;
  notice: { text: string; onClear: () => void } | null;
  error: string;
  onPickBean: (beanId: string) => void;
  onPickRecipe: (recipeId: string) => void;
  onPickDripper: (dripper: string) => void;
  onHideDripper: (dripper: string) => void;
  onPickGrinder: (grinder: string) => void;
  onHideGrinder: (grinder: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  useKeyboardInset();
  const [picker, setPicker] = useState<Picker>(null);
  const [tasteOpen, setTasteOpen] = useState(() => Object.values(note.taste).some(Boolean));
  // With no 분쇄도 yet, the grinder shown is the one last picked here, else the default (that bean's or the latest brew's).
  const [pickedGrinder, setPickedGrinder] = useState<string | null>(null);
  const grind = parseGrind(form.grindSize, grinders.map(option => option.value));
  const grinder = form.grindSize.trim() ? grind.grinder : pickedGrinder ?? defaultGrinder;
  const setGrind = (nextGrinder: string, clicks: string) => { setPickedGrinder(nextGrinder); setForm(current => ({ ...current, grindSize: composeGrind(nextGrinder, clicks) })); };
  const [coffeeSheet, setCoffeeSheet] = useState<CoffeeSheet>(null);
  const sheet = useSheet(onClose, () => { if (coffeeSheet !== null) { setCoffeeSheet(null); return true; } if (!picker) return false; setPicker(null); return true; });
  const set = <K extends keyof BrewForm>(key: K, value: BrewForm[K]) => setForm(current => ({ ...current, [key]: value }));
  const bean = beans.find(item => String(item.id) === form.beanId);
  const recipe = recipes.find(item => String(item.id) === selectedRecipeId);
  const amount = parseFloat(form.amount);
  const ratio = brewRatio(amount, parseFloat(form.waterAmount));
  const tasted = TASTE_ATTRIBUTES.filter(({ key }) => note.taste[key]).length;
  const missingBean = Boolean(error) && !bean;
  const missingAmount = Boolean(error) && !(amount > 0);
  const missingWater = Boolean(error) && !(parseFloat(form.waterAmount) > 0);
  const cafeMode = form.kind === "cafe";
  const missingCafe = Boolean(error) && !form.cafe?.name.trim();
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
        <div className="be-seg bw-kind" role="group" aria-label="기록 종류">
          <button type="button" aria-pressed={!cafeMode} onClick={() => set("kind", "own")}>내 원두로</button>
          <button type="button" aria-pressed={cafeMode} onClick={() => set("kind", "cafe")}>카페·남이 내려줌</button>
        </div>
        {notice && <p className="bw-notice" role="status"><span className="be-dot" aria-hidden="true" /><span>{notice.text}</span><button type="button" onClick={notice.onClear}>비우기</button></p>}
        {error && <p className="be-alert" role="alert">{error}</p>}

        {cafeMode ? <>
        <section className="be-group" aria-labelledby="bw-where">
          <h3 className="be-group-label" id="bw-where">어디서</h3>
          <div className="be-card">
            <button type="button" className={`be-row bw-bean-row${missingCafe ? " bad" : ""}`} onClick={() => setPicker("cafe")}>
              <span className="be-row-name">카페<span className="be-req"> *</span></span>
              {form.cafe?.name ? <span className="be-value bw-bean-value"><span><FitText className="bw-bean-name" text={form.cafe.name} min={12} /></span><span className="be-chev" aria-hidden="true">›</span></span> : valueSpan("", missingCafe ? "골라주세요" : "검색")}
            </button>
            <label className="be-row"><span className="be-row-name">날짜</span><input type="date" value={form.date} onChange={event => set("date", event.target.value)} /></label>
          </div>
        </section>

        {/* The coffee itself, laid out like the bean editor's 원두 section with the cup's price under it; every row may stay empty here. */}
        <section className="be-group" aria-labelledby="bw-coffee">
          <h3 className="be-group-label" id="bw-coffee">원두</h3>
          <div className="be-card">
            <CoffeeRows value={form.coffee} onChange={update => setForm(current => ({ ...current, coffee: update(current.coffee) }))} required={false} error={error} processes={BEAN_PROCESSES} origins={origins} varieties={varieties}
              sheet={coffeeSheet} setSheet={setCoffeeSheet} onAddOrigin={onAddOrigin} onHideVariety={onHideVariety} />
            <label className="be-row"><span className="be-row-name">가격</span><input type="text" inputMode="numeric" value={withCommas(form.price)} placeholder="7,000" onChange={event => handleNumericInput(event, price => set("price", price))} /><span className="be-unit">원</span></label>
          </div>
        </section>

        <section className="be-group" aria-labelledby="bw-notes">
          <h3 className="be-group-label" id="bw-notes">로스터리 컵노트</h3>
          <div className="be-card"><label className="be-row full"><span className="sr-only">로스터리 컵노트</span><input value={form.roasteryNotes} placeholder="예: 흰 꽃, 복숭아, 꿀 (쉼표로 구분)" onChange={event => set("roasteryNotes", event.target.value)} /></label></div>
        </section>
        </> : <>
        <section className="be-group" aria-labelledby="bw-what">
          <h3 className="be-group-label" id="bw-what">무엇을{ratio && <span className="bw-ratio">비율 {ratio}</span>}</h3>
          <div className="be-card">
            <button type="button" className={`be-row bw-bean-row${missingBean ? " bad" : ""}`} onClick={() => setPicker("bean")}>
              <span className="be-row-name">원두<span className="be-req"> *</span></span>
              {bean ? <span className="be-value bw-bean-value"><span>{bean.roastery && <small>{bean.roastery}</small>}<FitText className="bw-bean-name" text={bean.name} min={12} /></span><span className="be-chev" aria-hidden="true">›</span></span> : valueSpan("", missingBean ? "골라주세요" : "선택")}
            </button>
            <button type="button" className="be-row" onClick={() => setPicker("recipe")}>
              <span className="be-row-name">레시피</span>
              {valueSpan(recipe?.name ?? "", "직접 입력")}
            </button>
            {!recipe && <label className="be-row sub"><span className="be-row-name">레시피 이름</span><input value={form.recipe} placeholder="예: 나만의 4:6 (선택)" onChange={event => set("recipe", event.target.value)} /></label>}
            <div className="be-row bw-pair">
              <label className={`bw-half${missingAmount ? " bad" : ""}`}><span className="be-row-name">원두 양<span className="be-req"> *</span></span><input type="number" inputMode="decimal" min="0.1" step="0.1" value={form.amount} placeholder="15" onChange={event => set("amount", event.target.value)} /><span className="be-unit">g</span></label>
              <label className={`bw-half${missingWater ? " bad" : ""}`}><span className="be-row-name">물 양<span className="be-req"> *</span></span><input type="number" inputMode="decimal" min="0.1" step="0.1" value={form.waterAmount} placeholder="240" onChange={event => set("waterAmount", event.target.value)} /><span className="be-unit">g</span></label>
            </div>
            <label className="be-row"><span className="be-row-name">날짜</span><input type="date" value={form.date} onChange={event => set("date", event.target.value)} /></label>
          </div>
        </section>

        <section className="be-group" aria-labelledby="bw-how">
          <h3 className="be-group-label" id="bw-how">어떻게</h3>
          <div className="be-card">
            <button type="button" className="be-row" onClick={() => setPicker("dripper")}><span className="be-row-name">드리퍼</span>{valueSpan(form.method, "선택")}</button>
            <div className="be-row bw-grind-row">
              <span className="be-row-name">분쇄도</span>
              <button type="button" className={`bw-grinder${grinder ? "" : " empty"}`} onClick={() => setPicker("grinder")}>{grinder || "그라인더"}<span className="be-chev" aria-hidden="true">›</span></button>
              <input className="bw-clicks" inputMode="decimal" aria-label="분쇄도 클릭 수" value={grind.clicks} placeholder="24" onChange={event => setGrind(grinder, event.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))} />
              <span className="be-unit">클릭</span>
            </div>
            <div className="be-row bw-pair">
              <label className="bw-half"><span className="be-row-name">물 온도</span><input type="number" inputMode="decimal" min="1" max="100" step="0.5" value={form.waterTemp} placeholder="92" onChange={event => set("waterTemp", event.target.value)} /><span className="be-unit">℃</span></label>
              <label className="bw-half"><span className="be-row-name">추출 시간</span><input inputMode="numeric" aria-label="추출 시간 (숫자만 눌러도 돼요: 245 → 2:45)" value={form.brewTime} placeholder="2:45" onFocus={event => event.target.select()} onChange={event => set("brewTime", brewTimeFromDigits(event.target.value))} /></label>
            </div>
          </div>
        </section>
        </>}

        <section className="be-group" aria-labelledby="bw-taste">
          <h3 className="be-group-label" id="bw-taste">맛은 어땠나요{tasteOpen && <button type="button" onClick={() => setTasteOpen(false)}>세부 평가 접기</button>}</h3>
          <div className="be-card">
            <div className="be-row bw-rating-row"><span className="be-row-name">별점</span><StarRating value={note.rating} onChange={rating => setNote(current => ({ ...current, rating: current.rating === rating ? 0 : rating }))} /></div>
            <label className="be-row full bw-memo"><span className="be-row-name bw-memo-label">컵 노트</span><textarea rows={1} value={note.memo} placeholder="오늘의 맛과 느낌을 적어보세요" onChange={event => setNote(current => ({ ...current, memo: event.target.value }))} /></label>
            {tasteOpen ? TASTE_ATTRIBUTES.map(({ key, label }) => { const value = note.taste[key] ?? 0; return <div className="be-row bw-taste-row" role="group" aria-label={label} key={key}>
              <span className="be-row-name">{label}</span>
              <span className="brew-taste-scale">{[1, 2, 3, 4, 5].map(step => <button type="button" key={step} aria-pressed={value >= step} aria-label={`${label} ${step}단계`} onClick={() => setNote(current => ({ ...current, taste: { ...current.taste, [key]: value === step ? 0 : step } }))} />)}</span>
              <em>{value || "–"}</em>
            </div>; }) : <button type="button" className="be-row" onClick={() => setTasteOpen(true)}><span className="be-row-name">맛 세부 평가 <small className="bw-optional">향 · 산미 · 단맛 · 바디감…</small></span><span className={`be-value${tasted ? "" : " empty"}`}><span>{tasted ? `${tasted}개 평가함` : "펼치기"}</span><span className="be-chev" aria-hidden="true">›</span></span></button>}
          </div>
        </section>
      </div></div>
      <div className="bw-footer"><button type="submit" className="bw-save">{editing ? "수정 저장" : !cafeMode && amount > 0 ? `저장 (재고 ${fmt(amount)}g 차감)` : "저장"}</button></div>

      {picker === "bean" && <ListSheet title="원두" empty="남은 원두가 없어요. 원두 재고에서 먼저 등록해주세요." search="원두, 로스터리로 검색" noMatch="찾는 원두가 없어요" onClose={() => setPicker(null)} items={beans.map(item => ({ key: String(item.id), title: [item.roastery, item.name].filter(Boolean).join(" · "), keywords: [item.origin, item.farm, item.variety, item.process].join(" "), sub: `${fmt(item.remaining)}g 남음${item.status ? ` · ${item.status}` : ""}`, current: String(item.id) === form.beanId, onPick: () => { onPickBean(String(item.id)); setPicker(null); } }))} />}
      {picker === "recipe" && <ListSheet title="레시피" empty="" onClose={() => setPicker(null)} items={[
        { key: "custom", title: "직접 입력", sub: "원두 양과 물 양을 직접 적어요", current: !recipe, onPick: () => { onPickRecipe(""); setPicker(null); } },
        ...recipes.map(item => ({ key: String(item.id), title: item.name, sub: `원두 ${fmt(item.coffee)}g · 물 ${fmt(recipeWater(item.steps).extraction)}g`, current: String(item.id) === selectedRecipeId, onPick: () => { onPickRecipe(String(item.id)); setPicker(null); } }))
      ]} />}
      {picker === "grinder" && <PickSheet title="그라인더" layout="list" value={grinder} options={grinders} placeholder="그라인더 이름 (예: 코만단테)" onPick={next => { onPickGrinder(next); setGrind(next, next === grinder ? grind.clicks : lastClicks(next)); setPicker(null); }} onHide={onHideGrinder} onClose={() => setPicker(null)} />}
      {picker === "cafe" && <CafeSheet value={form.cafe} recent={recentCafes} onPick={cafe => { set("cafe", cafe); setPicker(null); }} onClose={() => setPicker(null)} />}
      {picker === "dripper" && <PickSheet title="드리퍼" layout="list" value={form.method} options={drippers} placeholder="드리퍼 이름 (예: 하리오 스위치)" onPick={dripper => { onPickDripper(dripper); setPicker(null); }} onHide={onHideDripper} onClose={() => setPicker(null)} />}
    </form>
  </div>;
}
