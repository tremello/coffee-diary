import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./data/auth";
import { retryFailedSync, useStorage, useSyncFailed } from "./data/sync";
import { Header } from "./components/Header";
import { STORAGE_KEYS } from "./data/keys";
import { FONT } from "./lib/format";
import { type Page, PAGE_HASHES, pageFromHash } from "./lib/pages";
import { BeansPage } from "./pages/BeansPage";
import { BrewLog } from "./pages/BrewLog";
import { BrewStats } from "./pages/BrewStats";
import { RecipePage } from "./pages/RecipePage";
import { type Bean, type BeanStatus, type Brew, type SavedRecipe, type TastingNote } from "./types";

// "배송 중" was retired (shipping is brief and always ends in degassing); older records read as "디개싱 중" and are saved that way on their next edit.
const LEGACY_SHIPPING_STATUS = "배송 중";

const normalizeBeans = (beans: Bean[]) => beans.some(bean => (bean.status as string) === LEGACY_SHIPPING_STATUS) ? beans.map(bean => (bean.status as string) === LEGACY_SHIPPING_STATUS ? { ...bean, status: "디개싱 중" as BeanStatus } : bean) : beans;

export default function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash));
  const [openBrewForm, setOpenBrewForm] = useState(false);
  const [brewBeanId, setBrewBeanId] = useState<number | null>(null);
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
        {page === "Beans" && <BeansPage beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} notes={notes} setNotes={setNotes} userId={user?.id ?? null} onBrew={beanId => { setBrewBeanId(beanId ?? null); setOpenBrewForm(true); navigate("Brew Log"); }} />}
        {page === "Brew Log" && <BrewLog beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} notes={notes} setNotes={setNotes} recipes={recipes} userId={user?.id ?? null} openInitially={openBrewForm} initialBeanId={brewBeanId} onOpened={() => { setOpenBrewForm(false); setBrewBeanId(null); }} />}
        {page === "Recipes" && <RecipePage recipes={recipes} setRecipes={setRecipes} brews={brews} setBrews={setBrews} />}
        {page === "Brew Stats" && <BrewStats beans={beans} brews={brews} />}
      </div>
    </div>
  );
}
