import { DEVICE_KEYS, readStartPage, useDeviceSetting } from "../../data/settings";
import { setThemeChoice, useTheme } from "../../data/theme";
import { type Page, PAGE_LABELS, PAGES } from "../../lib/pages";
import { type BeanDensity, initialBeanDensity } from "../../pages/BeansPage";
import { Segmented, SettingsGroup, SettingsRow } from "./parts";

export function DisplaySection() {
  const { choice } = useTheme();
  const [startPage, setStartPage] = useDeviceSetting<Page>(DEVICE_KEYS.startPage, readStartPage);
  const [density, setDensity] = useDeviceSetting<BeanDensity>(DEVICE_KEYS.beanDensity, initialBeanDensity);
  return <SettingsGroup title="화면 (이 기기)">
    <SettingsRow label="테마"><Segmented label="테마" value={choice ?? "system"} options={[{ value: "system", label: "시스템" }, { value: "light", label: "밝게" }, { value: "dark", label: "어둡게" }]} onChange={value => setThemeChoice(value === "system" ? null : value)} /></SettingsRow>
    <SettingsRow label="기본 원두 목록 보기" hint="앱을 열 때마다 이 보기로 시작해요."><Segmented label="기본 원두 목록 보기" value={density} options={[{ value: "detail", label: "자세히" }, { value: "compact", label: "간략하게" }]} onChange={setDensity} /></SettingsRow>
    <SettingsRow label="처음 열 탭"><select className="settings-select" aria-label="처음 열 탭" value={startPage} onChange={event => setStartPage(event.target.value as Page)}>{PAGES.map(page => <option key={page} value={page}>{PAGE_LABELS[page]}</option>)}</select></SettingsRow>
  </SettingsGroup>;
}
