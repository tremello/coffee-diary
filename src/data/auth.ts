import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { adoptLocalData, clearLocalData, hasPendingSync } from "./storage";

export function useAuth() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Clear another account's local data before any storage hook sees the new user id.
    const applyUser = (next: { id: string; email?: string } | null) => { if (next) adoptLocalData(next.id); setUser(next); };
    supabase.auth.getSession().then(({ data }) => { applyUser(data.session?.user ?? null); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applyUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);
  return { user, loading };
}

export const signInWithGoogle = () => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/` } });
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
