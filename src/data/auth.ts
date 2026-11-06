import { useEffect, useState } from "react";
import { googleReturn, supabase } from "../supabase";
import { GOOGLE_CLIENT_ID, startGoogleLogin } from "./googleLogin";
import { adoptLocalData, clearLocalData, hasPendingSync } from "./storage";
import { appLinkHash, PENDING_LINK_KEY, readAppLink } from "../lib/pages";

// Google's answer from the address, used once by the first useAuth.
let pendingGoogle = googleReturn;

export function useAuth() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Clear another account's local data before any storage hook sees the new user id.
    const applyUser = (next: { id: string; email?: string } | null) => { if (next) adoptLocalData(next.id); setUser(next); };
    const ready = async () => {
      // Back from Google's screen: hand its token to Supabase once (StrictMode runs effects twice).
      const back = pendingGoogle; pendingGoogle = null;
      if (back && "idToken" in back) {
        const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: back.idToken, nonce: back.nonce });
        if (error) window.alert(`Google 로그인에 실패했어요. 다시 시도해 주세요. (${error.message})`);
      } else if (back && back.error !== "access_denied") window.alert("Google 로그인에 실패했어요. 다시 시도해 주세요.");
      const { data } = await supabase.auth.getSession();
      applyUser(data.session?.user ?? null); setLoading(false);
    };
    void ready();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applyUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);
  return { user, loading };
}

export const signInWithGoogle = () => {
  const link = readAppLink(window.location.hash);
  try {
    if (!link.invalid && (link.beanId || link.brewId || link.range)) sessionStorage.setItem(PENDING_LINK_KEY, appLinkHash(link));
    else sessionStorage.removeItem(PENDING_LINK_KEY);
  } catch { /* Optional view context; login still works without storage. */ }
  if (!GOOGLE_CLIENT_ID) return supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/` } });
  return startGoogleLogin().then(() => ({ error: null }), (error: Error) => ({ error }));
};
export const signOutAndClear = async () => {
  await supabase.auth.signOut();
  clearLocalData();
  window.location.reload();
};

// Asks before signing out, warning louder when some changes never reached the server and would be lost.
export const confirmAndSignOut = async (accountName: string) => {
  if (!hasPendingSync() && !window.confirm(`${accountName} 계정에서 로그아웃할까요?`)) return;
  if (hasPendingSync() && !window.confirm("아직 서버에 저장하지 못한 기록이 있어요. 로그아웃하면 이 기기에서 지워져요. 계속할까요?")) return;
  await signOutAndClear();
};
