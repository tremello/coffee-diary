import { Fragment, useState } from "react";
import { RatingStars } from "../components/brew-editor/RatingStars";
import { shortDate } from "../components/brew-editor/brewFormat";
import { DeskSearch, DeskStart, DeskToolbar } from "../components/desk/Desk";
import { RecipeChart } from "../components/desk/RecipeChart";
import { type Page } from "../lib/pages";
import { type StorageSetter } from "../data/sync";
import { JourneySteps } from "../components/ui";
import { RecipeEditor, type RecipeDraft } from "../components/recipe-editor/RecipeEditor";
import { RecipeShareSheet } from "../components/recipe-share/RecipeShareSheet";
import { fmt } from "../lib/format";
import { extractionCumulative, immersionSeconds, linkBrewsToRecipes, normalizedRecipeAction, recipeTime, recipeWater } from "../lib/recipe";
import { type Bean, type Brew, type SavedRecipe, type TastingNote } from "../types";

type RecipeSort = "latest" | "registered" | "recentlyUsed";
const RECIPE_SORT_KEY = "coffee-recipe-sort";
const initialRecipeSort = (): RecipeSort => {
  try { const saved = localStorage.getItem(RECIPE_SORT_KEY); if (saved === "latest" || saved === "registered" || saved === "recentlyUsed") return saved; } catch {}
  return "latest";
};

type RecipeProps = { recipes: SavedRecipe[]; setRecipes: StorageSetter<SavedRecipe[]>; brews: Brew[]; setBrews: StorageSetter<Brew[]>; userId: string | null;
  notes?: TastingNote[]; beans?: Bean[]; desk?: boolean; onGoto?: (page: Page) => void; onBrewWith?: (recipeId: number) => void; onCafe?: () => void };

export function RecipePage(props: RecipeProps) {
  if (props.desk) return <div className="recipe-page desk-page recipes-desk"><RecipeLibrary {...props} /></div>;
  return <div className="recipe-page">
    <div className="inventory-intro recipe-intro"><div><p>자주 쓰는 추출 흐름을 내 방식으로 저장해요.</p></div></div>
    <RecipeLibrary {...props} />
  </div>;
}

function RecipeLibrary({ recipes, setRecipes, brews, setBrews, userId, notes = [], beans = [], desk, onGoto, onBrewWith, onCafe }: RecipeProps) {
  // The form opens as a sheet over the list: for a new recipe (null) or to edit a saved one.
  const [editor, setEditor] = useState<{ editing: SavedRecipe | null } | null>(null);
  const [deletedRecipe, setDeletedRecipe] = useState<SavedRecipe | null>(null);
  const [sharing, setSharing] = useState<SavedRecipe | null>(null);
  const [sort, setSort] = useState<RecipeSort>(initialRecipeSort);
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [pickedStep, setPickedStep] = useState<number | null>(null);
  const chooseSort = (next: RecipeSort) => { setSort(next); try { localStorage.setItem(RECIPE_SORT_KEY, next); } catch {} };

  const save = (draft: RecipeDraft) => {
    const editingId = editor?.editing?.id ?? null;
    const previous = recipes.find(recipe => recipe.id === editingId);
    const item: SavedRecipe = { id: editingId ?? Date.now(), ...draft, createdAt: previous?.createdAt ?? Date.now() };
    setRecipes(editingId === null ? [...recipes, item] : recipes.map(recipe => recipe.id === editingId ? item : recipe));
    // Older brews only carry the recipe name; on a rename, attach this recipe's id to them so the usage history follows it.
    if (previous && previous.name !== item.name) {
      const linked = linkBrewsToRecipes(brews, recipes.filter(recipe => recipe.name === previous.name));
      if (linked) setBrews(linked);
    }
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
  const lastUsedById = new Map<number, Brew>();
  (linkBrewsToRecipes(brews, recipes) ?? brews).forEach(brew => {
    if (brew.recipeId === undefined) return;
    const previous = lastUsedById.get(brew.recipeId);
    if (!previous || brew.date > previous.date || (brew.date === previous.date && brew.id > previous.id)) lastUsedById.set(brew.recipeId, brew);
  });
  const sorted = [...recipes].sort((a, b) => {
    if (sort === "registered") return a.createdAt - b.createdAt || a.id - b.id;
    if (sort === "recentlyUsed") {
      const aLast = lastUsedById.get(a.id);
      const bLast = lastUsedById.get(b.id);
      return (bLast?.date ?? "").localeCompare(aLast?.date ?? "") || (bLast?.id ?? 0) - (aLast?.id ?? 0) || b.createdAt - a.createdAt || b.id - a.id;
    }
    return b.createdAt - a.createdAt || b.id - a.id;
  });

  const sheets = <>
    {sharing && <RecipeShareSheet recipe={sharing} onClose={() => setSharing(null)} />}
    {editor && <RecipeEditor recipe={editor.editing} canReadPhoto={userId !== null} onSave={save} onClose={() => setEditor(null)} />}
  </>;

  if (desk) {
    const linked = linkBrewsToRecipes(brews, recipes) ?? brews;
    const usesOf = (recipe: SavedRecipe) => linked.filter(brew => brew.recipeId === recipe.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const ratingOf = (brew: Brew) => notes.find(note => note.brewId === brew.id)?.rating ?? 0;
    const shown = query.trim() ? sorted.filter(recipe => recipe.name.toLowerCase().includes(query.trim().toLowerCase())) : sorted;
    const picked = shown.find(recipe => recipe.id === pickedId) ?? shown[0];
    const pick = (id: number) => { setPickedId(id); setPickedStep(null); };
    const summary = (recipe: SavedRecipe) => {
      const { extraction: water } = recipeWater(recipe.steps);
      const steep = recipe.immersion ? immersionSeconds(recipe.steps) : null;
      const pours = recipe.steps.filter(step => !["없음", "마무리"].includes(normalizedRecipeAction(step.action))).length;
      return [recipe.temp ? `${fmt(recipe.temp)}℃` : "", `${fmt(recipe.coffee)}g`, `${fmt(water)}g`, water && recipe.coffee ? `1:${(water / recipe.coffee).toFixed(1)}` : "", recipe.immersion ? `${recipe.steps.length}단계${steep !== null ? ` · 침출 ${recipeTime(steep)}` : ""}` : `붓기 ${pours}번`].filter(Boolean).join(" · ");
    };
    const uses = picked ? usesOf(picked) : [];
    const rated = uses.map(ratingOf).filter(Boolean);
    const average = rated.length ? Math.round(rated.reduce((sum, value) => sum + value, 0) / rated.length * 10) / 10 : 0;
    const beanName = (brew: Brew) => beans.find(bean => bean.id === brew.beanId)?.name ?? "삭제된 원두";
    return <>
      <DeskToolbar
        search={<DeskSearch value={query} onChange={setQuery} placeholder="레시피 이름으로 검색" label="레시피 검색" />}
        middle={recipes.length > 0 && <p className="desk-summary">저장한 레시피 <b>{recipes.length}개</b> · 자주 쓰는 추출 흐름을 내 방식으로 저장해요</p>}
        actions={<>
          <select className="desk-select" aria-label="레시피 정렬" value={sort} onChange={event => chooseSort(event.target.value as RecipeSort)}><option value="latest">최신순</option><option value="registered">등록순</option><option value="recentlyUsed">최근 사용한 순</option></select>
          <button type="button" className="primary-button desk-add" data-desk-add onClick={() => setEditor({ editing: null })}>+ 새 레시피</button>
        </>} />
      {deletedRecipe && <div className="delete-notice" role="status"><span>레시피를 삭제했어요.</span><button type="button" onClick={undoRemove}>되돌리기</button></div>}
      {!recipes.length ? <DeskStart
        steps={[
          { label: "원두 등록", hint: "봉투 사진을 찍으면 이름·로스팅 날짜가 채워져요", done: beans.some(bean => !bean.deleted), action: { label: "원두 재고로", onClick: () => onGoto?.("Beans") } },
          { label: "레시피 만들기", hint: "자주 쓰는 붓기 순서를 저장해두면 기록할 때 바로 채워져요", done: false, action: { label: "만들기", onClick: () => setEditor({ editing: null }) } },
          { label: "첫 브루잉 기록", hint: "레시피 없이도 기록할 수 있어요", done: brews.length > 0, action: { label: "브루잉 기록으로", onClick: () => onGoto?.("Brew Log") } }
        ]}
        extra={onCafe && <>카페에서 마신 커피는 원두 없이도 바로 남길 수 있어요. <button type="button" className="desk-link" onClick={onCafe}>카페 커피 기록하기 →</button></>}
        example={<>
          <header className="desk-detail-head"><h2>4:6 메서드</h2><p className="desk-kicker">92℃ · 원두 20g · 물 300g · 1:15.0</p></header>
          <RecipeChart steps={[{ time: "0:00", action: "블룸", amount: 50 }, { time: "0:45", action: "원형 푸어", amount: 70 }, { time: "1:30", action: "원형 푸어", amount: 60 }, { time: "2:10", action: "센터 푸어", amount: 60 }, { time: "2:40", action: "센터 푸어", amount: 60 }, { time: "3:30", action: "마무리", amount: 0 }]} picked={null} />
        </>} />
      : <div className="desk-split">
        <div className="desk-list desk-panel" role="list">
          {shown.length === 0 ? <p className="empty-state">찾는 레시피가 없어요</p> : shown.map(recipe => <button type="button" role="listitem" key={recipe.id} data-desk-item className="desk-row" aria-current={recipe.id === picked?.id} onClick={() => pick(recipe.id)}>
            <span className="desk-row-top"><b>{recipe.name}</b>{recipe.immersion && <span className="recipe-type-badge">침출식</span>}<span className="desk-row-count">{usesOf(recipe).length}번</span></span>
            <span className="desk-row-sub">{summary(recipe)}</span>
          </button>)}
        </div>
        {picked ? <section className="desk-panel desk-detail" aria-labelledby="desk-recipe-title">
          <header className="desk-detail-head">
            <h2 id="desk-recipe-title">{picked.name}{picked.immersion && <span className="recipe-type-badge">침출식</span>}</h2>
            <p className="desk-kicker">{(() => { const { extraction: water, bypass } = recipeWater(picked.steps); const steep = picked.immersion ? immersionSeconds(picked.steps) : null; return [picked.temp ? `${fmt(picked.temp)}℃` : "", `원두 ${fmt(picked.coffee)}g`, `물 ${fmt(water)}g`, water && picked.coffee ? `1:${(water / picked.coffee).toFixed(1)}` : "", bypass > 0 ? `가수 ${fmt(bypass)}g` : "", steep !== null ? `침출 ${recipeTime(steep)}` : ""].filter(Boolean).join(" · "); })()}</p>
          </header>
          <div className="desk-actions">
            {onBrewWith && <button type="button" className="primary-button" onClick={() => onBrewWith(picked.id)}>이 레시피로 브루잉</button>}
            <button type="button" className="quiet-button" onClick={() => setSharing(picked)}>공유</button>
            <button type="button" className="quiet-button" data-desk-edit onClick={() => setEditor({ editing: picked })}>수정</button>
            <button type="button" className="quiet-button desk-danger" onClick={() => remove(picked)}>삭제</button>
          </div>
          <div className="desk-halves">
            <RecipeChart steps={picked.steps} immersion={picked.immersion} picked={pickedStep} />
            <div className="desk-table-wrap"><table className="desk-table desk-steps">
              <thead><tr><th>시간</th><th>할 일</th>{picked.immersion && <th>스위치</th>}<th className="num">붓기</th><th className="num">누적</th></tr></thead>
              <tbody>{(() => { let closed = false; return picked.steps.map((step, index) => {
                const action = normalizedRecipeAction(step.action);
                const toggled = picked.immersion && step.switch !== undefined && (step.switch === "닫고") !== closed;
                if (toggled) closed = step.switch === "닫고";
                const amountless = action === "없음" || action === "마무리";
                return <tr key={index} tabIndex={0} className={pickedStep === index ? "is-current" : undefined} onMouseEnter={() => setPickedStep(index)} onFocus={() => setPickedStep(index)} onClick={() => setPickedStep(index)}>
                  <td>{step.time}</td>
                  <td>{action === "없음" ? "기다리기" : action}</td>
                  {picked.immersion && <td>{toggled && <span className={`desk-switch${closed ? " is-closed" : ""}`}>{closed ? "닫기" : "열기"}</span>}</td>}
                  <td className="num">{amountless ? "–" : `${fmt(step.amount)}g`}</td>
                  <td className="num">{action === "가수" ? "컵에" : `${fmt(extractionCumulative(picked.steps, index))}g`}</td>
                </tr>;
              }); })()}</tbody>
            </table></div>
          </div>
          {(picked.memo || uses.length > 0) && <div className="desk-notes">
            {picked.memo && <div><h3 className="desk-label">메모</h3><p className="desk-note">{picked.memo}</p></div>}
            {uses.length > 0 && <div><h3 className="desk-label desk-label-row"><span>이 레시피로 내린 기록</span><span>{uses.length}잔{average ? ` · 평균 ★${average}` : ""}</span></h3>
              <div className="desk-note desk-uses">{uses.slice(0, 3).map(brew => <Fragment key={brew.id}><span>{beanName(brew)} · {shortDate(brew.date)}</span><RatingStars value={ratingOf(brew)} /></Fragment>)}</div></div>}
          </div>}
        </section> : <div className="desk-panel desk-detail desk-detail-empty">찾는 레시피가 없어요</div>}
      </div>}
      {sheets}
    </>;
  }

  return <>
    {deletedRecipe && <div className="delete-notice" role="status"><span>레시피를 삭제했어요.</span><button type="button" onClick={undoRemove}>되돌리기</button></div>}
    <section className="recipe-library" aria-label="저장 레시피">
      <div className="recipe-library-list-header"><div className="recipe-library-heading"><strong>저장한 레시피</strong><span>{recipes.length}개</span></div><div className="recipe-list-tools"><label className="recipe-sort-control" htmlFor="recipe-sort"><span className="sr-only">정렬</span><select id="recipe-sort" className="inventory-sort recipe-sort-select" value={sort} onChange={event => chooseSort(event.target.value as RecipeSort)}><option value="latest">최신순</option><option value="registered">등록순</option><option value="recentlyUsed">최근 사용한 순</option></select></label><button type="button" className="recipe-new-button" onClick={() => setEditor({ editing: null })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>새 레시피</button></div></div>
      <div className="recipe-library-list">
      {!sorted.length ? <div className="recipe-library-empty recipe-onboarding"><img className="onboarding-logo" src="/coffee-diary-logo-brown-96.png" width="38" height="38" alt="" /><h3>첫 레시피를 만들어보세요</h3><p>자주 쓰는 드립 방식을 저장해두면 브루잉 기록에 바로 적용할 수 있어요.</p><JourneySteps active="recipes" /><button type="button" className="primary-button" onClick={() => setEditor({ editing: null })}>첫 레시피 만들기</button></div> : sorted.map(recipe => {
        const { extraction: water, bypass } = recipeWater(recipe.steps);
        const steep = recipe.immersion ? immersionSeconds(recipe.steps) : null;
        return <article className="saved-recipe-card" key={recipe.id}>
          <div className="saved-recipe-top"><div><h3>{recipe.name}{recipe.immersion && <span className="recipe-type-badge">침출식</span>}</h3><p>{recipe.temp ? `${fmt(recipe.temp)}℃ · ` : ""}원두 {fmt(recipe.coffee)}g · 물 {fmt(water)}g · {water && recipe.coffee ? `1:${(water / recipe.coffee).toFixed(1)}` : "1:–"}{bypass > 0 && ` · 가수 ${fmt(bypass)}g`}{steep !== null && ` · 침출 ${recipeTime(steep)}`}</p></div><div className="saved-recipe-actions"><button type="button" onClick={() => setSharing(recipe)}>공유</button><button type="button" onClick={() => setEditor({ editing: recipe })}>수정</button><button type="button" onClick={() => remove(recipe)}>삭제</button></div></div>
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
              return <div className={`saved-recipe-step${closed ? " is-closed" : ""}`} key={`${recipe.id}-${index}`}><span>{step.time}</span><i aria-hidden="true" /><p><b>{title}{action !== "없음" && switchLabel && <small className="recipe-switch-note">{closed ? "닫기" : "열기"}</small>}</b><em>{meta}</em></p></div>;
            });
          })()}</div>
          {recipe.memo && <p className="saved-recipe-memo">{recipe.memo}</p>}
        </article>;
      })}
      </div>
    </section>
    {sheets}
  </>;
}
