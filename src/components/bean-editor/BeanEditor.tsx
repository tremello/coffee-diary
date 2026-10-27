import { useEffect, useRef, useState, type Dispatch, type FormEvent, type PointerEvent, type SetStateAction } from "react";
import { beanName, handleNumericInput, withCommas } from "../../lib/format";
import { type Bean, BEAN_QUALITIES, BEAN_STATUSES, type BeanForm } from "../../types";
import { type PickOption, PickSheet } from "./PickSheet";
import { RebuySheet } from "./RebuySheet";

export type BeanPhoto = {
  preview: string;
  busy: boolean;
  error: string;
  readCount: number | null;
  canRead: boolean;
  onSelect: (file?: File) => void;
  onRetry: () => void;
  onClear: () => void;
};

type Picker = "origin" | "variety" | "roastery" | "rebuy" | null;

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const CameraIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
const RepeatIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></svg>;

// The bean form as "name · value" rows: full screen on phones, a dialog on wider screens. BeansPage keeps the form
// state, saving and photo reading; this only lays the fields out and opens the pickers.
export function BeanEditor({ editing, form, setForm, processes, origins, roasteries, varieties, pastBeans, readFields, photo, error, onAddOrigin, onHideRoastery, onHideVariety, onRebuy, onRoastDate, onPurchaseDate, onSave, onCancel, onDelete }: {
  editing: boolean;
  form: BeanForm;
  setForm: Dispatch<SetStateAction<BeanForm>>;
  processes: readonly string[];
  origins: PickOption[];
  roasteries: PickOption[];
  varieties: PickOption[];
  pastBeans: Bean[];
  readFields: ReadonlySet<string>;
  photo: BeanPhoto | null;
  error: string;
  onAddOrigin: (origin: string) => void;
  onHideRoastery: (roastery: string) => void;
  onHideVariety: (variety: string) => void;
  onRebuy: (bean: Bean) => void;
  onRoastDate: (date: string) => void;
  onPurchaseDate: (date: string) => void;
  onSave: (event: FormEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [picker, setPicker] = useState<Picker>(null);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLFormElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number; v: number } | null>(null);
  const extras = [form.date, Number(form.consumed) > 0 ? form.consumed : "", form.price, form.quality].filter(Boolean).length;
  const [moreOpen, setMoreOpen] = useState(editing);
  const [otherProcess, setOtherProcess] = useState(() => Boolean(form.process) && !processes.includes(form.process));
  const isOther = otherProcess || (Boolean(form.process) && !processes.includes(form.process));
  const name = beanName(form);
  const missingOrigin = Boolean(error) && !form.origin.trim();
  const missingAmount = Boolean(error) && !(Number(form.purchased) > 0);

  // On phones the form is a sheet floating over the list: it slides down when closed, and can be dragged down by its top.
  const isSheet = () => window.matchMedia("(max-width: 759px)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dismiss = () => {
    if (closing) return;
    if (!isSheet()) { onCancel(); return; }
    setClosing(true);
    window.setTimeout(onCancel, 240);
  };
  const onDragStart = (event: PointerEvent<HTMLDivElement>) => {
    if (closing || !isSheet() || (event.target as HTMLElement).closest("button")) return;
    drag.current = { y: event.clientY, t: event.timeStamp, dy: 0, v: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDragMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current, panel = panelRef.current;
    if (!current || !panel) return;
    const dy = Math.max(0, event.clientY - current.y);
    current.v = (dy - current.dy) / Math.max(1, event.timeStamp - current.t);
    current.dy = dy;
    current.t = event.timeStamp;
    panel.style.transition = "none";
    panel.style.transform = `translateY(${dy}px)`;
    if (backdropRef.current) backdropRef.current.style.opacity = String(1 - Math.min(1, dy / panel.offsetHeight));
  };
  const onDragEnd = () => {
    const current = drag.current, panel = panelRef.current;
    drag.current = null;
    if (!current || !panel) return;
    panel.style.transition = "";
    panel.style.transform = "";
    if (backdropRef.current) backdropRef.current.style.opacity = "";
    if (current.dy > 120 || (current.dy > 20 && current.v > 0.6)) dismiss();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { if (picker) setPicker(null); else dismiss(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, []);

  const set = <K extends keyof BeanForm>(key: K, value: BeanForm[K]) => setForm(current => ({ ...current, [key]: value }));
  const rowClass = (field: string, bad = false) => `be-row${bad ? " bad" : readFields.has(field) ? " read" : ""}`;
  const rowName = (field: string, label: string, required = false) => <span className="be-row-name">{readFields.has(field) && <span className="be-dot" aria-hidden="true" />}{label}{required && <span className="be-req"> *</span>}</span>;
  const pickRow = (field: "origin" | "variety" | "roastery", label: string, required = false, bad = false) => {
    const value = (form[field] ?? "").trim();
    return <button type="button" className={rowClass(field, bad)} onClick={() => setPicker(field)}>
      {rowName(field, label, required)}
      <span className={`be-value${value ? "" : " empty"}`}><span>{value || (bad ? "골라주세요" : "선택")}</span><span className="be-chev" aria-hidden="true">›</span></span>
    </button>;
  };
  const pick = (field: "origin" | "variety" | "roastery") => (value: string) => {
    if (field === "origin" && value) onAddOrigin(value);
    set(field, value);
    setPicker(null);
  };

  return <div className={`be-layer${closing ? " closing" : ""}`}>
    <div className="be-backdrop" ref={backdropRef} aria-hidden="true" onClick={() => { if (isSheet()) dismiss(); }} />
    <form className="be-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="be-title" onSubmit={onSave} noValidate>
      <div className="be-top" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
        <div className="be-grab" aria-hidden="true" />
        <div className="be-head">
          <button type="button" className="be-head-button" onClick={dismiss}>취소</button>
          <h2 id="be-title">{editing ? "원두 정보 수정" : "새 원두"}</h2>
          <button type="submit" className="be-head-button save">저장</button>
        </div>
        <p className="be-name">{name || "원산지를 고르면 이름이 만들어져요"}</p>
      </div>
      <div className="be-body"><div className="be-body-inner">
        {error && <p className="be-alert" role="alert">{error}</p>}

        {photo && <div className="be-card be-quick">
          {photo.preview ? <div className="be-photo">
            <img src={photo.preview} alt="고른 원두 봉투 사진" />
            <div className="be-photo-text" role="status">
              {photo.busy ? <strong>라벨을 읽는 중…</strong>
                : photo.error ? <><strong className="bad">{photo.error}</strong><span>다시 읽거나 직접 입력해주세요</span></>
                : photo.readCount !== null ? <><strong className="ok">라벨에서 {photo.readCount}개를 읽었어요</strong><span>초록 점 칸만 한 번 확인해주세요</span></>
                : <><strong>사진을 골랐어요</strong><span>{photo.canRead ? "사진은 읽는 동안에만 쓰고 저장하지 않아요" : "사진 인식은 Google 로그인 후 쓸 수 있어요"}</span></>}
            </div>
            {!photo.busy && photo.canRead && <button type="button" className="be-pill" onClick={photo.onRetry}>다시 읽기</button>}
            <button type="button" className="be-photo-remove" onClick={photo.onClear} aria-label="고른 사진 지우기">×</button>
          </div> : <div className="be-row be-quick-row">
            <span className="be-row-name"><CameraIcon />라벨 사진으로 채우기</span>
            <span className="be-quick-actions">
              <label className="be-pill"><input type="file" accept={PHOTO_ACCEPT} capture="environment" onChange={event => { photo.onSelect(event.target.files?.[0]); event.target.value = ""; }} />찍기</label>
              <label className="be-pill"><input type="file" accept={PHOTO_ACCEPT} onChange={event => { photo.onSelect(event.target.files?.[0]); event.target.value = ""; }} />앨범</label>
            </span>
          </div>}
          {photo.error && !photo.preview && <p className="be-photo-note" role="alert">{photo.error}</p>}
          {pastBeans.length > 0 && <button type="button" className="be-row" onClick={() => setPicker("rebuy")}><span className="be-row-name"><RepeatIcon />예전에 산 원두 또 샀어요</span><span className="be-chev" aria-hidden="true">›</span></button>}
        </div>}

        <div className="be-columns">
          <section className="be-group" aria-labelledby="be-bean">
            <h3 className="be-group-label" id="be-bean">원두</h3>
            <div className="be-card">
              {pickRow("origin", "원산지", true, missingOrigin)}
              <label className={rowClass("farm")}>{rowName("farm", "농장·지역")}<input value={form.farm ?? ""} placeholder="예: 구지" onChange={event => set("farm", event.target.value)} /></label>
              {pickRow("variety", "품종")}
              <div className={`${rowClass("process")} seg-row`}>
                {rowName("process", "가공")}
                <div className="be-seg" role="group" aria-label="가공방식">
                  {processes.map(process => <button type="button" key={process} aria-pressed={!isOther && form.process === process} onClick={() => { setOtherProcess(false); set("process", form.process === process ? "" : process); }}>{process}</button>)}
                  <button type="button" aria-pressed={isOther} onClick={() => { if (isOther) { setOtherProcess(false); set("process", ""); } else { setOtherProcess(true); set("process", ""); } }}>기타</button>
                </div>
              </div>
              {isOther && <label className="be-row sub"><span className="be-row-name">직접 쓰기</span><input autoFocus={!form.process} value={form.process} placeholder="예: 무산소 내추럴" onChange={event => set("process", event.target.value)} /></label>}
            </div>
          </section>

          <section className="be-group" aria-labelledby="be-buy">
            <h3 className="be-group-label" id="be-buy">구매</h3>
            <div className="be-card">
              {pickRow("roastery", "로스터리")}
              <label className={rowClass("purchased", missingAmount)}>{rowName("purchased", "구매량", true)}<input type="number" inputMode="decimal" min="0.1" step="0.1" value={form.purchased} placeholder="입력" onChange={event => set("purchased", event.target.value)} /><span className="be-unit">g</span></label>
              <label className={rowClass("roastDate")}>{rowName("roastDate", "로스팅 날짜")}<input type="date" value={form.roastDate ?? ""} onChange={event => onRoastDate(event.target.value)} /></label>
              <div className="be-row seg-row">
                {rowName("status", "상태")}
                <div className="be-seg" role="group" aria-label="원두 상태">{BEAN_STATUSES.map(status => <button type="button" key={status} aria-pressed={form.status === status} onClick={() => set("status", status)}>{status}</button>)}</div>
              </div>
            </div>
          </section>
        </div>

        <section className="be-group" aria-labelledby="be-notes">
          <h3 className="be-group-label" id="be-notes">로스터리 컵노트</h3>
          <div className="be-card"><label className={`${rowClass("roasteryNotes")} full`}>{readFields.has("roasteryNotes") && <span className="be-dot" aria-hidden="true" />}<span className="sr-only">로스터리 컵노트</span><input value={form.roasteryNotes ?? ""} placeholder="예: 흰 꽃, 복숭아, 꿀 (쉼표로 구분)" onChange={event => set("roasteryNotes", event.target.value)} /></label></div>
        </section>

        {moreOpen ? <section className="be-group" aria-labelledby="be-more">
          <h3 className="be-group-label" id="be-more">더 보기<button type="button" onClick={() => setMoreOpen(false)}>접기</button></h3>
          <div className="be-card">
            <label className="be-row"><span className="be-row-name be-row-stack">구매일<small>로스팅 날짜를 따라가요</small></span><input type="date" value={form.date} onChange={event => onPurchaseDate(event.target.value)} /></label>
            <label className="be-row"><span className="be-row-name be-row-stack">소비량<small>이미 마신 양</small></span><input type="number" inputMode="decimal" min="0" step="0.1" value={form.consumed} placeholder="0" onChange={event => set("consumed", event.target.value)} /><span className="be-unit">g</span></label>
            <label className={rowClass("price")}>{rowName("price", "구매가격")}<input type="text" inputMode="numeric" value={withCommas(form.price)} placeholder="28,000" onChange={event => handleNumericInput(event, price => set("price", price))} /><span className="be-unit">원</span></label>
            <div className="be-row seg-row">
              <span className="be-row-name">내 분류</span>
              <div className="be-seg" role="group" aria-label="내 기준 분류">{BEAN_QUALITIES.map(quality => <button type="button" key={quality} aria-pressed={form.quality === quality} onClick={() => set("quality", form.quality === quality ? undefined : quality)}>{quality}</button>)}</div>
            </div>
          </div>
        </section> : <button type="button" className="be-more" onClick={() => setMoreOpen(true)}><span>구매일 · 소비량 · 가격 · 분류</span><b>{extras > 0 ? `${extras}개 입력됨 ›` : "더 보기 ›"}</b></button>}

        {onDelete && <button type="button" className="be-delete" onClick={onDelete}>이 원두 삭제</button>}
      </div></div>

      {picker === "origin" && <PickSheet title="원산지" layout="grid" value={form.origin} options={origins} placeholder="목록에 없으면 직접 쓰기" onPick={pick("origin")} onClose={() => setPicker(null)} />}
      {picker === "variety" && <PickSheet title="품종" layout="list" value={form.variety ?? ""} options={varieties} placeholder="품종 이름" onPick={pick("variety")} onHide={onHideVariety} onClose={() => setPicker(null)} />}
      {picker === "roastery" && <PickSheet title="로스터리" layout="list" value={form.roastery} options={roasteries} placeholder="로스터리 이름" onPick={pick("roastery")} onHide={onHideRoastery} onClose={() => setPicker(null)} />}
      {picker === "rebuy" && <RebuySheet beans={pastBeans} onPick={bean => { onRebuy(bean); setPicker(null); }} onClose={() => setPicker(null)} />}
    </form>
  </div>;
}
