import { DEVICE_KEYS, readStartPage, readStatsPeriod, type StatsPeriod, useDeviceSetting } from "../../data/settings";
import { setThemeChoice, useTheme } from "../../data/theme";
import { type Page, PAGE_LABELS, PAGES } from "../../lib/pages";
import { type BeanDensity, initialBeanDensity } from "../../pages/BeansPage";
import { Segmented, SettingsGroup, SettingsRow } from "./parts";

const STATS_LABELS: Record<StatsPeriod, string> = { "7": "7일", "30": "30일", "90": "90일", all: "전체" };

export function DisplaySection() {
  const { choice } = useTheme();
  const [startPage, setStartPage] = useDeviceSetting<Page>(DEVICE_KEYS.startPage, readStartPage);
  const [statsPeriod, setStatsPeriod] = useDeviceSetting<StatsPeriod>(DEVICE_KEYS.statsPeriod, readStatsPeriod);
  const [density, setDensity] = useDeviceSetting<BeanDensity>(DEVICE_KEYS.beanDensity, initialBeanDensity);
  return <SettingsGroup title="화면 (이 기기)">
    <SettingsRow label="테마"><Segmented label="테마" value={choice ?? "system"} options={[{ value: "system", label: "시스템" }, { value: "light", label: "밝게" }, { value: "dark", label: "어둡게" }]} onChange={value => setThemeChoice(value === "system" ? null : value)} /></SettingsRow>
    <SettingsRow label="기본 원두 목록 보기" hint="앱을 열 때마다 이 보기로 시작해요."><Segmented label="기본 원두 목록 보기" value={density} options={[{ value: "detail", label: "자세히" }, { value: "compact", label: "간략하게" }]} onChange={setDensity} /></SettingsRow>
    <SettingsRow label="처음 열 탭"><select className="settings-select" aria-label="처음 열 탭" value={startPage} onChange={event => setStartPage(event.target.value as Page)}>{PAGES.map(page => <option key={page} value={page}>{PAGE_LABELS[page]}</option>)}</select></SettingsRow>
    <SettingsRow label="통계 기본 기간"><select className="settings-select" aria-label="통계 기본 기간" value={statsPeriod} onChange={event => setStatsPeriod(event.target.value as StatsPeriod)}>{(Object.keys(STATS_LABELS) as StatsPeriod[]).map(period => <option key={period} value={period}>{STATS_LABELS[period]}</option>)}</select></SettingsRow>
  </SettingsGroup>;
}
