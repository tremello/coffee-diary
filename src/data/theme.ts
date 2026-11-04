import { useEffect, useState } from "react";

// Theme: follows the system setting unless the user picks light or dark. The choice lives outside the cf_ keys so logging out keeps it.
// index.html applies the stored choice before first paint. The settings sheet sets it; the hook keeps every reader in step with the system.
export type ThemeChoice = "light" | "dark" | null;

const THEME_KEY = "coffee-theme";
const CHANGE_EVENT = "coffee-theme-change";

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

const readThemeChoice = (): ThemeChoice => { try { const t = localStorage.getItem(THEME_KEY); return t === "light" || t === "dark" ? t : null; } catch { return null; } };

// Colour theme: coffee (default, no attribute) or one of the extra palettes in 26-color-themes.css, set as data-color on <html>.
export type ColorChoice = "coffee" | "earlgrey" | "espresso";
export const COLOR_CHOICES: { value: ColorChoice; label: string }[] = [{ value: "coffee", label: "커피" }, { value: "earlgrey", label: "얼그레이" }, { value: "espresso", label: "에스프레소" }];
const COLOR_KEY = "coffee-color";
// Browser bar colour per theme: the page colour in dark, the accent in light. Keep in step with index.html.
const BAR_COLORS: Record<ColorChoice, [light: string, dark: string]> = { coffee: ["#7a5733", "#1a1713"], earlgrey: ["#45627f", "#15181b"], espresso: ["#665d55", "#181717"] };

const readColorChoice = (): ColorChoice => { try { const c = localStorage.getItem(COLOR_KEY); return c === "earlgrey" || c === "espresso" ? c : "coffee"; } catch { return "coffee"; } };

const applyTheme = (choice: ThemeChoice) => {
  if (choice) document.documentElement.dataset.theme = choice; else delete document.documentElement.dataset.theme;
  const color = readColorChoice();
  if (color === "coffee") delete document.documentElement.dataset.color; else document.documentElement.dataset.color = color;
  const dark = choice ? choice === "dark" : darkQuery().matches;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR_COLORS[color][dark ? 1 : 0]);
};

export const setColorChoice = (color: ColorChoice) => {
  try { if (color === "coffee") localStorage.removeItem(COLOR_KEY); else localStorage.setItem(COLOR_KEY, color); } catch {}
  applyTheme(readThemeChoice());
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const setThemeChoice = (choice: ThemeChoice) => {
  try { if (choice) localStorage.setItem(THEME_KEY, choice); else localStorage.removeItem(THEME_KEY); } catch {}
  applyTheme(choice);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export function useTheme() {
  const [choice, setChoice] = useState(readThemeChoice);
  const [color, setColor] = useState(readColorChoice);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);
  useEffect(() => {
    const query = darkQuery();
    const onSystem = () => { setSystemDark(query.matches); applyTheme(readThemeChoice()); };
    const onChoice = () => { setChoice(readThemeChoice()); setColor(readColorChoice()); };
    query.addEventListener("change", onSystem);
    window.addEventListener(CHANGE_EVENT, onChoice);
    return () => { query.removeEventListener("change", onSystem); window.removeEventListener(CHANGE_EVENT, onChoice); };
  }, []);
  return { choice, color, systemDark, dark: choice ? choice === "dark" : systemDark };
}
