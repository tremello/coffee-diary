import { useState } from "react";
import { confirmAndSignOut, signInWithGoogle } from "../data/auth";
import { FONT } from "../lib/format";
import { type Page, PAGE_LABELS, PAGES } from "../lib/pages";

export function Header({ page, setPage, user, authLoading, onOpenSettings }: { page: Page; setPage: (page: Page) => void; user: { id: string; email?: string } | null; authLoading: boolean; onOpenSettings: () => void }) {
  const [loginError, setLoginError] = useState("");
  const signInGoogle = async () => {
    setLoginError("");
    const { error } = await signInWithGoogle();
    if (error) setLoginError(`Google 로그인에 실패했어요. ${error.message}`);
  };
  const accountName = user?.email?.split("@")[0] || "내 계정";
  const signOut = () => confirmAndSignOut(accountName);
  return (
    <div className="app-header" style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 0 0" }}>
        <div>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT }}>My Coffee Diary</p>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "2px 0 0", letterSpacing: "-0.02em", color: "var(--color-text-primary)", fontFamily: FONT }}>{PAGE_LABELS[page]}</h1>
        </div>
        <div className="account-actions">{user ? <button type="button" className="refresh-button account-button" onClick={signOut} aria-label={`${accountName} 로그아웃`} title={`${accountName} · 로그아웃`}>{accountName.slice(0, 1).toUpperCase()}</button> : <button type="button" className="google-button" onClick={signInGoogle} aria-label="Google 계정으로 로그인" title="Google 계정으로 로그인">로그인</button>}<button className="refresh-button" onClick={() => window.location.reload()} aria-label="새로고침" title="새로고침">↻</button><img className="brand-mark" src="/coffee-diary-logo-brown-96.png" width="40" height="40" alt="커피 기록 로고" /><button type="button" className="menu-button" onClick={onOpenSettings} aria-label="설정" title="설정"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" /></svg></button></div>
      </div>
      {loginError && <p className="login-error" role="alert">{loginError}</p>}
      <nav className="page-tabs">
        <span className="page-tab-indicator" aria-hidden="true" style={{ transform: `translateX(${PAGES.indexOf(page) * 100}%)` }} />
        {PAGES.map(p => (
          <button key={p} className="page-tab" onClick={() => setPage(p)} aria-current={page === p ? "page" : undefined} style={{
            padding: "8px 16px", fontSize: 14, borderRadius: 10, fontFamily: FONT,
            border: page === p ? "1px solid var(--bd-7a5733)" : "0.5px solid var(--color-border-tertiary)",
            background: page === p ? "var(--bg-7a5733)" : "transparent",
            color: page === p ? "var(--fg-ffffff)" : "var(--color-text-secondary)",
            cursor: "pointer"
          }}><span className="page-tab-icon" aria-hidden="true"><PageIcon page={p} /></span><span>{PAGE_LABELS[p]}</span></button>
        ))}
      </nav>
    </div>
  );
}

function PageIcon({ page }: { page: Page }) {
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (page === "Beans") return <svg {...props}><ellipse cx="12" cy="12" rx="6.5" ry="9" transform="rotate(42 12 12)" /><path d="M8 17c2.8-3 4.4-6.3 4.7-10" /></svg>;
  if (page === "Brew Log") return <svg {...props}><path d="m6 18 2.2-5.8L17.7 2.7a1.8 1.8 0 0 1 2.6 2.6L10.8 15.8 5 18Z" /><path d="m14.7 5.7 3.6 3.6M4 21h7" /></svg>;
  if (page === "Recipes") return <svg {...props}><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></svg>;
  return <svg {...props}><path d="M5 19V9M12 19V5M19 19v-7" /><path d="M3 19h18" /></svg>;
}
