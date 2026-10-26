import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { supabase } from "./src/supabase";

const STORAGE_KEYS = { beans: "cf_beans", brews: "cf_brews", notes: "cf_notes", recipes: "cf_recipes" };
const DEFAULT_PROCESSES = ["워시드", "내추럴", "허니", "무산소 내추럴", "무산소 워시드"];
const DEFAULT_ORIGINS = ["에티오피아", "파나마", "콜롬비아", "케냐"];
const BEAN_STATUSES = ["디개싱 중", "소비 중"] as const;
type BeanStatus = (typeof BEAN_STATUSES)[number];
// "배송 중" was retired (shipping is brief and always ends in degassing); older records read as "디개싱 중" and are saved that way on their next edit.
const LEGACY_SHIPPING_STATUS = "배송 중";
const normalizeBeans = (beans: Bean[]) => beans.some(bean => (bean.status as string) === LEGACY_SHIPPING_STATUS) ? beans.map(bean => (bean.status as string) === LEGACY_SHIPPING_STATUS ? { ...bean, status: "디개싱 중" as BeanStatus } : bean) : beans;
const BEAN_QUALITIES = ["특식", "준특식", "사료"] as const;
type BeanQuality = (typeof BEAN_QUALITIES)[number];
const PHOTO_ORIGIN_LABELS: Record<string, string> = {
  ethiopia: "에티오피아", panama: "파나마", colombia: "콜롬비아", kenya: "케냐",
  guatemala: "과테말라", peru: "페루", "costa rica": "코스타리카", costarica: "코스타리카"
};
const PHOTO_PROCESS_LABELS: Record<string, string> = {
  washed: "워시드", natural: "내추럴", honey: "허니", "anaerobic natural": "무산소 내추럴",
  "anaerobic washed": "무산소 워시드", "anaerobic fermentation natural": "무산소 내추럴",
  "anaerobic fermentation washed": "무산소 워시드"
};
// Vercel rejects request bodies over 4.5MB, so photos are shrunk to a JPEG well under that before upload.
const MAX_PHOTO_SELECT_BYTES = 25 * 1024 * 1024;
const MAX_PHOTO_UPLOAD_BYTES = 3 * 1024 * 1024;
const PHOTO_MAX_SIDE = 1800;
const readAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("사진을 읽지 못했어요."));
  reader.onerror = () => reject(new Error("사진을 읽지 못했어요."));
  reader.readAsDataURL(blob);
});
const shrinkPhoto = async (file: File): Promise<Blob | null> => {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch {
    return null;
  }
};
const preparePhoto = async (file: File, mimeType: string) => {
  const shrunk = await shrinkPhoto(file);
  if (shrunk && shrunk.size <= MAX_PHOTO_UPLOAD_BYTES) return { image: await readAsDataUrl(shrunk), mimeType: "image/jpeg" };
  // Browsers that cannot decode the file (e.g. HEIC outside Safari) send the original when it is small enough.
  if (file.size <= MAX_PHOTO_UPLOAD_BYTES) return { image: await readAsDataUrl(file), mimeType };
  throw new Error("이 브라우저에서는 사진 크기를 줄일 수 없어요. 3MB 이하 사진이나 JPG로 다시 선택해주세요.");
};
const localizedPhotoField = (value: string, labels: Record<string, string>) => labels[value.trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ")] ?? value.trim();
const localDate = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const beanName = (bean: BeanForm) => [bean.origin, bean.farm, bean.variety, bean.process].map(value => value?.trim()).filter(Boolean).join(" ");
const FONT = "'IBM Plex Sans KR', 'Apple SD Gothic Neo', sans-serif";
const PAGES = ["Beans", "Recipes", "Brew Log", "Brew Stats"] as const;
const PAGE_LABELS = { Beans: "원두 재고", "Brew Log": "브루잉 기록", Recipes: "나의 레시피", "Brew Stats": "브루잉 통계" };

type Page = (typeof PAGES)[number];
const PAGE_HASHES: Record<Page, string> = { Beans: "#beans", "Brew Log": "#brews", Recipes: "#recipes", "Brew Stats": "#stats" };
const pageFromHash = (hash: string): Page => ({ "#beans": "Beans", "#brews": "Brew Log", "#recipes": "Recipes", "#stats": "Brew Stats" }[hash.toLowerCase()] as Page | undefined) ?? "Beans";
type StorageSetter<T> = (value: T) => void;
type BeanSort = "registered" | "latest" | "roastOldest" | "remaining" | "unitPriceDesc" | "unitPriceAsc";
type BeanFacetKey = "origin" | "roastery" | "variety" | "process" | "note" | "status" | "remaining" | "age";
type BeanFacetFilters = Record<BeanFacetKey, string[]>;
const BEAN_FACET_KEYS: BeanFacetKey[] = ["origin", "variety", "process", "roastery", "note", "status", "remaining", "age"];
const emptyBeanFacetFilters = (): BeanFacetFilters => ({ origin: [], roastery: [], variety: [], process: [], note: [], status: [], remaining: [], age: [] });
const REMAINING_OPTIONS = ["100g 이하", "100~200g", "200g 이상"];
const AGE_OPTIONS = ["D+7 이내", "D+8~30", "D+31 이상"];
// Scroll after React has rendered the editor: scrolling first lets the inserted form shift the page and stop the scroll short.
const scrollToEditor = (editor: { current: HTMLElement | null }) => window.setTimeout(() => editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
// Notes are separated by commas (or ·, 、, line breaks) only, so a note like "흰 꽃" stays whole.
const splitCupNotes = (value?: string) => (value ?? "").split(/[,，·、\n]+/).map(note => note.trim()).filter(Boolean);

type Bean = {
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

type BeanForm = Omit<Bean, "id" | "purchased" | "remaining" | "consumed"> & {
  purchased: string;
  consumed: string;
};

type RecognizedBeanFields = {
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

type Brew = {
  id: number;
  beanId: number;
  amount: number;
  waterAmount?: number;
  method: string;
  date: string;
  recipe: string;
};

type BrewForm = Omit<Brew, "id" | "beanId" | "amount" | "waterAmount"> & {
  beanId: string;
  amount: string;
  waterAmount: string;
};

type RecipeStep = {
  time: string;
  action: "블룸" | "센터 푸어" | "원형 푸어" | "마무리" | "가수";
  amount: number;
};

type SavedRecipe = {
  id: number;
  name: string;
  coffee: number;
  steps: RecipeStep[];
  memo: string;
  createdAt: number;
};

type TastingNote = {
  id: number;
  beanId: number;
  brewId: number | null;
  rating: number;
  flavor: string;
  aroma: string;
  acidity: string;
  body: string;
  finish: string;
  memo: string;
  date: string;
};

type TastingNoteForm = Omit<TastingNote, "id" | "beanId"> & {
  beanId: string;
};

// Local data belongs to the account in OWNER_KEY; keys under PENDING_PREFIX failed to reach the server and must be pushed, not overwritten.
const OWNER_KEY = "cf_owner";
const PENDING_PREFIX = "cf_pending:";
const readLocal = <T,>(key: string): T | undefined => {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : undefined; } catch { return undefined; }
};
const writeLocal = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const localDataKeys = () => { try { return Object.keys(localStorage).filter(key => key.startsWith("cf_")); } catch { return []; } };
const clearLocalData = () => localDataKeys().forEach(key => { try { localStorage.removeItem(key); } catch {} });
const hasPendingSync = () => localDataKeys().some(key => key.startsWith(PENDING_PREFIX));
const adoptLocalData = (userId: string) => {
  const owner = (() => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } })();
  if (owner && owner !== userId) clearLocalData();
  try { localStorage.setItem(OWNER_KEY, userId); } catch {}
};

const failedSyncKeys = new Set<string>();
const syncRetries = new Map<string, () => void>();
const syncListeners = new Set<() => void>();
const setSyncFailed = (key: string, failed: boolean) => {
  if (failed === failedSyncKeys.has(key)) return;
  if (failed) failedSyncKeys.add(key); else failedSyncKeys.delete(key);
  syncListeners.forEach(listener => listener());
};
const retryFailedSync = () => [...failedSyncKeys].forEach(key => syncRetries.get(key)?.());
function useSyncFailed() {
  return useSyncExternalStore(listener => { syncListeners.add(listener); return () => { syncListeners.delete(listener); }; }, () => failedSyncKeys.size > 0);
}

// BASE_PREFIX holds the last value known to match the server, so a push can tell which side changed what.
const BASE_PREFIX = "cf_base:";
const REFRESH_INTERVAL = 10_000;
const VERIFY_DELAY = 1_500;
const MAX_VERIFY_ROUNDS = 3;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const itemId = (item: unknown) => typeof item === "string" ? item : item && typeof item === "object" && "id" in item ? String((item as { id: unknown }).id) : undefined;
const mergeSynced = (base: unknown, mine: unknown, theirs: unknown): unknown => {
  if (!Array.isArray(mine) || !Array.isArray(theirs)) return mine;
  const baseItems = Array.isArray(base) ? base : [];
  if ([...baseItems, ...mine, ...theirs].some(item => itemId(item) === undefined)) return mine;
  const byId = (items: unknown[]) => new Map(items.map(item => [itemId(item) as string, item]));
  const baseById = byId(baseItems), mineById = byId(mine), theirsById = byId(theirs);
  const merged: unknown[] = [];
  theirs.forEach(item => {
    const id = itemId(item) as string;
    if (mineById.has(id)) merged.push(baseById.has(id) && sameJson(mineById.get(id), baseById.get(id)) ? item : mineById.get(id));
    else if (!baseById.has(id)) merged.push(item);
  });
  mine.forEach(item => {
    const id = itemId(item) as string;
    if (theirsById.has(id)) return;
    if (!baseById.has(id) || !sameJson(item, baseById.get(id))) merged.push(item);
  });
  return merged;
};
type KeySync = { running: boolean; again: boolean; rounds: number; lastRefresh: number; apply?: (value: unknown) => void };
const keySyncs = new Map<string, KeySync>();
const keySync = (key: string) => {
  let sync = keySyncs.get(key);
  if (!sync) { sync = { running: false, again: false, rounds: 0, lastRefresh: 0 }; keySyncs.set(key, sync); }
  return sync;
};
const fetchRemote = async (key: string, userId: string) => {
  const { data, error } = await supabase.from("coffee_data").select("data").eq("user_id", userId).eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.data as unknown;
};
const pushOnce = async (key: string, userId: string) => {
  const sync = keySync(key);
  const mine = readLocal<unknown>(key);
  if (mine === undefined) return;
  let failed = true;
  try {
    const theirs = await fetchRemote(key, userId);
    // A newer local edit arrived while reading; the next round pushes it instead.
    if (!sameJson(readLocal(key), mine)) { sync.again = true; return; }
    const base = readLocal<unknown>(BASE_PREFIX + key);
    const value = theirs !== undefined && !sameJson(theirs, base) ? mergeSynced(base, mine, theirs) : mine;
    if (!sameJson(value, mine)) { writeLocal(key, value); sync.apply?.(value); }
    const { error } = await supabase.from("coffee_data").upsert({ key, data: value, user_id: userId }, { onConflict: "user_id,key" });
    if (error) console.error("Coffee sync save failed", error);
    else {
      failed = false;
      writeLocal(BASE_PREFIX + key, value);
      // Two devices saving at once can overwrite each other; re-read shortly after and merge again against what we saw.
      await new Promise(resolve => setTimeout(resolve, VERIFY_DELAY));
      const check = await fetchRemote(key, userId).catch(() => value);
      if (!sameJson(check, value) && sync.rounds < MAX_VERIFY_ROUNDS) { sync.rounds++; writeLocal(BASE_PREFIX + key, theirs ?? base); sync.again = true; }
    }
  } catch (error) { console.error("Coffee sync save failed", error); }
  try { if (failed) localStorage.setItem(PENDING_PREFIX + key, "1"); else localStorage.removeItem(PENDING_PREFIX + key); } catch {}
  setSyncFailed(key, failed);
};
// One push per key at a time; edits made meanwhile are sent together when it finishes.
const pushKey = async (key: string, userId: string) => {
  const sync = keySync(key);
  if (sync.running) { sync.again = true; return; }
  sync.running = true;
  sync.rounds = 0;
  try { do { sync.again = false; await pushOnce(key, userId); } while (sync.again); }
  finally { sync.running = false; }
};
const refreshKey = async (key: string, userId: string) => {
  const sync = keySync(key);
  if (sync.running || Date.now() - sync.lastRefresh < REFRESH_INTERVAL) return;
  sync.lastRefresh = Date.now();
  if (readLocal(PENDING_PREFIX + key)) { void pushKey(key, userId); return; }
  const local = readLocal<unknown>(key);
  try {
    const remote = await fetchRemote(key, userId);
    if (remote === undefined || sync.running || !sameJson(readLocal(key), local)) return;
    writeLocal(BASE_PREFIX + key, remote);
    if (!sameJson(remote, local)) { writeLocal(key, remote); sync.apply?.(remote); }
  } catch (error) { console.error("Coffee sync read failed", error); }
};

function useStorage<T>(key: string, init: T, userId: string | null = null): [T, StorageSetter<T>] {
  const [val, setVal] = useState<T>(() => readLocal<T>(key) ?? init);
  const editedRef = useRef(false);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    editedRef.current = false;
    const sync = keySync(key);
    const apply = (value: unknown) => { if (!cancelled) setVal(value as T); };
    sync.apply = apply;
    const pushLocal = () => { void pushKey(key, userId); };
    syncRetries.set(key, pushLocal);
    const refresh = () => { if (document.visibilityState === "visible") void refreshKey(key, userId); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const cleanup = () => {
      cancelled = true; syncRetries.delete(key);
      if (sync.apply === apply) sync.apply = undefined;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
    if (readLocal(PENDING_PREFIX + key)) { pushLocal(); return cleanup; }
    sync.lastRefresh = Date.now();
    fetchRemote(key, userId).then(remote => {
      if (cancelled || editedRef.current) return;
      if (remote !== undefined) { setVal(remote as T); writeLocal(key, remote); writeLocal(BASE_PREFIX + key, remote); return; }
      const local = readLocal<T>(key);
      if (Array.isArray(local) && local.length > 0) pushLocal();
      else if (local === undefined) setVal(init);
    }, error => console.error("Coffee sync read failed", error));
    return cleanup;
  }, [key, userId]);
  const set = (v: T) => {
    editedRef.current = true;
    setVal(v);
    writeLocal(key, v);
    if (userId) void pushKey(key, userId);
  };
  return [val, set];
}

function useAuth() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Clear another account's local data before any storage hook sees the new user id.
    const applyUser = (next: { id: string; email?: string } | null) => { if (next) adoptLocalData(next.id); setUser(next); };
    supabase.auth.getSession().then(({ data }) => { applyUser(data.session?.user ?? null); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applyUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);
  return { user, loading };
}

const fmt = (n: number | string) => Number(n).toLocaleString();
const digitsOnly = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
const withCommas = (value: string) => /^\d+$/.test(value) ? fmt(value) : value;
// Prices are stored as plain digits but shown with thousands commas; the caret stays after the same digit it was after.
const handleNumericInput = (event: React.ChangeEvent<HTMLInputElement>, setValue: (value: string) => void) => {
  const input = event.target;
  const digitsBeforeCaret = digitsOnly(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
  setValue(digitsOnly(input.value));
  window.setTimeout(() => {
    let position = 0;
    for (let seen = 0; position < input.value.length && seen < digitsBeforeCaret; position++) if (/\d/.test(input.value[position])) seen++;
    if (document.activeElement === input) input.setSelectionRange(position, position);
  });
};
const parseLocalDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const emptyBeanForm: BeanForm = { name: "", origin: "", process: "", roastery: "", date: "", purchased: "", consumed: "", price: "", roasteryNotes: "", roastDate: "", farm: "", variety: "", flavor: "", memo: "", status: undefined, quality: undefined };
const emptyBrewForm = (): BrewForm => ({ beanId: "", amount: "", waterAmount: "", method: "", date: localDate(), recipe: "" });
const brewRatio = (amount: number, waterAmount?: number) => waterAmount && amount > 0 ? `1:${Number((waterAmount / amount).toFixed(1)).toLocaleString()}` : "";
const emptyNoteForm = (): TastingNoteForm => ({
  beanId: "",
  brewId: null,
  rating: 3,
  flavor: "",
  aroma: "",
  acidity: "",
  body: "",
  finish: "",
  memo: "",
  date: localDate()
});

export default function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash));
  const [openBrewForm, setOpenBrewForm] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const [storedBeans, setBeans] = useStorage<Bean[]>(STORAGE_KEYS.beans, [], user?.id ?? null);
  const beans = useMemo(() => normalizeBeans(storedBeans), [storedBeans]);
  const [brews, setBrews] = useStorage<Brew[]>(STORAGE_KEYS.brews, [], user?.id ?? null);
  const [notes, setNotes] = useStorage<TastingNote[]>(STORAGE_KEYS.notes, [], user?.id ?? null);
  const [recipes, setRecipes] = useStorage<SavedRecipe[]>(STORAGE_KEYS.recipes, [], user?.id ?? null);
  const syncFailed = useSyncFailed();
  useEffect(() => {
    window.addEventListener("online", retryFailedSync);
    return () => window.removeEventListener("online", retryFailedSync);
  }, []);
  const navigate = (nextPage: Page) => {
    const nextHash = PAGE_HASHES[nextPage];
    if (window.location.hash !== nextHash) window.history.pushState({ page: nextPage }, "", nextHash);
    setPage(nextPage);
  };

  useEffect(() => {
    const syncPageFromUrl = () => setPage(pageFromHash(window.location.hash));
    const resolvedPage = pageFromHash(window.location.hash);
    if (window.location.hash !== PAGE_HASHES[resolvedPage]) window.history.replaceState({ page: resolvedPage }, "", PAGE_HASHES[resolvedPage]);
    window.addEventListener("popstate", syncPageFromUrl);
    window.addEventListener("hashchange", syncPageFromUrl);
    return () => {
      window.removeEventListener("popstate", syncPageFromUrl);
      window.removeEventListener("hashchange", syncPageFromUrl);
    };
  }, []);

  return (
    <div style={{ fontFamily: FONT, maxWidth: 960, margin: "0 auto", padding: "0 0 3rem" }}>
      <Header page={page} setPage={navigate} user={user} authLoading={authLoading} />
      {syncFailed && <div className="sync-alert" role="alert"><span>최근 변경을 서버에 저장하지 못했어요. 이 기기에는 남아 있어요.</span><button type="button" onClick={retryFailedSync}>다시 시도</button></div>}
      <div className="page-transition" key={page}>
        {page === "Beans" && <BeansPage beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} notes={notes} setNotes={setNotes} userId={user?.id ?? null} onBrew={() => { setOpenBrewForm(true); navigate("Brew Log"); }} />}
        {page === "Brew Log" && <BrewLog beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} notes={notes} setNotes={setNotes} recipes={recipes} openInitially={openBrewForm} onOpened={() => setOpenBrewForm(false)} />}
        {page === "Recipes" && <RecipePage recipes={recipes} setRecipes={setRecipes} />}
        {page === "Brew Stats" && <BrewStats beans={beans} brews={brews} />}
      </div>
    </div>
  );
}

// Theme: follows the system setting until the user taps the toggle. The choice lives outside the cf_ keys so logging out keeps it,
// and choosing the same look as the system clears it so the app goes back to following the system.
// index.html applies the stored choice before first paint.
const THEME_KEY = "coffee-theme";
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");
const readThemeChoice = (): "light" | "dark" | null => { try { const t = localStorage.getItem(THEME_KEY); return t === "light" || t === "dark" ? t : null; } catch { return null; } };

function ThemeToggle() {
  const [choice, setChoice] = useState(readThemeChoice);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);
  useEffect(() => {
    const query = darkQuery();
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const dark = choice ? choice === "dark" : systemDark;
  useEffect(() => {
    if (choice) document.documentElement.dataset.theme = choice; else delete document.documentElement.dataset.theme;
    try { if (choice) localStorage.setItem(THEME_KEY, choice); else localStorage.removeItem(THEME_KEY); } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1a1713" : "#7a5733");
  }, [choice, dark]);
  const toggle = () => { const next = !dark; setChoice(next === systemDark ? null : next ? "dark" : "light"); };
  const label = dark ? "밝은 화면으로 바꾸기" : "어두운 화면으로 바꾸기";
  return <button type="button" className="refresh-button theme-button" onClick={toggle} aria-label={label} title={label}>{dark ? <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor" /><g stroke="currentColor" strokeWidth="2" strokeLinecap="round">{[0, 45, 90, 135, 180, 225, 270, 315].map(a => <line key={a} x1="12" y1="2.6" x2="12" y2="4.6" transform={`rotate(${a} 12 12)`} />)}</g></svg> : <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" /></svg>}</button>;
}

function Header({ page, setPage, user, authLoading }: { page: Page; setPage: (page: Page) => void; user: { id: string; email?: string } | null; authLoading: boolean }) {
  const [loginError, setLoginError] = useState("");
  const signInGoogle = async () => {
    setLoginError("");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/` } });
    if (error) setLoginError(`Google 로그인에 실패했어요. ${error.message}`);
  };
  const accountName = user?.email?.split("@")[0] || "내 계정";
  const signOut = async () => {
    if (!hasPendingSync() && !window.confirm(`${accountName} 계정에서 로그아웃할까요?`)) return;
    if (hasPendingSync() && !window.confirm("아직 서버에 저장하지 못한 기록이 있어요. 로그아웃하면 이 기기에서 지워져요. 계속할까요?")) return;
    await supabase.auth.signOut();
    clearLocalData();
    window.location.reload();
  };
  return (
    <div className="app-header" style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 0 0" }}>
        <div>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT }}>My Coffee Diary</p>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "2px 0 0", letterSpacing: "-0.02em", color: "var(--color-text-primary)", fontFamily: FONT }}>{PAGE_LABELS[page]}</h1>
        </div>
        <div className="account-actions">{user ? <button type="button" className="refresh-button account-button" onClick={signOut} aria-label={`${accountName} 로그아웃`} title={`${accountName} · 로그아웃`}>{accountName.slice(0, 1).toUpperCase()}</button> : <button type="button" className="google-button" onClick={signInGoogle} aria-label="Google 계정으로 로그인" title="Google 계정으로 로그인">로그인</button>}<ThemeToggle /><button className="refresh-button" onClick={() => window.location.reload()} aria-label="새로고침" title="새로고침">↻</button><img className="brand-mark" src="/coffee-diary-logo-brown-96.png" width="40" height="40" alt="커피 기록 로고" /></div>
      </div>
      {loginError && <p className="login-error" role="alert">{loginError}</p>}
      <nav className="page-tabs">
        <span className="page-tab-indicator" aria-hidden="true" style={{ transform: `translateX(${PAGES.indexOf(page) * 100}%)` }} />
        {PAGES.map(p => (
          <button key={p} className="page-tab" onClick={() => setPage(p)} aria-current={page === p ? "page" : undefined} style={{
            padding: "8px 16px", fontSize: 14, borderRadius: 10, fontFamily: FONT,
            border: page === p ? "1px solid var(--bd-7a5733)" : "0.5px solid var(--color-border-tertiary)",
            background: page === p ? "var(--bg-7a5733)" : "transparent",
            color: page === p ? "var(--fg-ffffff)" : "var(--color-text-secondary)",
            cursor: "pointer"
          }}><span className="page-tab-icon" aria-hidden="true"><PageIcon page={p} /></span><span>{PAGE_LABELS[p]}</span></button>
        ))}
      </nav>
    </div>
  );
}

function PageIcon({ page }: { page: Page }) {
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (page === "Beans") return <svg {...props}><ellipse cx="12" cy="12" rx="6.5" ry="9" transform="rotate(42 12 12)" /><path d="M8 17c2.8-3 4.4-6.3 4.7-10" /></svg>;
  if (page === "Brew Log") return <svg {...props}><path d="m6 18 2.2-5.8L17.7 2.7a1.8 1.8 0 0 1 2.6 2.6L10.8 15.8 5 18Z" /><path d="m14.7 5.7 3.6 3.6M4 21h7" /></svg>;
  if (page === "Recipes") return <svg {...props}><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></svg>;
  return <svg {...props}><path d="M5 19V9M12 19V5M19 19v-7" /><path d="M3 19h18" /></svg>;
}

function BeansPage({ beans, setBeans, brews, setBrews, notes, setNotes, userId, onBrew }: { beans: Bean[]; setBeans: StorageSetter<Bean[]>; brews: Brew[]; setBrews: StorageSetter<Brew[]>; notes: TastingNote[]; setNotes: StorageSetter<TastingNote[]>; userId: string | null; onBrew: () => void }) {
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BeanForm>(emptyBeanForm);
  const [filter, setFilter] = useState("active");
  const [sort, setSort] = useState<BeanSort>("registered");
  const [qualityFilter, setQualityFilter] = useState<"all" | BeanQuality>("all");
  const [density, setDensity] = useState<"detail" | "compact" | "dense">("detail");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [facetFilters, setFacetFilters] = useState<BeanFacetFilters>(emptyBeanFacetFilters);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [roastFrom, setRoastFrom] = useState("");
  const [roastTo, setRoastTo] = useState("");
  const [purchaseFrom, setPurchaseFrom] = useState("");
  const [purchaseTo, setPurchaseTo] = useState("");
  const [beanQuery, setBeanQuery] = useState("");
  const [error, setError] = useState("");
  const [roastDateTouched, setRoastDateTouched] = useState(false);
  // True while the purchase date only mirrors the roast date. iOS date pickers fire a change with today's date the moment they open,
  // so an empty purchase date must keep following the roast date until the user edits it directly.
  const purchaseDateFollowsRoast = useRef(false);
  const beanFormRef = useRef<HTMLFormElement>(null);
  const purchaseDateForRoast = (purchaseDate: string, roastDate: string) => {
    if (purchaseDate && !purchaseDateFollowsRoast.current) return purchaseDate;
    purchaseDateFollowsRoast.current = Boolean(roastDate);
    return roastDate;
  };
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoMessage, setPhotoMessage] = useState("");
  const [customOrigins, setCustomOrigins] = useStorage<string[]>("cf_origins", [], userId);
  const [addingOrigin, setAddingOrigin] = useState(false);
  const [newOrigin, setNewOrigin] = useState("");
  const origins = [...new Set([...DEFAULT_ORIGINS, ...customOrigins, ...beans.map(b => b.origin).filter(Boolean)])];
  const [hiddenRoasteries, setHiddenRoasteries] = useStorage<string[]>("cf_hidden_roasteries", [], userId);
  const [hiddenVarieties, setHiddenVarieties] = useStorage<string[]>("cf_hidden_varieties", [], userId);
  const roasteries = [...new Set(beans.map(bean => bean.roastery?.trim()).filter((roastery): roastery is string => Boolean(roastery)))].filter(roastery => !hiddenRoasteries.includes(roastery));
  const varieties = [...new Set(beans.map(bean => bean.variety?.trim()).filter((variety): variety is string => Boolean(variety)))].filter(variety => !hiddenVarieties.includes(variety));
  const addOrigin = () => {
    const origin = newOrigin.trim();
    if (!origin) return;
    if (!origins.includes(origin)) setCustomOrigins([...customOrigins, origin]);
    setForm({ ...form, origin }); setNewOrigin(""); setAddingOrigin(false);
  };
  const hideRoastery = (roastery: string) => setHiddenRoasteries([...hiddenRoasteries, roastery]);
  const hideVariety = (variety: string) => setHiddenVarieties([...hiddenVarieties, variety]);
  const [deletedId, setDeletedId] = useState<number | null>(null);
  // One clock for every card's D+ badge instead of an interval per card.
  const [cardToday, setCardToday] = useState(localDate);
  useEffect(() => {
    const timer = window.setInterval(() => setCardToday(localDate()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [deletedBrews, setDeletedBrews] = useState<Brew[]>([]);
  const [deletedNotes, setDeletedNotes] = useState<TastingNote[]>([]);
  const available = beans.filter(b => !b.deleted);
  const active = available.filter(b => b.remaining > 0);
  const degassingWeight = active.filter(bean => bean.status === "디개싱 중").reduce((sum, bean) => sum + bean.remaining, 0);
  const consumingWeight = active.filter(bean => (bean.status ?? "소비 중") === "소비 중").reduce((sum, bean) => sum + bean.remaining, 0);
  const today = localDate();
  const beanFacetValues = (bean: Bean, key: BeanFacetKey): string[] => {
    if (key === "status") return [bean.status ?? "소비 중"];
    if (key === "note") return splitCupNotes(bean.roasteryNotes);
    if (key === "remaining") return [bean.remaining <= 100 ? REMAINING_OPTIONS[0] : bean.remaining <= 200 ? REMAINING_OPTIONS[1] : REMAINING_OPTIONS[2]];
    if (key === "age") {
      if (!bean.roastDate) return [];
      const days = Math.round((Date.parse(today) - Date.parse(bean.roastDate)) / 86_400_000);
      if (!Number.isFinite(days)) return [];
      return [days <= 7 ? AGE_OPTIONS[0] : days <= 30 ? AGE_OPTIONS[1] : AGE_OPTIONS[2]];
    }
    const value = bean[key]?.trim();
    return value ? [value] : [];
  };
  const toggleFacet = (key: BeanFacetKey, value: string) => setFacetFilters(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value] }));
  const queryTerms = beanQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const queryMatches = (bean: Bean) => {
    if (!queryTerms.length) return true;
    const text = [bean.name, bean.origin, bean.farm, bean.variety, bean.process, bean.roastery, bean.roasteryNotes, bean.flavor, bean.memo, ...notes.filter(note => note.beanId === bean.id).flatMap(note => [note.flavor, note.memo])].filter(Boolean).join(" ").toLowerCase();
    return queryTerms.every(term => text.includes(term));
  };
  const rangeMatches = (bean: Bean) => {
    if (priceMin !== "" || priceMax !== "") {
      const price = Number(bean.price);
      const minimumPrice = priceMin === "" ? 0 : Number(priceMin);
      const maximumPrice = priceMax === "" ? Infinity : Number(priceMax);
      if (!bean.price || !Number.isFinite(price) || price < minimumPrice || price > maximumPrice) return false;
    }
    if (roastFrom && (!bean.roastDate || bean.roastDate < roastFrom)) return false;
    if (roastTo && (!bean.roastDate || bean.roastDate > roastTo)) return false;
    if (purchaseFrom && (!bean.date || bean.date < purchaseFrom)) return false;
    if (purchaseTo && (!bean.date || bean.date > purchaseTo)) return false;
    return true;
  };
  const tabMatches = (bean: Bean) => filter === "all" || (filter === "active" ? bean.remaining > 0 : bean.remaining <= 0);
  // A facet's own selection is ignored when counting its options, so each chip shows how many beans picking it would add.
  const beanMatches = (bean: Bean, exceptFacet?: BeanFacetKey) => tabMatches(bean) && queryMatches(bean) && rangeMatches(bean) && (qualityFilter === "all" || bean.quality === qualityFilter)
    && BEAN_FACET_KEYS.every(key => key === exceptFacet || facetFilters[key].length === 0 || beanFacetValues(bean, key).some(value => facetFilters[key].includes(value)));
  const facetOptions = (key: BeanFacetKey) => {
    const fixed: Partial<Record<BeanFacetKey, readonly string[]>> = { process: DEFAULT_PROCESSES, status: BEAN_STATUSES, remaining: REMAINING_OPTIONS, age: AGE_OPTIONS };
    const usage = new Map<string, number>();
    available.forEach(bean => beanFacetValues(bean, key).forEach(value => usage.set(value, (usage.get(value) ?? 0) + 1)));
    let values = [...new Set([...(fixed[key] ?? []), ...(key === "origin" ? origins : []), ...usage.keys()])];
    if (!fixed[key]) values.sort((a, b) => a.localeCompare(b, "ko"));
    if (key === "note") values = values.sort((a, b) => (usage.get(b) ?? 0) - (usage.get(a) ?? 0)).slice(0, 12);
    values = [...new Set([...values, ...facetFilters[key]])];
    const counts = new Map<string, number>();
    available.filter(bean => beanMatches(bean, key)).forEach(bean => beanFacetValues(bean, key).forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1)));
    return values.map(value => ({ value, count: counts.get(value) ?? 0 }));
  };
  const qualityCount = (quality: BeanQuality) => available.filter(bean => tabMatches(bean) && queryMatches(bean) && rangeMatches(bean) && bean.quality === quality
    && BEAN_FACET_KEYS.every(key => facetFilters[key].length === 0 || beanFacetValues(bean, key).some(value => facetFilters[key].includes(value)))).length;
  const rangeLabel = (from: string, to: string, after: string, before: string) => from && to ? `${from} ~ ${to}` : from ? `${from} ${after}` : `${to} ${before}`;
  const activeFilterChips = [
    ...BEAN_FACET_KEYS.flatMap(key => facetFilters[key].map(value => ({ key: `${key}:${value}`, label: key === "note" ? `#${value}` : value, clear: () => toggleFacet(key, value) }))),
    ...(qualityFilter !== "all" ? [{ key: "quality", label: qualityFilter, clear: () => setQualityFilter("all") }] : []),
    ...(priceMin || priceMax ? [{ key: "price", label: `구매가 ${rangeLabel(priceMin && `₩${fmt(priceMin)}`, priceMax && `₩${fmt(priceMax)}`, "이상", "이하")}`, clear: () => { setPriceMin(""); setPriceMax(""); } }] : []),
    ...(roastFrom || roastTo ? [{ key: "roast", label: `로스팅 ${rangeLabel(roastFrom, roastTo, "이후", "이전")}`, clear: () => { setRoastFrom(""); setRoastTo(""); } }] : []),
    ...(purchaseFrom || purchaseTo ? [{ key: "purchase", label: `구매일 ${rangeLabel(purchaseFrom, purchaseTo, "이후", "이전")}`, clear: () => { setPurchaseFrom(""); setPurchaseTo(""); } }] : []),
  ];
  const activeDetailCount = activeFilterChips.length;
  const clearDetailFilters = () => { setFacetFilters(emptyBeanFacetFilters()); setQualityFilter("all"); setPriceMin(""); setPriceMax(""); setRoastFrom(""); setRoastTo(""); setPurchaseFrom(""); setPurchaseTo(""); };
  const visible = available.filter(bean => beanMatches(bean));
  const sortedVisible = [...visible].sort((a, b) => {
    if (sort === "latest") return b.id - a.id;
    if (sort === "remaining") return a.remaining - b.remaining || b.id - a.id;
    if (sort === "unitPriceDesc" || sort === "unitPriceAsc") {
      const aUnit = a.price && a.purchased > 0 ? Number(a.price) / a.purchased : null;
      const bUnit = b.price && b.purchased > 0 ? Number(b.price) / b.purchased : null;
      if (aUnit === null && bUnit === null) return a.id - b.id;
      if (aUnit === null) return 1;
      if (bUnit === null) return -1;
      return (sort === "unitPriceDesc" ? bUnit - aUnit : aUnit - bUnit) || b.id - a.id;
    }
    if (sort === "roastOldest") {
      if (!a.roastDate && !b.roastDate) return a.id - b.id;
      if (!a.roastDate) return 1;
      if (!b.roastDate) return -1;
      return a.roastDate.localeCompare(b.roastDate) || a.id - b.id;
    }
    return a.id - b.id;
  });
  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null); setPhotoPreview(""); setPhotoBusy(false); setPhotoError(""); setPhotoMessage("");
  };
  const photoMimeType = (file: File) => {
    if (file.type) return file.type.toLowerCase();
    const extension = file.name.split(".").pop()?.toLowerCase();
    return extension === "heic" ? "image/heic" : extension === "heif" ? "image/heif" : "";
  };
  const selectPhoto = (file?: File) => {
    clearPhoto();
    if (!file) return;
    const mimeType = photoMimeType(file);
    if (!new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]).has(mimeType)) { setPhotoError("JPG, PNG, WebP, HEIC 사진만 선택할 수 있어요."); return; }
    if (file.size > MAX_PHOTO_SELECT_BYTES) { setPhotoError("사진은 25MB 이하로 선택해주세요."); return; }
    setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file));
  };
  const recognizePhoto = async () => {
    if (!photoFile || photoBusy) return;
    setPhotoBusy(true); setPhotoError(""); setPhotoMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("사진 인식은 Google 로그인 후 사용할 수 있어요.");
      const photo = await preparePhoto(photoFile, photoMimeType(photoFile));
      const response = await fetch("/api/recognize-bean", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(photo)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "사진에서 정보를 읽지 못했어요.");
      const result = (payload.bean ?? {}) as RecognizedBeanFields;
      const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
      const origin = localizedPhotoField(text(result.origin), PHOTO_ORIGIN_LABELS);
      const process = localizedPhotoField(text(result.process), PHOTO_PROCESS_LABELS);
      if (origin && !origins.includes(origin) && !customOrigins.includes(origin)) setCustomOrigins([...customOrigins, origin]);
      // A new photo replaces what an earlier photo (or typing) put in these fields.
      setForm(current => ({
        ...current,
        origin: "", farm: "", variety: "", process: "", roastery: "", roasteryNotes: "", purchased: "", price: "",
        roastDate: current.date,
        ...(origin ? { origin } : {}),
        ...(text(result.farm) ? { farm: text(result.farm) } : {}),
        ...(text(result.variety) ? { variety: text(result.variety) } : {}),
        ...(process ? { process } : {}),
        ...(text(result.roastery) ? { roastery: text(result.roastery) } : {}),
        ...(text(result.roasteryNotes) ? { roasteryNotes: text(result.roasteryNotes) } : {}),
        ...(result.purchased !== undefined && String(result.purchased).trim() ? { purchased: String(result.purchased) } : {}),
        ...(text(result.roastDate) ? { roastDate: text(result.roastDate), date: purchaseDateForRoast(current.date, text(result.roastDate)) } : {}),
        ...(result.price !== undefined && String(result.price).trim() ? { price: String(result.price) } : {})
      }));
      setRoastDateTouched(Boolean(text(result.roastDate)));
      setPhotoMessage("읽어온 정보를 입력칸에 채웠어요. 저장하기 전에 확인해주세요.");
    } catch (photoRecognitionError) {
      setPhotoError(photoRecognitionError instanceof Error ? photoRecognitionError.message : "사진에서 정보를 읽지 못했어요.");
    } finally {
      setPhotoBusy(false);
    }
  };
  const close = () => { clearPhoto(); setShow(false); setEditingId(null); setForm(emptyBeanForm); setError(""); setRoastDateTouched(false); purchaseDateFollowsRoast.current = false; setAddingOrigin(false); setNewOrigin(""); };
  const openNewBean = () => { close(); setShow(true); scrollToEditor(beanFormRef); };
  const edit = (bean: Bean) => {
    setForm({ ...bean, status: bean.status ?? "소비 중", purchased: String(bean.purchased), consumed: String(bean.consumed ?? 0) });
    setRoastDateTouched(Boolean(bean.roastDate && bean.roastDate !== bean.date));
    purchaseDateFollowsRoast.current = false;
    setEditingId(bean.id); setError(""); setShow(true);
    scrollToEditor(beanFormRef);
  };
  const remove = () => {
    if (editingId === null) return;
    const relatedBrews = brews.filter(brew => brew.beanId === editingId);
    const relatedNotes = notes.filter(note => note.beanId === editingId);
    setBeans(beans.map(bean => bean.id === editingId ? { ...bean, deleted: true } : bean));
    setBrews(brews.filter(brew => brew.beanId !== editingId));
    setNotes(notes.filter(note => note.beanId !== editingId));
    setDeletedBrews(relatedBrews); setDeletedNotes(relatedNotes);
    setDeletedId(editingId); close();
  };
  const undoRemove = () => {
    setBeans(beans.map(bean => bean.id === deletedId ? { ...bean, deleted: false } : bean));
    setBrews([...brews, ...deletedBrews]);
    setNotes([...notes, ...deletedNotes]);
    setDeletedBrews([]); setDeletedNotes([]);
    setDeletedId(null);
  };
  const updateStatus = (beanId: number, status: BeanStatus) => {
    setBeans(beans.map(bean => bean.id === beanId ? { ...bean, status } : bean));
  };
  const facetGroup = (key: BeanFacetKey, label: string, emptyText = "등록된 정보 없음") => {
    const options = facetOptions(key);
    return <fieldset className="facet-group" key={key}><legend>{label}</legend>{options.length ? <div className="facet-options">{options.map(({ value, count }) => {
      const pressed = facetFilters[key].includes(value);
      return <button type="button" key={value} aria-pressed={pressed} disabled={!pressed && count === 0} onClick={() => toggleFacet(key, value)}>{key === "note" ? `#${value}` : value}<small>{count}</small></button>;
    })}</div> : <p className="facet-empty">{emptyText}</p>}</fieldset>;
  };
  const dateRange = (label: string, from: string, setFrom: (value: string) => void, to: string, setTo: (value: string) => void) => <fieldset className="range-filter-group"><legend>{label}</legend><div><span className="date-field" data-empty={!from} data-placeholder="시작일"><input type="date" value={from} onChange={event => setFrom(event.target.value)} aria-label={`${label} 시작일`} /></span><span>~</span><span className="date-field" data-empty={!to} data-placeholder="종료일"><input type="date" value={to} onChange={event => setTo(event.target.value)} aria-label={`${label} 종료일`} /></span></div></fieldset>;
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const purchased = Number(form.purchased);
    if (!form.origin.trim() || !Number.isFinite(purchased) || purchased <= 0) {
      setError("원산지와 0보다 큰 구매량을 입력해주세요."); return;
    }
    const previous = beans.find(b => b.id === editingId);
    const consumed = Number(form.consumed);
    if (!Number.isFinite(consumed) || consumed < 0) { setError("소비량은 0 이상의 숫자로 입력해주세요."); return; }
    const used = Math.round(((previous ? previous.purchased - previous.remaining - (previous.consumed ?? 0) : 0) + consumed) * 10) / 10;
    if (purchased < used) { setError(`이미 사용한 ${fmt(used)}g보다 구매량이 적을 수 없어요.`); return; }
    const bean: Bean = { ...form, name: beanName(form), id: editingId ?? Date.now(), purchased, consumed, remaining: Math.round((purchased - used) * 10) / 10 };
    setBeans(editingId === null ? [...beans, bean] : beans.map(b => b.id === editingId ? bean : b));
    close();
  };
  return (
    <main className="inventory">
      <div className="inventory-intro"><div><p>좋아하는 맛을 기록하고, 남은 원두를 한눈에.</p></div>
        <div className="intro-actions"><button className="secondary-button" onClick={onBrew}>브루잉 추가</button><button className="primary-button intro-add-bean" onClick={openNewBean}>+ 원두 추가</button></div></div>
      {active.length > 0 && <div className="stats-cards inventory-summary-cards" aria-label="보유 원두 요약">
        <div><span>보유 원두</span><strong>{active.length}<small>종</small></strong><em>{fmt(Math.round(active.reduce((sum, b) => sum + b.remaining, 0) * 10) / 10)}<small>g</small></em></div>
        <div><span>소비 중</span><strong>{fmt(Math.round(consumingWeight * 10) / 10)}<small>g</small></strong></div>
        <div><span>디개싱 중</span><strong>{fmt(Math.round(degassingWeight * 10) / 10)}<small>g</small></strong></div>
      </div>}
      {deletedId !== null && <div className="delete-notice" role="status"><span>{deletedBrews.length > 0 ? `원두와 연결된 브루잉 기록 ${deletedBrews.length}개를 삭제했어요.` : "원두를 삭제했어요."}</span><button type="button" onClick={undoRemove}>되돌리기</button></div>}
      {show && <form ref={beanFormRef} className="bean-form" onSubmit={save}>
        <h3>{editingId === null ? "새 원두 등록" : "원두 정보 수정"}</h3>
        {editingId === null && <section className="bean-photo-import" aria-label="사진으로 원두 정보 자동 입력">
          <div className="bean-photo-import-heading"><div><strong>사진으로 자동 입력</strong><p>원두 봉투 라벨을 찍으면 읽을 수 있는 정보만 초안에 채워드려요.</p></div><span className="bean-photo-actions"><label className="secondary-button bean-photo-picker"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" capture="environment" onChange={event => selectPhoto(event.target.files?.[0])} />사진 찍기</label><label className="secondary-button bean-photo-picker"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={event => selectPhoto(event.target.files?.[0])} />사진 선택</label></span></div>
          {photoPreview && <div className="bean-photo-preview"><img src={photoPreview} alt="선택한 원두 봉투 사진 미리보기" /><div><strong>{photoFile?.name}</strong><span>{userId ? "사진은 정보를 읽는 동안에만 사용하고 저장하지 않아요." : "사진 인식은 Google 로그인 후 사용할 수 있어요."}</span>{photoMessage && <p className="bean-photo-success" role="status">{photoMessage}</p>}{photoError && <p className="bean-photo-error" role="alert">{photoError}</p>}<button type="button" className="primary-button" disabled={photoBusy || !userId} onClick={recognizePhoto}>{photoBusy ? "정보 읽는 중…" : "사진에서 정보 읽기"}</button></div><button className="bean-photo-remove" type="button" onClick={clearPhoto} aria-label="선택한 사진 제거">×</button></div>}
          {!photoPreview && photoError && <p className="bean-photo-error" role="alert">{photoError}</p>}
        </section>}
        <div className="bean-form-grid">
          <fieldset className="origin-field full-width"><legend>원산지 *</legend>
            <div className="origin-options">{origins.map(origin => <button type="button" key={origin} aria-pressed={form.origin === origin} onClick={() => setForm({ ...form, origin })}>{origin}</button>)}<button type="button" aria-expanded={addingOrigin} onClick={() => setAddingOrigin(!addingOrigin)}>+ 원산지 추가</button></div>
            {addingOrigin && <div className="origin-add"><label>새 원산지<input value={newOrigin} onChange={e => setNewOrigin(e.target.value)} placeholder="예: 과테말라" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOrigin(); } }} /></label><button type="button" className="quiet-button" disabled={!newOrigin.trim()} onClick={addOrigin}>추가</button></div>}
          </fieldset>
          <div className="bean-origin-row full-width"><label>농장 및 지역<input value={form.farm ?? ""} placeholder="예: 세로아줄" onChange={e => setForm({ ...form, farm: e.target.value })} /></label><label>품종<input value={form.variety ?? ""} placeholder="예: 게이샤" onChange={e => setForm({ ...form, variety: e.target.value })} /></label></div>
          {editingId === null && varieties.length > 0 && <div className="existing-purchasers existing-varieties full-width"><span>기존 품종</span><span className="existing-purchaser-options">{varieties.map(variety => <span className="existing-purchaser-option" key={variety}><button type="button" onClick={() => setForm({ ...form, variety })}>{variety}</button><button type="button" className="remove-purchaser" aria-label={`${variety} 기존 품종에서 삭제`} onClick={() => hideVariety(variety)}>×</button></span>)}</span></div>}
          <fieldset className="origin-field full-width"><legend>가공방식</legend>
            <div className="origin-options process-options">{DEFAULT_PROCESSES.slice(0, 3).map(process => <button type="button" key={process} aria-pressed={form.process === process} onClick={() => setForm({ ...form, process })}>{process}</button>)}<span className="process-anaerobic-pair">{DEFAULT_PROCESSES.slice(3).map(process => <button type="button" key={process} aria-pressed={form.process === process} onClick={() => setForm({ ...form, process })}>{process}</button>)}</span></div>
            <label className="process-custom">가공방식 직접 입력<input value={DEFAULT_PROCESSES.includes(form.process) ? "" : form.process} placeholder="예: 카보닉 매서레이션" onChange={e => setForm({ ...form, process: e.target.value })} /><span>이 원두에만 적용돼요.</span></label>
          </fieldset>
          <div className="generated-name full-width"><span>자동으로 만들어지는 원두 이름</span><output>{beanName(form) || "원두 정보를 입력해주세요"}</output></div>
          <label className="full-width">로스터리<input value={form.roastery} placeholder="로스터리 이름" onChange={e => setForm({ ...form, roastery: e.target.value })} />{editingId === null && roasteries.length > 0 && <span className="existing-purchasers"><span>기존 구매처</span><span className="existing-purchaser-options">{roasteries.map(roastery => <span className="existing-purchaser-option" key={roastery}><button type="button" onClick={() => setForm({ ...form, roastery })}>{roastery}</button><button type="button" className="remove-purchaser" aria-label={`${roastery} 기존 구매처에서 삭제`} onClick={() => hideRoastery(roastery)}>×</button></span>)}</span></span>}</label>
          <fieldset className="origin-field full-width"><legend>원두 상태</legend><div className="origin-options">{BEAN_STATUSES.map(status => <button type="button" key={status} aria-pressed={form.status === status} onClick={() => setForm({ ...form, status })}>{status}</button>)}</div></fieldset>
          <div className="bean-dates full-width">
          <label>구매량 (g) *<input type="number" min="0.1" step="0.1" required value={form.purchased} placeholder="200" onChange={e => setForm({ ...form, purchased: e.target.value })} /></label>
          <label><span className="purchase-field-label">소비량 (g)<span className="input-hint">이미 소비한 원두</span></span><input type="number" min="0" step="0.1" value={form.consumed} placeholder="0" onChange={e => setForm({ ...form, consumed: e.target.value })} /></label>
          </div>
          <label className="full-width"><span className="purchase-field-label">로스터리 컵노트<span className="input-hint">쉼표(,)로 구분해요</span></span><input value={form.roasteryNotes ?? ""} placeholder="예: 흰 꽃, 복숭아, 꿀" onChange={e => setForm({ ...form, roasteryNotes: e.target.value })} /></label>
          <div className="bean-purchase-row full-width"><label>구매가격 (원)<input type="text" inputMode="numeric" value={withCommas(form.price)} placeholder="예: 28,000" onChange={e => handleNumericInput(e, price => setForm(current => ({ ...current, price })))} /></label><fieldset className="origin-field"><legend>내 기준 분류</legend><div className="origin-options">{BEAN_QUALITIES.map(quality => <button type="button" key={quality} aria-pressed={form.quality === quality} onClick={() => setForm({ ...form, quality })}>{quality}</button>)}</div></fieldset></div>
          <div className="bean-dates full-width">
            <label>구매일<input type="date" value={form.date} onChange={e => { const date = e.target.value; purchaseDateFollowsRoast.current = false; setForm(current => ({ ...current, date, roastDate: roastDateTouched ? current.roastDate : date })); }} /></label>
            <label>로스팅 날짜<input type="date" value={form.roastDate ?? ""} onChange={e => {
              const roastDate = e.target.value;
              setRoastDateTouched(true);
              setForm(current => ({ ...current, roastDate, date: purchaseDateForRoast(current.date, roastDate) }));
            }} /></label>
          </div>

        </div>
        {error && <p role="alert">{error}</p>}
        <div className="form-buttons">{editingId !== null && <button type="button" className="delete-bean-button" onClick={remove}>삭제</button>}<button type="button" className="quiet-button" onClick={close}>취소</button><button type="submit" className="primary-button">저장</button></div>
      </form>}
      <label className="bean-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg><span className="sr-only">원두 검색</span><input type="search" value={beanQuery} onChange={event => setBeanQuery(event.target.value)} placeholder="원산지, 로스터리, 컵노트로 검색" /></label>
      <div className="inventory-toolbar"><div className="inventory-toolbar-top"><label className="view-mode-control" htmlFor="bean-density">보기<select id="bean-density" className="inventory-sort" value={density} onChange={event => setDensity(event.target.value as "detail" | "compact")}><option value="detail">자세히</option><option value="compact">간략하게</option></select></label><button type="button" className="advanced-filter-button" aria-expanded={advancedFiltersOpen} onClick={() => setAdvancedFiltersOpen(!advancedFiltersOpen)}>세부 검색{activeDetailCount > 0 && <b>{activeDetailCount}</b>}</button></div><div className="inventory-toolbar-row"><div className="inventory-filters" aria-label="원두 재고 필터">
        {[["active", "보유 중"], ["finished", "소비 완료"], ["all", "전체"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div><div className="inventory-toolbar-meta"><label htmlFor="bean-sort">정렬</label><select id="bean-sort" className="inventory-sort" value={sort} onChange={event => setSort(event.target.value as BeanSort)}><option value="registered">등록순</option><option value="latest">최신순</option><option value="roastOldest">로스팅 날짜 빠른 순</option><option value="remaining">재고 적은 순</option><option value="unitPriceDesc">단가 높은 순</option><option value="unitPriceAsc">단가 낮은 순</option></select></div></div></div>
      {advancedFiltersOpen && <section className="advanced-filter-panel" aria-label="원두 세부 검색">
        <div className="advanced-filter-header"><div><strong>세부 검색</strong><span>여러 조건을 함께 고를 수 있어요. 숫자는 해당하는 원두 수예요.</span></div></div>
        <section className="filter-section" aria-label="원두 정보"><h4>원두 정보</h4><div className="facet-grid">{facetGroup("origin", "원산지")}{facetGroup("variety", "품종")}{facetGroup("process", "가공방식")}{facetGroup("roastery", "로스터리")}{facetGroup("note", "컵노트")}</div></section>
        <section className="filter-section" aria-label="상태·재고"><h4>상태·재고</h4><div className="facet-grid">{facetGroup("status", "원두 상태")}{facetGroup("remaining", "남은 양")}{facetGroup("age", "로스팅 후", "로스팅 날짜 정보 없음")}</div></section>
        <section className="filter-section" aria-label="가격·날짜"><h4>가격·날짜</h4><div className="facet-grid">
          <fieldset className="facet-group"><legend>가격 구분</legend><div className="facet-options">{BEAN_QUALITIES.map(quality => { const pressed = qualityFilter === quality; const count = qualityCount(quality); return <button type="button" key={quality} aria-pressed={pressed} disabled={!pressed && count === 0} onClick={() => setQualityFilter(pressed ? "all" : quality)}>{quality}<small>{count}</small></button>; })}</div></fieldset>
          <fieldset className="range-filter-group"><legend>구매가 (원)</legend><div><input type="text" inputMode="numeric" value={withCommas(priceMin)} onChange={event => handleNumericInput(event, setPriceMin)} placeholder="최소" aria-label="최소 구매가" /><span>~</span><input type="text" inputMode="numeric" value={withCommas(priceMax)} onChange={event => handleNumericInput(event, setPriceMax)} placeholder="최대" aria-label="최대 구매가" /></div></fieldset>
          {dateRange("로스팅 날짜", roastFrom, setRoastFrom, roastTo, setRoastTo)}
          {dateRange("구매일", purchaseFrom, setPurchaseFrom, purchaseTo, setPurchaseTo)}
        </div></section>
        <div className="advanced-filter-footer"><span role="status">원두 <b>{visible.length}</b>개 찾음</span><div><button type="button" className="quiet-button" onClick={clearDetailFilters} disabled={activeDetailCount === 0}>초기화</button><button type="button" className="primary-button" onClick={() => setAdvancedFiltersOpen(false)}>닫기</button></div></div>
      </section>}
      {!advancedFiltersOpen && activeFilterChips.length > 0 && <div className="active-filter-chips" aria-label="적용된 세부 검색 조건">{activeFilterChips.map(chip => <button type="button" key={chip.key} onClick={chip.clear} aria-label={`${chip.label} 조건 해제`}>{chip.label}<span aria-hidden="true">×</span></button>)}<button type="button" className="active-filter-clear" onClick={clearDetailFilters}>모두 지우기</button></div>}
      <div className={`bean-list density-${density}`}>
        {sortedVisible.map(bean => {
          const pct = bean.purchased > 0 ? Math.max(0, Math.min(100, bean.remaining / bean.purchased * 100)) : 0;
          return <article className="inventory-card" key={bean.id}>
            <div className="bean-info">
              <p className="roastery"><span>{bean.roastery || "로스터리 미입력"}</span></p>
              <h3>{bean.name}</h3>
              <BeanDates bean={bean} />
              <div className="compact-summary"><strong>{bean.roastery || "로스터리 미입력"}</strong><time className="compact-roast" dateTime={bean.roastDate}>로스팅 : {bean.roastDate || "날짜 미입력"}</time><b>{bean.name}</b>{bean.roasteryNotes && <span className="compact-cup-notes">{splitCupNotes(bean.roasteryNotes).map((note, index) => <i key={index}>{note}</i>)}</span>}</div>
              {bean.roasteryNotes && <div className="roastery-cup-notes"><span className="detail-label">로스터리 컵노트</span><div className="flavor-tags">{splitCupNotes(bean.roasteryNotes).map((note, index) => <span key={index}>{note}</span>)}</div></div>}
              <div className="bean-card-actions"><button className="edit-bean" onClick={() => edit(bean)} aria-label={`${bean.name} 원두 정보 수정`}>원두 정보 수정</button><details className="record-details"><summary>내 메모 보기</summary><BeanComments bean={bean} notes={notes.filter(note => note.beanId === bean.id)} /></details></div>
            </div>
            <div className="bean-stock">
              <div className="stock-status-row"><RoastAge bean={bean} today={cardToday} />{bean.remaining <= 0 ? <span data-status="finished" className={`stock-status ${pct <= 20 ? "low" : ""}`}>다 마셨어요</span> : (() => {
                const status = bean.status ?? "소비 중";
                const next: BeanStatus = status === "소비 중" ? "디개싱 중" : "소비 중";
                return <button type="button" data-status={status} className={`stock-status stock-status-toggle ${pct <= 20 ? "low" : ""}`} onClick={() => updateStatus(bean.id, next)} aria-label={`${bean.name} 상태: ${status}. 눌러서 ${next}으로 변경`} title={`눌러서 ${next}으로 변경`}>{status}<span aria-hidden="true">⇄</span></button>;
              })()}</div>
              <p className="remaining-label">남은 원두</p>
              <p className="remaining-weight">{fmt(bean.remaining)}<span>g</span></p>
              <p className="purchased-weight">구매 {fmt(bean.purchased)}g</p>
              <div className="stock-meter" role="progressbar" aria-label={`${bean.name} 잔량`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
              <p className="stock-percent">{Math.round(pct)}% 남음</p>
              <div className="compact-stock-donut" style={{ "--stock-progress": `${pct}%` } as CSSProperties}><strong>{fmt(bean.remaining)}<span>g</span></strong><small>남음</small></div>
            </div>
          </article>;
        })}
        {visible.length === 0 && <div className="inventory-empty"><img className="onboarding-logo" src="/coffee-diary-logo-brown-96.png" width="38" height="38" alt="" /><h3>{available.length === 0 ? "첫 원두를 등록해보세요" : "해당하는 원두가 없어요"}</h3><p>{available.length === 0 ? "원두부터 기록하면 나만의 브루잉 흐름이 시작돼요." : "원두 정보와 향미 노트, 남은 양을 한곳에서 관리해요."}</p>{available.length === 0 && <><JourneySteps active="beans" /><button className="primary-button" onClick={() => { close(); setShow(true); }}>첫 원두 등록하기</button></>}</div>}
      </div>
      {!show && <button type="button" className="bean-fab" onClick={openNewBean}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>원두 추가</button>}
    </main>
  );
}

// The D+ chip sits on the roastery line beside the status chip; the roast date itself goes on the price row.
function RoastAge({ bean, today }: { bean: Bean; today: string }) {
  if (!bean.roastDate) return null;
  const days = Math.round((Date.parse(today) - Date.parse(bean.roastDate)) / 86_400_000);
  if (!Number.isFinite(days)) return null;
  return <span className="roast-age" aria-label={days >= 0 ? `로스팅 후 ${days}일` : `로스팅까지 ${-days}일`}>{days >= 0 ? `D+${days}` : `D${days}`}</span>;
}

// The purchase date stays in the form only.
function BeanDates({ bean }: { bean: Bean }) {
  const priceLabel = bean.price ? (Number.isFinite(Number(bean.price)) ? `₩${fmt(bean.price)}` : bean.price) : null;
  if (!bean.roastDate && !priceLabel && !bean.quality) return null;
  return <div className="title-dates">
    {bean.roastDate && <span className="roast-date">로스팅 <time dateTime={bean.roastDate}>{bean.roastDate.slice(2).replace(/-/g, ".")}</time></span>}
    {(priceLabel || bean.quality) && <span className="bean-purchase-meta">{priceLabel && <span>구매가 {priceLabel}</span>}{bean.quality && <b className={`quality-tag quality-${bean.quality}`}>{bean.quality}</b>}</span>}
  </div>;
}

function BeanComments({ bean, notes }: { bean: Bean; notes: TastingNote[] }) {
  const [expanded, setExpanded] = useState(false);
  const legacy = Boolean(bean.flavor || bean.memo);
  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return <section className="bean-comments" aria-label={`${bean.name} 내 메모`}>
    <div className="comments-heading"><h4>내 메모 <span>{notes.length + Number(legacy)}</span></h4></div>
    {!notes.length && !legacy && <p className="placeholder-note">브루잉 기록에서 컵 노트를 남기면 여기에 모여요.</p>}
    <div className={`comment-list ${expanded ? "expanded" : "collapsed"}`}>{(expanded ? sorted : sorted.slice(0, 1)).map(note => <div className="taste-comment" key={note.id}><time dateTime={note.date}>{note.date}</time>{note.flavor && <div className="flavor-tags">{splitCupNotes(note.flavor).map((tag, index) => <span key={index}>{tag}</span>)}</div>}{note.memo && <p className="bean-memo">{note.memo}</p>}</div>)}
      {legacy && (expanded || !sorted.length) && <div className="taste-comment legacy-comment"><span className="detail-label">이전에 저장한 노트 · 날짜 미지정</span>{bean.flavor && <p className="bean-memo">{bean.flavor}</p>}{bean.memo && <p className="bean-memo">{bean.memo}</p>}</div>}
    </div>
    {notes.length + Number(legacy) > 1 && <button type="button" className="more-records" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "접기" : `더보기 · 이전 기록 ${notes.length + Number(legacy) - 1}개`}</button>}
  </section>;
}

const recipeActions: RecipeStep["action"][] = ["블룸", "센터 푸어", "원형 푸어", "마무리", "가수"];
const normalizedRecipeAction = (action: string): RecipeStep["action"] => action === "스파이럴" ? "원형 푸어" : recipeActions.includes(action as RecipeStep["action"]) ? action as RecipeStep["action"] : "원형 푸어";
// 가수 (bypass water added to the server after extraction) is kept out of the brew ratio and shown on its own.
const isBypassStep = (step: RecipeStep) => normalizedRecipeAction(step.action) === "가수";
const recipeWater = (steps: RecipeStep[]) => steps.reduce((total, step) => {
  const amount = Number(step.amount) || 0;
  return isBypassStep(step) ? { ...total, bypass: total.bypass + amount } : { ...total, extraction: total.extraction + amount };
}, { extraction: 0, bypass: 0 });
const extractionCumulative = (steps: RecipeStep[], index: number) => recipeWater(steps.slice(0, index + 1)).extraction;
// Phone number pads have no ':', so digits alone read as m:ss with the last two as seconds (130 → 1:30).
const recipeTimeFromDigits = (value: string) => {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 4);
  return digits ? `${Number(digits.slice(0, -2) || "0")}:${digits.slice(-2).padStart(2, "0")}` : "";
};
const recipeTimeToSeconds = (time: string) => {
  const match = time.match(/^(\d+):(\d{1,2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};
const recipeTime = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};
const defaultRecipeSteps = (): RecipeStep[] => [
  { time: "0:00", action: "블룸", amount: 0 },
  { time: "0:30", action: "원형 푸어", amount: 0 }
];

function RecipePage({ recipes, setRecipes }: { recipes: SavedRecipe[]; setRecipes: StorageSetter<SavedRecipe[]> }) {
  return <div className="recipe-page">
    <div className="inventory-intro recipe-intro"><div><p>자주 쓰는 추출 흐름을 내 방식으로 저장해요.</p></div></div>
    <RecipeLibrary recipes={recipes} setRecipes={setRecipes} />
  </div>;
}

function RecipeLibrary({ recipes, setRecipes }: { recipes: SavedRecipe[]; setRecipes: StorageSetter<SavedRecipe[]> }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [coffee, setCoffee] = useState("");
  const [memo, setMemo] = useState("");
  const [steps, setSteps] = useState<RecipeStep[]>(defaultRecipeSteps);
  const [showErrors, setShowErrors] = useState(false);
  const [deletedRecipe, setDeletedRecipe] = useState<SavedRecipe | null>(null);
  const composerRef = useRef<HTMLElement>(null);

  const { extraction: totalWater, bypass: bypassWater } = recipeWater(steps);
  const explicitTimeRows = useRef(new Set<number>());
  const handleTimeInput = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = (event.nativeEvent as InputEvent).data;
    const value = event.target.value;
    // Typing ':' switches the row to literal m:ss entry, with the digits so far as minutes.
    if (typed === ":") { explicitTimeRows.current.add(index); updateStep(index, { time: `${Number(steps[index].time.replace(/\D/g, "").slice(-3)) || 0}:` }); return; }
    updateStep(index, { time: explicitTimeRows.current.has(index) ? value.replace(/[^\d:]/g, "").replace(/^(\d{0,3}:\d{0,2}).*$/, "$1") : recipeTimeFromDigits(value) });
  };
  const reset = () => {
    setEditingId(null); setName(""); setCoffee(""); setMemo(""); setSteps(defaultRecipeSteps()); setShowErrors(false);
  };
  const close = () => { reset(); setOpen(false); };
  const updateStep = (index: number, patch: Partial<RecipeStep>) => setSteps(current => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  const setStepTime = (index: number, value: string) => {
    const requested = Math.min(recipeTimeToSeconds(value), 99 * 60 + 59);
    const min = index === 0 ? 0 : recipeTimeToSeconds(steps[index - 1].time) + 5;
    const max = index === steps.length - 1 ? Infinity : recipeTimeToSeconds(steps[index + 1].time) - 5;
    updateStep(index, { time: recipeTime(Math.min(Math.max(requested, min), max)) });
  };
  const addStep = () => {
    if (steps.length >= 7) return;
    const last = steps[steps.length - 1];
    setSteps([...steps, { time: recipeTime(recipeTimeToSeconds(last?.time ?? "0:00") + 30), action: "원형 푸어", amount: 0 }]);
  };
  const edit = (recipe: SavedRecipe) => {
    setEditingId(recipe.id); setName(recipe.name); setCoffee(String(recipe.coffee)); setMemo(recipe.memo ?? ""); setShowErrors(false);
    setSteps(recipe.steps.length >= 2 ? recipe.steps.map(step => ({ ...step, action: normalizedRecipeAction(step.action) })) : defaultRecipeSteps()); setOpen(true);
    scrollToEditor(composerRef);
  };
  const save = () => {
    const coffeeAmount = Number(coffee);
    if (!name.trim() || coffeeAmount <= 0 || totalWater <= 0) { setShowErrors(true); return; }
    const item: SavedRecipe = { id: editingId ?? Date.now(), name: name.trim(), coffee: coffeeAmount, memo: memo.trim(), steps, createdAt: editingId ? recipes.find(recipe => recipe.id === editingId)?.createdAt ?? Date.now() : Date.now() };
    setRecipes(editingId === null ? [...recipes, item] : recipes.map(recipe => recipe.id === editingId ? item : recipe));
    close();
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
  const sorted = [...recipes].sort((a, b) => b.createdAt - a.createdAt);

  return <>
    <section ref={composerRef} className="recipe-composer-card" aria-label="새 레시피">
      <button type="button" className="recipe-library-toggle" aria-expanded={open} onClick={() => open ? close() : setOpen(true)}>
        <span><strong>{editingId === null ? "새 레시피 만들기" : "레시피 수정"}</strong><small>{editingId === null ? "시간과 붓는 양을 단계별로 저장해보세요." : "수정 후 저장하면 기존 레시피에 반영됩니다."}</small></span>
        <span className="recipe-toggle-mark" aria-hidden="true">+</span>
      </button>
      {open && <div className="recipe-composer">
        <div className="recipe-top-fields">
          <Field label="레시피 이름" required invalid={showErrors && !name.trim()}><input aria-invalid={showErrors && !name.trim()} value={name} maxLength={40} onChange={event => setName(event.target.value)} placeholder="예: 484 레시피" /></Field>
          <Field label="원두 (g)" required invalid={showErrors && Number(coffee) <= 0}><input aria-invalid={showErrors && Number(coffee) <= 0} type="number" min="0.1" step="0.1" value={coffee} onChange={event => setCoffee(event.target.value)} placeholder="15" /></Field>
        </div>
        <div className="recipe-step-section">
          <div className="recipe-section-heading"><strong>푸어 타임라인</strong><span>시간 · 붓는 양 · 누적 양</span></div>
          <div className={`recipe-step-editor ${showErrors && totalWater <= 0 ? "has-error" : ""}`}>
            <div className="recipe-step-head"><span>시간</span><span>동작</span><span>붓는 양</span><span>누적</span><span /></div>
            {steps.map((step, index) => {
              const cumulative = extractionCumulative(steps, index);
              return <div className="recipe-step-row" key={index}>
                {index === 0 ? <span className="recipe-fixed-time">0:00</span> : <input className="recipe-time-input" value={step.time} inputMode="numeric" placeholder="130" onFocus={event => event.target.select()} onChange={event => handleTimeInput(index, event)} onBlur={event => { explicitTimeRows.current.delete(index); setStepTime(index, event.target.value); }} onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setStepTime(index, recipeTime(recipeTimeToSeconds(step.time) + (event.key === "ArrowUp" ? 5 : -5))); } }} aria-label={`${index + 1}번째 푸어 시간`} />}
                <select value={step.action} onChange={event => { const action = event.target.value as RecipeStep["action"]; updateStep(index, { action, ...(action === "마무리" ? { amount: 0 } : {}) }); }} aria-label={`${index + 1}번째 푸어 동작`}>{recipeActions.map(action => <option key={action}>{action}</option>)}</select>
                {step.action === "마무리" ? <span className="recipe-no-amount">–</span> : <label className="recipe-amount-input"><input type="number" min="0" step="0.1" value={step.amount || ""} onChange={event => updateStep(index, { amount: Number(event.target.value) || 0 })} placeholder="0" aria-label={`${index + 1}번째 붓는 양`} /><span>g</span></label>}
                <span className="recipe-cumulative" aria-label={isBypassStep(step) ? `가수 ${fmt(Number(step.amount) || 0)}g, 누적에서 제외` : undefined}>{isBypassStep(step) ? `+${fmt(Number(step.amount) || 0)}g` : `${cumulative || "–"}g`}</span>
                <button type="button" className="recipe-remove-step" disabled={index < 2} aria-label={`${index + 1}번째 푸어 삭제`} onClick={() => setSteps(steps.filter((_, stepIndex) => stepIndex !== index))}>×</button>
              </div>;
            })}
          </div>
          <p className="recipe-time-hint">시간은 숫자만 눌러도 돼요. 130 → 1:30</p>
          {showErrors && totalWater <= 0 && <p className="recipe-timeline-error">붓는 양을 한 번 이상 입력해주세요.</p>}
          <button type="button" className="recipe-add-step" disabled={steps.length >= 7} onClick={addStep}>{steps.length >= 7 ? "6회 푸어까지 입력 가능" : "+ 푸어 추가"}</button>
        </div>
        <div className="recipe-metrics"><span>최종 물 양 <b>{totalWater ? `${fmt(totalWater)}g` : "–"}</b></span><span>브루잉 비율 <b>{Number(coffee) > 0 && totalWater > 0 ? `1:${(totalWater / Number(coffee)).toFixed(1)}` : "1:–"}</b></span>{bypassWater > 0 && <span>가수 <b>{fmt(bypassWater)}g</b></span>}</div>
        <Field label="추출 메모"><textarea rows={1} value={memo} onChange={event => setMemo(event.target.value)} placeholder="" /></Field>
        <div className="recipe-form-actions"><button type="button" className="quiet-button" onClick={close}>취소</button><button type="button" className="primary-button" onClick={save}>{editingId === null ? "레시피 저장" : "수정 저장"}</button></div>
      </div>}
    </section>
    {deletedRecipe && <div className="delete-notice" role="status"><span>레시피를 삭제했어요.</span><button type="button" onClick={undoRemove}>되돌리기</button></div>}
    <section className="recipe-library" aria-label="저장 레시피">
      <div className="recipe-library-list-header"><strong>저장한 레시피</strong><span>{recipes.length}개</span></div>
      <div className="recipe-library-list">
      {!sorted.length ? <div className="recipe-library-empty recipe-onboarding"><img className="onboarding-logo" src="/coffee-diary-logo-brown-96.png" width="38" height="38" alt="" /><h3>첫 레시피를 만들어보세요</h3><p>자주 쓰는 드립 방식을 저장해두면 브루잉 기록에 바로 적용할 수 있어요.</p><JourneySteps active="recipes" /><button type="button" className="primary-button" onClick={() => setOpen(true)}>첫 레시피 만들기</button></div> : sorted.map(recipe => {
        const { extraction: water, bypass } = recipeWater(recipe.steps);
        return <article className="saved-recipe-card" key={recipe.id}>
          <div className="saved-recipe-top"><div><h3>{recipe.name}</h3><p>원두 {fmt(recipe.coffee)}g · 물 {fmt(water)}g · {water && recipe.coffee ? `1:${(water / recipe.coffee).toFixed(1)}` : "1:–"}{bypass > 0 && ` · 가수 ${fmt(bypass)}g`}</p></div><div className="saved-recipe-actions"><button type="button" onClick={() => edit(recipe)}>수정</button><button type="button" onClick={() => remove(recipe)}>삭제</button></div></div>
          <div className="saved-recipe-timeline">{recipe.steps.map((step, index) => { const cumulative = extractionCumulative(recipe.steps, index); const action = normalizedRecipeAction(step.action); return <div className="saved-recipe-step" key={`${recipe.id}-${index}`}><span>{step.time}</span><i aria-hidden="true" /><p><b>{action}</b><em>{action === "마무리" ? "–" : action === "가수" ? `+${fmt(step.amount)}g · 추출 후 추가` : `${fmt(step.amount)}g · 누적 ${fmt(cumulative)}g`}</em></p></div>; })}</div>
          {recipe.memo && <p className="saved-recipe-memo">{recipe.memo}</p>}
        </article>;
      })}
      </div>
    </section>
  </>;
}

function BrewLog({ beans, setBeans, brews, setBrews, notes, setNotes, recipes, openInitially, onOpened }: {
  beans: Bean[];
  setBeans: StorageSetter<Bean[]>;
  brews: Brew[];
  setBrews: StorageSetter<Brew[]>;
  notes: TastingNote[];
  setNotes: StorageSetter<TastingNote[]>;
  recipes: SavedRecipe[];
  openInitially: boolean;
  onOpened: () => void;
}) {
  const [show, setShow] = useState(openInitially);
  const brewFormRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (openInitially) onOpened(); }, [openInitially, onOpened]);
  const [form, setForm] = useState<BrewForm>(emptyBrewForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [noteMemo, setNoteMemo] = useState("");
  const [noteRating, setNoteRating] = useState(0);
  const [query, setQuery] = useState("");
  const [brewSort, setBrewSort] = useState<"latest" | "oldest" | "amount">("latest");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [recipeMode, setRecipeMode] = useState<"saved" | "custom">("saved");
  const [brewError, setBrewError] = useState("");
  const [deletedBrew, setDeletedBrew] = useState<{ brew: Brew; notes: TastingNote[] } | null>(null);

  const add = () => {
    const recipeReady = recipeMode === "saved" ? Boolean(selectedRecipeId) : Boolean(form.amount) && Boolean(form.waterAmount);
    if (!form.beanId || !form.amount || !form.date || (editingId === null && !recipeReady)) { setBrewError("원두와 레시피 선택을 확인해주세요."); return; }
    const nextBeanId = Number(form.beanId);
    const bean = beans.find(b => b.id === nextBeanId);
    const amt = parseFloat(form.amount);
    if (!bean) { setBrewError("선택한 원두를 찾을 수 없어요. 원두를 다시 선택해주세요."); return; }
    if (Number.isNaN(amt) || amt <= 0) { setBrewError("사용량은 0보다 큰 숫자로 입력해주세요."); return; }
    const water = form.waterAmount.trim() ? parseFloat(form.waterAmount) : undefined;
    if (water !== undefined && (Number.isNaN(water) || water <= 0)) { setBrewError("물 양은 0보다 큰 숫자로 입력해주세요."); return; }
    const previous = editingId === null ? null : brews.find(item => item.id === editingId) ?? null;
    const previousNote = previous ? notes.find(note => note.brewId === previous.id) : null;
    const restoredBeans = previous ? beans.map(item => item.id === previous.beanId ? { ...item, remaining: Math.round((item.remaining + previous.amount) * 10) / 10 } : item) : beans;
    const available = restoredBeans.find(item => item.id === nextBeanId);
    if (!available || available.remaining < amt) { setBrewError(`잔여량(${fmt(available?.remaining ?? 0)}g)이 부족해요.`); return; }
    const startsConsuming = available.status === "디개싱 중";
    const brew = { ...form, id: editingId ?? Date.now(), beanId: nextBeanId, amount: amt, waterAmount: water };
    setBrews(editingId === null ? [...brews, brew] : brews.map(item => item.id === editingId ? brew : item));
    setBeans(restoredBeans.map(item => item.id === nextBeanId ? { ...item, remaining: Math.round((item.remaining - amt) * 10) / 10, ...(startsConsuming ? { status: "소비 중" as BeanStatus } : {}) } : item));
    if (noteMemo.trim() || noteRating > 0 || previousNote) {
      const note = { ...(previousNote ?? emptyNoteForm()), id: previousNote?.id ?? Date.now() + 1, beanId: nextBeanId, brewId: brew.id, rating: noteRating, memo: noteMemo.trim(), date: form.date };
      setNotes(previousNote ? notes.map(item => item.id === previousNote.id ? note : item) : [...notes, note]);
    }
    setForm(emptyBrewForm());
    setNoteMemo(""); setNoteRating(0); setEditingId(null); setSelectedRecipeId(""); setRecipeMode("saved"); setBrewError(""); setShow(false);
  };

  const remove = (brew: Brew) => {
    setBrews(brews.filter(b => b.id !== brew.id));
    setBeans(beans.map(b => b.id === brew.beanId ? { ...b, remaining: Math.round((b.remaining + brew.amount) * 10) / 10 } : b));
    setNotes(notes.filter(note => note.brewId !== brew.id));
    setDeletedBrew({ brew, notes: notes.filter(note => note.brewId === brew.id) });
  };
  const undoRemove = () => {
    if (!deletedBrew) return;
    const { brew, notes: removedNotes } = deletedBrew;
    setBrews([...brews, brew]);
    setBeans(beans.map(b => b.id === brew.beanId ? { ...b, remaining: Math.round((b.remaining - brew.amount) * 10) / 10 } : b));
    setNotes([...notes, ...removedNotes]);
    setDeletedBrew(null);
  };
  const edit = (brew: Brew) => {
    setEditingId(brew.id);
    setForm({ beanId: String(brew.beanId), amount: String(brew.amount), waterAmount: brew.waterAmount ? String(brew.waterAmount) : "", method: brew.method, date: brew.date, recipe: brew.recipe });
    const note = notes.find(item => item.brewId === brew.id);
    setNoteMemo(note?.memo ?? ""); setNoteRating(note?.rating ?? 0); setSelectedRecipeId(""); setRecipeMode("custom"); setBrewError("");
    setShow(true);
    scrollToEditor(brewFormRef);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredBrews = brews.filter(brew => {
    if (!normalizedQuery) return true;
    const bean = beans.find(b => b.id === brew.beanId);
    return [bean?.name, bean?.roastery, brew.recipe, brew.date].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
  });
  const sorted = [...filteredBrews].sort((a, b) => {
    if (brewSort === "amount") return b.amount - a.amount || b.date.localeCompare(a.date);
    return brewSort === "latest" ? b.date.localeCompare(a.date) || b.id - a.id : a.date.localeCompare(b.date) || a.id - b.id;
  });
  const activeBeans = beans.filter(b => !b.deleted && b.remaining > 0);
  const applySavedRecipe = (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    setRecipeMode("saved");
    setBrewError("");
    const recipe = recipes.find(item => String(item.id) === recipeId);
    if (!recipe) return;
    const water = recipeWater(recipe.steps).extraction;
    setForm(current => ({ ...current, amount: String(recipe.coffee), waterAmount: water ? String(water) : "", recipe: recipe.name }));
  };

  return (
    <div className="brew-log">
      <div className="inventory-intro brew-log-heading">
        <div><p>총 {brews.length}회 브루잉을 기록했어요.</p></div>
        <div className="brew-log-heading-actions"><button type="button" className="primary-button brew-add-button" onClick={() => setShow(!show)}>+ 브루잉 추가</button></div>
      </div>
      {deletedBrew && <div className="delete-notice" role="status"><span>브루잉 기록을 삭제했어요.</span><button type="button" onClick={undoRemove}>되돌리기</button></div>}

      {show && <div ref={brewFormRef} className="editor-anchor" aria-hidden="true" />}
      {show && (
        <FormCard>
          <div className="brew-core-grid">
            <Field label="원두 선택*">
              <select value={form.beanId} onChange={e => { setForm({ ...form, beanId: e.target.value }); setBrewError(""); }} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }}>
                <option value="">선택하세요</option>
                {activeBeans.map(b => <option key={b.id} value={b.id}>{[b.roastery, b.name].filter(Boolean).join(" ")} ({fmt(b.remaining)}g 남음)</option>)}
              </select>
            </Field>
            <Field label="날짜*"><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} /></Field>
          </div>
          <div className="brew-recipe-picker"><span className="brew-recipe-picker-label">레시피 선택*</span><div className="recipe-mode-options"><button type="button" aria-pressed={recipeMode === "saved"} onClick={() => { setRecipeMode("saved"); setBrewError(""); }}>저장한 레시피</button><button type="button" aria-pressed={recipeMode === "custom"} onClick={() => { setRecipeMode("custom"); setSelectedRecipeId(""); setForm(current => ({ ...current, recipe: "" })); setBrewError(""); }}>직접 입력</button></div>{recipeMode === "saved" ? <div className="recipe-mode-content"><select value={selectedRecipeId} onChange={event => applySavedRecipe(event.target.value)}><option value="">선택하세요</option>{recipes.map(recipe => { const water = recipeWater(recipe.steps).extraction; return <option key={recipe.id} value={recipe.id}>{recipe.name} · 원두 {fmt(recipe.coffee)}g · 물 {fmt(water)}g</option>; })}</select>{selectedRecipeId && <p>레시피의 원두 양과 물 양을 적용했어요.</p>}</div> : <div className="brew-custom-recipe-fields"><Field label="사용량 (g)*"><input type="number" min="0.1" step="0.1" value={form.amount} onChange={event => { setForm({ ...form, amount: event.target.value }); setBrewError(""); }} placeholder="예: 15" /></Field><Field label="투입 물 양 (g)*"><input type="number" min="0.1" step="0.1" value={form.waterAmount} onChange={event => { setForm({ ...form, waterAmount: event.target.value }); setBrewError(""); }} placeholder="예: 220" /></Field><div className="custom-recipe-name"><Field label="레시피 이름"><input value={form.recipe} onChange={event => setForm({ ...form, recipe: event.target.value })} placeholder="예: 나만의 4:6 레시피" /></Field></div></div>}</div>
          <div className="brew-note-form"><Field label="컵 노트 / 느낀점"><textarea value={noteMemo} onChange={e => setNoteMemo(e.target.value)} rows={1} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: FONT }} placeholder="오늘의 맛과 느낌을 자유롭게 기록해보세요..." /></Field><div><span className="brew-rating-label">별점</span><StarRating value={noteRating} onChange={setNoteRating} /></div></div>
          {brewError && <p className="brew-form-error" role="alert">{brewError}</p>}
          <FormActions onSave={add} onCancel={() => { setShow(false); setEditingId(null); setSelectedRecipeId(""); setRecipeMode("saved"); setBrewError(""); setForm(emptyBrewForm()); setNoteMemo(""); setNoteRating(0); }} saveLabel={editingId === null ? "저장 (재고 차감)" : "수정 저장"} />
        </FormCard>
      )}

      <div className="brew-log-tools">
        <label className="brew-search"><span className="sr-only">브루잉 기록 검색</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="원두, 로스터리, 레시피 검색" /></label>
        <select aria-label="브루잉 기록 정렬" value={brewSort} onChange={event => setBrewSort(event.target.value as "latest" | "oldest" | "amount")}><option value="latest">최신순</option><option value="oldest">오래된 순</option><option value="amount">사용량 많은 순</option></select>
      </div>

      {sorted.length === 0 ? (brews.length === 0 ? <div className="brew-empty inventory-empty"><img className="onboarding-logo" src="/coffee-diary-logo-brown-96.png" width="38" height="38" alt="" /><h3>첫 브루잉을 기록해보세요</h3><p>원두와 레시피를 골라 오늘의 한 잔을 남겨보세요.</p><JourneySteps active="brews" /><button type="button" className="primary-button" onClick={() => setShow(true)}>첫 브루잉 기록하기</button></div> : <Empty text="검색 결과가 없어요" />) : sorted.map(brew => {
        const bean = beans.find(b => b.id === brew.beanId);
        const hasNote = notes.some(n => n.brewId === brew.id);
        return (
          <article key={brew.id} className="brew-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                {bean?.roastery && <p className="brew-roastery">{bean.roastery}</p>}
                <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 500, fontFamily: FONT }}>{bean?.name || "삭제된 원두"}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)", fontFamily: FONT }}>{brew.date}</p>
                <div className="brew-recipe-block"><p className="brew-metrics">원두 {fmt(brew.amount)}g {brew.waterAmount ? `· 물 ${fmt(brew.waterAmount)}g · ${brewRatio(brew.amount, brew.waterAmount)}` : ""}</p>{brew.recipe && <p>{brew.recipe}</p>}</div>
                {hasNote && (() => { const note = notes.find(item => item.brewId === brew.id); const memo = note ? [note.memo, note.flavor].filter(Boolean).join(" · ") : ""; return memo ? <p className="brew-note-inline"><span>메모</span> {memo}</p> : null; })()}
              </div>
              <div className="brew-card-actions"><button onClick={() => edit(brew)} className="brew-edit-button">수정</button><button onClick={() => remove(brew)} className="brew-delete-button">삭제</button></div>
            </div>
          </article>
        );
      })}
      {!show && <button type="button" className="bean-fab brew-fab" onClick={() => { setShow(true); scrollToEditor(brewFormRef); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>브루잉 추가</button>}
    </div>
  );
}

function BrewStats({ beans, brews }: { beans: Bean[]; brews: Brew[] }) {
  const [period, setPeriod] = useState<"all" | "7" | "30" | "90">("30");
  const days = period === "all" ? null : Number(period);
  const cutoff = days === null ? null : Date.parse(localDate()) - (days - 1) * 86_400_000;
  const filtered = brews.filter(brew => cutoff === null || Date.parse(brew.date) >= cutoff);
  const totalAmount = filtered.reduce((sum, brew) => sum + brew.amount, 0);
  const beanUsage = [...new Set(filtered.map(brew => brew.beanId))].map(beanId => {
    const bean = beans.find(item => item.id === beanId);
    return { name: bean?.name || "삭제된 원두", amount: filtered.filter(brew => brew.beanId === beanId).reduce((sum, brew) => sum + brew.amount, 0) };
  }).sort((a, b) => b.amount - a.amount);
  const dailyUsage = Object.entries(filtered.reduce<Record<string, number>>((result, brew) => {
    result[brew.date] = (result[brew.date] || 0) + brew.amount;
    return result;
  }, {})).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14);
  const dailyMax = Math.max(...dailyUsage.map(([, amount]) => amount), 1);
  const usageRows = (items: Array<[string, number]>, max: number, label: (key: string) => string) => items.length === 0
    ? <p className="stats-empty">선택한 기간에 브루잉 기록이 없어요.</p>
    : <div className="usage-list">{items.map(([key, amount]) => <div className="usage-row" key={key}><span>{label(key)}</span><div className="usage-row-value"><div className="usage-bar"><i style={{ width: `${Math.max(8, amount / max * 100)}%` }} /></div><b>{fmt(Math.round(amount * 10) / 10)}g</b></div></div>)}</div>;
  return <div className="brew-stats">
    <div className="inventory-intro stats-header"><div><p>기간을 골라 내 기록을 가볍게 돌아봐요.</p></div><select aria-label="통계 기간" value={period} onChange={event => setPeriod(event.target.value as "all" | "7" | "30" | "90")}><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option><option value="all">전체 기간</option></select></div>
    <div className="stats-cards"><div><span>브루잉 횟수</span><strong>{filtered.length}<small>회</small></strong></div><div><span>사용한 원두</span><strong>{beanUsage.length}<small>종</small></strong></div><div><span>사용량</span><strong>{fmt(Math.round(totalAmount * 10) / 10)}<small>g</small></strong></div></div>
    <section className="stats-section"><h3>원두별 사용량</h3>{beanUsage.length === 0 ? <p className="stats-empty">선택한 기간에 브루잉 기록이 없어요.</p> : <div className="usage-list">{beanUsage.map(item => <div className="usage-row" key={item.name}><span>{item.name}</span><b>{fmt(Math.round(item.amount * 10) / 10)}g</b></div>)}</div>}</section>
    <section className="stats-section"><h3>일별 사용량</h3>{usageRows(dailyUsage, dailyMax, key => { const date = parseLocalDate(key); return `${date.getMonth() + 1}/${date.getDate()}`; })}</section>
  </div>;
}

function FormCard({ children }: { children: ReactNode }) {
  return <div className="form-card">{children}</div>;
}

function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="star-rating" aria-label={`별점 ${value}점`}>{[1, 2, 3, 4, 5].map(star => <span className={`star-rating-star ${value >= star ? "full" : value >= star - 0.5 ? "half" : "empty"}`} key={star}><span aria-hidden="true">★</span><button type="button" aria-label={`${star - 0.5}점`} onClick={() => onChange(star - 0.5)} /><button type="button" aria-label={`${star}점`} onClick={() => onChange(star)} /></span>)}</div>;
}

function Field({ label, children, required = false, invalid = false }: { label: string; children: ReactNode; required?: boolean; invalid?: boolean }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: invalid ? "var(--fg-b65f50)" : "var(--color-text-secondary)", display: "block", marginBottom: 4, fontFamily: FONT }}>{label}{required && <span aria-hidden="true" style={{ color: invalid ? "var(--fg-b65f50)" : "var(--fg-7a5733)", marginLeft: 2 }}>*</span>}</label>
      {children}
    </div>
  );
}

function FormActions({ onSave, onCancel, saveLabel }: { onSave: () => void; onCancel: () => void; saveLabel: string }) {
  return (
    <div className="form-buttons">
      <button type="button" className="quiet-button" onClick={onCancel}>취소</button>
      <button type="button" className="primary-button" onClick={onSave}>{saveLabel}</button>
    </div>
  );
}

function JourneySteps({ active }: { active: "beans" | "recipes" | "brews" }) {
  const steps = [
    { id: "beans" as const, number: 1, label: "원두 등록" },
    { id: "recipes" as const, number: 2, label: "레시피 만들기" },
    { id: "brews" as const, number: 3, label: "첫 브루잉 기록" }
  ];
  return <ol className="journey-steps" aria-label="커피 다이어리 시작 순서">{steps.map(step => <li key={step.id} className={step.id === active ? "is-active" : undefined}><b>{step.number}</b><span>{step.label}</span></li>)}</ol>;
}

function Empty({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}
