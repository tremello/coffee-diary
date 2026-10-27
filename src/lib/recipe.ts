import { type Brew, type RecipeStep, type SavedRecipe } from "../types";

export const recipeActions: RecipeStep["action"][] = ["블룸", "센터 푸어", "원형 푸어", "마무리", "가수"];

// 침출형: 스위치만 조작하는 단계를 위해 동작이 비어 있음("–")을 고를 수 있다.
export const immersionActions: RecipeStep["action"][] = ["없음", ...recipeActions];
export const recipeSwitches: NonNullable<RecipeStep["switch"]>[] = ["닫고", "열고"];

// 이 동작은 붓는 양 없이 시점만 기록한다.
export const isAmountlessStep = (step: RecipeStep) => step.action === "마무리" || step.action === "없음";

export const normalizedRecipeAction = (action: string): RecipeStep["action"] => action === "스파이럴" ? "원형 푸어" : immersionActions.includes(action as RecipeStep["action"]) ? action as RecipeStep["action"] : "원형 푸어";

// 가수 (bypass water added to the server after extraction) is kept out of the brew ratio and shown on its own.
export const isBypassStep = (step: RecipeStep) => normalizedRecipeAction(step.action) === "가수";

export const recipeWater = (steps: RecipeStep[]) => steps.reduce((total, step) => {
  const amount = Number(step.amount) || 0;
  return isBypassStep(step) ? { ...total, bypass: total.bypass + amount } : { ...total, extraction: total.extraction + amount };
}, { extraction: 0, bypass: 0 });

// 침출 시간: 스위치를 닫은 시점부터 연 시점까지의 합. 열린 적이 없으면 null.
export const immersionSeconds = (steps: RecipeStep[]) => {
  let closedAt: number | null = null;
  let total = 0;
  let opened = false;
  for (const step of steps) {
    const at = recipeTimeToSeconds(step.time);
    if (step.switch === "닫고" && closedAt === null) closedAt = at;
    else if (step.switch === "열고" && closedAt !== null) { total += Math.max(0, at - closedAt); closedAt = null; opened = true; }
  }
  return opened ? total : null;
};

// 기본형으로 저장할 때는 스위치 조작과 스위치만 있는 단계를 정리한다.
export const basicRecipeSteps = (steps: RecipeStep[]): RecipeStep[] => steps.filter(step => step.action !== "없음").map(({ switch: _switch, ...step }) => step);

export const extractionCumulative = (steps: RecipeStep[], index: number) => recipeWater(steps.slice(0, index + 1)).extraction;

// Phone number pads have no ':', so digits alone read as m:ss with the last two as seconds (130 → 1:30).
export const recipeTimeFromDigits = (value: string) => {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 4);
  return digits ? `${Number(digits.slice(0, -2) || "0")}:${digits.slice(-2).padStart(2, "0")}` : "";
};

export const recipeTimeToSeconds = (time: string) => {
  const match = time.match(/^(\d+):(\d{1,2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};

export const recipeTime = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

export const defaultRecipeSteps = (): RecipeStep[] => [
  { time: "0:00", action: "블룸", amount: 0 },
  { time: "0:30", action: "원형 푸어", amount: 0 }
];

// Links brews without a recipeId to the one saved recipe of the same name; ambiguous or unknown names stay unlinked.
export const linkBrewsToRecipes = (brews: Brew[], recipes: SavedRecipe[]): Brew[] | null => {
  const idsByName = new Map<string, number[]>();
  recipes.forEach(recipe => idsByName.set(recipe.name, [...(idsByName.get(recipe.name) ?? []), recipe.id]));
  let changed = false;
  const linked = brews.map(brew => {
    if (brew.recipeId !== undefined) return brew;
    const ids = idsByName.get(brew.recipe.trim());
    if (ids?.length !== 1) return brew;
    changed = true;
    return { ...brew, recipeId: ids[0] };
  });
  return changed ? linked : null;
};
