import { useEffect, useRef } from "react";
import { type StorageSetter } from "../../data/sync";
import { type ExportData } from "../../lib/export";
import { type Bean } from "../../types";
import { AboutSection } from "./AboutSection";
import { AccountSection } from "./AccountSection";
import { DataSection } from "./DataSection";
import { DisplaySection } from "./DisplaySection";
import { ListsSection } from "./ListsSection";

// Bottom sheet on phones, side panel on wider screens. App unmounts the pages while it is open, so the lists here
// are the only copy in memory and the pages read the new values when they come back.
export function SettingsSheet({ user, data, setBeans, onClose }: { user: { id: string; email?: string } | null; data: ExportData; setBeans: StorageSetter<Bean[]>; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return <div className="settings-layer">
    <div className="settings-backdrop" onClick={onClose} aria-hidden="true" />
    <div className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="settings-grab" aria-hidden="true" />
      <div className="settings-head"><h2 id="settings-title">설정</h2><button ref={closeRef} type="button" className="settings-close" onClick={onClose}>닫기</button></div>
      <div className="settings-body">
        <AccountSection user={user} />
        <DisplaySection />
        <ListsSection userId={user?.id ?? null} />
        <DataSection data={data} setBeans={setBeans} signedIn={Boolean(user)} />
        <AboutSection />
      </div>
    </div>
  </div>;
}
