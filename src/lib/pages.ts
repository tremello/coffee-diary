export const PAGES = ["Home", "Beans", "Recipes", "Brew Log", "Brew Stats"] as const;

export const PAGE_LABELS = { Home: "홈", Beans: "원두 재고", "Brew Log": "브루잉 기록", Recipes: "나의 레시피", "Brew Stats": "브루잉 통계" };

export type Page = (typeof PAGES)[number];

export const PAGE_HASHES: Record<Page, string> = { Home: "#home", Beans: "#beans", "Brew Log": "#brews", Recipes: "#recipes", "Brew Stats": "#stats" };

export const pageFromHash = (hash: string): Page => ({ "#home": "Home", "#beans": "Beans", "#brews": "Brew Log", "#recipes": "Recipes", "#stats": "Brew Stats" }[hash.split("?")[0].toLowerCase()] as Page | undefined) ?? "Home";

export type DateRange = { from: string; to: string };
export type AppLink = { page: Page; beanId?: number; brewId?: number; range?: DateRange; invalid: boolean };
export const PENDING_LINK_KEY = "coffee-pending-view-link";
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

// Only view context is supported. No editing actions or authentication parameters.
export const readAppLink = (hash: string): AppLink => {
  const page = pageFromHash(hash);
  const params = new URLSearchParams(hash.split("?").slice(1).join("?"));
  const result: AppLink = { page, invalid: false };
  const id = (key: string) => {
    const values = params.getAll(key);
    if (!values.length) return undefined;
    const value = /^\d+$/.test(values[0]) ? Number(values[0]) : NaN;
    if (values.length !== 1 || !Number.isSafeInteger(value) || value <= 0) { result.invalid = true; return undefined; }
    return value;
  };
  if (page === "Beans") result.beanId = id("bean");
  if (page === "Brew Log") result.brewId = id("brew");
  if (page === "Brew Stats" && (params.has("from") || params.has("to"))) {
    const from = params.get("from") ?? "", to = params.get("to") ?? "";
    if (params.getAll("from").length === 1 && params.getAll("to").length === 1 && validDate(from) && validDate(to) && from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 < 366) result.range = { from, to };
    else result.invalid = true;
  }
  return result;
};

export const appLinkHash = (link: AppLink): string => {
  const params = new URLSearchParams();
  if (link.page === "Beans" && link.beanId) params.set("bean", String(link.beanId));
  if (link.page === "Brew Log" && link.brewId) params.set("brew", String(link.brewId));
  if (link.page === "Brew Stats" && link.range) { params.set("from", link.range.from); params.set("to", link.range.to); }
  return PAGE_HASHES[link.page] + (params.size ? `?${params}` : "");
};
