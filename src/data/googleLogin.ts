// Google sign-in that comes back to this site instead of to the Supabase server,
// so Google's account screen names our own address. Supabase then checks the Google token.
// A Google client ID is public (it is in every sign-in link), not a secret.
export const GOOGLE_CLIENT_ID = "713082441007-k79jkm74t19nsr1v57eq24u52bkol0g4.apps.googleusercontent.com";

const NONCE_KEY = "coffee-google-nonce";
const STATE_KEY = "coffee-google-state";
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const randomHex = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const sha256Hex = async (text: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));

export const startGoogleLogin = async () => {
  const nonce = randomHex(), state = randomHex();
  sessionStorage.setItem(NONCE_KEY, nonce);
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${window.location.origin}/`,
    response_type: "id_token",
    scope: "openid email profile",
    nonce: await sha256Hex(nonce), // Google gets the hash; Supabase gets the original and compares.
    state,
    prompt: "select_account",
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

export type GoogleReturn = { idToken: string; nonce: string } | { error: string } | null;

// Run once, before the Supabase client and the app read the address: takes Google's answer off the hash.
export const takeGoogleReturn = (): GoogleReturn => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has("id_token") && !params.has("error")) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  let nonce = "", state = "";
  try {
    nonce = sessionStorage.getItem(NONCE_KEY) ?? ""; state = sessionStorage.getItem(STATE_KEY) ?? "";
    sessionStorage.removeItem(NONCE_KEY); sessionStorage.removeItem(STATE_KEY);
  } catch { /* No storage: the state check below fails safely. */ }
  if (!state || params.get("state") !== state) return { error: "state" };
  const idToken = params.get("id_token");
  if (!idToken) return { error: params.get("error") ?? "unknown" };
  return { idToken, nonce };
};
