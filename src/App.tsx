import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./data/auth";
import { retryFailedSync, useStorage, useSyncFailed } from "./data/sync";
import { readLocal } from "./data/storage";
import { Header } from "./components/Header";
import { SettingsDesk, SettingsPage, SettingsSheet } from "./components/settings/SettingsSheet";
import { PEAK_KEY, STORAGE_KEYS } from "./data/keys";
import { readStartPage } from "./data/settings";
import { FONT } from "./lib/format";
import { type Page, PAGE_HASHES, pageFromHash, readAppLink, appLinkHash, PENDING_LINK_KEY } from "./lib/pages";
import { BeansPage } from "./pages/BeansPage";
import { type BrewIntent, BrewLog } from "./pages/BrewLog";
import { HomePage } from "./pages/HomePage";
import { BrewStats } from "./pages/BrewStats";
import { RecipePage } from "./pages/RecipePage";
import { useDesk, useDeskKeys } from "./components/desk/Desk";
import { type Bean, type BeanStatus, type Brew, type PeakSettings, type SavedRecipe, type TastingNote } from "./types";

// "배송 중" was retired (shipping is brief and always ends in degassing); older records read as "디개싱 중" and are saved that way on their next edit.
const LEGACY_SHIPPING_STATUS = "배송 중";
const WIDE_QUERY = "(min-width: 541px)";

const normalizeBeans = (beans: Bean[]) => beans.some(bean => (bean.status as string) === LEGACY_SHIPPING_STATUS) ? beans.map(bean => (bean.status as string) === LEGACY_SHIPPING_STATUS ? { ...bean, status: "디개싱 중" as BeanStatus } : bean) : beans;

export default function App() {
  // A bare link opens the tab chosen in settings; a link with #beans, #brews, … opens that tab.
  const [page, setPage] = useState<Page>(() => window.location.hash ? pageFromHash(window.location.hash) : readStartPage());
  const [link, setLink] = useState(() => readAppLink(window.location.hash));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  // Phones open settings as a sheet from the header menu; wider screens show it as the last tab, in place of the page.
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const desk = useDesk();
  useDeskKeys(desk && !settingsOpen);
  const [openBrewForm, setOpenBrewForm] = useState(false);
  const [brewRecipeId, setBrewRecipeId] = useState<number | null>(null);
  const [brewCafe, setBrewCafe] = useState(false);
  const [brewBeanId, setBrewBeanId] = useState<number | null>(null);
  const [brewIntent, setBrewIntent] = useState<BrewIntent | null>(null);
  // The bean the home tab tapped, opened when the bean tab mounts.
  const [openBeanId, setOpenBeanId] = useState<number | null>(null);
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
    setLink(readAppLink(nextHash));
    setSettingsOpen(false);
  };

  useEffect(() => {
    const syncPageFromUrl = () => { setPage(pageFromHash(window.location.hash)); setLink(readAppLink(window.location.hash)); setSettingsOpen(false); };
    window.addEventListener("popstate", syncPageFromUrl);
    window.addEventListener("hashchange", syncPageFromUrl);
    return () => {
      window.removeEventListener("popstate", syncPageFromUrl);
      window.removeEventListener("hashchange", syncPageFromUrl);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let pending: string | null = null;
    if (user) {
      try { pending = sessionStorage.getItem(PENDING_LINK_KEY); sessionStorage.removeItem(PENDING_LINK_KEY); } catch { /* Optional view context. */ }
    }
    if (pending) {
      const context = readAppLink(pending);
      if (!context.invalid && (context.beanId || context.brewId || context.range)) {
        window.history.replaceState({}, "", appLinkHash(context));
        setLink(context); setPage(context.page);
        return;
      }
    }
    const hash = window.location.hash;
    if (!Object.values(PAGE_HASHES).includes(hash.split("?")[0].toLowerCase())) {
      const resolved = readStartPage();
      window.history.replaceState({}, "", PAGE_HASHES[resolved]);
      setPage(resolved); setLink(readAppLink(PAGE_HASHES[resolved]));
    }
  }, [authLoading, user?.id]);

  const settingsProps = { user, data: { beans, brews, notes, recipes, drippers: readLocal<string[]>(STORAGE_KEYS.drippers) ?? [], filters: readLocal<string[]>(STORAGE_KEYS.filters) ?? [], waters: readLocal<string[]>(STORAGE_KEYS.waters) ?? [], peak: readLocal<PeakSettings>(PEAK_KEY) ?? {} }, setBeans };

  return (
    <div className={`app-shell${desk ? " is-desk" : ""}`} style={{ fontFamily: FONT, margin: "0 auto", padding: "0 0 3rem" }}>
      <Header page={page} setPage={navigate} user={user} authLoading={authLoading} settingsOpen={settingsOpen && wide} onOpenSettings={() => setSettingsOpen(true)} />
      {syncFailed && <div className="sync-alert" role="alert"><span>최근 변경을 서버에 저장하지 못했어요. 이 기기에는 남아 있어요.</span><button type="button" onClick={retryFailedSync}>다시 시도</button></div>}
      {settingsOpen && (desk ? <SettingsDesk {...settingsProps} /> : wide ? <SettingsPage {...settingsProps} /> : <SettingsSheet {...settingsProps} onClose={closeSettings} />)}
      {/* Pages step aside while settings is open so the lists it edits have a single owner; they remount with the new values. */}
      {!settingsOpen && <div className="page-transition" key={`${page}:${appLinkHash(link)}`}>
        {(link.invalid || (link.beanId && !beans.some(bean => bean.id === link.beanId && !bean.deleted)) || (link.brewId && !brews.some(brew => brew.id === link.brewId))) && <p className="view-link-notice" role="status">{link.invalid ? "연결된 항목의 주소가 올바르지 않아 기본 화면을 열었어요." : "연결된 항목을 아직 찾지 못했어요. 웹앱 계정과 동기화 상태를 확인해주세요."}</p>}
        {page === "Home" && <HomePage beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} notes={notes} setNotes={setNotes} userId={user?.id ?? null} onNavigate={navigate}
          onOpenBrew={(beanId, intent) => { setBrewBeanId(beanId); setBrewIntent(intent ?? null); setOpenBrewForm(true); navigate("Brew Log"); }} onOpenBean={beanId => { setOpenBeanId(beanId); navigate("Beans"); }} desk={desk} recipeCount={recipes.length} />}
        {page === "Beans" && <BeansPage initialOpenId={link.beanId ?? openBeanId} beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} notes={notes} setNotes={setNotes} userId={user?.id ?? null} desk={desk} recipeCount={recipes.length} onGoto={navigate} onBrew={beanId => { setBrewBeanId(beanId ?? null); setOpenBrewForm(true); navigate("Brew Log"); }} />}
        {page === "Brew Log" && <BrewLog initialDetailId={link.brewId} beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} notes={notes} setNotes={setNotes} recipes={recipes} userId={user?.id ?? null} openInitially={openBrewForm} initialBeanId={brewBeanId} initialRecipeId={brewRecipeId} initialCafe={brewCafe} intent={brewIntent} desk={desk} onGoto={navigate} onOpened={() => { setOpenBrewForm(false); setBrewBeanId(null); setBrewRecipeId(null); setBrewCafe(false); setBrewIntent(null); }} />}
        {page === "Recipes" && <RecipePage recipes={recipes} setRecipes={setRecipes} brews={brews} setBrews={setBrews} notes={notes} beans={beans} userId={user?.id ?? null} desk={desk} onGoto={navigate} onBrewWith={recipeId => { setBrewRecipeId(recipeId); setOpenBrewForm(true); navigate("Brew Log"); }} onCafe={() => { setBrewCafe(true); setOpenBrewForm(true); navigate("Brew Log"); }} />}
        {page === "Brew Stats" && <BrewStats initialRange={link.range} beans={beans} brews={brews} notes={notes} />}
      </div>}
    </div>
  );
}
