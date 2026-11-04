import { DEVICE_KEYS, readStartPage, useDeviceSetting } from "../../data/settings";
import { COLOR_CHOICES, setColorChoice, setThemeChoice, useTheme } from "../../data/theme";
import { type Page, PAGE_LABELS, PAGES } from "../../lib/pages";
import { Segmented, SettingsGroup, SettingsRow } from "./parts";

export function DisplaySection() {
  const { choice, color } = useTheme();
  const [startPage, setStartPage] = useDeviceSetting<Page>(DEVICE_KEYS.startPage, readStartPage);
  return <SettingsGroup title="화면 (이 기기)">
    <SettingsRow label="밝기"><Segmented label="밝기" value={choice ?? "system"} options={[{ value: "system", label: "시스템" }, { value: "light", label: "밝게" }, { value: "dark", label: "어둡게" }]} onChange={value => setThemeChoice(value === "system" ? null : value)} /></SettingsRow>
    <SettingsRow label="색"><Segmented label="색" value={color} options={COLOR_CHOICES} onChange={setColorChoice} /></SettingsRow>
    <SettingsRow label="처음 열 탭"><select className="settings-select" aria-label="처음 열 탭" value={startPage} onChange={event => setStartPage(event.target.value as Page)}>{PAGES.map(page => <option key={page} value={page}>{PAGE_LABELS[page]}</option>)}</select></SettingsRow>
  </SettingsGroup>;
}
