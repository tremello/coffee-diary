import { useEffect, useState } from "react";

// Theme: follows the system setting until the user taps the toggle. The choice lives outside the cf_ keys so logging out keeps it,
// and choosing the same look as the system clears it so the app goes back to following the system.
// index.html applies the stored choice before first paint.
const THEME_KEY = "coffee-theme";

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

const readThemeChoice = (): "light" | "dark" | null => { try { const t = localStorage.getItem(THEME_KEY); return t === "light" || t === "dark" ? t : null; } catch { return null; } };

export function ThemeToggle() {
  const [choice, setChoice] = useState(readThemeChoice);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);
  useEffect(() => {
    const query = darkQuery();
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const dark = choice ? choice === "dark" : systemDark;
  useEffect(() => {
    if (choice) document.documentElement.dataset.theme = choice; else delete document.documentElement.dataset.theme;
    try { if (choice) localStorage.setItem(THEME_KEY, choice); else localStorage.removeItem(THEME_KEY); } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1a1713" : "#7a5733");
  }, [choice, dark]);
  const toggle = () => { const next = !dark; setChoice(next === systemDark ? null : next ? "dark" : "light"); };
  const label = dark ? "밝은 화면으로 바꾸기" : "어두운 화면으로 바꾸기";
  return <button type="button" className="refresh-button theme-button" onClick={toggle} aria-label={label} title={label}>{dark ? <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor" /><g stroke="currentColor" strokeWidth="2" strokeLinecap="round">{[0, 45, 90, 135, 180, 225, 270, 315].map(a => <line key={a} x1="12" y1="2.6" x2="12" y2="4.6" transform={`rotate(${a} 12 12)`} />)}</g></svg> : <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" /></svg>}</button>;
}
