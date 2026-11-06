import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { supabase } from "../supabase";
import { type StorageSetter, useStorage } from "../data/sync";
import { SwipeToBrew } from "../components/SwipeToBrew";
import { JourneySteps } from "../components/ui";
import { BeanEditor } from "../components/bean-editor/BeanEditor";
import { beanValues, blendFields, blendSummary, isBlend, MAX_BLEND_PARTS, ratioTotal, usedParts } from "../lib/blend";
import { beanName, fmt, handleNumericInput, localDate, splitCupNotes, withCommas } from "../lib/format";
import { localizedPhotoField, PHOTO_ORIGIN_LABELS, PHOTO_PROCESS_LABELS, photoMimeType, photoProblem, preparePhoto, sendPhoto } from "../lib/photo";
import { type Bean, BEAN_ORIGINS, BEAN_PROCESSES, BEAN_QUALITIES, BEAN_STATUSES, type BeanForm, type BeanQuality, type BeanStatus, type Brew, type CardPhoto, type PeakSettings, type RecognizedBeanFields, type TastingNote } from "../types";
import { LIST_KEYS, PEAK_KEY } from "../data/keys";
import { basePeak, beanPeak, type BeanPeak, effectiveStatus, isRoastLevel, roastDateLabel, levelPeak, peakSortKey, RESEARCH_PEAK, shiftPeak, withRoasteryPeak } from "../lib/peak";
import { PeakBlock, PeakPill } from "../components/peak/PeakParts";
import { PeakSheet } from "../components/peak/PeakSheet";
import { DEVICE_KEYS } from "../data/settings";
import { BeanPanel } from "../components/desk/BeanPanel";
import { capListRows, DeskSearch, DeskStart, DeskToolbar, Tile } from "../components/desk/Desk";
import { type Page } from "../lib/pages";
import { removeCard } from "../lib/cardPhoto";
import { CardPhotoButton } from "../components/card-photo/CardPhoto";

const capBeanList = capListRows(8);

// 무산소 가공은 직접 입력칸에 적어요. 이미 등록된 무산소 원두는 세부 검색에 그대로 나와요.
const DEFAULT_PROCESSES = BEAN_PROCESSES;

const DEFAULT_ORIGINS = BEAN_ORIGINS;

type BeanSort = "registered" | "latest" | "roastOldest" | "peakEnding" | "remaining" | "unitPriceDesc" | "unitPriceAsc";

type BeanFacetKey = "origin" | "roastery" | "variety" | "process" | "note" | "status" | "remaining" | "age";

type BeanFacetFilters = Record<BeanFacetKey, string[]>;

const BEAN_FACET_KEYS: BeanFacetKey[] = ["origin", "variety", "process", "roastery", "note", "status", "remaining", "age"];

const emptyBeanFacetFilters = (): BeanFacetFilters => ({ origin: [], roastery: [], variety: [], process: [], note: [], status: [], remaining: [], age: [] });

const REMAINING_OPTIONS = ["100g 이하", "100~200g", "200g 이상"];

const AGE_OPTIONS = ["D+7 이내", "D+8~30", "D+31 이상"];

const SWIPE_HINT_KEY = DEVICE_KEYS.swipeHint;

// Cards show the short summary; tapping one opens it in place into the full card, one at a time.
// Taps on the card's own controls (status chip, edit, memo, cup-note scroller) never toggle it.
const CARD_CONTROLS = "button, a, summary, details, input, select, textarea, .flavor-tags, .compact-cup-notes";
// Same speed and curve as the app's sheets (bean editor, settings).
const CARD_MOTION: KeyframeAnimationOptions = { duration: 240, easing: "cubic-bezier(.2, .8, .2, 1)" };
// Cards that change column or come into view wait until the moving cards have mostly passed, then fade in.
const FADE_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }];
const FADE_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }];
// Letters the opened card can show (labels, stage names, units), used to fetch their font pieces ahead of time.
const CARD_TEXT = "가값개게경고괜구기까끝나날남났내노눌는다단대더두뒤드디딕때라량러레렌력로록루르른를리마만맛매메면모미바변보볶본부분브블비상서세셜셨소수순쉬스시싱아약어엄에여요용울원으은음의이일입있잉자잔장저전절접정조좋주준중지직진짜째찮치커컵크태터트티팅페프피필하한히0123456789.,:·+-%g›₩~";
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const emptyBeanForm: BeanForm = { name: "", origin: "", process: "", roastery: "", date: "", purchased: "", consumed: "", price: "", roasteryNotes: "", roastDate: "", farm: "", variety: "", flavor: "", memo: "", status: undefined, quality: undefined, roastLevel: undefined, peak: undefined };

export function BeansPage({ beans, setBeans, brews, setBrews, notes, setNotes, userId, onBrew, initialOpenId = null, desk, recipeCount = 0, onGoto }: { initialOpenId?: number | null; beans: Bean[]; setBeans: StorageSetter<Bean[]>; brews: Brew[]; setBrews: StorageSetter<Brew[]>; notes: TastingNote[]; setNotes: StorageSetter<TastingNote[]>; userId: string | null; onBrew: (beanId?: number) => void; desk?: boolean; recipeCount?: number; onGoto?: (page: Page) => void }) {
  const [pickedId, setPickedId] = useState<number | null>(initialOpenId);
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BeanForm>(emptyBeanForm);
  // The card photo the bean had when its editor opened: a photo uploaded since then is dropped again if the editor is cancelled.
  const originalCard = useRef<CardPhoto | undefined>(undefined);
  const [filter, setFilter] = useState(initialOpenId === null ? "active" : "all");
  const [sort, setSort] = useState<BeanSort>("registered");
  const [qualityFilter, setQualityFilter] = useState<"all" | BeanQuality>("all");
  const [expandedId, setExpandedId] = useState<number | null>(initialOpenId);
  // Wait for synced data before scrolling to the linked card, once per target.
  const scrolledLink = useRef<number | null>(null);
  useEffect(() => {
    if (initialOpenId === null || scrolledLink.current === initialOpenId) return;
    const card = document.querySelector(`.bean-list > [data-swipe-id="${initialOpenId}"]`);
    if (card) { card.scrollIntoView({ block: "center" }); scrolledLink.current = initialOpenId; }
  }, [initialOpenId, beans]);
  const [twoColumns, setTwoColumns] = useState(() => window.matchMedia?.("(min-width: 541px)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(min-width: 541px)");
    if (!query) return;
    const update = () => setTwoColumns(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  // Where every card sat before a card opened or closed, so the change can be played as one smooth move.
  const expandAnchor = useRef<{ id: number; rects: Map<number, DOMRect> } | null>(null);
  const [swipeOpenId, setSwipeOpenId] = useState<number | null>(null);
  const [swipeHint, setSwipeHint] = useState(() => { try { return window.matchMedia?.("(pointer: coarse)").matches && !localStorage.getItem(SWIPE_HINT_KEY); } catch { return false; } });
  const dismissSwipeHint = () => { setSwipeHint(false); try { localStorage.setItem(SWIPE_HINT_KEY, "1"); } catch {} };
  useEffect(() => {
    if (swipeOpenId === null) return;
    const closeOutside = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest(`[data-swipe-id="${swipeOpenId}"]`)) setSwipeOpenId(null); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [swipeOpenId]);
  // Korean web fonts arrive in small pieces as new letters appear. Fetch the pieces the opened card needs while the
  // page is idle, so the first open does not stall and re-layout when they land.
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts?.load) return;
    const family = getComputedStyle(document.body).fontFamily;
    const warm = () => ["400", "500", "600", "700"].forEach(weight => { fonts.load(`${weight} 16px ${family}`, CARD_TEXT).catch(() => undefined); });
    const idle = window.requestIdleCallback ? window.requestIdleCallback(warm, { timeout: 2000 }) : window.setTimeout(warm, 1200);
    return () => { if (window.cancelIdleCallback) window.cancelIdleCallback(idle); else window.clearTimeout(idle); };
  }, []);
  const cardOf = (id: number) => document.querySelector<HTMLElement>(`[data-swipe-id="${id}"] .inventory-card`);
  // A still copy of the tapped card as it looked before the change; it fades out over the new look (cross-fade).
  const ghosts = useRef(new Map<number, { node: HTMLElement; top: number; left: number; width: number; height: number }>());
  const clearGhosts = useRef<() => void>(() => undefined);
  const toggleExpanded = (id: number) => {
    clearGhosts.current();
    const rects = new Map<number, DOMRect>();
    // Only cards on or near the screen are measured and moved; the rest just take their new place.
    const reach = window.innerHeight;
    document.querySelectorAll<HTMLElement>(".bean-list > [data-swipe-id]").forEach(node => {
      const rect = node.getBoundingClientRect();
      if (rect.bottom > -reach && rect.top < reach * 2) rects.set(Number(node.dataset.swipeId), rect);
    });
    // Still copies of the cards that change (the tapped one and the one that was open), as they look now.
    ghosts.current = new Map();
    const list = document.querySelector<HTMLElement>(".bean-list");
    if (list && !prefersReducedMotion()) {
      const listRect = list.getBoundingClientRect();
      [id, expandedId].forEach(cardId => {
        const wrapper = cardId === null ? null : list.querySelector<HTMLElement>(`:scope > [data-swipe-id="${cardId}"]`);
        const rect = cardId === null ? undefined : rects.get(cardId);
        const card = wrapper?.querySelector(".inventory-card");
        if (cardId === null || !wrapper || !rect || !card || ghosts.current.has(cardId)) return;
        // Keep the old density class on the copy so it keeps its old look outside the real card.
        const copy = document.createElement("div");
        copy.className = `swipe-card bean-ghost ${wrapper.classList.contains("density-detail") ? "density-detail is-expanded" : "density-compact"}`;
        copy.setAttribute("aria-hidden", "true");
        copy.inert = true;
        copy.appendChild(card.cloneNode(true));
        ghosts.current.set(cardId, { node: copy, top: rect.top - listRect.top, left: rect.left - listRect.left, width: rect.width, height: rect.height });
      });
    }
    expandAnchor.current = { id, rects };
    setSwipeOpenId(null);
    setExpandedId(expandedId === id ? null : id);
  };
  const onCardClick = (event: MouseEvent<HTMLElement>, id: number) => {
    if ((event.target as HTMLElement).closest(CARD_CONTROLS)) return;
    if (swipeOpenId === id) { setSwipeOpenId(null); return; }
    toggleExpanded(id);
  };
  useLayoutEffect(() => {
    const anchor = expandAnchor.current;
    expandAnchor.current = null;
    if (!anchor) return;
    const card = cardOf(anchor.id);
    if (!card) return;
    // Bring the tapped card into view only when needed, with one smooth scroll that runs alongside the card move below.
    // (Jumping the scroll to hold the card under the finger made everything outside the list jerk, then scroll back.)
    const rect = card.getBoundingClientRect();
    const bottomLimit = window.innerHeight - (window.matchMedia?.("(max-width: 540px)").matches ? 110 : 24);
    const scroll = rect.top < 16 ? rect.top - 16 : expandedId === anchor.id && rect.bottom > bottomLimit ? Math.min(rect.bottom - bottomLimit, rect.top - 16) : 0;
    if (scroll) window.scrollBy({ top: scroll, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    if (prefersReducedMotion()) return;
    // Play the change without re-laying out the page every frame (FLIP): every card is drawn where it was and slides to
    // its new place with transform; the card that grew also opens out from its old outline with clip-path.
    const radius = getComputedStyle(document.documentElement).getPropertyValue("--r-md").trim() || "0px";
    // Read every position first, then start the moves, so the browser lays the page out only once.
    const nodes = [...document.querySelectorAll<HTMLElement>(".bean-list > [data-swipe-id]")].map(node => ({ node, before: anchor.rects.get(Number(node.dataset.swipeId)), after: node.getBoundingClientRect() }));
    // Cards that change look cross-fade: a still copy of the old look sits where the card was. When the card opens,
    // the copy lies on top and fades away as the full contents come in. When it closes in place, the copy is the
    // card's frame and shrinks to the closed size while the short contents fade in on top of it.
    const copies = ghosts.current;
    ghosts.current = new Map();
    const list = card.closest(".bean-list");
    const parts = (root: Element) => [...root.querySelectorAll<HTMLElement>(":scope > .inventory-card > .bean-info, :scope > .inventory-card > .bean-stock")];
    const shrinking = new Set<HTMLElement>();
    const moves: Animation[] = [];
    const morphing: HTMLElement[] = [];
    const copyNodes: HTMLElement[] = [];
    if (list) nodes.forEach(({ node, before, after }) => {
      const copy = copies.get(Number(node.dataset.swipeId));
      if (!copy || !before) return;
      const grew = after.width - before.width > 1 || after.height - before.height > 1;
      // Closing in place: the new box fits inside the old one (on PC the card may move away; then it just fades in).
      const inside = after.top >= before.top - 1 && after.left >= before.left - 1 && after.right <= before.right + 1 && after.bottom <= before.bottom + 1;
      if (!grew && !inside) return;
      Object.assign(copy.node.style, { top: `${copy.top}px`, left: `${copy.left}px`, width: `${copy.width}px`, height: `${copy.height}px` });
      if (grew) {
        copy.node.classList.add("on-top");
        moves.push(copy.node.animate(FADE_OUT, CARD_MOTION));
      } else {
        node.classList.add("is-morphing");
        morphing.push(node);
        shrinking.add(node);
        const edges = [after.top - before.top, before.right - after.right, before.bottom - after.bottom, after.left - before.left].map(value => `${Math.max(0, value)}px`).join(" ");
        moves.push(copy.node.animate([{ clipPath: `inset(0px 0px 0px 0px round ${radius})` }, { clipPath: `inset(${edges} round ${radius})` }], CARD_MOTION));
        parts(copy.node).forEach(part => moves.push(part.animate(FADE_OUT, CARD_MOTION)));
      }
      list.appendChild(copy.node);
      copyNodes.push(copy.node);
      parts(node.querySelector(".swipe-card-body") ?? node).forEach(part => moves.push(part.animate(FADE_IN, CARD_MOTION)));
    });
    if (moves.length) {
      const done = () => {
        moves.forEach(move => move.cancel());
        copyNodes.forEach(copy => copy.remove());
        // Put the frames back at once (no border/shadow transition), in the same frame the copies go away.
        const cards = morphing.map(node => node.querySelector<HTMLElement>(".inventory-card")).filter((item): item is HTMLElement => !!item);
        cards.forEach(item => { item.style.transition = "none"; });
        morphing.forEach(node => node.classList.remove("is-morphing"));
        cards.forEach(item => { void item.offsetWidth; item.style.transition = ""; });
        clearGhosts.current = () => undefined;
      };
      clearGhosts.current = done;
      moves[0].finished.then(done, done);
    }
    nodes.forEach(({ node, before, after }) => {
      // A card closing in place stays put under its shrinking copy.
      if (shrinking.has(node)) return;
      if (!before) {
        // A card that was off screen before and is now in view just fades in.
        if (after.bottom > 0 && after.top < window.innerHeight) node.animate(FADE_IN, CARD_MOTION);
        return;
      }
      const dx = before.left - after.left, dy = before.top - after.top;
      if (after.width - before.width > 1 || after.height - before.height > 1) {
        const edges = [0, after.right - before.right, after.height - before.height, before.left - after.left].map(value => `${Math.max(0, value)}px`).join(" ");
        node.animate([{ transform: `translateY(${dy}px)`, clipPath: `inset(${edges} round ${radius})` }, { transform: "none", clipPath: `inset(0px 0px 0px 0px round ${radius})` }], CARD_MOTION);
      } else if (Math.abs(dx) > 1 || before.height - after.height > 1 || before.width - after.width > 1) {
        // A card that changed column, or the other card that just closed, fades in at its new place instead of
        // flying across the list over the card that is opening.
        node.animate(FADE_IN, CARD_MOTION);
      } else if (Math.abs(dy) > 0.5) {
        node.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], CARD_MOTION);
      }
    });
  }, [expandedId]);
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
  const purchaseDateForRoast = (purchaseDate: string, roastDate: string) => {
    if (purchaseDate && !purchaseDateFollowsRoast.current) return purchaseDate;
    purchaseDateFollowsRoast.current = Boolean(roastDate);
    return roastDate;
  };
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  // Only the latest photo's answer fills the form; clearing the photo or closing the sheet drops a read still on its way.
  const photoRun = useRef(0);
  const [photoError, setPhotoError] = useState("");
  // How many fields the last photo filled, and which ones, so the editor can mark them for checking.
  const [photoReadCount, setPhotoReadCount] = useState<number | null>(null);
  const [readFields, setReadFields] = useState<Set<string>>(() => new Set());
  const [customOrigins, setCustomOrigins] = useStorage<string[]>(LIST_KEYS.origins, [], userId);
  const origins = [...new Set([...DEFAULT_ORIGINS, ...customOrigins, ...beans.flatMap(bean => beanValues(bean, "origin"))])];
  const [hiddenRoasteries, setHiddenRoasteries] = useStorage<string[]>(LIST_KEYS.hiddenRoasteries, [], userId);
  const [hiddenVarieties, setHiddenVarieties] = useStorage<string[]>(LIST_KEYS.hiddenVarieties, [], userId);
  const roasteries = [...new Set(beans.map(bean => bean.roastery?.trim()).filter((roastery): roastery is string => Boolean(roastery)))].filter(roastery => !hiddenRoasteries.includes(roastery));
  const varieties = [...new Set(beans.flatMap(bean => beanValues(bean, "variety")))].filter(variety => !hiddenVarieties.includes(variety));
  const hideRoastery = (roastery: string) => setHiddenRoasteries([...hiddenRoasteries, roastery]);
  const hideVariety = (variety: string) => setHiddenVarieties([...hiddenVarieties, variety]);
  const [deletedId, setDeletedId] = useState<number | null>(null);
  // One clock for every card's D+ badge instead of an interval per card.
  const [cardToday, setCardToday] = useState(localDate);
  useEffect(() => {
    const timer = window.setInterval(() => setCardToday(localDate()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [peakSettings, setPeakSettings] = useStorage<PeakSettings>(PEAK_KEY, {}, userId);
  // The bean whose 맛있는 시기 sheet is open from its card.
  const [adjustId, setAdjustId] = useState<number | null>(null);
  const [deletedBrews, setDeletedBrews] = useState<Brew[]>([]);
  const [deletedNotes, setDeletedNotes] = useState<TastingNote[]>([]);
  const available = beans.filter(b => !b.deleted);
  const active = available.filter(b => b.remaining > 0);
  // Kept between renders so a card's props stay the same unless that bean really changed (BeanCard is memoised).
  const peaks = useMemo(() => new Map(beans.filter(b => !b.deleted).map(bean => [bean.id, beanPeak(bean, peakSettings, brews, cardToday)])), [beans, peakSettings, brews, cardToday]);
  const notesByBean = useMemo(() => {
    const map = new Map<number, TastingNote[]>();
    notes.forEach(note => { const list = map.get(note.beanId); if (list) list.push(note); else map.set(note.beanId, [note]); });
    return map;
  }, [notes]);
  const peakOf = (bean: Bean): BeanPeak => peaks.get(bean.id) ?? { age: null, espresso: 0 };
  const statusOf = (bean: Bean) => effectiveStatus(bean, peakOf(bean));
  const degassingWeight = active.filter(bean => statusOf(bean) === "디개싱 중").reduce((sum, bean) => sum + bean.remaining, 0);
  const consumingWeight = active.filter(bean => statusOf(bean) === "소비 중").reduce((sum, bean) => sum + bean.remaining, 0);
  const today = localDate();
  const beanFacetValues = (bean: Bean, key: BeanFacetKey): string[] => {
    if (key === "status") return [statusOf(bean)];
    if (key === "note") return splitCupNotes(bean.roasteryNotes);
    if (key === "remaining") return [bean.remaining <= 100 ? REMAINING_OPTIONS[0] : bean.remaining <= 200 ? REMAINING_OPTIONS[1] : REMAINING_OPTIONS[2]];
    if (key === "age") {
      if (!bean.roastDate) return [];
      const days = Math.round((Date.parse(today) - Date.parse(bean.roastDate)) / 86_400_000);
      if (!Number.isFinite(days)) return [];
      return [days <= 7 ? AGE_OPTIONS[0] : days <= 30 ? AGE_OPTIONS[1] : AGE_OPTIONS[2]];
    }
    if (key === "origin" || key === "process" || key === "variety") return beanValues(bean, key);
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
    if (sort === "peakEnding") {
      const [aGroup, aDays] = peakSortKey(peakOf(a)), [bGroup, bDays] = peakSortKey(peakOf(b));
      return aGroup - bGroup || aDays - bDays || a.id - b.id;
    }
    if (sort === "roastOldest") {
      if (!a.roastDate && !b.roastDate) return a.id - b.id;
      if (!a.roastDate) return 1;
      if (!b.roastDate) return -1;
      return a.roastDate.localeCompare(b.roastDate) || a.id - b.id;
    }
    return a.id - b.id;
  });
  // On two columns the opened card takes the whole row; if it sat on the right, its left neighbour moves just below it so no gap is left.
  const listOrder = [...sortedVisible];
  const openIndex = twoColumns ? listOrder.findIndex(bean => bean.id === expandedId) : -1;
  if (openIndex > 0 && openIndex % 2 === 1) [listOrder[openIndex - 1], listOrder[openIndex]] = [listOrder[openIndex], listOrder[openIndex - 1]];
  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    photoRun.current += 1;
    setPhotoFile(null); setPhotoPreview(""); setPhotoBusy(false); setPhotoError(""); setPhotoReadCount(null); setReadFields(new Set());
  };
  const selectPhoto = (file?: File) => {
    clearPhoto();
    if (!file) return;
    const problem = photoProblem(file);
    if (problem) { setPhotoError(problem); return; }
    setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file));
    // Read the label right away; the button below stays for retrying after an error.
    if (userId) void recognizePhoto(file);
  };
  const recognizePhoto = async (file = photoFile) => {
    if (!file || (photoBusy && file === photoFile)) return;
    const run = ++photoRun.current;
    setPhotoBusy(true); setPhotoError(""); setPhotoReadCount(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("사진 인식은 Google 로그인 후 사용할 수 있어요.");
      const photo = await preparePhoto(file, photoMimeType(file));
      if (run !== photoRun.current) return;
      const { ok, payload } = await sendPhoto("/api/recognize-bean", session.access_token, photo);
      if (run !== photoRun.current) return;
      if (!ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : "사진에서 정보를 읽지 못했어요.");
      const result = (payload.bean ?? {}) as RecognizedBeanFields;
      const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
      // Two or more coffees on the label make it a blend; each becomes a part row.
      const parts = (Array.isArray(result.blendParts) ? result.blendParts : []).map(part => ({
        origin: localizedPhotoField(text(part?.origin), PHOTO_ORIGIN_LABELS),
        process: localizedPhotoField(text(part?.process), PHOTO_PROCESS_LABELS) || undefined,
        variety: text(part?.variety) || undefined,
        ratio: Number(part?.ratio) > 0 && Number(part?.ratio) <= 100 ? Math.round(Number(part?.ratio)) : undefined
      })).filter(part => part.origin).slice(0, MAX_BLEND_PARTS);
      const blend = parts.length >= 2;
      const origin = blend ? "" : localizedPhotoField(text(result.origin), PHOTO_ORIGIN_LABELS);
      const process = blend ? "" : localizedPhotoField(text(result.process), PHOTO_PROCESS_LABELS);
      const newOrigins = [...new Set([origin, ...parts.map(part => part.origin)])].filter(value => value && !origins.includes(value) && !customOrigins.includes(value));
      if (newOrigins.length) setCustomOrigins([...customOrigins, ...newOrigins]);
      // A new photo replaces what an earlier photo (or typing) put in these fields.
      const roastLevel = isRoastLevel(text(result.roastLevel)) ? text(result.roastLevel) as Bean["roastLevel"] : undefined;
      const restDays = Number(result.restDays);
      // The roaster's "로스팅 후 N일부터" moves the start; the rest of the window keeps its length from the roast level default.
      const restBase = roastLevel ? levelPeak(roastLevel, peakSettings).window : RESEARCH_PEAK.라이트;
      const peak = Number.isFinite(restDays) && restDays > 0 && restDays < 120 ? shiftPeak(restBase, Math.round(restDays) - restBase.start) : undefined;
      setForm(current => ({
        ...current,
        roastLevel, peak,
        origin: "", farm: "", variety: "", process: "", roastery: "", roasteryNotes: "", purchased: "", price: "",
        roastDate: current.date,
        ...(blend ? { kind: "blend" as const, parts, blendName: text(result.blendName) } : { kind: undefined, parts: undefined, blendName: undefined }),
        ...(origin ? { origin } : {}),
        ...(text(result.farm) ? { farm: text(result.farm) } : {}),
        ...(!blend && text(result.variety) ? { variety: text(result.variety) } : {}),
        ...(process ? { process } : {}),
        ...(text(result.roastery) ? { roastery: text(result.roastery) } : {}),
        ...(text(result.roasteryNotes) ? { roasteryNotes: text(result.roasteryNotes) } : {}),
        ...(result.purchased !== undefined && String(result.purchased).trim() ? { purchased: String(result.purchased) } : {}),
        ...(text(result.roastDate) ? { roastDate: text(result.roastDate), date: purchaseDateForRoast(current.date, text(result.roastDate)) } : {}),
        ...(result.price !== undefined && String(result.price).trim() ? { price: String(result.price) } : {})
      }));
      setRoastDateTouched(Boolean(text(result.roastDate)));
      const read = new Set([
        ...(origin ? ["origin"] : []), ...(process ? ["process"] : []),
        ...(blend ? ["parts", ...(text(result.blendName) ? ["blendName"] : [])] : []),
        ...(["farm", "variety", "roastery", "roasteryNotes", "roastDate"] as const).filter(field => !(blend && field === "variety") && text(result[field])),
        ...(["purchased", "price"] as const).filter(field => result[field] !== undefined && String(result[field]).trim()),
        ...(roastLevel ? ["roastLevel"] : []), ...(peak ? ["peak"] : [])
      ]);
      setReadFields(read); setPhotoReadCount(read.size);
    } catch (photoRecognitionError) {
      if (run !== photoRun.current) return;
      setPhotoError(photoRecognitionError instanceof Error ? photoRecognitionError.message : "사진에서 정보를 읽지 못했어요.");
    } finally {
      if (run === photoRun.current) setPhotoBusy(false);
    }
  };
  const close = () => { originalCard.current = undefined; clearPhoto(); setShow(false); setEditingId(null); setForm(emptyBeanForm); setError(""); setRoastDateTouched(false); purchaseDateFollowsRoast.current = false; };
  const openNewBean = () => { close(); setShow(true); };
  const edit = (bean: Bean) => {
    originalCard.current = bean.card;
    setForm({ ...bean, status: bean.status ?? "소비 중", purchased: String(bean.purchased), consumed: String(bean.consumed ?? 0) });
    setRoastDateTouched(Boolean(bean.roastDate && bean.roastDate !== bean.date));
    purchaseDateFollowsRoast.current = false;
    setEditingId(bean.id); setError(""); setShow(true);
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
  // Picker options, most used first; values nobody has used yet keep their listed order after them.
  const rankByUse = (values: string[], field: (bean: Bean) => string | string[] | undefined) => {
    const counts = new Map<string, number>();
    available.forEach(bean => [field(bean)].flat().forEach(value => { const text = value?.trim(); if (text) counts.set(text, (counts.get(text) ?? 0) + 1); }));
    return values.map((value, index) => ({ value, count: counts.get(value) ?? 0, index })).sort((a, b) => b.count - a.count || a.index - b.index).map(({ value, count }) => ({ value, count }));
  };
  // Buying the same bean again: copy what describes the bean, leave the amount, dates and status for this bag.
  const rebuy = (bean: Bean) => {
    setForm(current => ({ ...current, origin: bean.origin, farm: bean.farm ?? "", variety: bean.variety ?? "", process: bean.process, roastery: bean.roastery, roasteryNotes: bean.roasteryNotes ?? "", price: bean.price, quality: bean.quality, roastLevel: bean.roastLevel, peak: bean.peak, kind: bean.kind, blendName: bean.blendName, parts: bean.parts?.map(part => ({ ...part })) }));
    setReadFields(new Set());
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const purchased = Number(form.purchased);
    const blend = isBlend(form);
    const missing = (blend ? [usedParts(form.parts).length < 2 && "구성 원두 2개의 원산지"] : [!form.origin.trim() && "원산지", !form.variety?.trim() && "품종", !form.process.trim() && "가공방식"])
      .concat(!(Number.isFinite(purchased) && purchased > 0) && "구매량").filter(Boolean);
    if (missing.length) { setError(`${missing.join("·")} 칸을 채워주세요.`); return; }
    if (blend && ratioTotal(usedParts(form.parts)) > 100) { setError("구성 원두 비율을 합해서 100% 이하로 맞춰주세요."); return; }
    const previous = beans.find(b => b.id === editingId);
    const consumed = Number(form.consumed);
    if (!Number.isFinite(consumed) || consumed < 0) { setError("소비량은 0 이상의 숫자로 입력해주세요."); return; }
    const used = Math.round(((previous ? previous.purchased - previous.remaining - (previous.consumed ?? 0) : 0) + consumed) * 10) / 10;
    if (purchased < used) { setError(`이미 사용한 ${fmt(used)}g보다 구매량이 적을 수 없어요.`); return; }
    // A single origin keeps no blend fields, even if the form was switched to blend and back.
    const { kind: _kind, blendName: _blendName, parts: _parts, ...single } = form;
    const fields: BeanForm = blend ? { ...form, ...blendFields(form) } : single;
    const bean: Bean = { ...fields, name: beanName(fields), id: editingId ?? Date.now(), purchased, consumed, remaining: Math.round((purchased - used) * 10) / 10 };
    setBeans(editingId === null ? [...beans, bean] : beans.map(b => b.id === editingId ? bean : b));
    // The old card photo goes only once the bean no longer points at it.
    if (previous?.card && previous.card.path !== bean.card?.path) removeCard(previous.card);
    close();
  };
  // Cards get one unchanging set of actions that always call this render's handlers.
  // A photo swapped or re-cropped from the viewer replaces the bean's card at once; the old files go after.
  const updateCard = (id: number, card: CardPhoto) => {
    const old = beans.find(bean => bean.id === id)?.card;
    setBeans(beans.map(bean => bean.id === id ? { ...bean, card } : bean));
    if (old && old.path !== card.path) removeCard(old);
  };
  const latest = useRef({ toggleExpanded, onCardClick, edit, updateStatus, onBrew, dismissSwipeHint, updateCard });
  latest.current = { toggleExpanded, onCardClick, edit, updateStatus, onBrew, dismissSwipeHint, updateCard };
  const cardActions = useMemo<CardActions>(() => ({
    toggle: id => latest.current.toggleExpanded(id),
    cardClick: (event, id) => latest.current.onCardClick(event, id),
    swipeChange: (id, open) => { setSwipeOpenId(open ? id : null); if (open) latest.current.dismissSwipeHint(); },
    brew: id => latest.current.onBrew(id),
    edit: bean => latest.current.edit(bean),
    status: (id, status) => latest.current.updateStatus(id, status),
    adjust: id => setAdjustId(id),
    card: (id, card) => latest.current.updateCard(id, card),
  }), []);
  const editorEl = <>
      {show && <BeanEditor
        key={editingId ?? "new"}
        editing={editingId !== null}
        form={form}
        setForm={setForm}
        peakSettings={peakSettings}
        setPeakSettings={setPeakSettings}
        processes={DEFAULT_PROCESSES}
        origins={rankByUse(origins, bean => beanValues(bean, "origin"))}
        roasteries={rankByUse(roasteries, bean => bean.roastery)}
        varieties={rankByUse(varieties, bean => beanValues(bean, "variety"))}
        pastBeans={editingId === null ? available : []}
        readFields={readFields}
        canSaveCard={Boolean(userId)}
        onCard={card => { if (form.card && form.card.path !== originalCard.current?.path) removeCard(form.card); setForm(current => ({ ...current, card })); }}
        photo={editingId === null ? { preview: photoPreview, busy: photoBusy, error: photoError, readCount: photoReadCount, canRead: Boolean(userId), onSelect: selectPhoto, onRetry: () => recognizePhoto(), onClear: clearPhoto } : null}
        error={error}
        onAddOrigin={origin => { if (!origins.includes(origin)) setCustomOrigins([...customOrigins, origin]); }}
        onHideRoastery={hideRoastery}
        onHideVariety={hideVariety}
        onRebuy={rebuy}
        onRoastDate={roastDate => { setRoastDateTouched(true); setForm(current => ({ ...current, roastDate, date: purchaseDateForRoast(current.date, roastDate) })); }}
        onPurchaseDate={date => { purchaseDateFollowsRoast.current = false; setForm(current => ({ ...current, date, roastDate: roastDateTouched ? current.roastDate : date })); }}
        onSave={save}
        onCancel={() => { if (form.card && form.card.path !== originalCard.current?.path) removeCard(form.card); close(); }}
        onDelete={editingId !== null ? remove : undefined}
      />}
  </>;
  const advancedEl = <>
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
  </>;
  const chipsEl = <>
      {!advancedFiltersOpen && activeFilterChips.length > 0 && <div className="active-filter-chips" aria-label="적용된 세부 검색 조건">{activeFilterChips.map(chip => <button type="button" key={chip.key} onClick={chip.clear} aria-label={`${chip.label} 조건 해제`}>{chip.label}<span aria-hidden="true">×</span></button>)}<button type="button" className="active-filter-clear" onClick={clearDetailFilters}>모두 지우기</button></div>}
  </>;
  const peakSheetEl = <>
      {(() => {
        const bean = adjustId !== null ? available.find(item => item.id === adjustId) : undefined;
        const base = bean && basePeak(bean, peakSettings);
        if (!bean || !base) return null;
        const level = base.level, roastery = bean.roastery?.trim();
        const peak = peakOf(bean);
        // The dashed default already includes espresso days when this bean is mostly brewed as espresso.
        const shown = shiftPeak(base.window, peak.espresso && !bean.peak ? peak.espresso : 0);
        return <PeakSheet title="맛있는 시기" note={`${bean.name} · ${level}`} value={peak.window ?? shown} base={shown} age={peak.age}
          roasteryLabel={roastery ? `${roastery} ${level}` : undefined}
          onSave={({ window, applyRoastery }) => {
            if (applyRoastery && window && roastery) {
              setPeakSettings(withRoasteryPeak(peakSettings, roastery, level, shiftPeak(window, -(peak.espresso && !bean.peak ? peak.espresso : 0))));
              setBeans(beans.map(item => item.id === bean.id ? { ...item, peak: undefined } : item));
            } else setBeans(beans.map(item => item.id === bean.id ? { ...item, peak: window ?? undefined } : item));
            setAdjustId(null);
          }} onClose={() => setAdjustId(null)} />;
      })()}
  </>;

  if (desk) {
    const pickedBean = sortedVisible.find(bean => bean.id === pickedId) ?? (initialOpenId !== null && pickedId === initialOpenId ? undefined : sortedVisible[0]);
    const totalWeight = Math.round(active.reduce((sum, b) => sum + b.remaining, 0) * 10) / 10;
    return (
      <main className="inventory desk-page beans-desk">
        <DeskToolbar
          search={<DeskSearch value={beanQuery} onChange={setBeanQuery} placeholder="원산지, 로스터리, 컵노트로 검색" label="원두 검색" />}
          middle={<div className="inventory-filters" aria-label="원두 재고 필터">{[["active", "보유 중"], ["finished", "소비 완료"], ["all", "전체"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>}
          actions={<>
            <select className="desk-select" aria-label="원두 정렬" value={sort} onChange={event => setSort(event.target.value as BeanSort)}><option value="registered">등록순</option><option value="latest">최신순</option><option value="roastOldest">로스팅 날짜 빠른 순</option><option value="peakEnding">맛있는 시기 끝나가는 순</option><option value="remaining">재고 적은 순</option><option value="unitPriceDesc">단가 높은 순</option><option value="unitPriceAsc">단가 낮은 순</option></select>
            <button type="button" className="quiet-button advanced-filter-button desk-filter-button" aria-expanded={advancedFiltersOpen} onClick={() => setAdvancedFiltersOpen(!advancedFiltersOpen)}>세부 검색{activeDetailCount > 0 && <b>{activeDetailCount}</b>}</button>
            <button type="button" className="primary-button desk-add" data-desk-add onClick={openNewBean}>+ 원두 추가</button>
          </>} />
        {deletedId !== null && <div className="delete-notice" role="status"><span>{deletedBrews.length > 0 ? `원두와 연결된 브루잉 기록 ${deletedBrews.length}개를 삭제했어요.` : "원두를 삭제했어요."}</span><button type="button" onClick={undoRemove}>되돌리기</button></div>}
        {editorEl}
        {advancedEl}
        {chipsEl}
        {available.length === 0 ? <DeskStart
          steps={[
            { label: "원두 등록", hint: "봉투 사진을 찍으면 이름·로스팅 날짜가 채워져요", done: false, action: { label: "등록하기", onClick: openNewBean } },
            { label: "레시피 만들기", hint: "자주 쓰는 붓기 순서를 저장해요 (건너뛰어도 돼요)", done: recipeCount > 0, action: { label: "레시피로", onClick: () => onGoto?.("Recipes") } },
            { label: "첫 브루잉 기록", hint: "원두를 고르면 남은 양이 저절로 줄어요", done: brews.length > 0, action: { label: "브루잉 기록으로", onClick: () => onGoto?.("Brew Log") } }
          ]}
          extra={<>카페에서 마신 커피는 원두 없이도 바로 남길 수 있어요. <button type="button" className="desk-link" onClick={() => onGoto?.("Brew Log")}>브루잉 기록으로 →</button></>}
          example={<>
            <header className="desk-detail-head"><p className="desk-kicker">로스터리 이름</p><h2>에티오피아 예가체프 워시드</h2><p className="desk-meta"><span>로스팅 26.10.20</span><span>구매가 ₩20,000</span></p></header>
            <div className="desk-strip is-single"><div className="desk-stock"><div className="peak-block-row"><span>남은 원두</span><strong>200g <small>/ 구매 200g</small></strong></div><div className="stock-meter"><div style={{ width: "100%" }} /></div><div className="peak-block-why"><span>100% 남음</span><span className="desk-cups"><b>약 13잔</b></span></div></div></div>
            <div className="desk-tiles"><Tile label="원산지" value="에티오피아" /><Tile label="품종" value="헤이룸" /><Tile label="가공" value="워시드" /></div>
          </>} />
        : <div className="desk-split">
          <div className="desk-list-stack">
            {active.length > 0 && <div className="desk-panel desk-sum" aria-label="보유 원두 요약">
              <div><span>보유 원두</span><b>{active.length}종 · {fmt(totalWeight)}g</b></div>
              <div><span>소비 중</span><b>{fmt(Math.round(consumingWeight * 10) / 10)}g</b></div>
              <div><span>디개싱 중</span><b>{fmt(Math.round(degassingWeight * 10) / 10)}g</b></div>
            </div>}
            <div ref={capBeanList} className="desk-list desk-panel" role="list">
              {sortedVisible.length === 0 ? <p className="empty-state">해당하는 원두가 없어요</p> : sortedVisible.map(bean => {
                const peak = peakOf(bean);
                const status = statusOf(bean);
                return <button type="button" role="listitem" key={bean.id} data-desk-item className="desk-row desk-bean-row" aria-current={bean.id === pickedBean?.id} onClick={() => setPickedId(bean.id)}>
                  <span className="desk-row-top"><span className="desk-roastery">{bean.roastery || "로스터리 미입력"}</span>{bean.remaining <= 0 ? <span className="stock-status">다 마셨어요</span> : peak.stage ? <PeakPill peak={peak} variant="stage" /> : <span className="stock-status" data-status={status}>{status}</span>}</span>
                  <span className="desk-row-top"><b>{bean.name}</b></span>
                  <span className="desk-row-sub">{bean.roastDate && <span className="desk-date-chip">{roastDateLabel(bean.roastDate)}</span>}{isBlend(bean) && <span className="blend-tag">블렌드</span>}<span className="desk-row-amount">{fmt(bean.remaining)}g</span></span>
                </button>;
              })}
            </div>
          </div>
          {pickedBean ? <BeanPanel bean={pickedBean} peak={peakOf(pickedBean)} brews={brews} notes={notesByBean.get(pickedBean.id) ?? NO_NOTES} onBrew={() => onBrew(pickedBean.id)} onEdit={() => edit(pickedBean)} onStatus={status => updateStatus(pickedBean.id, status)} onAdjust={() => setAdjustId(pickedBean.id)} onCard={card => updateCard(pickedBean.id, card)} onShowBrews={onGoto && (() => onGoto("Brew Log"))} />
            : <div className="desk-panel desk-detail desk-detail-empty">해당하는 원두가 없어요</div>}
        </div>}
        {peakSheetEl}
      </main>
    );
  }
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
      {editorEl}
      <label className="bean-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg><span className="sr-only">원두 검색</span><input type="search" value={beanQuery} onChange={event => setBeanQuery(event.target.value)} placeholder="원산지, 로스터리, 컵노트로 검색" /></label>
      <div className="inventory-toolbar"><div className="inventory-toolbar-row"><div className="inventory-filters" aria-label="원두 재고 필터">
        {[["active", "보유 중"], ["finished", "소비 완료"], ["all", "전체"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div><div className="inventory-toolbar-meta"><label htmlFor="bean-sort">정렬</label><select id="bean-sort" className="inventory-sort" value={sort} onChange={event => setSort(event.target.value as BeanSort)}><option value="registered">등록순</option><option value="latest">최신순</option><option value="roastOldest">로스팅 날짜 빠른 순</option><option value="peakEnding">맛있는 시기 끝나가는 순</option><option value="remaining">재고 적은 순</option><option value="unitPriceDesc">단가 높은 순</option><option value="unitPriceAsc">단가 낮은 순</option></select><button type="button" className="advanced-filter-button" aria-expanded={advancedFiltersOpen} onClick={() => setAdvancedFiltersOpen(!advancedFiltersOpen)}>세부 검색{activeDetailCount > 0 && <b>{activeDetailCount}</b>}</button></div></div></div>
      {advancedEl}
      {chipsEl}
      {swipeHint && active.length > 0 && <p className="swipe-hint">카드를 왼쪽으로 밀면 바로 브루잉을 기록할 수 있어요.<button type="button" onClick={dismissSwipeHint} aria-label="안내 닫기">×</button></p>}
      <div className="bean-list">
        {listOrder.map(bean => <BeanCard key={bean.id} bean={bean} peak={peakOf(bean)} notes={notesByBean.get(bean.id) ?? NO_NOTES} expanded={expandedId === bean.id} swipeOpen={swipeOpenId === bean.id} today={cardToday} actions={cardActions} />)}
        {visible.length === 0 && <div className="inventory-empty"><img className="onboarding-logo" src="/coffee-diary-logo-brown-96.png" width="38" height="38" alt="" /><h3>{available.length === 0 ? "첫 원두를 등록해보세요" : "해당하는 원두가 없어요"}</h3><p>{available.length === 0 ? "원두부터 기록하면 나만의 브루잉 흐름이 시작돼요." : "원두 정보와 향미 노트, 남은 양을 한곳에서 관리해요."}</p>{available.length === 0 && <><JourneySteps active="beans" /><button className="primary-button" onClick={() => { close(); setShow(true); }}>첫 원두 등록하기</button></>}</div>}
      </div>
      {peakSheetEl}
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
type CardActions = { toggle: (id: number) => void; cardClick: (event: MouseEvent<HTMLElement>, id: number) => void; swipeChange: (id: number, open: boolean) => void; brew: (id: number) => void; edit: (bean: Bean) => void; status: (id: number, status: BeanStatus) => void; adjust: (id: number) => void; card: (id: number, card: CardPhoto) => void };
const NO_NOTES: TastingNote[] = [];

// One bean card. Memoised so opening or closing a card re-renders only the cards that change, not the whole list.
const BeanCard = memo(function BeanCard({ bean, peak, notes, expanded, swipeOpen, today, actions }: { bean: Bean; peak: BeanPeak; notes: TastingNote[]; expanded: boolean; swipeOpen: boolean; today: string; actions: CardActions }) {
  const pct = bean.purchased > 0 ? Math.max(0, Math.min(100, bean.remaining / bean.purchased * 100)) : 0;
  const adjust = () => actions.adjust(bean.id);
  return <SwipeToBrew className={expanded ? "density-detail is-expanded" : "density-compact"} beanId={bean.id} beanName={bean.name} disabled={bean.remaining <= 0} open={swipeOpen} onOpenChange={open => actions.swipeChange(bean.id, open)} onBrew={() => actions.brew(bean.id)}><article className="inventory-card" tabIndex={0} aria-expanded={expanded} aria-label={`${bean.name}, 눌러서 ${expanded ? "접기" : "자세히 보기"}`} onClick={event => actions.cardClick(event, bean.id)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); actions.toggle(bean.id); } }}>
    <div className="bean-info">
      <p className="roastery"><span>{bean.roastery || "로스터리 미입력"}</span></p>
      <h3>{bean.name}<CardPhotoButton card={bean.card} title={bean.name} onChange={card => actions.card(bean.id, card)} /></h3>
      {isBlend(bean) && <div className="blend-line"><span className="blend-tag">블렌드</span><span>{blendSummary(bean.parts)}</span></div>}
      <BeanDates bean={bean} />
      <div className="compact-summary"><strong>{bean.roastery || "로스터리 미입력"}</strong><time className="compact-roast" dateTime={bean.roastDate}>{roastDateLabel(bean.roastDate)}</time><b className="cp-name"><span>{bean.name}</span><CardPhotoButton card={bean.card} title={bean.name} onChange={card => actions.card(bean.id, card)} /></b>{isBlend(bean) && <span className="blend-line"><span className="blend-tag">블렌드</span><span>{blendSummary(bean.parts)}</span></span>}{bean.roasteryNotes && <span className="compact-cup-notes">{splitCupNotes(bean.roasteryNotes).map((note, index) => <i key={index}>{note}</i>)}</span>}</div>
      {bean.roasteryNotes && <div className="roastery-cup-notes"><span className="detail-label">로스터리 컵노트</span><div className="flavor-tags">{splitCupNotes(bean.roasteryNotes).map((note, index) => <span key={index}>{note}</span>)}</div></div>}
      <div className="bean-card-actions"><button className="edit-bean" onClick={() => actions.edit(bean)} aria-label={`${bean.name} 원두 정보 수정`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4Z" /><path d="M13.5 6.5l4 4" /></svg>원두 정보 수정</button>{expanded && <details className="record-details"><summary>내 메모 보기</summary><BeanComments bean={bean} notes={notes} /></details>}</div>
    </div>
    <div className="bean-stock">
      <div className="stock-status-row">{peak.stage ? <PeakPill peak={peak} variant={expanded ? "long" : "stage"} onClick={adjust} /> : <RoastAge bean={bean} today={today} />}{bean.remaining <= 0 ? <span data-status="finished" className={`stock-status ${pct <= 20 ? "low" : ""}`}>다 마셨어요</span> : (() => {
        // A bean with a roast level gets its status from the peak stage, so there is nothing to switch.
        if (peak.level) return null;
        const status = bean.status ?? "소비 중";
        const next: BeanStatus = status === "소비 중" ? "디개싱 중" : "소비 중";
        return <button type="button" data-status={status} className={`stock-status stock-status-toggle ${pct <= 20 ? "low" : ""}`} onClick={() => actions.status(bean.id, next)} aria-label={`${bean.name} 상태: ${status}. 눌러서 ${next}으로 변경`} title={`눌러서 ${next}으로 변경`}>{status}<span aria-hidden="true">⇄</span></button>;
      })()}</div>
      <div className="stock-main">
      <p className="remaining-label">남은 원두</p>
      <p className="remaining-weight">{fmt(bean.remaining)}<span>g</span></p>
      <p className="purchased-weight">구매 {fmt(bean.purchased)}g</p>
      <div className="stock-meter" role="progressbar" aria-label={`${bean.name} 잔량`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
      <p className="stock-percent">{Math.round(pct)}% 남음</p>
      </div>
      {expanded && <PeakBlock peak={peak} onAdjust={adjust} />}
      <div className="compact-stock-donut" style={{ "--stock-progress": `${pct}%` } as CSSProperties}><strong>{fmt(bean.remaining)}<span>g</span></strong><small>남음</small></div>
    </div>
          </article></SwipeToBrew>;
});

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
