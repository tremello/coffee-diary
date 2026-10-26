import { useEffect, useRef, useState, type CSSProperties } from "react";
import { supabase } from "../supabase";
import { type StorageSetter, useStorage } from "../data/sync";
import { SwipeToBrew } from "../components/SwipeToBrew";
import { JourneySteps } from "../components/ui";
import { beanName, fmt, handleNumericInput, localDate, scrollToEditor, splitCupNotes, withCommas } from "../lib/format";
import { localizedPhotoField, MAX_PHOTO_SELECT_BYTES, PHOTO_ORIGIN_LABELS, PHOTO_PROCESS_LABELS, preparePhoto } from "../lib/photo";
import { type Bean, BEAN_QUALITIES, BEAN_STATUSES, type BeanForm, type BeanQuality, type BeanStatus, type Brew, type RecognizedBeanFields, type TastingNote } from "../types";

const DEFAULT_PROCESSES = ["워시드", "내추럴", "허니", "무산소 내추럴", "무산소 워시드"];

const DEFAULT_ORIGINS = ["에티오피아", "파나마", "콜롬비아", "케냐"];

type BeanSort = "registered" | "latest" | "roastOldest" | "remaining" | "unitPriceDesc" | "unitPriceAsc";

type BeanFacetKey = "origin" | "roastery" | "variety" | "process" | "note" | "status" | "remaining" | "age";

type BeanFacetFilters = Record<BeanFacetKey, string[]>;

const BEAN_FACET_KEYS: BeanFacetKey[] = ["origin", "variety", "process", "roastery", "note", "status", "remaining", "age"];

const emptyBeanFacetFilters = (): BeanFacetFilters => ({ origin: [], roastery: [], variety: [], process: [], note: [], status: [], remaining: [], age: [] });

const REMAINING_OPTIONS = ["100g 이하", "100~200g", "200g 이상"];

const AGE_OPTIONS = ["D+7 이내", "D+8~30", "D+31 이상"];

// The bean list view is a per-device preference, kept outside the synced cf_ keys: phones start compact, wider screens detailed.
type BeanDensity = "detail" | "compact";

const BEAN_DENSITY_KEY = "coffee-bean-density";

const SWIPE_HINT_KEY = "coffee-swipe-hint-dismissed";

const initialBeanDensity = (): BeanDensity => {
  try { const saved = localStorage.getItem(BEAN_DENSITY_KEY); if (saved === "detail" || saved === "compact") return saved; } catch {}
  return window.matchMedia?.("(max-width: 540px)").matches ? "compact" : "detail";
};

const emptyBeanForm: BeanForm = { name: "", origin: "", process: "", roastery: "", date: "", purchased: "", consumed: "", price: "", roasteryNotes: "", roastDate: "", farm: "", variety: "", flavor: "", memo: "", status: undefined, quality: undefined };

export function BeansPage({ beans, setBeans, brews, setBrews, notes, setNotes, userId, onBrew }: { beans: Bean[]; setBeans: StorageSetter<Bean[]>; brews: Brew[]; setBrews: StorageSetter<Brew[]>; notes: TastingNote[]; setNotes: StorageSetter<TastingNote[]>; userId: string | null; onBrew: (beanId?: number) => void }) {
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BeanForm>(emptyBeanForm);
  const [filter, setFilter] = useState("active");
  const [sort, setSort] = useState<BeanSort>("registered");
  const [qualityFilter, setQualityFilter] = useState<"all" | BeanQuality>("all");
  const [density, setDensity] = useState<BeanDensity>(initialBeanDensity);
  const [swipeOpenId, setSwipeOpenId] = useState<number | null>(null);
  const [swipeHint, setSwipeHint] = useState(() => { try { return window.matchMedia?.("(pointer: coarse)").matches && !localStorage.getItem(SWIPE_HINT_KEY); } catch { return false; } });
  const dismissSwipeHint = () => { setSwipeHint(false); try { localStorage.setItem(SWIPE_HINT_KEY, "1"); } catch {} };
  useEffect(() => {
    if (swipeOpenId === null) return;
    const closeOutside = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest(`[data-swipe-id="${swipeOpenId}"]`)) setSwipeOpenId(null); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [swipeOpenId]);
  const chooseDensity = (next: BeanDensity) => { setDensity(next); try { localStorage.setItem(BEAN_DENSITY_KEY, next); } catch {} };
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
        <div className="intro-actions"><button className="secondary-button" onClick={() => onBrew()}>브루잉 추가</button><button className="primary-button intro-add-bean" onClick={openNewBean}>+ 원두 추가</button></div></div>
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
      <div className="inventory-toolbar"><div className="inventory-toolbar-top"><label className="view-mode-control" htmlFor="bean-density">보기<select id="bean-density" className="inventory-sort" value={density} onChange={event => chooseDensity(event.target.value as BeanDensity)}><option value="detail">자세히</option><option value="compact">간략하게</option></select></label><button type="button" className="advanced-filter-button" aria-expanded={advancedFiltersOpen} onClick={() => setAdvancedFiltersOpen(!advancedFiltersOpen)}>세부 검색{activeDetailCount > 0 && <b>{activeDetailCount}</b>}</button></div><div className="inventory-toolbar-row"><div className="inventory-filters" aria-label="원두 재고 필터">
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
      {swipeHint && active.length > 0 && <p className="swipe-hint">카드를 왼쪽으로 밀면 바로 브루잉을 기록할 수 있어요.<button type="button" onClick={dismissSwipeHint} aria-label="안내 닫기">×</button></p>}
      <div className={`bean-list density-${density}`}>
        {sortedVisible.map(bean => {
          const pct = bean.purchased > 0 ? Math.max(0, Math.min(100, bean.remaining / bean.purchased * 100)) : 0;
          return <SwipeToBrew key={bean.id} beanId={bean.id} beanName={bean.name} disabled={bean.remaining <= 0} open={swipeOpenId === bean.id} onOpenChange={open => { setSwipeOpenId(open ? bean.id : null); if (open) dismissSwipeHint(); }} onBrew={() => onBrew(bean.id)}><article className="inventory-card">
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
          </article></SwipeToBrew>;
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
