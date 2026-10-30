export const BEAN_STATUSES = ["디개싱 중", "소비 중"] as const;

export type BeanStatus = (typeof BEAN_STATUSES)[number];

// The process choices offered as a segmented control (beans and cafe brews); anything else is typed under 기타.
export const BEAN_PROCESSES = ["워시드", "내추럴", "허니"] as const;

export const BEAN_QUALITIES = ["특식", "준특식", "사료"] as const;

export type BeanQuality = (typeof BEAN_QUALITIES)[number];

// One coffee in a blend. Only the origin is required; labels often leave out the rest.
export type BlendPart = { origin: string; process?: string; variety?: string; ratio?: number };

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
  // Blends keep each coffee in parts; origin, process and variety then hold a joined summary so older readers still work.
  kind?: "blend";
  blendName?: string;
  parts?: BlendPart[];
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
  blendName?: string;
  blendParts?: { origin?: string; process?: string; variety?: string; ratio?: number | string }[];
};

export type Brew = {
  id: number;
  beanId: number;
  amount: number;
  waterAmount?: number;
  method: string;
  date: string;
  recipe: string;
  // Saved recipe this brew used, so renaming the recipe keeps its usage history. Older brews are linked by name.
  recipeId?: number;
  grindSize?: string;
  waterTemp?: number;
  brewTime?: string;
  // A cup drunk at a cafe or made by someone else: no bean of ours (beanId 0, amount 0), so it never touches the inventory.
  // Brews without kind are our own.
  kind?: "cafe";
  cafe?: CafePlace;
  menu?: string;
  // The coffee in the cup, typed freely. Records from before it existed kept that text in menu (see cafeCup).
  beanName?: string;
  // Only on the first cafe records; no longer asked for.
  roastery?: string;
  origin?: string;
  process?: string;
};

// A cafe picked from the Kakao keyword search, or only a typed name (manual).
export type CafePlace = { name: string; address?: string; lat?: number; lng?: number; mapUrl?: string; placeId?: string; manual?: boolean };

// Menu choices for a cafe cup; anything else is typed under 기타.
export const CAFE_MENUS = ["핸드드립", "아메리카노", "에스프레소", "라떼", "콜드브루"] as const;

export const isCafeBrew = (brew: Brew) => brew.kind === "cafe";

export type BrewForm = Omit<Brew, "id" | "beanId" | "recipeId" | "amount" | "waterAmount" | "grindSize" | "waterTemp" | "brewTime" | "kind" | "cafe" | "menu" | "beanName" | "roastery" | "origin" | "process"> & {
  beanId: string;
  amount: string;
  waterAmount: string;
  grindSize: string;
  waterTemp: string;
  brewTime: string;
  kind: "own" | "cafe";
  cafe: CafePlace | null;
  menu: string;
  beanName: string;
  origin: string;
  process: string;
};

export type RecipeStep = {
  time: string;
  action: "블룸" | "센터 푸어" | "원형 푸어" | "마무리" | "가수" | "없음";
  amount: number;
  // 침출형 레시피에서만 쓰는 스위치(밸브) 조작. 비어 있으면 조작 없음.
  switch?: "닫고" | "열고";
};

export type SavedRecipe = {
  id: number;
  name: string;
  coffee: number;
  // 물 온도(℃). 넣지 않아도 되는 칸.
  temp?: number;
  steps: RecipeStep[];
  immersion?: boolean;
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
