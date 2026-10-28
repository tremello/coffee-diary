import { RELEASES } from "../../data/changelog";
import { SettingsDisclosure, SettingsGroup, SettingsRow } from "./parts";

// The version is the newest changelog entry.
export function AboutSection() {
  const [latest] = RELEASES;
  return <SettingsGroup title="정보">
    <SettingsRow label="앱 버전"><span className="settings-status-text">v{latest.version}</span></SettingsRow>
    <SettingsDisclosure label="업데이트 기록" summary={latest.date.replace(/-/g, ".")}>
      <ol className="settings-releases">{RELEASES.map(release => <li key={release.version}><div><strong>v{release.version}</strong><time dateTime={release.date}>{release.date.replace(/-/g, ".")}</time></div><ul>{release.changes.map(change => <li key={change}>{change}</li>)}</ul></li>)}</ol>
    </SettingsDisclosure>
  </SettingsGroup>;
}
