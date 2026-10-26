// Local data belongs to the account in OWNER_KEY; keys under PENDING_PREFIX failed to reach the server and must be pushed, not overwritten.
export const OWNER_KEY = "cf_owner";
export const PENDING_PREFIX = "cf_pending:";
export const readLocal = <T,>(key: string): T | undefined => {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : undefined; } catch { return undefined; }
};
export const writeLocal = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
export const localDataKeys = () => { try { return Object.keys(localStorage).filter(key => key.startsWith("cf_")); } catch { return []; } };
export const clearLocalData = () => localDataKeys().forEach(key => { try { localStorage.removeItem(key); } catch {} });
export const hasPendingSync = () => localDataKeys().some(key => key.startsWith(PENDING_PREFIX));
export const adoptLocalData = (userId: string) => {
  const owner = (() => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } })();
  if (owner && owner !== userId) clearLocalData();
  try { localStorage.setItem(OWNER_KEY, userId); } catch {}
};
