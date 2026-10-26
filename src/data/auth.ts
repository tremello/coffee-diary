import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { adoptLocalData, clearLocalData } from "./storage";

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
