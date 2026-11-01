import { useEffect, useRef, useState } from "react";
import { type StorageSetter } from "../../data/sync";
import { type ExportData } from "../../lib/export";
import { type Bean } from "../../types";
import { AboutSection } from "./AboutSection";
import { AccountSection } from "./AccountSection";
import { DataSection } from "./DataSection";
import { DisplaySection } from "./DisplaySection";
import { ListsSection } from "./ListsSection";
import { PeakSection } from "./PeakSection";
import { useSheetDrag } from "./useSheetDrag";

type SettingsProps = { user: { id: string; email?: string } | null; data: ExportData; setBeans: StorageSetter<Bean[]> };

function SettingsSections({ user, data, setBeans }: SettingsProps) {
  return <>
    <AccountSection user={user} />
    <DisplaySection />
    <ListsSection userId={user?.id ?? null} />
    <PeakSection userId={user?.id ?? null} beans={data.beans} />
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
      <PeakSection userId={user?.id ?? null} beans={data.beans} />
      <AboutSection />
    </div>
  </div>;
}

const DESK_SECTIONS = [
  { id: "account", title: "계정·동기화", hint: "로그인, 기기 간 동기화" },
  { id: "display", title: "화면", hint: "밝게·어둡게" },
  { id: "lists", title: "내 도구·목록", hint: "드리퍼·그라인더·필터·물" },
  { id: "peak", title: "맛있는 시기", hint: "로스터리별 기준 날짜" },
  { id: "data", title: "데이터·정보", hint: "내보내기·가져오기, 업데이트 소식" }
] as const;
type DeskSection = typeof DESK_SECTIONS[number]["id"];

// Wide PC screens: a category list on the left and only the chosen group on the right, so nothing scrolls far.
// The tool lists are open cards there, edited in place.
export function SettingsDesk({ user, data, setBeans }: SettingsProps) {
  const [section, setSection] = useState<DeskSection>("account");
  const userId = user?.id ?? null;
  return <div className="settings-page settings-desk">
    <nav className="settings-nav" aria-label="설정 분류">
      {DESK_SECTIONS.map(item => <button type="button" key={item.id} className="settings-nav-item" aria-current={section === item.id ? "true" : undefined} onClick={() => setSection(item.id)}>
        <strong>{item.title}</strong><small>{item.hint}</small>
      </button>)}
    </nav>
    <div className={`settings-pane settings-pane-${section}`}>
      {section === "account" && <AccountSection user={user} />}
      {section === "display" && <DisplaySection />}
      {section === "lists" && <ListsSection userId={userId} open />}
      {section === "peak" && <PeakSection userId={userId} beans={data.beans} />}
      {section === "data" && <><DataSection data={data} setBeans={setBeans} signedIn={Boolean(user)} /><AboutSection /></>}
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
