import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabase } from "../supabase";
import { PENDING_PREFIX, readLocal, writeLocal } from "./storage";

export type StorageSetter<T> = (value: T) => void;

export const failedSyncKeys = new Set<string>();
export const syncRetries = new Map<string, () => void>();
export const syncListeners = new Set<() => void>();
export const setSyncFailed = (key: string, failed: boolean) => {
  if (failed === failedSyncKeys.has(key)) return;
  if (failed) failedSyncKeys.add(key); else failedSyncKeys.delete(key);
  syncListeners.forEach(listener => listener());
};
export const retryFailedSync = () => [...failedSyncKeys].forEach(key => syncRetries.get(key)?.());
export function useSyncFailed() {
  return useSyncExternalStore(listener => { syncListeners.add(listener); return () => { syncListeners.delete(listener); }; }, () => failedSyncKeys.size > 0);
}

// BASE_PREFIX holds the last value known to match the server, so a push can tell which side changed what.
export const BASE_PREFIX = "cf_base:";
export const REFRESH_INTERVAL = 10_000;
export const VERIFY_DELAY = 1_500;
export const MAX_VERIFY_ROUNDS = 3;
export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const itemId = (item: unknown) => typeof item === "string" ? item : item && typeof item === "object" && "id" in item ? String((item as { id: unknown }).id) : undefined;
// Both sides changed the same record: take each field from whichever side changed it; bean stock deltas add up.
export const mergeRecord = (base: unknown, mine: unknown, theirs: unknown, sumStock: boolean): unknown => {
  if (sameJson(mine, base)) return theirs;
  if (sameJson(theirs, base)) return mine;
  const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (!isRecord(base) || !isRecord(mine) || !isRecord(theirs)) return mine;
  const merged: Record<string, unknown> = {};
  new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]).forEach(field => {
    const mineChanged = !sameJson(mine[field], base[field]), theirsChanged = !sameJson(theirs[field], base[field]);
    const [b, m, t] = [base[field], mine[field], theirs[field]];
    const bothStock = field === "remaining" && mineChanged && theirsChanged && typeof b === "number" && typeof m === "number" && typeof t === "number";
    // On a re-check the server copy may already include our deduction, so adding again would double count; keep theirs.
    const value = bothStock ? (sumStock ? Math.round(((t as number) + (m as number) - (b as number)) * 10) / 10 : t) : mineChanged ? m : t;
    if (value !== undefined) merged[field] = value;
  });
  return merged;
};
export const mergeSynced = (base: unknown, mine: unknown, theirs: unknown, sumStock = true): unknown => {
  if (!Array.isArray(mine) || !Array.isArray(theirs)) return mine;
  const baseItems = Array.isArray(base) ? base : [];
  if ([...baseItems, ...mine, ...theirs].some(item => itemId(item) === undefined)) return mine;
  const byId = (items: unknown[]) => new Map(items.map(item => [itemId(item) as string, item]));
  const baseById = byId(baseItems), mineById = byId(mine), theirsById = byId(theirs);
  const merged: unknown[] = [];
  theirs.forEach(item => {
    const id = itemId(item) as string;
    if (mineById.has(id)) merged.push(baseById.has(id) ? mergeRecord(baseById.get(id), mineById.get(id), item, sumStock) : mineById.get(id));
    else if (!baseById.has(id)) merged.push(item);
  });
  mine.forEach(item => {
    const id = itemId(item) as string;
    if (theirsById.has(id)) return;
    if (!baseById.has(id) || !sameJson(item, baseById.get(id))) merged.push(item);
  });
  return merged;
};
// readyFor is the account whose first server read finished for this key; pushes wait for it so nothing is sent before we know the account's data.
export type KeySync = { running: boolean; again: boolean; rounds: number; lastRefresh: number; readyFor: string | null; queued: boolean; apply?: (value: unknown) => void };
export const keySyncs = new Map<string, KeySync>();
export const keySync = (key: string) => {
  let sync = keySyncs.get(key);
  if (!sync) { sync = { running: false, again: false, rounds: 0, lastRefresh: 0, readyFor: null, queued: false }; keySyncs.set(key, sync); }
  return sync;
};
export const fetchRemote = async (key: string, userId: string) => {
  const { data, error } = await supabase.from("coffee_data").select("data").eq("user_id", userId).eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.data as unknown;
};
export const pushOnce = async (key: string, userId: string) => {
  const sync = keySync(key);
  const mine = readLocal<unknown>(key);
  if (mine === undefined) return;
  let failed = true;
  try {
    const theirs = await fetchRemote(key, userId);
    // A newer local edit arrived while reading; the next round pushes it instead.
    if (!sameJson(readLocal(key), mine)) { sync.again = true; return; }
    const base = readLocal<unknown>(BASE_PREFIX + key);
    const value = theirs !== undefined && !sameJson(theirs, base) ? mergeSynced(base, mine, theirs, sync.rounds === 0) : mine;
    if (!sameJson(value, mine)) { writeLocal(key, value); sync.apply?.(value); }
    const { error } = await supabase.from("coffee_data").upsert({ key, data: value, user_id: userId }, { onConflict: "user_id,key" });
    if (error) console.error("Coffee sync save failed", error);
    else {
      failed = false;
      writeLocal(BASE_PREFIX + key, value);
      // Two devices saving at once can overwrite each other; re-read shortly after and merge again against what we saw.
      await new Promise(resolve => setTimeout(resolve, VERIFY_DELAY));
      const check = await fetchRemote(key, userId).catch(() => value);
      if (!sameJson(check, value) && sync.rounds < MAX_VERIFY_ROUNDS) { sync.rounds++; writeLocal(BASE_PREFIX + key, theirs ?? base); sync.again = true; }
    }
  } catch (error) { console.error("Coffee sync save failed", error); }
  try { if (failed) localStorage.setItem(PENDING_PREFIX + key, "1"); else localStorage.removeItem(PENDING_PREFIX + key); } catch {}
  setSyncFailed(key, failed);
};
// One push per key at a time; edits made meanwhile are sent together when it finishes.
export const pushKey = async (key: string, userId: string) => {
  const sync = keySync(key);
  if (sync.readyFor !== userId) { sync.queued = true; return; }
  if (sync.running) { sync.again = true; return; }
  sync.running = true;
  sync.rounds = 0;
  try { do { sync.again = false; await pushOnce(key, userId); } while (sync.again); }
  finally { sync.running = false; }
};
export const refreshKey = async (key: string, userId: string) => {
  const sync = keySync(key);
  if (sync.running || sync.readyFor !== userId || Date.now() - sync.lastRefresh < REFRESH_INTERVAL) return;
  sync.lastRefresh = Date.now();
  if (readLocal(PENDING_PREFIX + key)) { void pushKey(key, userId); return; }
  const local = readLocal<unknown>(key);
  try {
    const remote = await fetchRemote(key, userId);
    if (remote === undefined || sync.running || !sameJson(readLocal(key), local)) return;
    writeLocal(BASE_PREFIX + key, remote);
    if (!sameJson(remote, local)) { writeLocal(key, remote); sync.apply?.(remote); }
  } catch (error) { console.error("Coffee sync read failed", error); }
};

export function useStorage<T>(key: string, init: T, userId: string | null = null): [T, StorageSetter<T>] {
  const [val, setVal] = useState<T>(() => readLocal<T>(key) ?? init);
  const editedRef = useRef(false);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    editedRef.current = false;
    // Drop whatever the previous account left in memory; adoptLocalData has already cleared its local copy.
    setVal(readLocal<T>(key) ?? init);
    const sync = keySync(key);
    sync.readyFor = null; sync.queued = false;
    const markReady = () => {
      if (cancelled) return;
      sync.readyFor = userId;
      if (sync.queued) { sync.queued = false; void pushKey(key, userId); }
    };
    const apply = (value: unknown) => { if (!cancelled) setVal(value as T); };
    sync.apply = apply;
    const pushLocal = () => { void pushKey(key, userId); };
    syncRetries.set(key, pushLocal);
    const refresh = () => { if (document.visibilityState === "visible") void refreshKey(key, userId); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const cleanup = () => {
      cancelled = true; syncRetries.delete(key);
      if (sync.apply === apply) sync.apply = undefined;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
    if (readLocal(PENDING_PREFIX + key)) { markReady(); pushLocal(); return cleanup; }
    sync.lastRefresh = Date.now();
    fetchRemote(key, userId).then(remote => {
      if (cancelled) return;
      if (editedRef.current) { markReady(); return; }
      if (remote !== undefined) { setVal(remote as T); writeLocal(key, remote); writeLocal(BASE_PREFIX + key, remote); markReady(); return; }
      markReady();
      const local = readLocal<T>(key);
      if (Array.isArray(local) && local.length > 0) pushLocal();
      else if (local === undefined) setVal(init);
    }, error => { console.error("Coffee sync read failed", error); markReady(); });
    return cleanup;
  }, [key, userId]);
  const set = (v: T) => {
    editedRef.current = true;
    setVal(v);
    writeLocal(key, v);
    if (userId) void pushKey(key, userId);
  };
  return [val, set];
}
