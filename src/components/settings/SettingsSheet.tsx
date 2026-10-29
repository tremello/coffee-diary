import { useEffect, useRef } from "react";
import { type StorageSetter } from "../../data/sync";
import { type ExportData } from "../../lib/export";
import { type Bean } from "../../types";
import { AboutSection } from "./AboutSection";
import { AccountSection } from "./AccountSection";
import { DataSection } from "./DataSection";
import { DisplaySection } from "./DisplaySection";
import { ListsSection } from "./ListsSection";
import { useSheetDrag } from "./useSheetDrag";

type SettingsProps = { user: { id: string; email?: string } | null; data: ExportData; setBeans: StorageSetter<Bean[]> };

function SettingsSections({ user, data, setBeans }: SettingsProps) {
  return <>
    <AccountSection user={user} />
    <DisplaySection />
    <ListsSection userId={user?.id ?? null} />
    <DataSection data={data} setBeans={setBeans} signedIn={Boolean(user)} />
    <AboutSection />
  </>;
}

// Wider screens: settings is a tab of its own, shown under the tab row in place of the page, like the other tabs.
// Two columns so each row stays short; the lists that open (tools, update history) sit on the right so opening one never shifts the left column.
export function SettingsPage({ user, data, setBeans }: SettingsProps) {
  return <div className="settings-page">
    <div className="settings-column">
      <AccountSection user={user} />
      <DisplaySection />
      <DataSection data={data} setBeans={setBeans} signedIn={Boolean(user)} />
    </div>
    <div className="settings-column">
      <ListsSection userId={user?.id ?? null} />
      <AboutSection />
    </div>
  </div>;
}

// Bottom sheet on phones (drag it down to close; see useSheetDrag), side panel on wider screens. App unmounts the pages while it is open, so the lists here
// are the only copy in memory and the pages read the new values when they come back.
export function SettingsSheet({ onClose, ...props }: SettingsProps & { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { sheetRef, bodyRef, backdropRef, handleProps, close } = useSheetDrag(onClose);
  const closeLatest = useRef(close);
  closeLatest.current = close;
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeLatest.current(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return <div className="settings-layer">
    <div ref={backdropRef} className="settings-backdrop" onClick={close} aria-hidden="true" />
    <div ref={sheetRef} className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="settings-drag" {...handleProps}>
        <div className="settings-grab" aria-hidden="true" />
        <div className="settings-head"><h2 id="settings-title">설정</h2><button ref={closeRef} type="button" className="settings-close" onClick={close}>닫기</button></div>
      </div>
      <div ref={bodyRef} className="settings-body">
        <SettingsSections {...props} />
      </div>
    </div>
  </div>;
}
