export const BEAN_STATUSES = ["디개싱 중", "소비 중"] as const;

export type BeanStatus = (typeof BEAN_STATUSES)[number];

export const BEAN_QUALITIES = ["특식", "준특식", "사료"] as const;

export type BeanQuality = (typeof BEAN_QUALITIES)[number];

export type Bean = {
  id: number;
  name: string;
  origin: string;
  process: string;
  roastery: string;
  date: string;
  consumed?: number;
  purchased: number;
  remaining: number;
  price: string;
  roasteryNotes?: string;
  deleted?: boolean;
  roastDate?: string;
  farm?: string;
  variety?: string;
  flavor?: string;
  memo?: string;
  status?: BeanStatus;
  quality?: BeanQuality;
};

export type BeanForm = Omit<Bean, "id" | "purchased" | "remaining" | "consumed"> & {
  purchased: string;
  consumed: string;
};

export type RecognizedBeanFields = {
  origin?: string;
  farm?: string;
  variety?: string;
  process?: string;
  roastery?: string;
  roasteryNotes?: string;
  purchased?: number | string;
  roastDate?: string;
  price?: number | string;
};

export type Brew = {
  id: number;
  beanId: number;
  amount: number;
  waterAmount?: number;
  method: string;
  date: string;
  recipe: string;
  grindSize?: string;
  waterTemp?: number;
  brewTime?: string;
};

export type BrewForm = Omit<Brew, "id" | "beanId" | "amount" | "waterAmount" | "grindSize" | "waterTemp" | "brewTime"> & {
  beanId: string;
  amount: string;
  waterAmount: string;
  grindSize: string;
  waterTemp: string;
  brewTime: string;
};

export type RecipeStep = {
  time: string;
  action: "블룸" | "센터 푸어" | "원형 푸어" | "마무리" | "가수";
  amount: number;
};

export type SavedRecipe = {
  id: number;
  name: string;
  coffee: number;
  steps: RecipeStep[];
  memo: string;
  createdAt: number;
};

export type TastingNote = {
  id: number;
  beanId: number;
  brewId: number | null;
  rating: number;
  flavor: string;
  aroma: string;
  acidity: string;
  body: string;
  finish: string;
  sweetness?: string;
  balance?: string;
  memo: string;
  date: string;
};

export type TastingNoteForm = Omit<TastingNote, "id" | "beanId"> & {
  beanId: string;
};
