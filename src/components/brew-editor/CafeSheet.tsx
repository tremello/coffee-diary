import { useEffect, useRef, useState } from "react";
import { usePickDrag } from "../bean-editor/usePickDrag";
import { supabase } from "../../supabase";
import { type CafePlace } from "../../types";

type Found = CafePlace & { distance?: number };
type Mode = "search" | "near" | "recent";

const NOT_READY = "카페 검색이 아직 준비되지 않았어요. 직접 입력할 수 있어요.";

export const formatDistance = (meters: number) => meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;

const findCafes = async (query: string, at: { lat: number; lng: number } | null, signal: AbortSignal): Promise<Found[]> => {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch("/api/search-cafe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify({ query, ...(at ?? {}) }),
    signal
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    if (payload?.code === "KAKAO_KEY_MISSING" || !payload) throw new Error(NOT_READY);
    throw new Error(`${payload.error || "카페를 찾지 못했어요."} 직접 입력할 수 있어요.`);
  }
  return (payload.cafes ?? []) as Found[];
};

// The cafe picker: Kakao keyword search (from 2 letters, 300ms after typing stops), 내 주변 sorts by distance from where the
// phone is, 최근 간 곳 lists the cafes of past cafe brews, and the last row keeps the typed text as a cafe name of its own.
export function CafeSheet({ value, recent, onPick, onClose }: { value: CafePlace | null; recent: CafePlace[]; onPick: (cafe: CafePlace | null) => void; onClose: () => void }) {
  const pick = usePickDrag(onClose);
  const [query, setQuery] = useState(value?.manual ? value.name : "");
  const [mode, setMode] = useState<Mode>(recent.length ? "recent" : "search");
  const [at, setAt] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [results, setResults] = useState<Found[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const typed = query.trim();
  const searchText = mode === "near" && typed.length < 2 ? "카페" : typed;
  const searching = mode !== "recent" && searchText.length >= 2 && (mode !== "near" || at !== null);
  const latest = useRef(0);

  useEffect(() => {
    if (!searching) { setResults([]); setBusy(false); return; }
    const controller = new AbortController();
    const run = ++latest.current;
    setBusy(true);
    const timer = window.setTimeout(() => {
      findCafes(searchText, mode === "near" ? at : null, controller.signal)
        .then(cafes => { if (run === latest.current) { setResults(cafes); setError(""); } })
        .catch(problem => { if (run === latest.current && !controller.signal.aborted) { setResults([]); setError(problem instanceof Error && problem.message ? problem.message : NOT_READY); } })
        .finally(() => { if (run === latest.current) setBusy(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [searching, searchText, mode, at]);

  const nearMe = () => {
    if (mode === "near") { setMode("search"); return; }
    if (at) { setMode("near"); return; }
    if (!navigator.geolocation) { setError("이 기기에서는 위치를 쓸 수 없어요."); return; }
    setLocating(true); setError("");
    navigator.geolocation.getCurrentPosition(
      position => { setLocating(false); setAt({ lat: position.coords.latitude, lng: position.coords.longitude }); setMode("near"); },
      () => { setLocating(false); setError("위치를 가져오지 못했어요. 위치 권한을 확인해주세요."); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
    );
  };
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  const recentShown = words.length ? recent.filter(cafe => words.every(word => `${cafe.name} ${cafe.address ?? ""}`.toLowerCase().includes(word))) : recent;
  const shown: Found[] = mode === "recent" ? recentShown : results;
  const isCurrent = (cafe: CafePlace) => Boolean(value) && (cafe.placeId ? cafe.placeId === value!.placeId : !value!.placeId && cafe.name === value!.name);

  return <div className="be-pick-layer">
    <div className="be-pick-backdrop" style={pick.backdropStyle} onClick={pick.close} aria-hidden="true" />
    <div className="be-pick" ref={pick.sheetRef} style={pick.sheetStyle} role="dialog" aria-modal="true" aria-label="카페">
      <div className="be-pick-grab" {...pick.handleProps} aria-hidden="true" />
      <div className="be-pick-head" {...pick.handleProps}><h3>카페</h3><div>{value && <button type="button" onClick={() => onPick(null)}>지우기</button>}<button type="button" onClick={pick.close}>닫기</button></div></div>
      <label className="be-pick-search"><span className="sr-only">카페 이름</span><input type="search" value={query} placeholder="카페 이름이나 동네로 검색" autoFocus={window.matchMedia("(min-width: 760px)").matches}
        onChange={event => { setQuery(event.target.value); if (mode === "recent" && event.target.value.trim().length >= 2) setMode("search"); }}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} /></label>
      <div className="bw-cafe-chips" role="group" aria-label="카페 찾는 방법">
        <button type="button" className="bw-again" aria-pressed={mode === "near"} disabled={locating} onClick={nearMe}>{locating ? "위치 찾는 중…" : "내 주변"}</button>
        {recent.length > 0 && <button type="button" className="bw-again" aria-pressed={mode === "recent"} onClick={() => setMode(mode === "recent" ? "search" : "recent")}>최근 간 곳</button>}
      </div>
      <div className="be-pick-scroll" ref={pick.scrollRef}>
        {error && <p className="be-pick-note" role="status">{error}</p>}
        {mode !== "recent" && !error && (busy ? <p className="be-pick-note">찾는 중…</p> : searching && results.length > 0 ? <p className="be-pick-note">카카오 지도 검색 결과</p> : searching ? <p className="be-pick-note">찾는 카페가 없어요</p> : mode === "search" && <p className="be-pick-note">두 글자 이상 입력하면 찾아드려요</p>)}
        <div className="be-pick-list">
          {shown.map(cafe => <div className="be-pick-item" key={cafe.placeId || cafe.name} aria-current={isCurrent(cafe)}>
            <button type="button" onClick={() => { const { distance: _distance, ...place } = cafe; onPick(place); }}>
              <span>{cafe.name}</span>
              {(cafe.address || cafe.distance !== undefined) && <small>{[cafe.distance !== undefined && formatDistance(cafe.distance), cafe.address].filter(Boolean).join(" · ")}</small>}
            </button>
          </div>)}
          <div className="be-pick-item be-pick-new"><button type="button" disabled={!typed} onClick={() => onPick({ name: typed, manual: true })}>
            <span>직접 입력</span><small>{typed ? `‘${typed}’ 이름으로 저장해요` : "검색창에 카페 이름을 적어주세요"}</small>
          </button></div>
        </div>
      </div>
    </div>
  </div>;
}
