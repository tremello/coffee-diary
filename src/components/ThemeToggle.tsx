import { setThemeChoice, useTheme } from "../data/theme";

// Header shortcut between light and dark. Choosing the same look as the system clears the choice so the app follows the system again.
export function ThemeToggle() {
  const { dark, systemDark } = useTheme();
  const toggle = () => { const next = !dark; setThemeChoice(next === systemDark ? null : next ? "dark" : "light"); };
  const label = dark ? "밝은 화면으로 바꾸기" : "어두운 화면으로 바꾸기";
  return <button type="button" className="refresh-button theme-button" onClick={toggle} aria-label={label} title={label}>{dark ? <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor" /><g stroke="currentColor" strokeWidth="2" strokeLinecap="round">{[0, 45, 90, 135, 180, 225, 270, 315].map(a => <line key={a} x1="12" y1="2.6" x2="12" y2="4.6" transform={`rotate(${a} 12 12)`} />)}</g></svg> : <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" /></svg>}</button>;
}
