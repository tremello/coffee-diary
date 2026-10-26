import { type RecipeStep } from "../types";

export const recipeActions: RecipeStep["action"][] = ["블룸", "센터 푸어", "원형 푸어", "마무리", "가수"];

export const normalizedRecipeAction = (action: string): RecipeStep["action"] => action === "스파이럴" ? "원형 푸어" : recipeActions.includes(action as RecipeStep["action"]) ? action as RecipeStep["action"] : "원형 푸어";

// 가수 (bypass water added to the server after extraction) is kept out of the brew ratio and shown on its own.
export const isBypassStep = (step: RecipeStep) => normalizedRecipeAction(step.action) === "가수";

export const recipeWater = (steps: RecipeStep[]) => steps.reduce((total, step) => {
  const amount = Number(step.amount) || 0;
  return isBypassStep(step) ? { ...total, bypass: total.bypass + amount } : { ...total, extraction: total.extraction + amount };
}, { extraction: 0, bypass: 0 });

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
