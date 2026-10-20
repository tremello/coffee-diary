import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "./src/supabase";

const STORAGE_KEYS = { beans: "cf_beans", brews: "cf_brews", notes: "cf_notes" };
const DEFAULT_PROCESSES = ["워시드", "내추럴", "허니", "무산소 내추럴", "무산소 워시드"];
const DEFAULT_ORIGINS = ["에티오피아", "파나마", "콜롬비아", "케냐"];
const BEAN_STATUSES = ["배송 중", "디개싱 중", "소비 중"] as const;
type BeanStatus = (typeof BEAN_STATUSES)[number];
const BEAN_QUALITIES = ["특식", "준특식", "사료"] as const;
type BeanQuality = (typeof BEAN_QUALITIES)[number];
const localDate = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const beanName = (bean: BeanForm) => [bean.origin, bean.farm, bean.variety, bean.process].map(value => value?.trim()).filter(Boolean).join(" ");
const FONT = "'Nanum Barun Gothic', 'Apple SD Gothic Neo', sans-serif";
const PAGES = ["Beans", "Brew Log", "Brew Stats"] as const;
const PAGE_LABELS = { Beans: "원두 재고", "Brew Log": "브루잉 기록", "Brew Stats": "브루잉 통계" };

type Page = (typeof PAGES)[number];
type StorageSetter<T> = (value: T) => void;
type BeanSort = "registered" | "latest" | "roastOldest" | "remaining";

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
  const [page, setPage] = useState<Page>("Beans");
  const [openBrewForm, setOpenBrewForm] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const [beans, setBeans] = useStorage<Bean[]>(STORAGE_KEYS.beans, [], user?.id ?? null);
  const [brews, setBrews] = useStorage<Brew[]>(STORAGE_KEYS.brews, [], user?.id ?? null);
  const [notes, setNotes] = useStorage<TastingNote[]>(STORAGE_KEYS.notes, [], user?.id ?? null);

  return (
    <div style={{ fontFamily: FONT, maxWidth: 960, margin: "0 auto", padding: "0 0 3rem" }}>
      <Header page={page} setPage={setPage} user={user} authLoading={authLoading} />
      {page === "Beans" && <BeansPage beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} notes={notes} setNotes={setNotes} userId={user?.id ?? null} onBrew={() => { setOpenBrewForm(true); setPage("Brew Log"); }} />}
      {page === "Brew Log" && <BrewLog beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} notes={notes} setNotes={setNotes} openInitially={openBrewForm} onOpened={() => setOpenBrewForm(false)} />}
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
    <div style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 0 0" }}>
        <div>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT }}>My Coffee Diary</p>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: "2px 0 0", color: "var(--color-text-primary)", fontFamily: FONT }}>{PAGE_LABELS[page]}</h1>
        </div>
        <div className="account-actions">{user ? <button className="account-button" onClick={signOut}>{user.email?.split("@")[0] ?? "내 계정"} · 로그아웃</button> : <button className="google-button" onClick={signInGoogle}>Google 로그인</button>}<button className="refresh-button" onClick={() => window.location.reload()} aria-label="새로고침" title="새로고침">↻</button><img className="brand-mark" src="/coffee-diary-logo-brown.png" alt="커피 기록 로고" /></div>
      </div>
      <nav className="page-tabs">
        {PAGES.map(p => (
          <button key={p} className="page-tab" onClick={() => setPage(p)} style={{
            padding: "8px 16px", fontSize: 14, borderRadius: 10, fontFamily: FONT,
            border: page === p ? "1px solid #8B6F47" : "0.5px solid var(--color-border-tertiary)",
            background: page === p ? "#8B6F47" : "transparent",
            color: page === p ? "#fff" : "var(--color-text-secondary)",
            cursor: "pointer"
          }}>{PAGE_LABELS[p]}</button>
        ))}
      </nav>
    </div>
  );
}

function BeansPage({ beans, setBeans, brews, setBrews, notes, setNotes, userId, onBrew }: { beans: Bean[]; setBeans: StorageSetter<Bean[]>; brews: Brew[]; setBrews: StorageSetter<Brew[]>; notes: TastingNote[]; setNotes: StorageSetter<TastingNote[]>; userId: string | null; onBrew: () => void }) {
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BeanForm>(emptyBeanForm);
  const [filter, setFilter] = useState("active");
  const [sort, setSort] = useState<BeanSort>("registered");
  const [error, setError] = useState("");
  const [customOrigins, setCustomOrigins] = useStorage<string[]>("cf_origins", [], userId);
  const [addingOrigin, setAddingOrigin] = useState(false);
  const [newOrigin, setNewOrigin] = useState("");
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null);
  const origins = [...new Set([...DEFAULT_ORIGINS, ...customOrigins, ...beans.map(b => b.origin).filter(Boolean)])];
  const [hiddenRoasteries, setHiddenRoasteries] = useStorage<string[]>("cf_hidden_roasteries", [], userId);
  const roasteries = [...new Set(beans.map(bean => bean.roastery?.trim()).filter((roastery): roastery is string => Boolean(roastery)))].filter(roastery => !hiddenRoasteries.includes(roastery));
  const addOrigin = () => {
    const origin = newOrigin.trim();
    if (!origin) return;
    if (!origins.includes(origin)) setCustomOrigins([...customOrigins, origin]);
    setForm({ ...form, origin }); setNewOrigin(""); setAddingOrigin(false);
  };
  const hideRoastery = (roastery: string) => setHiddenRoasteries([...hiddenRoasteries, roastery]);
  const [deletedId, setDeletedId] = useState<number | null>(null);
  const [deletedBrews, setDeletedBrews] = useState<Brew[]>([]);
  const [deletedNotes, setDeletedNotes] = useState<TastingNote[]>([]);
  const available = beans.filter(b => !b.deleted);
  const active = available.filter(b => b.remaining > 0);
  const shippingAndDegassingWeight = active.filter(bean => bean.status === "배송 중" || bean.status === "디개싱 중").reduce((sum, bean) => sum + bean.remaining, 0);
  const consumingWeight = active.filter(bean => (bean.status ?? "소비 중") === "소비 중").reduce((sum, bean) => sum + bean.remaining, 0);
  const visible = available.filter(b => filter === "all" || (filter === "active" ? b.remaining > 0 : b.remaining <= 0));
  const sortedVisible = [...visible].sort((a, b) => {
    if (sort === "latest") return b.id - a.id;
    if (sort === "remaining") return a.remaining - b.remaining || b.id - a.id;
    if (sort === "roastOldest") {
      if (!a.roastDate && !b.roastDate) return a.id - b.id;
      if (!a.roastDate) return 1;
      if (!b.roastDate) return -1;
      return a.roastDate.localeCompare(b.roastDate) || a.id - b.id;
    }
    return a.id - b.id;
  });
  const close = () => { setShow(false); setEditingId(null); setForm(emptyBeanForm); setError(""); setAddingOrigin(false); setNewOrigin(""); };
  const edit = (bean: Bean) => {
    setForm({ ...bean, status: bean.status ?? "소비 중", purchased: String(bean.purchased), consumed: String(bean.consumed ?? 0) });
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
        <div><span>보유 중인 원두</span><strong>{active.length}<small>종</small></strong></div>
        <div><span>총 남은 무게</span><strong>{fmt(Math.round(active.reduce((sum, b) => sum + b.remaining, 0) * 10) / 10)}<small>g</small></strong></div>
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
          {([["farm", "농장 및 지역", "예: 세로아줄"], ["variety", "품종", "예: 게이샤"]] as const).map(([key, label, placeholder]) => <label key={key} className="full-width">{label}<input value={form[key] ?? ""} placeholder={placeholder} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
          <fieldset className="origin-field full-width"><legend>가공방식</legend>
            <div className="origin-options">{DEFAULT_PROCESSES.map(process => <button type="button" key={process} aria-pressed={form.process === process} onClick={() => setForm({ ...form, process })}>{process}</button>)}</div>
            <label className="process-custom">가공방식 직접 입력<input value={DEFAULT_PROCESSES.includes(form.process) ? "" : form.process} placeholder="예: 카보닉 매서레이션" onChange={e => setForm({ ...form, process: e.target.value })} /><span>이 원두에만 적용돼요.</span></label>
          </fieldset>
          <div className="generated-name full-width"><span>자동으로 만들어지는 원두 이름</span><output>{beanName(form) || "원두 정보를 입력해주세요"}</output></div>
          <label className="full-width">로스터리<input value={form.roastery} placeholder="로스터리 이름" onChange={e => setForm({ ...form, roastery: e.target.value })} />{editingId === null && roasteries.length > 0 && <span className="existing-purchasers"><span>기존 구매처</span><span className="existing-purchaser-options">{roasteries.map(roastery => <span className="existing-purchaser-option" key={roastery}><button type="button" onClick={() => setForm({ ...form, roastery })}>{roastery}</button><button type="button" className="remove-purchaser" aria-label={`${roastery} 기존 구매처에서 삭제`} onClick={() => hideRoastery(roastery)}>×</button></span>)}</span></span>}</label>
          <fieldset className="origin-field full-width"><legend>원두 상태</legend><div className="origin-options">{BEAN_STATUSES.map(status => <button type="button" key={status} aria-pressed={form.status === status} onClick={() => setForm({ ...form, status })}>{status}</button>)}</div></fieldset>
          <div className="bean-dates full-width">
          <label>구매량 (g) *<input type="number" min="0.1" step="0.1" required value={form.purchased} placeholder="200" onChange={e => setForm({ ...form, purchased: e.target.value })} /></label>
          <label>소비량 (g)<input type="number" min="0" step="0.1" value={form.consumed} placeholder="0" onChange={e => setForm({ ...form, consumed: e.target.value })} /><span className="input-hint">이미 소비한 원두</span></label>
          </div>
          <label className="full-width">로스터리 컵노트<input value={form.roasteryNotes ?? ""} placeholder="예: 자스민, 복숭아, 꿀" onChange={e => setForm({ ...form, roasteryNotes: e.target.value })} /></label>
          <div className="bean-purchase-row full-width"><label>구매가격 (원)<input type="number" min="0" step="100" value={form.price} placeholder="예: 28000" onChange={e => setForm({ ...form, price: e.target.value })} /></label><fieldset className="origin-field"><legend>내 기준 분류</legend><div className="origin-options">{BEAN_QUALITIES.map(quality => <button type="button" key={quality} aria-pressed={form.quality === quality} onClick={() => setForm({ ...form, quality })}>{quality}</button>)}</div></fieldset></div>
          <div className="bean-dates full-width">
            <label>구매일<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
            <label>로스팅 날짜<input type="date" value={form.roastDate ?? ""} onChange={e => setForm({ ...form, roastDate: e.target.value })} /></label>
          </div>

        </div>
        {error && <p role="alert">{error}</p>}
        <div className="form-buttons">{editingId !== null && <button type="button" className="delete-bean-button" onClick={remove}>삭제</button>}<button type="button" className="quiet-button" onClick={close}>취소</button><button type="submit" className="primary-button">저장</button></div>
      </form>}
      <div className="inventory-toolbar"><div className="inventory-filters" aria-label="원두 재고 필터">
        {[["active", "보유 중"], ["finished", "다 마신 원두"], ["all", "전체"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div><div className="inventory-toolbar-meta"><label htmlFor="bean-sort">정렬</label><select id="bean-sort" className="inventory-sort" value={sort} onChange={event => setSort(event.target.value as BeanSort)}><option value="registered">등록순</option><option value="latest">최신순</option><option value="roastOldest">로스팅 날짜가 빠른 순</option><option value="remaining">재고가 적은 순</option></select><span>{visible.length}종</span></div></div>
      <div className="bean-list">
        {sortedVisible.map(bean => {
          const pct = bean.purchased > 0 ? Math.max(0, Math.min(100, bean.remaining / bean.purchased * 100)) : 0;
          return <article className="inventory-card" key={bean.id}>
            <div className="bean-info">
              <p className="roastery">{bean.roastery || "로스터리 미입력"}</p>
              <h3>{bean.name}</h3>
              <BeanDates bean={bean} />
              {bean.roasteryNotes && <div className="roastery-cup-notes"><span className="detail-label">로스터리 컵노트</span><div className="flavor-tags">{bean.roasteryNotes.split(/[\s,·、\n]+/).map(value => value.trim()).filter(Boolean).map((note, index) => <span key={index}>{note}</span>)}</div></div>}
              <button className="edit-bean" onClick={() => edit(bean)} aria-label={`${bean.name} 기본 정보 수정`}>기본 정보 수정 ↗</button>
              <BeanComments bean={bean} notes={notes.filter(note => note.beanId === bean.id)} onAdd={note => setNotes([...notes, note])} />
            </div>
            <div className="bean-stock">
              <div className="stock-status-row">{editingStatusId === bean.id ? <select className="stock-status-select" value={bean.status ?? "소비 중"} aria-label={`${bean.name} 상태`} onChange={event => updateStatus(bean.id, event.target.value as BeanStatus)}>{BEAN_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select> : <><span className={`stock-status ${pct <= 20 ? "low" : ""}`}>{bean.remaining <= 0 ? "다 마셨어요" : bean.status ?? "소비 중"}</span><button type="button" className="status-edit-button" onClick={() => setEditingStatusId(bean.id)}>수정</button></>}</div>
              <p className="remaining-label">남은 원두</p>
              <p className="remaining-weight">{fmt(bean.remaining)}<span>g</span></p>
              <p className="purchased-weight">구매 {fmt(bean.purchased)}g</p>
              <div className="stock-meter" role="progressbar" aria-label={`${bean.name} 잔량`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
              <p className="stock-percent">{Math.round(pct)}% 남음</p>

            </div>
          </article>;
        })}
        {visible.length === 0 && <div className="inventory-empty"><span aria-hidden="true">☕</span><h3>{available.length === 0 ? "나의 첫 원두를 올려보세요" : "해당하는 원두가 없어요"}</h3><p>원두 정보와 향미 노트, 남은 양을 한곳에서 관리해요.</p>{available.length === 0 && <button className="primary-button" onClick={() => { close(); setShow(true); }}>+ 원두 추가</button>}</div>}
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

function BrewLog({ beans, setBeans, brews, setBrews, notes, setNotes, openInitially, onOpened }: {
  beans: Bean[];
  setBeans: StorageSetter<Bean[]>;
  brews: Brew[];
  setBrews: StorageSetter<Brew[]>;
  notes: TastingNote[];
  setNotes: StorageSetter<TastingNote[]>;
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

  const add = () => {
    if (!form.beanId || !form.amount || !form.date) return;
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
    setNoteMemo(""); setNoteRating(0); setEditingId(null); setShow(false);
  };

  const remove = (brew: Brew) => {
    setBrews(brews.filter(b => b.id !== brew.id));
    setBeans(beans.map(b => b.id === brew.beanId ? { ...b, remaining: Math.round((b.remaining + brew.amount) * 10) / 10 } : b));
  };
  const edit = (brew: Brew) => {
    setEditingId(brew.id);
    setForm({ beanId: String(brew.beanId), amount: String(brew.amount), waterAmount: brew.waterAmount ? String(brew.waterAmount) : "", method: brew.method, date: brew.date, recipe: brew.recipe });
    const note = notes.find(item => item.brewId === brew.id);
    setNoteMemo(note?.memo ?? ""); setNoteRating(note?.rating ?? 0);
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)", fontFamily: FONT }}>총 {brews.length}회 브루잉</p>
        <Btn onClick={() => setShow(!show)} filled={show}>+ 기록 추가</Btn>
      </div>

      {show && (
        <FormCard>
          <div className="brew-form-grid">
            <Field label="원두 선택*">
              <select value={form.beanId} onChange={e => setForm({ ...form, beanId: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }}>
                <option value="">선택하세요</option>
                {activeBeans.map(b => <option key={b.id} value={b.id}>{[b.roastery, b.name].filter(Boolean).join(" ")} ({fmt(b.remaining)}g 남음)</option>)}
              </select>
            </Field>
            <Field label="사용량(g)*"><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} /></Field>
            <Field label="투입 물 양(g)"><input type="number" min="0" step="0.1" value={form.waterAmount} onChange={e => setForm({ ...form, waterAmount: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} placeholder="예: 300" /></Field>
            <Field label="날짜*"><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} /></Field>
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="레시피 메모">
              <textarea value={form.recipe} onChange={e => setForm({ ...form, recipe: e.target.value })} rows={2} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: FONT }} placeholder="레시피, 추출 파라미터 등..." />
            </Field>
          </div>
          <div className="brew-note-form"><Field label="컵 노트 / 느낀점"><textarea value={noteMemo} onChange={e => setNoteMemo(e.target.value)} rows={2} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: FONT }} placeholder="오늘의 맛과 느낌을 자유롭게 기록해보세요..." /></Field><div><span className="brew-rating-label">별점</span><StarRating value={noteRating} onChange={setNoteRating} /></div></div>
          <FormActions onSave={add} onCancel={() => { setShow(false); setEditingId(null); setForm(emptyBrewForm()); setNoteMemo(""); setNoteRating(0); }} saveLabel={editingId === null ? "저장 (재고 차감)" : "수정 저장"} />
        </FormCard>
      )}

      <div className="brew-log-tools">
        <label className="brew-search"><span className="sr-only">브루잉 기록 검색</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="원두, 로스터리, 레시피 검색" /></label>
        <select aria-label="브루잉 기록 정렬" value={brewSort} onChange={event => setBrewSort(event.target.value as "latest" | "oldest" | "amount")}><option value="latest">최신순</option><option value="oldest">오래된 순</option><option value="amount">사용량 많은 순</option></select>
      </div>

      {sorted.length === 0 ? <Empty text={brews.length === 0 ? "브루잉 기록을 추가해보세요" : "검색 결과가 없어요"} /> : sorted.map(brew => {
        const bean = beans.find(b => b.id === brew.beanId);
        const hasNote = notes.some(n => n.brewId === brew.id);
        return (
          <div key={brew.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                {bean?.roastery && <p className="brew-roastery">{bean.roastery}</p>}
                <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 500, fontFamily: FONT }}>{bean?.name || "삭제된 원두"}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)", fontFamily: FONT }}>{brew.date}</p>
                <div className="brew-recipe-block"><p className="brew-metrics">원두 {fmt(brew.amount)}g {brew.waterAmount ? `· 물 ${fmt(brew.waterAmount)}g · ${brewRatio(brew.amount, brew.waterAmount)}` : ""}</p>{brew.recipe && <p>{brew.recipe}</p>}</div>
                {hasNote && (() => { const note = notes.find(item => item.brewId === brew.id); return note ? <div className="brew-note-block"><span className="brew-detail-label">노트</span>{note.flavor && <div className="flavor-tags">{note.flavor.split(/[,·、\n]+/).map(value => value.trim()).filter(Boolean).map((value, index) => <span key={index}>{value}</span>)}</div>}{note.memo && <p>{note.memo}</p>}</div> : null; })()}
              </div>
              <div className="brew-card-actions"><button onClick={() => edit(brew)} className="brew-edit-button">수정</button><button onClick={() => remove(brew)} className="brew-delete-button">삭제</button></div>
            </div>
          </div>
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
  const totalWater = filtered.reduce((sum, brew) => sum + (brew.waterAmount ?? 0), 0);
  const withWater = filtered.filter(brew => brew.waterAmount && brew.waterAmount > 0);
  const averageRatio = withWater.length ? totalWater / withWater.reduce((sum, brew) => sum + brew.amount, 0) : null;
  const beanUsage = [...new Set(filtered.map(brew => brew.beanId))].map(beanId => {
    const bean = beans.find(item => item.id === beanId);
    return { name: bean?.name || "삭제된 원두", amount: filtered.filter(brew => brew.beanId === beanId).reduce((sum, brew) => sum + brew.amount, 0) };
  }).sort((a, b) => b.amount - a.amount);
  return <div className="brew-stats">
    <div className="stats-header"><div><p className="eyebrow">BREWING INSIGHTS</p><h2>브루잉 통계</h2><p>기간을 골라 내 기록을 가볍게 돌아봐요.</p></div><select aria-label="통계 기간" value={period} onChange={event => setPeriod(event.target.value as "all" | "7" | "30" | "90")}><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option><option value="all">전체 기간</option></select></div>
    <div className="stats-cards"><div><span>브루잉 횟수</span><strong>{filtered.length}<small>회</small></strong></div><div><span>사용한 원두</span><strong>{beanUsage.length}<small>종</small></strong></div><div><span>사용량</span><strong>{fmt(Math.round(totalAmount * 10) / 10)}<small>g</small></strong></div></div>
    <section className="stats-section"><h3>원두별 사용량</h3>{beanUsage.length === 0 ? <p className="stats-empty">선택한 기간에 브루잉 기록이 없어요.</p> : <div className="usage-list">{beanUsage.map(item => <div className="usage-row" key={item.name}><span>{item.name}</span><b>{fmt(Math.round(item.amount * 10) / 10)}g</b></div>)}</div>}</section>
    <section className="stats-section"><h3>물 비율</h3><p className="ratio-summary">{averageRatio === null ? "물 투입량이 기록된 브루잉이 아직 없어요." : `평균 1:${averageRatio.toFixed(1)} · 물 투입량 ${fmt(Math.round(totalWater * 10) / 10)}g`}</p></section>
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
  return <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1rem", marginBottom: "1rem", border: "0.5px solid var(--color-border-tertiary)" }}>{children}</div>;
}

function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="star-rating" aria-label={`별점 ${value}점`}>{[1, 2, 3, 4, 5].map(star => <span className={`star-rating-star ${value >= star ? "full" : value >= star - 0.5 ? "half" : "empty"}`} key={star}><span aria-hidden="true">★</span><button type="button" aria-label={`${star - 0.5}점`} onClick={() => onChange(star - 0.5)} /><button type="button" aria-label={`${star}점`} onClick={() => onChange(star)} /></span>)}</div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4, fontFamily: FONT }}>{label}</label>
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

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center", padding: "1.5rem 0", margin: 0, fontFamily: FONT }}>{text}</p>;
}
