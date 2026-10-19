import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "./src/supabase";

const STORAGE_KEYS = { beans: "cf_beans", brews: "cf_brews", notes: "cf_notes" };
const DEFAULT_PROCESSES = ["워시드", "내추럴", "허니", "무산소 내추럴", "무산소 워시드"];
const DEFAULT_ORIGINS = ["에티오피아", "파나마", "콜롬비아", "케냐", "코스타리카"];
const localDate = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const beanName = (bean: BeanForm) => [bean.origin, bean.farm, bean.variety, bean.process].map(value => value?.trim()).filter(Boolean).join(" ");
const FONT = "'Nanum Barun Gothic', 'Apple SD Gothic Neo', sans-serif";
const PAGES = ["Beans", "Brew Log", "Tasting Notes"] as const;
const PAGE_LABELS = { Beans: "원두 재고", "Brew Log": "브루잉 기록", "Tasting Notes": "테이스팅 노트" };

type Page = (typeof PAGES)[number];
type StorageSetter<T> = (value: T) => void;

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

const emptyBeanForm: BeanForm = { name: "", origin: "", process: "", roastery: "", date: "", purchased: "", consumed: "", price: "", roasteryNotes: "", roastDate: "", farm: "", variety: "", flavor: "", memo: "" };
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
  const [linkedBrewId, setLinkedBrewId] = useState<number | null>(null);
  const [beans, setBeans] = useStorage<Bean[]>(STORAGE_KEYS.beans, [], user?.id ?? null);
  const [brews, setBrews] = useStorage<Brew[]>(STORAGE_KEYS.brews, [], user?.id ?? null);
  const [notes, setNotes] = useStorage<TastingNote[]>(STORAGE_KEYS.notes, [], user?.id ?? null);

  const goToNotes = (brewId: number) => { setLinkedBrewId(brewId); setPage("Tasting Notes"); };

  return (
    <div style={{ fontFamily: FONT, maxWidth: 960, margin: "0 auto", padding: "0 0 3rem" }}>
      <Header page={page} setPage={setPage} user={user} authLoading={authLoading} />
      {page === "Beans" && <BeansPage beans={beans} setBeans={setBeans} notes={notes} setNotes={setNotes} userId={user?.id ?? null} onBrew={() => { setOpenBrewForm(true); setPage("Brew Log"); }} />}
      {page === "Brew Log" && <BrewLog beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} goToNotes={goToNotes} notes={notes} openInitially={openBrewForm} onOpened={() => setOpenBrewForm(false)} />}
      {page === "Tasting Notes" && <TastingNotes beans={beans} notes={notes} setNotes={setNotes} brews={brews} linkedBrewId={linkedBrewId} setLinkedBrewId={setLinkedBrewId} />}
    </div>
  );
}

function Header({ page, setPage, user, authLoading }: { page: Page; setPage: (page: Page) => void; user: { id: string; email?: string } | null; authLoading: boolean }) {
  const signIn = async () => {
    const email = window.prompt("동기화할 이메일 주소를 입력해주세요.");
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/` } });
    if (error) window.alert(error.message); else window.alert("로그인 링크를 이메일로 보냈어요.");
  };
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
        <div className="account-actions">{user ? <button className="account-button" onClick={signOut}>{user.email?.split("@")[0] ?? "내 계정"} · 로그아웃</button> : <><button className="google-button" onClick={signInGoogle}>Google 로그인</button><button className="account-button" onClick={signIn}>이메일 로그인</button></>}<img className="brand-mark" src="/coffee-diary-logo-inverted.png" alt="커피 기록 로고" /></div>
      </div>
      <nav style={{ display: "flex", gap: 4, marginTop: "1rem" }}>
        {PAGES.map(p => (
          <button key={p} onClick={() => setPage(p)} style={{
            padding: "6px 14px", fontSize: 13, borderRadius: 20, fontFamily: FONT,
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

function BeansPage({ beans, setBeans, notes, setNotes, userId, onBrew }: { beans: Bean[]; setBeans: StorageSetter<Bean[]>; notes: TastingNote[]; setNotes: StorageSetter<TastingNote[]>; userId: string | null; onBrew: () => void }) {
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BeanForm>(emptyBeanForm);
  const [filter, setFilter] = useState("active");
  const [error, setError] = useState("");
  const [customOrigins, setCustomOrigins] = useStorage<string[]>("cf_origins", [], userId);
  const [addingOrigin, setAddingOrigin] = useState(false);
  const [newOrigin, setNewOrigin] = useState("");
  const origins = [...new Set([...DEFAULT_ORIGINS, ...customOrigins, ...beans.map(b => b.origin).filter(Boolean)])];
  const addOrigin = () => {
    const origin = newOrigin.trim();
    if (!origin) return;
    if (!origins.includes(origin)) setCustomOrigins([...customOrigins, origin]);
    setForm({ ...form, origin }); setNewOrigin(""); setAddingOrigin(false);
  };
  const [deletedId, setDeletedId] = useState<number | null>(null);
  const available = beans.filter(b => !b.deleted);
  const active = available.filter(b => b.remaining > 0);
  const visible = available.filter(b => filter === "all" || (filter === "active" ? b.remaining > 0 : b.remaining <= 0));
  const close = () => { setShow(false); setEditingId(null); setForm(emptyBeanForm); setError(""); setAddingOrigin(false); setNewOrigin(""); };
  const edit = (bean: Bean) => {
    setForm({ ...bean, purchased: String(bean.purchased), consumed: String(bean.consumed ?? 0) });
    setEditingId(bean.id); setError(""); setShow(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const remove = () => {
    if (editingId === null) return;
    setBeans(beans.map(bean => bean.id === editingId ? { ...bean, deleted: true } : bean));
    setDeletedId(editingId); close();
  };
  const undoRemove = () => {
    setBeans(beans.map(bean => bean.id === deletedId ? { ...bean, deleted: false } : bean));
    setDeletedId(null);
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
          <label className="full-width">로스터리<input value={form.roastery} placeholder="로스터리 이름" onChange={e => setForm({ ...form, roastery: e.target.value })} /></label>
          <div className="bean-dates full-width">
          <label>구매량 (g) *<input type="number" min="0.1" step="0.1" required value={form.purchased} placeholder="200" onChange={e => setForm({ ...form, purchased: e.target.value })} /></label>
          <label>소비량 (g)<input type="number" min="0" step="0.1" value={form.consumed} placeholder="0" onChange={e => setForm({ ...form, consumed: e.target.value })} /><span className="input-hint">브루잉에 기록하지 않은 소비량</span></label>
          </div>
          <label className="full-width">로스터리 컵노트<input value={form.roasteryNotes ?? ""} placeholder="예: 자스민, 복숭아, 꿀" onChange={e => setForm({ ...form, roasteryNotes: e.target.value })} /></label>
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
      </div><span>{visible.length}종</span></div>
      <div className="bean-list">
        {visible.map(bean => {
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
              <span className={`stock-status ${pct <= 20 ? "low" : ""}`}>{bean.remaining <= 0 ? "다 마셨어요" : pct <= 20 ? "얼마 남지 않았어요" : "보유 중"}</span>
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
  if (!bean.date && !bean.roastDate) return null;
  return <div className="title-dates">
    {bean.date && <span>구매일 <time dateTime={bean.date}>{bean.date}</time></span>}
    {bean.roastDate && <span>로스팅 <time dateTime={bean.roastDate}>{bean.roastDate}</time>{days !== null && Number.isFinite(days) && <strong aria-label={days >= 0 ? `로스팅 후 ${days}일` : `로스팅까지 ${-days}일`}>{days >= 0 ? `D+${days}` : `D${days}`}</strong>}</span>}
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

function BrewLog({ beans, setBeans, brews, setBrews, goToNotes, notes, openInitially, onOpened }: {
  beans: Bean[];
  setBeans: StorageSetter<Bean[]>;
  brews: Brew[];
  setBrews: StorageSetter<Brew[]>;
  goToNotes: (brewId: number) => void;
  notes: TastingNote[];
  openInitially: boolean;
  onOpened: () => void;
}) {
  const [show, setShow] = useState(openInitially);
  useEffect(() => { if (openInitially) onOpened(); }, [openInitially, onOpened]);
  const [form, setForm] = useState<BrewForm>(emptyBrewForm);

  const add = () => {
    if (!form.beanId || !form.amount || !form.date) return;
    const bean = beans.find(b => b.id === Number(form.beanId));
    const amt = parseFloat(form.amount);
    if (!bean) return;
    if (Number.isNaN(amt) || amt <= 0) return;
    if (bean.remaining < amt) { alert(`잔여량(${fmt(bean.remaining)}g)이 부족해요!`); return; }
    const water = form.waterAmount.trim() ? parseFloat(form.waterAmount) : undefined;
    if (water !== undefined && (Number.isNaN(water) || water <= 0)) return;
    const brew = { ...form, id: Date.now(), beanId: Number(form.beanId), amount: amt, waterAmount: water };
    setBrews([...brews, brew]);
    setBeans(beans.map(b => b.id === bean.id ? { ...b, remaining: Math.round((b.remaining - amt) * 10) / 10 } : b));
    setForm(emptyBrewForm());
    setShow(false);
  };

  const remove = (brew: Brew) => {
    setBrews(brews.filter(b => b.id !== brew.id));
    setBeans(beans.map(b => b.id === brew.beanId ? { ...b, remaining: Math.round((b.remaining + brew.amount) * 10) / 10 } : b));
  };

  const sorted = sortByDateDesc(brews);
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
          <FormActions onSave={add} onCancel={() => setShow(false)} saveLabel="저장 (재고 차감)" />
        </FormCard>
      )}

      {sorted.length === 0 ? <Empty text="브루잉 기록을 추가해보세요" /> : sorted.map(brew => {
        const bean = beans.find(b => b.id === brew.beanId);
        const hasNote = notes.some(n => n.brewId === brew.id);
        return (
          <div key={brew.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 500, fontFamily: FONT }}>{bean?.name || "삭제된 원두"}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)", fontFamily: FONT }}>
                  {brew.date} · 원두 {fmt(brew.amount)}g {brew.waterAmount ? `· 물 ${fmt(brew.waterAmount)}g · ${brewRatio(brew.amount, brew.waterAmount)}` : ""}
                </p>
                {brew.recipe && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-text-secondary)", fontStyle: "italic", fontFamily: FONT }}>{brew.recipe}</p>}
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  {hasNote
                    ? <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: "#E1F5EE", color: "#0F6E56", fontFamily: FONT }}>컵 노트 작성됨 ✓</span>
                    : <button onClick={() => goToNotes(brew.id)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, border: "0.5px solid #8B6F47", background: "transparent", color: "#8B6F47", cursor: "pointer", fontFamily: FONT }}>컵 노트 작성 →</button>
                  }
                </div>
              </div>
              <button onClick={() => remove(brew)} style={{ fontSize: 12, border: "none", background: "none", color: "#D85A30", cursor: "pointer", padding: 0, fontFamily: FONT }}>삭제</button>
            </div>
          </div>
        );
      })}
    </div>
  );
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
  const [form, setForm] = useState<TastingNoteForm>({
    beanId: linkedBean?.id?.toString() || "",
    brewId: linkedBrewId || null,
    rating: 3, flavor: "", aroma: "", acidity: "", body: "", finish: "", memo: "",
    date: linkedBrew?.date || new Date().toISOString().slice(0, 10)
  });

  useEffect(() => {
    if (!linkedBrewId || !linkedBrew) return;
    setForm({
      ...emptyNoteForm(),
      beanId: linkedBrew.beanId.toString(),
      brewId: linkedBrewId,
      date: linkedBrew.date
    });
    setShow(true);
  }, [linkedBrewId, linkedBrew]);

  const add = () => {
    if (!form.beanId) return;
    setNotes([...notes, { ...form, id: Date.now(), beanId: Number(form.beanId), rating: Number(form.rating) }]);
    setForm(emptyNoteForm());
    setLinkedBrewId(null);
    setShow(false);
  };

  const remove = (id: number) => setNotes(notes.filter(n => n.id !== id));
  const sorted = sortByDateDesc(notes);

  const openNew = () => {
    setLinkedBrewId(null);
    setForm(emptyNoteForm());
    setShow(true);
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
          <FormActions onSave={add} onCancel={() => { setShow(false); setLinkedBrewId(null); }} saveLabel="저장" />
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
              <button onClick={() => remove(n.id)} style={{ fontSize: 12, border: "none", background: "none", color: "var(--color-text-tertiary)", cursor: "pointer", padding: 0, alignSelf: "flex-start", fontFamily: FONT }}>삭제</button>
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
