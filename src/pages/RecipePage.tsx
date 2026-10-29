import { useState } from "react";
import { type StorageSetter } from "../data/sync";
import { JourneySteps } from "../components/ui";
import { RecipeEditor, type RecipeDraft } from "../components/recipe-editor/RecipeEditor";
import { fmt } from "../lib/format";
import { extractionCumulative, immersionSeconds, linkBrewsToRecipes, normalizedRecipeAction, recipeTime, recipeWater } from "../lib/recipe";
import { type Brew, type SavedRecipe } from "../types";

type RecipeSort = "latest" | "registered" | "recentlyUsed";
const RECIPE_SORT_KEY = "coffee-recipe-sort";
const initialRecipeSort = (): RecipeSort => {
  try { const saved = localStorage.getItem(RECIPE_SORT_KEY); if (saved === "latest" || saved === "registered" || saved === "recentlyUsed") return saved; } catch {}
  return "latest";
};

type RecipeProps = { recipes: SavedRecipe[]; setRecipes: StorageSetter<SavedRecipe[]>; brews: Brew[]; setBrews: StorageSetter<Brew[]>; userId: string | null };

export function RecipePage(props: RecipeProps) {
  return <div className="recipe-page">
    <div className="inventory-intro recipe-intro"><div><p>자주 쓰는 추출 흐름을 내 방식으로 저장해요.</p></div></div>
    <RecipeLibrary {...props} />
  </div>;
}

function RecipeLibrary({ recipes, setRecipes, brews, setBrews, userId }: RecipeProps) {
  // The form opens as a sheet over the list: for a new recipe (null) or to edit a saved one.
  const [editor, setEditor] = useState<{ editing: SavedRecipe | null } | null>(null);
  const [deletedRecipe, setDeletedRecipe] = useState<SavedRecipe | null>(null);
  const [sort, setSort] = useState<RecipeSort>(initialRecipeSort);
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

  return <>
    {deletedRecipe && <div className="delete-notice" role="status"><span>레시피를 삭제했어요.</span><button type="button" onClick={undoRemove}>되돌리기</button></div>}
    <section className="recipe-library" aria-label="저장 레시피">
      <div className="recipe-library-list-header"><div className="recipe-library-heading"><strong>저장한 레시피</strong><span>{recipes.length}개</span></div><div className="recipe-list-tools"><label className="recipe-sort-control" htmlFor="recipe-sort"><span className="sr-only">정렬</span><select id="recipe-sort" className="inventory-sort recipe-sort-select" value={sort} onChange={event => chooseSort(event.target.value as RecipeSort)}><option value="latest">최신순</option><option value="registered">등록순</option><option value="recentlyUsed">최근 사용한 순</option></select></label><button type="button" className="recipe-new-button" onClick={() => setEditor({ editing: null })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>새 레시피</button></div></div>
      <div className="recipe-library-list">
      {!sorted.length ? <div className="recipe-library-empty recipe-onboarding"><img className="onboarding-logo" src="/coffee-diary-logo-brown-96.png" width="38" height="38" alt="" /><h3>첫 레시피를 만들어보세요</h3><p>자주 쓰는 드립 방식을 저장해두면 브루잉 기록에 바로 적용할 수 있어요.</p><JourneySteps active="recipes" /><button type="button" className="primary-button" onClick={() => setEditor({ editing: null })}>첫 레시피 만들기</button></div> : sorted.map(recipe => {
        const { extraction: water, bypass } = recipeWater(recipe.steps);
        const steep = recipe.immersion ? immersionSeconds(recipe.steps) : null;
        return <article className="saved-recipe-card" key={recipe.id}>
          <div className="saved-recipe-top"><div><h3>{recipe.name}{recipe.immersion && <span className="recipe-type-badge">침출식</span>}</h3><p>원두 {fmt(recipe.coffee)}g · 물 {fmt(water)}g · {water && recipe.coffee ? `1:${(water / recipe.coffee).toFixed(1)}` : "1:–"}{bypass > 0 && ` · 가수 ${fmt(bypass)}g`}{steep !== null && ` · 침출 ${recipeTime(steep)}`}</p></div><div className="saved-recipe-actions"><button type="button" onClick={() => setEditor({ editing: recipe })}>수정</button><button type="button" onClick={() => remove(recipe)}>삭제</button></div></div>
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
    {editor && <RecipeEditor recipe={editor.editing} canReadPhoto={userId !== null} onSave={save} onClose={() => setEditor(null)} />}
  </>;
}
