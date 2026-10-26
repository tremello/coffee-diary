export const PAGES = ["Beans", "Recipes", "Brew Log", "Brew Stats"] as const;

export const PAGE_LABELS = { Beans: "원두 재고", "Brew Log": "브루잉 기록", Recipes: "나의 레시피", "Brew Stats": "브루잉 통계" };

export type Page = (typeof PAGES)[number];

export const PAGE_HASHES: Record<Page, string> = { Beans: "#beans", "Brew Log": "#brews", Recipes: "#recipes", "Brew Stats": "#stats" };

export const pageFromHash = (hash: string): Page => ({ "#beans": "Beans", "#brews": "Brew Log", "#recipes": "Recipes", "#stats": "Brew Stats" }[hash.toLowerCase()] as Page | undefined) ?? "Beans";
