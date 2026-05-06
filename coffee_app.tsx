import { useEffect, useState, type ReactNode } from "react";

const STORAGE_KEYS = { beans: "cf_beans", brews: "cf_brews", notes: "cf_notes" };
const FONT = "'Söhne', 'ui-sans-serif', system-ui, -apple-system, sans-serif";
const PAGES = ["Dashboard", "Beans", "Brew Log", "Tasting Notes"] as const;

type Page = (typeof PAGES)[number];
type StorageSetter<T> = (value: T) => void;

type Bean = {
  id: number;
  name: string;
  origin: string;
  process: string;
  roastery: string;
  date: string;
  purchased: number;
  remaining: number;
  price: string;
};

type BeanForm = Omit<Bean, "id" | "purchased" | "remaining"> & {
  purchased: string;
};

type Brew = {
  id: number;
  beanId: number;
  amount: number;
  method: string;
  date: string;
  recipe: string;
};

type BrewForm = Omit<Brew, "id" | "beanId" | "amount"> & {
  beanId: string;
  amount: string;
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

function useStorage<T>(key: string, init: T): [T, StorageSetter<T>] {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; }
  });
  const set = (v: T) => { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
  return [val, set];
}

const fmt = (n: number | string) => Number(n).toLocaleString();
const sortByDateDesc = <T extends { date: string }>(items: T[]) =>
  [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const emptyBeanForm: BeanForm = { name: "", origin: "", process: "", roastery: "", date: "", purchased: "", price: "" };
const emptyBrewForm = (): BrewForm => ({ beanId: "", amount: "", method: "", date: new Date().toISOString().slice(0, 10), recipe: "" });
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
  const [page, setPage] = useState<Page>("Dashboard");
  const [linkedBrewId, setLinkedBrewId] = useState<number | null>(null);
  const [beans, setBeans] = useStorage<Bean[]>(STORAGE_KEYS.beans, []);
  const [brews, setBrews] = useStorage<Brew[]>(STORAGE_KEYS.brews, []);
  const [notes, setNotes] = useStorage<TastingNote[]>(STORAGE_KEYS.notes, []);

  const goToNotes = (brewId: number) => { setLinkedBrewId(brewId); setPage("Tasting Notes"); };

  return (
    <div style={{ fontFamily: FONT, maxWidth: 780, margin: "0 auto", padding: "0 0 3rem" }}>
      <Header page={page} setPage={setPage} />
      {page === "Dashboard" && <Dashboard beans={beans} brews={brews} notes={notes} setPage={setPage} />}
      {page === "Beans" && <BeansPage beans={beans} setBeans={setBeans} brews={brews} />}
      {page === "Brew Log" && <BrewLog beans={beans} setBeans={setBeans} brews={brews} setBrews={setBrews} goToNotes={goToNotes} notes={notes} />}
      {page === "Tasting Notes" && <TastingNotes beans={beans} notes={notes} setNotes={setNotes} brews={brews} linkedBrewId={linkedBrewId} setLinkedBrewId={setLinkedBrewId} />}
    </div>
  );
}

function Header({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  return (
    <div style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 0 0" }}>
        <div>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT }}>My Coffee Diary</p>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: "2px 0 0", color: "var(--color-text-primary)", fontFamily: FONT }}>{page}</h1>
        </div>
        <div style={{ fontSize: 22 }}>☕</div>
      </div>
      <nav style={{ display: "flex", gap: 4, marginTop: "1rem" }}>
        {PAGES.map(p => (
          <button key={p} onClick={() => setPage(p)} style={{
            padding: "6px 14px", fontSize: 13, borderRadius: 20, fontFamily: FONT,
            border: page === p ? "1px solid #8B6F47" : "0.5px solid var(--color-border-tertiary)",
            background: page === p ? "#8B6F47" : "transparent",
            color: page === p ? "#fff" : "var(--color-text-secondary)",
            cursor: "pointer"
          }}>{p}</button>
        ))}
      </nav>
    </div>
  );
}

function BeanGauge({ bean }: { bean: Bean }) {
  const pct = bean.purchased > 0 ? Math.min(100, (bean.remaining / bean.purchased) * 100) : 0;
  const color = pct > 50 ? "#8B6F47" : pct > 20 ? "#E8A838" : "#D85A30";
  const r = 28, cx = 36, cy = 36, stroke = 6;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct / 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
      <svg width={72} height={72} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border-tertiary)" strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 0.5s ease" }} />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={11} fontWeight={500} fill={color} fontFamily={FONT}>{Math.round(pct)}%</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize={9} fill="var(--color-text-tertiary)" fontFamily={FONT}>{fmt(Math.round(bean.remaining))}g</text>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, fontFamily: FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bean.name}</p>
        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)", fontFamily: FONT }}>{fmt(bean.remaining)}g / {fmt(bean.purchased)}g</p>
        {bean.remaining <= 0 && <span style={{ fontSize: 10, background: "#FAECE7", color: "#D85A30", padding: "1px 6px", borderRadius: 8, fontFamily: FONT }}>소진</span>}
        {bean.remaining > 0 && bean.remaining <= bean.purchased * 0.2 && <span style={{ fontSize: 10, background: "#FAEEDA", color: "#BA7517", padding: "1px 6px", borderRadius: 8, fontFamily: FONT }}>소진 임박</span>}
      </div>
    </div>
  );
}

function Dashboard({ beans, brews, notes, setPage }: { beans: Bean[]; brews: Brew[]; notes: TastingNote[]; setPage: (page: Page) => void }) {
  const totalBeans = beans.length;
  const activeBeans = beans.filter(b => b.remaining > 0).length;
  const totalBrews = brews.length;
  const totalNotes = notes.length;
  const recentBrews = sortByDateDesc(brews).slice(0, 3);
  const recentNotes = sortByDateDesc(notes).slice(0, 3);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: "1.5rem" }}>
        {[["보유 원두", totalBeans + "종"], ["재고 있음", activeBeans + "종"], ["브루잉 기록", totalBrews + "회"], ["컵 노트", totalNotes + "개"]].map(([label, val]) => (
          <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem", textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px", fontFamily: FONT }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 500, margin: 0, color: "var(--color-text-primary)", fontFamily: FONT }}>{val}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Section title="최근 브루잉" onMore={() => setPage("Brew Log")}>
          {recentBrews.length === 0 ? <Empty text="브루잉 기록이 없어요" /> : recentBrews.map(b => {
            const bean = beans.find(x => x.id === b.beanId);
            return (
              <div key={b.id} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "8px 0" }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, fontFamily: FONT }}>{bean?.name || "삭제된 원두"}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)", fontFamily: FONT }}>{b.date} · {b.amount}g · {b.method}</p>
              </div>
            );
          })}
        </Section>
        <Section title="최근 컵 노트" onMore={() => setPage("Tasting Notes")}>
          {recentNotes.length === 0 ? <Empty text="컵 노트가 없어요" /> : recentNotes.map(n => {
            const bean = beans.find(x => x.id === n.beanId);
            return (
              <div key={n.id} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "8px 0" }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, fontFamily: FONT }}>{bean?.name || "삭제된 원두"} {"★".repeat(n.rating)}{"☆".repeat(5 - n.rating)}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)", fontFamily: FONT }}>{n.flavor}</p>
              </div>
            );
          })}
        </Section>
      </div>

      <Section title="원두 재고 현황">
        {beans.length === 0 ? <Empty text="등록된 원두가 없어요" /> :
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
            {beans.map(b => <BeanGauge key={b.id} bean={b} />)}
          </div>
        }
      </Section>
    </div>
  );
}

function BeansPage({ beans, setBeans, brews }: { beans: Bean[]; setBeans: StorageSetter<Bean[]>; brews: Brew[] }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<BeanForm>(emptyBeanForm);
  const beanTextFields: Array<[keyof BeanForm, string]> = [["name","원두 이름*"],["origin","원산지"],["process","프로세싱"],["roastery","로스터리"],["price","가격(원)"]];

  const add = () => {
    if (!form.name || !form.purchased) return;
    const g = parseFloat(form.purchased);
    if (Number.isNaN(g) || g <= 0) return;
    setBeans([...beans, { ...form, id: Date.now(), purchased: g, remaining: g }]);
    setForm(emptyBeanForm);
    setShow(false);
  };

  const remove = (id: number) => {
    if (brews.some(b => b.beanId === id)) { alert("브루잉 기록이 있는 원두는 삭제할 수 없어요."); return; }
    setBeans(beans.filter(b => b.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)", fontFamily: FONT }}>총 {beans.length}종의 원두</p>
        <Btn onClick={() => setShow(!show)} filled={show}>+ 원두 추가</Btn>
      </div>

      {show && (
        <FormCard>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {beanTextFields.map(([k, label]) => (
              <Field key={k} label={label}><input type="text" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} /></Field>
            ))}
            <Field label="구매일"><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} /></Field>
            <Field label="구매량(g)*"><input type="number" value={form.purchased} onChange={e => setForm({ ...form, purchased: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} /></Field>
          </div>
          <FormActions onSave={add} onCancel={() => setShow(false)} saveLabel="저장" />
        </FormCard>
      )}

      {beans.length === 0 ? <Empty text="원두를 추가해보세요" /> : beans.map(bean => (
        <div key={bean.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 500, fontFamily: FONT }}>{bean.name}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)", fontFamily: FONT }}>
                {[bean.origin, bean.process, bean.roastery].filter(Boolean).join(" · ")}
                {bean.date && ` · ${bean.date}`}
                {bean.price && ` · ₩${fmt(bean.price)}`}
              </p>
            </div>
            <button onClick={() => remove(bean.id)} style={{ fontSize: 12, border: "none", background: "none", color: "var(--color-text-tertiary)", cursor: "pointer", padding: 0, fontFamily: FONT }}>삭제</button>
          </div>
          <div style={{ marginTop: 12 }}>
            <BeanGauge bean={bean} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BrewLog({ beans, setBeans, brews, setBrews, goToNotes, notes }: {
  beans: Bean[];
  setBeans: StorageSetter<Bean[]>;
  brews: Brew[];
  setBrews: StorageSetter<Brew[]>;
  goToNotes: (brewId: number) => void;
  notes: TastingNote[];
}) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<BrewForm>(emptyBrewForm);

  const add = () => {
    if (!form.beanId || !form.amount || !form.date) return;
    const bean = beans.find(b => b.id === Number(form.beanId));
    const amt = parseFloat(form.amount);
    if (!bean) return;
    if (Number.isNaN(amt) || amt <= 0) return;
    if (bean.remaining < amt) { alert(`잔여량(${fmt(bean.remaining)}g)이 부족해요!`); return; }
    const brew = { ...form, id: Date.now(), beanId: Number(form.beanId), amount: amt };
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
  const activeBeans = beans.filter(b => b.remaining > 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)", fontFamily: FONT }}>총 {brews.length}회 브루잉</p>
        <Btn onClick={() => setShow(!show)} filled={show}>+ 기록 추가</Btn>
      </div>

      {show && (
        <FormCard>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="원두 선택*">
              <select value={form.beanId} onChange={e => setForm({ ...form, beanId: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }}>
                <option value="">선택하세요</option>
                {activeBeans.map(b => <option key={b.id} value={b.id}>{b.name} ({fmt(b.remaining)}g 남음)</option>)}
              </select>
            </Field>
            <Field label="사용량(g)*"><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} /></Field>
            <Field label="추출 방식"><input type="text" placeholder="Pour over, Espresso..." value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} style={{ width: "100%", boxSizing: "border-box", fontFamily: FONT }} /></Field>
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
                  {brew.date} · {fmt(brew.amount)}g {brew.method && `· ${brew.method}`}
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
            <strong>{linkedBean?.name}</strong> 브루잉 기록에서 연결됐어요 — {linkedBrew.date} · {fmt(linkedBrew.amount)}g {linkedBrew.method && `· ${linkedBrew.method}`}
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
