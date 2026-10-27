import { useEffect, useState } from "react";

// Theme: follows the system setting unless the user picks light or dark. The choice lives outside the cf_ keys so logging out keeps it.
// index.html applies the stored choice before first paint. The settings sheet sets it; the hook keeps every reader in step with the system.
export type ThemeChoice = "light" | "dark" | null;

const THEME_KEY = "coffee-theme";
const CHANGE_EVENT = "coffee-theme-change";

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

const readThemeChoice = (): ThemeChoice => { try { const t = localStorage.getItem(THEME_KEY); return t === "light" || t === "dark" ? t : null; } catch { return null; } };

const applyTheme = (choice: ThemeChoice) => {
  if (choice) document.documentElement.dataset.theme = choice; else delete document.documentElement.dataset.theme;
  const dark = choice ? choice === "dark" : darkQuery().matches;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1a1713" : "#7a5733");
};

export const setThemeChoice = (choice: ThemeChoice) => {
  try { if (choice) localStorage.setItem(THEME_KEY, choice); else localStorage.removeItem(THEME_KEY); } catch {}
  applyTheme(choice);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export function useTheme() {
  const [choice, setChoice] = useState(readThemeChoice);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);
  useEffect(() => {
    const query = darkQuery();
    const onSystem = () => { setSystemDark(query.matches); applyTheme(readThemeChoice()); };
    const onChoice = () => setChoice(readThemeChoice());
    query.addEventListener("change", onSystem);
    window.addEventListener(CHANGE_EVENT, onChoice);
    return () => { query.removeEventListener("change", onSystem); window.removeEventListener(CHANGE_EVENT, onChoice); };
  }, []);
  return { choice, systemDark, dark: choice ? choice === "dark" : systemDark };
}
