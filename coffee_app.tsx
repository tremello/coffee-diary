import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { supabase } from "./src/supabase";

const STORAGE_KEYS = { beans: "cf_beans", brews: "cf_brews", notes: "cf_notes", recipes: "cf_recipes" };
const DEFAULT_PROCESSES = ["워시드", "내추럴", "허니", "무산소 내추럴", "무산소 워시드"];
const DEFAULT_ORIGINS = ["에티오피아", "파나마", "콜롬비아", "케냐"];
const BEAN_STATUSES = ["배송 중", "디개싱 중", "소비 중"] as const;
type BeanStatus = (typeof BEAN_STATUSES)[number];
const BEAN_QUALITIES = ["특식", "준특식", "사료"] as const;
type BeanQuality = (typeof BEAN_QUALITIES)[number];
const localDate = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const beanName = (bean: BeanForm) => [bean.origin, bean.farm, bean.variety, bean.process].map(value => value?.trim()).filter(Boolean).join(" ");
const FONT = "'Nanum Barun Gothic', 'Apple SD Gothic Neo', sans-serif";
const PAGES = ["Beans", "Recipes", "Brew Log", "Brew Stats"] as const;
const PAGE_LABELS = { Beans: "원두 재고", "Brew Log": "브루잉 기록", Recipes: "나의 레시피", "Brew Stats": "브루잉 통계" };

type Page = (typeof PAGES)[number];
const PAGE_HASHES: Record<Page, string> = { Beans: "#beans", "Brew Log": "#brews", Recipes: "#recipes", "Brew Stats": "#stats" };
const pageFromHash = (hash: string): Page => ({ "#beans": "Beans", "#brews": "Brew Log", "#recipes": "Recipes", "#stats": "Brew Stats" }[hash.toLowerCase()] as Page | undefined) ?? "Beans";
type StorageSetter<T> = (value: T) => void;
type BeanSort = "registered" | "latest" | "roastOldest" | "remaining" | "unitPriceDesc" | "unitPriceAsc";
type BeanFacetKey = "origin" | "roastery" | "variety" | "process" | "status";
type BeanFacetFilters = Record<BeanFacetKey, string[]>;
const emptyBeanFacetFilters = (): BeanFacetFilters => ({ origin: [], roastery: [], variety: [], process: [], status: [] });

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
  action: "블룸" | "센터 푸어" | "원형 푸어" | "마무리";
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
type TastingNoteTextKey = "flavor" | "aroma" | "acidity" | "body" | "finish";

function useStorage<T>(key: string, init: T, userId: string | null = null): [T, StorageSetter<T>] {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; }
  });
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.from("coffee_data").select("data").eq("key", key).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { console.error("Coffee sync read failed", error); return; }
      if (data?.data !== undefined) setVal(data.data as T);
      else if (Array.isArray(val) && val.length > 0) void supabase.from("coffee_data").upsert({ key, data: val, user_id: userId }, { onConflict: "user_id,key" }).then(({ error: saveError }) => { if (saveError) console.error("Coffee sync migration failed", saveError); });
    });
    return () => { cancelled = true; };
  }, [key, userId]);
  const set = (v: T) => {
    setVal(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
    if (userId) void supabase.from("coffee_data").upsert({ key, data: v, user_id: userId }, { onConflict: "user_id,key" }).then(({ error }) => { if (error) console.error("Coffee sync save failed", error); });
  };
  return [val, set];
}

function useAuth() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);
  return { user, loading };
}

const fmt = (n: number | string) => Number(n).toLocaleString();
const parseLocalDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};
const sortByDateDesc = <T extends { date: string }>(items: T[]) =>
  [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const emptyBeanForm: BeanForm = { name: "", origin: "", process: "", roastery: "", date: "", purchased: "", consumed: "", price: "", roasteryNotes: "", roastDate: "", farm: "", variety: "", flavor: "", memo: "", status: undefined, quality: undefined };
const emptyBrewForm = (): BrewForm => ({ beanId: "", amount: "", waterAmount: "", method: "", date: new Date().toISOString().slice(0, 10), recipe: "" });
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
  date: new Date().toISOString().slice(0, 10)
});

export default function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash));
  const [openBrewForm, setOpenBrewForm] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const [beans, setBeans] = useStorage<Bean[]>(STORAGE_KEYS.beans, [], user?.id ?? null);
  const [brews, setBrews] = useStorage<Brew[]>(STORAGE_KEYS.brews, [], user?.id ?? null);
  const [notes, setNotes] = useStorage<TastingNote[]>(STORAGE_KEYS.notes, [], user?.id ?? null);
  const [recipes, setRecipes] = useStorage<SavedRecipe[]>(STORAGE_KEYS.recipes, [], user?.id ?? null);
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
      {page === "Beans" && <BeansPage beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} notes={notes} setNotes={setNotes} userId={user?.id ?? null} onBrew={() => { setOpenBrewForm(true); navigate("Brew Log"); }} />}
      {page === "Brew Log" && <BrewLog beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} notes={notes} setNotes={setNotes} recipes={recipes} openInitially={openBrewForm} onOpened={() => setOpenBrewForm(false)} />}
      {page === "Recipes" && <RecipePage recipes={recipes} setRecipes={setRecipes} />}
      {page === "Brew Stats" && <BrewStats beans={beans} brews={brews} />}
    </div>
  );
}

function Header({ page, setPage, user, authLoading }: { page: Page; setPage: (page: Page) => void; user: { id: string; email?: string } | null; authLoading: boolean }) {
  const signInGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/` } });
    if (error) window.alert(error.message);
  };
  const signOut = () => { void supabase.auth.signOut(); };
  return (
    <div className="app-header" style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 0 0" }}>
        <div>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT }}>My Coffee Diary</p>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: "2px 0 0", color: "var(--color-text-primary)", fontFamily: FONT }}>{PAGE_LABELS[page]}</h1>
        </div>
        <div className="account-actions">{user ? <button className="account-button" onClick={signOut}>{user.email?.split("@")[0] ?? "내 계정"} · 로그아웃</button> : <button className="google-button" onClick={signInGoogle}>Google 로그인</button>}<button className="refresh-button" onClick={() => window.location.reload()} aria-label="새로고침" title="새로고침">↻</button><img className="brand-mark" src="/coffee-diary-logo-brown-96.png" width="40" height="40" alt="커피 기록 로고" /></div>
      </div>
      <nav className="page-tabs">
        {PAGES.map(p => (
          <button key={p} className="page-tab" onClick={() => setPage(p)} aria-current={page === p ? "page" : undefined} style={{
            padding: "8px 16px", fontSize: 14, borderRadius: 10, fontFamily: FONT,
            border: page === p ? "1px solid #8B6F47" : "0.5px solid var(--color-border-tertiary)",
            background: page === p ? "#8B6F47" : "transparent",
            color: page === p ? "#fff" : "var(--color-text-secondary)",
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
  const [error, setError] = useState("");
  const [roastDateTouched, setRoastDateTouched] = useState(false);
  const [customOrigins, setCustomOrigins] = useStorage<string[]>("cf_origins", [], userId);
  const [addingOrigin, setAddingOrigin] = useState(false);
  const [newOrigin, setNewOrigin] = useState("");
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null);
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
  const [deletedBrews, setDeletedBrews] = useState<Brew[]>([]);
  const [deletedNotes, setDeletedNotes] = useState<TastingNote[]>([]);
  const available = beans.filter(b => !b.deleted);
  const active = available.filter(b => b.remaining > 0);
  const shippingAndDegassingWeight = active.filter(bean => bean.status === "배송 중" || bean.status === "디개싱 중").reduce((sum, bean) => sum + bean.remaining, 0);
  const consumingWeight = active.filter(bean => (bean.status ?? "소비 중") === "소비 중").reduce((sum, bean) => sum + bean.remaining, 0);
  const facetValue = (bean: Bean, key: BeanFacetKey) => {
    if (key === "origin") return bean.origin?.trim() ?? "";
    if (key === "roastery") return bean.roastery?.trim() ?? "";
    if (key === "variety") return bean.variety?.trim() ?? "";
    if (key === "process") return bean.process?.trim() ?? "";
    return bean.status ?? "소비 중";
  };
  const facetValues = (key: BeanFacetKey) => [...new Set(available.map(bean => facetValue(bean, key)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const toggleFacet = (key: BeanFacetKey, value: string) => setFacetFilters(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value] }));
  const activeFacetCount = Object.values(facetFilters).reduce((sum, values) => sum + values.length, 0);
  const activeRangeCount = Number(Boolean(priceMin || priceMax)) + Number(Boolean(roastFrom || roastTo));
  const activeDetailCount = activeFacetCount + activeRangeCount;
  const facetMatches = (bean: Bean) => (Object.keys(facetFilters) as BeanFacetKey[]).every(key => facetFilters[key].length === 0 || facetFilters[key].includes(facetValue(bean, key)));
  const rangeMatches = (bean: Bean) => {
    const price = Number(bean.price);
    const minimumPrice = priceMin === "" ? 0 : Number(priceMin);
    const maximumPrice = priceMax === "" ? Infinity : Number(priceMax);
    if (!Number.isFinite(price) || price < minimumPrice || price > maximumPrice) return false;
    if (roastFrom && (!bean.roastDate || bean.roastDate < roastFrom)) return false;
    if (roastTo && (!bean.roastDate || bean.roastDate > roastTo)) return false;
    return true;
  };
  const clearDetailFilters = () => { setFacetFilters(emptyBeanFacetFilters()); setPriceMin(""); setPriceMax(""); setRoastFrom(""); setRoastTo(""); };
  const visible = available.filter(b => (filter === "all" || (filter === "active" ? b.remaining > 0 : b.remaining <= 0)) && (qualityFilter === "all" || b.quality === qualityFilter) && facetMatches(b) && rangeMatches(b));
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
  const close = () => { setShow(false); setEditingId(null); setForm(emptyBeanForm); setError(""); setRoastDateTouched(false); setAddingOrigin(false); setNewOrigin(""); };
  const edit = (bean: Bean) => {
    setForm({ ...bean, status: bean.status ?? "소비 중", purchased: String(bean.purchased), consumed: String(bean.consumed ?? 0) });
    setRoastDateTouched(Boolean(bean.roastDate && bean.roastDate !== bean.date));
    setEditingId(bean.id); setError(""); setShow(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const remove = () => {
    if (editingId === null) return;
    const relatedBrews = brews.filter(brew => brew.beanId === editingId);
    const relatedNotes = notes.filter(note => note.beanId === editingId);
    const warning = relatedBrews.length > 0 ? `이 원두에 연결된 브루잉 기록 ${relatedBrews.length}개도 함께 삭제돼요.` : "연결된 브루잉 기록은 없어요.";
    if (!window.confirm(`${warning}\n계속 삭제할까요?`)) return;
    if (!window.confirm("원두와 관련 기록을 모두 삭제합니다. 정말 삭제할까요?")) return;
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
    setEditingStatusId(null);
  };
  const facetGroup = (key: BeanFacetKey, label: string) => {
    const values = facetValues(key);
    if (!values.length) return null;
    return <fieldset className="facet-group" key={key}><legend>{label}</legend><div className="facet-options">{values.map(value => <button type="button" key={value} aria-pressed={facetFilters[key].includes(value)} onClick={() => toggleFacet(key, value)}>{value}</button>)}</div></fieldset>;
  };
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
      <div className="inventory-intro"><div><p className="eyebrow">MY BEAN SHELF</p><h2>지금, 내 원두</h2><p>좋아하는 맛을 기록하고, 남은 원두를 한눈에.</p></div>
        <div className="intro-actions"><button className="secondary-button" onClick={onBrew}>브루잉 기록하기</button><button className="primary-button" onClick={() => { close(); setShow(true); }}>+ 원두 추가</button></div></div>
      <div className="inventory-summary">
        <div className="summary-primary"><span>보유 중</span><strong>{active.length}<small>종</small>{fmt(Math.round(active.reduce((sum, b) => sum + b.remaining, 0) * 10) / 10)}<small>g</small></strong></div>
        <div className="summary-details"><div className="summary-status-breakdown"><span>배송·디개싱 중 <b>{fmt(Math.round(shippingAndDegassingWeight * 10) / 10)}g</b></span><span>소비 중 <b>{fmt(Math.round(consumingWeight * 10) / 10)}g</b></span></div></div>
      </div>
      {deletedId !== null && <div className="delete-notice" role="status"><span>원두를 삭제했어요.</span><button type="button" onClick={undoRemove}>되돌리기</button></div>}
      {show && <form className="bean-form" onSubmit={save}>
        <h3>{editingId === null ? "새 원두 등록" : "원두 정보 수정"}</h3>
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
          <label className="full-width">로스터리 컵노트<input value={form.roasteryNotes ?? ""} placeholder="예: 자스민, 복숭아, 꿀" onChange={e => setForm({ ...form, roasteryNotes: e.target.value })} /></label>
          <div className="bean-purchase-row full-width"><label>구매가격 (원)<input type="number" min="0" step="100" value={form.price} placeholder="예: 28000" onChange={e => setForm({ ...form, price: e.target.value })} /></label><fieldset className="origin-field"><legend>내 기준 분류</legend><div className="origin-options">{BEAN_QUALITIES.map(quality => <button type="button" key={quality} aria-pressed={form.quality === quality} onClick={() => setForm({ ...form, quality })}>{quality}</button>)}</div></fieldset></div>
          <div className="bean-dates full-width">
            <label>구매일<input type="date" value={form.date} onChange={e => { const date = e.target.value; setForm(current => ({ ...current, date, roastDate: roastDateTouched ? current.roastDate : date })); }} /></label>
            <label>로스팅 날짜<input type="date" value={form.roastDate ?? ""} onChange={e => { setRoastDateTouched(true); setForm({ ...form, roastDate: e.target.value }); }} /></label>
          </div>

        </div>
        {error && <p role="alert">{error}</p>}
        <div className="form-buttons">{editingId !== null && <button type="button" className="delete-bean-button" onClick={remove}>삭제</button>}<button type="button" className="quiet-button" onClick={close}>취소</button><button type="submit" className="primary-button">저장</button></div>
      </form>}
      <div className="inventory-toolbar"><div className="inventory-toolbar-top"><label className="view-mode-control" htmlFor="bean-density">보기<select id="bean-density" className="inventory-sort" value={density} onChange={event => setDensity(event.target.value as "detail" | "compact")}><option value="detail">자세히</option><option value="compact">간략하게</option></select></label><button type="button" className="advanced-filter-button" aria-expanded={advancedFiltersOpen} onClick={() => setAdvancedFiltersOpen(!advancedFiltersOpen)}>세부 검색{activeDetailCount > 0 && <b>{activeDetailCount}</b>}</button></div><div className="inventory-toolbar-row"><div className="inventory-filters" aria-label="원두 재고 필터">
        {[["active", "보유 중"], ["finished", "소비 완료"], ["all", "전체"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div><div className="inventory-toolbar-meta"><label htmlFor="quality-filter">분류</label><select id="quality-filter" className="inventory-sort" value={qualityFilter} onChange={event => setQualityFilter(event.target.value as "all" | BeanQuality)}><option value="all">전체</option>{BEAN_QUALITIES.map(quality => <option key={quality} value={quality}>{quality}</option>)}</select><label htmlFor="bean-sort">정렬</label><select id="bean-sort" className="inventory-sort" value={sort} onChange={event => setSort(event.target.value as BeanSort)}><option value="registered">등록순</option><option value="latest">최신순</option><option value="roastOldest">로스팅 날짜 빠른 순</option><option value="remaining">재고 적은 순</option><option value="unitPriceDesc">단가 높은 순</option><option value="unitPriceAsc">단가 낮은 순</option></select></div></div></div>
      {advancedFiltersOpen && <section className="advanced-filter-panel" aria-label="원두 세부 검색"><div className="advanced-filter-header"><div><strong>세부 검색</strong><span>여러 조건을 함께 선택할 수 있어요.</span></div>{activeDetailCount > 0 && <button type="button" onClick={clearDetailFilters}>초기화</button>}</div><div className="facet-grid">{facetGroup("origin", "원산지")}{facetGroup("roastery", "로스터리")}{facetGroup("variety", "품종")}{facetGroup("process", "가공방식")}{facetGroup("status", "원두 상태")}</div><div className="range-filter-grid"><fieldset className="range-filter-group"><legend>구매가 (원)</legend><div><input type="number" min="0" value={priceMin} onChange={event => setPriceMin(event.target.value)} placeholder="최소" aria-label="최소 구매가" /><span>~</span><input type="number" min="0" value={priceMax} onChange={event => setPriceMax(event.target.value)} placeholder="최대" aria-label="최대 구매가" /></div></fieldset><fieldset className="range-filter-group range-filter-quality"><legend>가격 구분</legend><div className="facet-options">{BEAN_QUALITIES.map(quality => <button type="button" key={quality} aria-pressed={qualityFilter === quality} onClick={() => setQualityFilter(qualityFilter === quality ? "all" : quality)}>{quality}</button>)}</div></fieldset><fieldset className="range-filter-group"><legend>로스팅 날짜</legend><div><input type="date" value={roastFrom} onChange={event => setRoastFrom(event.target.value)} aria-label="로스팅 시작일" /><span>~</span><input type="date" value={roastTo} onChange={event => setRoastTo(event.target.value)} aria-label="로스팅 종료일" /></div></fieldset></div></section>}
      <div className={`bean-list density-${density}`}>
        {sortedVisible.map(bean => {
          const pct = bean.purchased > 0 ? Math.max(0, Math.min(100, bean.remaining / bean.purchased * 100)) : 0;
          return <article className="inventory-card" key={bean.id}>
            <div className="bean-info">
              <p className="roastery">{bean.roastery || "로스터리 미입력"}</p>
              <h3>{bean.name}</h3>
              <BeanDates bean={bean} />
              <div className="compact-summary"><strong>{bean.roastery || "로스터리 미입력"}</strong><b>{bean.name}</b><div className="compact-meta"><span>로스팅 : {bean.roastDate || "날짜 미입력"}</span>{bean.roasteryNotes && <span className="compact-cup-notes">{bean.roasteryNotes.split(/[\s,·、\n]+/).map(value => value.trim()).filter(Boolean).map((note, index) => <i key={index}>{note}</i>)}</span>}</div></div>
              {bean.roasteryNotes && <div className="roastery-cup-notes"><span className="detail-label">로스터리 컵노트</span><div className="flavor-tags">{bean.roasteryNotes.split(/[\s,·、\n]+/).map(value => value.trim()).filter(Boolean).map((note, index) => <span key={index}>{note}</span>)}</div></div>}
              <div className="bean-card-actions"><button className="edit-bean" onClick={() => edit(bean)} aria-label={`${bean.name} 기본 정보 수정`}>기본 정보 수정 ↗</button><details className="record-details"><summary>기록 보기</summary><BeanComments bean={bean} notes={notes.filter(note => note.beanId === bean.id)} onAdd={note => setNotes([...notes, note])} /></details></div>
            </div>
            <div className="bean-stock">
              <div className="stock-status-row">{editingStatusId === bean.id ? <select className="stock-status-select" value={bean.status ?? "소비 중"} aria-label={`${bean.name} 상태`} onChange={event => updateStatus(bean.id, event.target.value as BeanStatus)}>{BEAN_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select> : <><span className={`stock-status ${pct <= 20 ? "low" : ""}`}>{bean.remaining <= 0 ? "다 마셨어요" : bean.status ?? "소비 중"}</span><button type="button" className="status-edit-button" onClick={() => setEditingStatusId(bean.id)}>수정</button></>}</div>
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
    </main>
  );
}

function BeanDates({ bean }: { bean: Bean }) {
  const [today, setToday] = useState(localDate);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDate()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const days = bean.roastDate ? Math.round((Date.parse(today) - Date.parse(bean.roastDate)) / 86_400_000) : null;
  const priceLabel = bean.price ? (Number.isFinite(Number(bean.price)) ? `₩${fmt(bean.price)}` : bean.price) : null;
  if (!bean.date && !bean.roastDate && !priceLabel && !bean.quality) return null;
  return <div className="title-dates">
    {bean.date && <span>구매일 <time dateTime={bean.date}>{bean.date}</time></span>}
    {bean.roastDate && <span>로스팅 <time dateTime={bean.roastDate}>{bean.roastDate}</time>{days !== null && Number.isFinite(days) && <strong aria-label={days >= 0 ? `로스팅 후 ${days}일` : `로스팅까지 ${-days}일`}>{days >= 0 ? `D+${days}` : `D${days}`}</strong>}</span>}
    {(priceLabel || bean.quality) && <span className="bean-purchase-meta">{priceLabel && <span>구매가 {priceLabel}</span>}{bean.quality && <b className={`quality-tag quality-${bean.quality}`}>{bean.quality}</b>}</span>}
  </div>;
}

function BeanComments({ bean, notes, onAdd }: { bean: Bean; notes: TastingNote[]; onAdd: (note: TastingNote) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(localDate);
  const [flavor, setFlavor] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const legacy = Boolean(bean.flavor || bean.memo);
  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!date || (!flavor.trim() && !memo.trim())) { setError("내린 날짜와 향미 또는 감상을 입력해주세요."); return; }
    onAdd({ ...emptyNoteForm(), id: Date.now(), beanId: bean.id, date, flavor: flavor.trim(), memo: memo.trim() });
    setFlavor(""); setMemo(""); setError(""); setOpen(false);
  };
  return <section className="bean-comments" aria-label={`${bean.name} 기록`}>
    <div className="comments-heading"><h4>기록 <span>{notes.length + Number(legacy)}</span></h4><button type="button" className="edit-bean" aria-expanded={open} onClick={() => setOpen(!open)}>+ 기록 남기기</button></div>
    {open && <form className="comment-form" onSubmit={save}>
      <label>내린 날짜<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>향미 노트<input value={flavor} onChange={e => setFlavor(e.target.value)} placeholder="예: 자스민, 복숭아, 꿀" /></label>
      <label>오늘의 감상<textarea rows={3} value={memo} onChange={e => setMemo(e.target.value)} placeholder="오늘 내린 커피는 어땠나요?" /></label>
      {error && <p role="alert">{error}</p>}
      <div className="form-buttons"><button type="button" className="quiet-button" onClick={() => { setOpen(false); setError(""); }}>취소</button><button className="primary-button" type="submit">기록 저장</button></div>
    </form>}
    {!notes.length && !legacy && <p className="placeholder-note">마실 때마다 달라지는 맛을 남겨보세요.</p>}
    <div className={`comment-list ${expanded ? "expanded" : "collapsed"}`}>{(expanded ? sorted : sorted.slice(0, 1)).map(note => <div className="taste-comment" key={note.id}><time dateTime={note.date}>{note.date}</time>{note.flavor && <div className="flavor-tags">{note.flavor.split(/[,·、\n]+/).map(v => v.trim()).filter(Boolean).map((tag, index) => <span key={index}>{tag}</span>)}</div>}{note.memo && <p className="bean-memo">{note.memo}</p>}</div>)}
      {legacy && (expanded || !sorted.length) && <div className="taste-comment legacy-comment"><span className="detail-label">이전에 저장한 노트 · 날짜 미지정</span>{bean.flavor && <p className="bean-memo">{bean.flavor}</p>}{bean.memo && <p className="bean-memo">{bean.memo}</p>}</div>}
    </div>
    {notes.length + Number(legacy) > 1 && <button type="button" className="more-records" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "접기" : `더보기 · 이전 기록 ${notes.length + Number(legacy) - 1}개`}</button>}
  </section>;
}

const recipeActions: RecipeStep["action"][] = ["블룸", "센터 푸어", "원형 푸어", "마무리"];
const normalizedRecipeAction = (action: string): RecipeStep["action"] => action === "스파이럴" ? "원형 푸어" : recipeActions.includes(action as RecipeStep["action"]) ? action as RecipeStep["action"] : "원형 푸어";
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
    <div className="inventory-intro recipe-intro"><div><p className="eyebrow">MY RECIPES</p><h2>나의 레시피</h2><p>자주 쓰는 추출 흐름을 내 방식으로 저장해요.</p></div></div>
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

  const totalWater = steps.reduce((sum, step) => sum + (Number(step.amount) || 0), 0);
  const reset = () => {
    setEditingId(null); setName(""); setCoffee(""); setMemo(""); setSteps(defaultRecipeSteps()); setShowErrors(false);
  };
  const close = () => { reset(); setOpen(false); };
  const updateStep = (index: number, patch: Partial<RecipeStep>) => setSteps(current => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  const setStepTime = (index: number, value: string) => {
    const requested = recipeTimeToSeconds(value);
    const min = index === 0 ? 0 : recipeTimeToSeconds(steps[index - 1].time) + 5;
    const max = index === steps.length - 1 ? Infinity : recipeTimeToSeconds(steps[index + 1].time) - 5;
    updateStep(index, { time: recipeTime(Math.min(Math.max(requested, min), max)) });
  };
  const addStep = () => {
    if (steps.length >= 6) return;
    const last = steps[steps.length - 1];
    setSteps([...steps, { time: recipeTime(recipeTimeToSeconds(last?.time ?? "0:00") + 30), action: "원형 푸어", amount: 0 }]);
  };
  const edit = (recipe: SavedRecipe) => {
    setEditingId(recipe.id); setName(recipe.name); setCoffee(String(recipe.coffee)); setMemo(recipe.memo ?? ""); setShowErrors(false);
    setSteps(recipe.steps.length >= 2 ? recipe.steps.map(step => ({ ...step, action: normalizedRecipeAction(step.action) })) : defaultRecipeSteps()); setOpen(true);
  };
  const save = () => {
    const coffeeAmount = Number(coffee);
    if (!name.trim() || coffeeAmount <= 0 || totalWater <= 0) { setShowErrors(true); return; }
    const item: SavedRecipe = { id: editingId ?? Date.now(), name: name.trim(), coffee: coffeeAmount, memo: memo.trim(), steps, createdAt: editingId ? recipes.find(recipe => recipe.id === editingId)?.createdAt ?? Date.now() : Date.now() };
    setRecipes(editingId === null ? [...recipes, item] : recipes.map(recipe => recipe.id === editingId ? item : recipe));
    close();
  };
  const sorted = [...recipes].sort((a, b) => b.createdAt - a.createdAt);

  return <>
    <section className="recipe-composer-card" aria-label="새 레시피">
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
              const cumulative = steps.slice(0, index + 1).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
              return <div className="recipe-step-row" key={index}>
                {index === 0 ? <span className="recipe-fixed-time">0:00</span> : <input className="recipe-time-input" value={step.time} inputMode="numeric" onChange={event => updateStep(index, { time: event.target.value })} onBlur={event => setStepTime(index, event.target.value)} onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setStepTime(index, recipeTime(recipeTimeToSeconds(step.time) + (event.key === "ArrowUp" ? 5 : -5))); } }} aria-label={`${index + 1}번째 푸어 시간`} />}
                <select value={step.action} onChange={event => { const action = event.target.value as RecipeStep["action"]; updateStep(index, { action, ...(action === "마무리" ? { amount: 0 } : {}) }); }} aria-label={`${index + 1}번째 푸어 동작`}>{recipeActions.map(action => <option key={action}>{action}</option>)}</select>
                {step.action === "마무리" ? <span className="recipe-no-amount">–</span> : <label className="recipe-amount-input"><input type="number" min="0" step="0.1" value={step.amount || ""} onChange={event => updateStep(index, { amount: Number(event.target.value) || 0 })} placeholder="0" aria-label={`${index + 1}번째 붓는 양`} /><span>g</span></label>}
                <span className="recipe-cumulative">{cumulative || "–"}g</span>
                <button type="button" className="recipe-remove-step" disabled={index < 2} aria-label={`${index + 1}번째 푸어 삭제`} onClick={() => setSteps(steps.filter((_, stepIndex) => stepIndex !== index))}>×</button>
              </div>;
            })}
          </div>
          {showErrors && totalWater <= 0 && <p className="recipe-timeline-error">붓는 양을 한 번 이상 입력해주세요.</p>}
          <button type="button" className="recipe-add-step" disabled={steps.length >= 6} onClick={addStep}>{steps.length >= 6 ? "5회 푸어까지 입력 가능" : "+ 푸어 추가"}</button>
        </div>
        <div className="recipe-metrics"><span>최종 물 양 <b>{totalWater ? `${fmt(totalWater)}g` : "–"}</b></span><span>브루잉 비율 <b>{Number(coffee) > 0 && totalWater > 0 ? `1:${(totalWater / Number(coffee)).toFixed(1)}` : "1:–"}</b></span></div>
        <Field label="추출 메모"><textarea rows={1} value={memo} onChange={event => setMemo(event.target.value)} placeholder="" /></Field>
        <div className="recipe-form-actions"><button type="button" className="quiet-button" onClick={close}>취소</button><button type="button" className="primary-button" onClick={save}>{editingId === null ? "레시피 저장" : "수정 저장"}</button></div>
      </div>}
    </section>
    <section className="recipe-library" aria-label="저장 레시피">
      <div className="recipe-library-list-header"><strong>저장한 레시피</strong><span>{recipes.length}개</span></div>
      <div className="recipe-library-list">
      {!sorted.length ? <div className="recipe-library-empty recipe-onboarding"><img className="onboarding-logo" src="/coffee-diary-logo-brown-96.png" width="38" height="38" alt="" /><h3>첫 레시피를 만들어보세요</h3><p>자주 쓰는 드립 방식을 저장해두면 브루잉 기록에 바로 적용할 수 있어요.</p><JourneySteps active="recipes" /><button type="button" className="primary-button" onClick={() => setOpen(true)}>첫 레시피 만들기</button></div> : sorted.map(recipe => {
        const water = recipe.steps.reduce((sum, step) => sum + (Number(step.amount) || 0), 0);
        return <article className="saved-recipe-card" key={recipe.id}>
          <div className="saved-recipe-top"><div><h3>{recipe.name}</h3><p>원두 {fmt(recipe.coffee)}g · 물 {fmt(water)}g · {water && recipe.coffee ? `1:${(water / recipe.coffee).toFixed(1)}` : "1:–"}</p></div><div className="saved-recipe-actions"><button type="button" onClick={() => edit(recipe)}>수정</button><button type="button" onClick={() => setRecipes(recipes.filter(item => item.id !== recipe.id))}>삭제</button></div></div>
          <div className="saved-recipe-timeline">{recipe.steps.map((step, index) => { const cumulative = recipe.steps.slice(0, index + 1).reduce((sum, item) => sum + (Number(item.amount) || 0), 0); const action = normalizedRecipeAction(step.action); return <div className="saved-recipe-step" key={`${recipe.id}-${index}`}><span>{step.time}</span><i aria-hidden="true" /><p><b>{action}</b><em>{action === "마무리" ? "–" : `${fmt(step.amount)}g`} · 누적 {fmt(cumulative)}g</em></p></div>; })}</div>
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

  const add = () => {
    const recipeReady = recipeMode === "saved" ? Boolean(selectedRecipeId) : Boolean(form.amount) && Boolean(form.waterAmount);
    if (!form.beanId || !form.amount || !form.date || (editingId === null && !recipeReady)) { setBrewError("원두와 레시피 선택을 확인해주세요."); return; }
    const nextBeanId = Number(form.beanId);
    const bean = beans.find(b => b.id === nextBeanId);
    const amt = parseFloat(form.amount);
    if (!bean) return;
    if (Number.isNaN(amt) || amt <= 0) return;
    const water = form.waterAmount.trim() ? parseFloat(form.waterAmount) : undefined;
    if (water !== undefined && (Number.isNaN(water) || water <= 0)) return;
    const previous = editingId === null ? null : brews.find(item => item.id === editingId) ?? null;
    const previousNote = previous ? notes.find(note => note.brewId === previous.id) : null;
    const restoredBeans = previous ? beans.map(item => item.id === previous.beanId ? { ...item, remaining: Math.round((item.remaining + previous.amount) * 10) / 10 } : item) : beans;
    const available = restoredBeans.find(item => item.id === nextBeanId);
    if (!available || available.remaining < amt) { alert(`잔여량(${fmt(available?.remaining ?? 0)}g)이 부족해요!`); return; }
    const startsConsuming = available.status === "배송 중" || available.status === "디개싱 중";
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
  };
  const edit = (brew: Brew) => {
    setEditingId(brew.id);
    setForm({ beanId: String(brew.beanId), amount: String(brew.amount), waterAmount: brew.waterAmount ? String(brew.waterAmount) : "", method: brew.method, date: brew.date, recipe: brew.recipe });
    const note = notes.find(item => item.brewId === brew.id);
    setNoteMemo(note?.memo ?? ""); setNoteRating(note?.rating ?? 0); setSelectedRecipeId(""); setRecipeMode("custom"); setBrewError("");
    setShow(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    const water = recipe.steps.reduce((sum, step) => sum + (Number(step.amount) || 0), 0);
    setForm(current => ({ ...current, amount: String(recipe.coffee), waterAmount: water ? String(water) : "", recipe: recipe.name }));
  };

  return (
    <div className="brew-log">
      <div className="inventory-intro brew-log-heading">
        <div><p className="eyebrow">BREWING LOG</p><h2>오늘의 브루잉</h2><p>총 {brews.length}회 브루잉을 기록했어요.</p></div>
        <div className="brew-log-heading-actions"><button type="button" className="secondary-button brew-add-button" onClick={() => setShow(!show)}>+ 기록 추가</button></div>
      </div>

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
          <div className="brew-recipe-picker"><span className="brew-recipe-picker-label">레시피 선택*</span><div className="recipe-mode-options"><button type="button" aria-pressed={recipeMode === "saved"} onClick={() => { setRecipeMode("saved"); setBrewError(""); }}>저장한 레시피</button><button type="button" aria-pressed={recipeMode === "custom"} onClick={() => { setRecipeMode("custom"); setSelectedRecipeId(""); setForm(current => ({ ...current, recipe: "" })); setBrewError(""); }}>직접 입력</button></div>{recipeMode === "saved" ? <div className="recipe-mode-content"><select value={selectedRecipeId} onChange={event => applySavedRecipe(event.target.value)}><option value="">선택하세요</option>{recipes.map(recipe => { const water = recipe.steps.reduce((sum, step) => sum + (Number(step.amount) || 0), 0); return <option key={recipe.id} value={recipe.id}>{recipe.name} · 원두 {fmt(recipe.coffee)}g · 물 {fmt(water)}g</option>; })}</select>{selectedRecipeId && <p>레시피의 원두 양과 물 양을 적용했어요.</p>}</div> : <div className="brew-custom-recipe-fields"><Field label="사용량 (g)*"><input type="number" min="0.1" step="0.1" value={form.amount} onChange={event => { setForm({ ...form, amount: event.target.value }); setBrewError(""); }} placeholder="예: 15" /></Field><Field label="투입 물 양 (g)*"><input type="number" min="0.1" step="0.1" value={form.waterAmount} onChange={event => { setForm({ ...form, waterAmount: event.target.value }); setBrewError(""); }} placeholder="예: 220" /></Field><div className="custom-recipe-name"><Field label="레시피 이름"><input value={form.recipe} onChange={event => setForm({ ...form, recipe: event.target.value })} placeholder="예: 나만의 4:6 레시피" /></Field></div></div>}</div>
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
    <div className="inventory-intro stats-header"><div><p className="eyebrow">BREWING INSIGHTS</p><h2>나의 브루잉 흐름</h2><p>기간을 골라 내 기록을 가볍게 돌아봐요.</p></div><select aria-label="통계 기간" value={period} onChange={event => setPeriod(event.target.value as "all" | "7" | "30" | "90")}><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option><option value="all">전체 기간</option></select></div>
    <div className="stats-cards"><div><span>브루잉 횟수</span><strong>{filtered.length}<small>회</small></strong></div><div><span>사용한 원두</span><strong>{beanUsage.length}<small>종</small></strong></div><div><span>사용량</span><strong>{fmt(Math.round(totalAmount * 10) / 10)}<small>g</small></strong></div></div>
    <section className="stats-section"><h3>원두별 사용량</h3>{beanUsage.length === 0 ? <p className="stats-empty">선택한 기간에 브루잉 기록이 없어요.</p> : <div className="usage-list">{beanUsage.map(item => <div className="usage-row" key={item.name}><span>{item.name}</span><b>{fmt(Math.round(item.amount * 10) / 10)}g</b></div>)}</div>}</section>
    <section className="stats-section"><h3>일별 사용량</h3>{usageRows(dailyUsage, dailyMax, key => { const date = parseLocalDate(key); return `${date.getMonth() + 1}/${date.getDate()}`; })}</section>
  </div>;
}

function TastingNotes({ beans, notes, setNotes, brews, linkedBrewId, setLinkedBrewId }: {
  beans: Bean[];
  notes: TastingNote[];
  setNotes: StorageSetter<TastingNote[]>;
  brews: Brew[];
  linkedBrewId: number | null;
  setLinkedBrewId: (brewId: number | null) => void;
}) {
  const linkedBrew = linkedBrewId ? brews.find(b => b.id === linkedBrewId) : null;
  const linkedBean = linkedBrew ? beans.find(b => b.id === linkedBrew.beanId) : null;
  const noteTextFields: Array<[TastingNoteTextKey, string, string]> = [["flavor","Flavor","Fruity, Chocolate..."],["aroma","Aroma","Floral, Nutty..."],["acidity","Acidity","Bright, Mild..."],["body","Body","Light, Full..."],["finish","Finish","Clean, Long..."]];

  const [show, setShow] = useState(!!linkedBrewId);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [form, setForm] = useState<TastingNoteForm>({
    beanId: linkedBean?.id?.toString() || "",
    brewId: linkedBrewId || null,
    rating: 3, flavor: "", aroma: "", acidity: "", body: "", finish: "", memo: "",
    date: linkedBrew?.date || new Date().toISOString().slice(0, 10)
  });

  useEffect(() => {
    if (!linkedBrewId || !linkedBrew) return;
    const existing = notes.find(note => note.brewId === linkedBrewId);
    setEditingNoteId(existing?.id ?? null);
    setForm({
      ...(existing ?? emptyNoteForm()),
      beanId: linkedBrew.beanId.toString(),
      brewId: linkedBrewId,
      date: existing?.date ?? linkedBrew.date
    });
    setShow(true);
  }, [linkedBrewId, linkedBrew, notes]);

  const add = () => {
    if (!form.beanId) return;
    const note = { ...form, id: editingNoteId ?? Date.now(), beanId: Number(form.beanId), rating: Number(form.rating) };
    setNotes(editingNoteId === null ? [...notes, note] : notes.map(item => item.id === editingNoteId ? note : item));
    setForm(emptyNoteForm());
    setEditingNoteId(null); setLinkedBrewId(null); setShow(false);
  };

  const remove = (id: number) => setNotes(notes.filter(n => n.id !== id));
  const sorted = sortByDateDesc(notes);

  const openNew = () => {
    setLinkedBrewId(null);
    setEditingNoteId(null);
    setForm(emptyNoteForm());
    setShow(true);
  };
  const editNote = (note: TastingNote) => {
    setEditingNoteId(note.id);
    setLinkedBrewId(null);
    setForm({ ...note, beanId: String(note.beanId) });
    setShow(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)", fontFamily: FONT }}>총 {notes.length}개의 노트</p>
        <Btn onClick={openNew} filled={show && !linkedBrewId}>+ 노트 추가</Btn>
      </div>

      {linkedBrew && !notes.some(n => n.brewId === linkedBrewId) && (
        <div style={{ background: "#E1F5EE", border: "0.5px solid #9FE1CB", borderRadius: "var(--border-radius-md)", padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#085041", fontFamily: FONT }}>
            <strong>{linkedBean?.name}</strong> 브루잉 기록에서 연결됐어요 — {linkedBrew.date} · 원두 {fmt(linkedBrew.amount)}g {linkedBrew.waterAmount ? `· 물 ${fmt(linkedBrew.waterAmount)}g · ${brewRatio(linkedBrew.amount, linkedBrew.waterAmount)}` : ""}
          </span>
        </div>
      )}

      {(show || linkedBrewId) && (
        <FormCard>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="원두*">
              {linkedBean
                ? <div style={{ padding: "7px 10px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", fontSize: 13, background: "var(--color-background-secondary)", fontFamily: FONT }}>{linkedBean.name}</div>
                : <select value={form.beanId} onChange={e => setForm({ ...form, beanId: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }}>
                    <option value="">선택하세요</option>
                    {beans.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
              }
            </Field>
            <Field label="날짜"><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} /></Field>
            {noteTextFields.map(([k, label, ph]) => (
              <Field key={k} label={label}><input placeholder={ph} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} /></Field>
            ))}
            <Field label={`별점  ${"★".repeat(form.rating)}${"☆".repeat(5 - form.rating)}`}>
              <input type="range" min={1} max={5} step={1} value={form.rating} onChange={e => setForm({ ...form, rating: Number(e.target.value) })} style={{ width: "100%" }} />
            </Field>
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="메모">
              <textarea value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} rows={2} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: FONT }} placeholder="자유롭게 기록..." />
            </Field>
          </div>
          <FormActions onSave={add} onCancel={() => { setShow(false); setEditingNoteId(null); setLinkedBrewId(null); }} saveLabel={editingNoteId === null ? "저장" : "수정 저장"} />
        </FormCard>
      )}

      {sorted.length === 0 ? <Empty text="컵 노트를 추가해보세요" /> : sorted.map(n => {
        const bean = beans.find(b => b.id === n.beanId);
        const brew = n.brewId ? brews.find(b => b.id === n.brewId) : null;
        const attrs = [["Flavor", n.flavor], ["Aroma", n.aroma], ["Acidity", n.acidity], ["Body", n.body], ["Finish", n.finish]].filter(([, v]) => v);
        return (
          <div key={n.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 500, fontFamily: FONT }}>{bean?.name || "삭제된 원두"}</p>
                  <span style={{ fontSize: 13, color: "#8B6F47" }}>{"★".repeat(n.rating)}{"☆".repeat(5 - n.rating)}</span>
                </div>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-tertiary)", fontFamily: FONT }}>
                  {n.date}
                  {brew && <span style={{ marginLeft: 8, background: "#E1F5EE", color: "#0F6E56", padding: "1px 7px", borderRadius: 8, fontSize: 11, fontFamily: FONT }}>Brew linked</span>}
                </p>
                {attrs.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                    {attrs.map(([k, v]) => (
                      <span key={k} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", fontFamily: FONT }}>
                        <span style={{ color: "var(--color-text-tertiary)" }}>{k} </span>{v}
                      </span>
                    ))}
                  </div>
                )}
                {n.memo && <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)", fontStyle: "italic", fontFamily: FONT }}>{n.memo}</p>}
              </div>
              <div className="note-actions"><button onClick={() => editNote(n)} className="note-edit-button">수정</button><button onClick={() => remove(n.id)} className="note-delete-button">삭제</button></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children, onMore }: { title: string; children: ReactNode; onMore?: () => void }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, fontFamily: FONT }}>{title}</p>
        {onMore && <button onClick={onMore} style={{ fontSize: 12, border: "none", background: "none", color: "#8B6F47", cursor: "pointer", padding: 0, fontFamily: FONT }}>더 보기</button>}
      </div>
      {children}
    </div>
  );
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
      <label style={{ fontSize: 12, color: invalid ? "#b65f50" : "var(--color-text-secondary)", display: "block", marginBottom: 4, fontFamily: FONT }}>{label}{required && <span aria-hidden="true" style={{ color: invalid ? "#b65f50" : "#8b6f47", marginLeft: 2 }}>*</span>}</label>
      {children}
    </div>
  );
}

function FormActions({ onSave, onCancel, saveLabel }: { onSave: () => void; onCancel: () => void; saveLabel: string }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <button onClick={onSave} style={{ padding: "6px 20px", fontSize: 13, border: "none", borderRadius: 20, background: "#8B6F47", color: "#fff", cursor: "pointer", fontFamily: FONT }}>{saveLabel}</button>
      <button onClick={onCancel} style={{ padding: "6px 20px", fontSize: 13, border: "0.5px solid var(--color-border-tertiary)", borderRadius: 20, background: "transparent", cursor: "pointer", fontFamily: FONT }}>취소</button>
    </div>
  );
}

function Btn({ onClick, filled, children }: { onClick: () => void; filled: boolean; children: ReactNode }) {
  return <button onClick={onClick} style={{ padding: "6px 16px", fontSize: 13, border: filled ? "1px solid #8B6F47" : "0.5px solid #8B6F47", borderRadius: 20, background: filled ? "#8B6F47" : "transparent", color: filled ? "#fff" : "#8B6F47", cursor: "pointer", fontFamily: FONT }}>{children}</button>;
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
