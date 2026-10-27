import { SettingsGroup, SettingsRow } from "./parts";

export function AboutSection() {
  return <SettingsGroup title="정보">
    <SettingsRow label="앱 버전" hint="이 화면이 만들어진 시점이에요."><span className="settings-status-text">{__APP_VERSION__}</span></SettingsRow>
    <SettingsRow label="새로 고침" hint="다른 기기에서 바꾼 내용을 바로 보고 싶을 때"><button type="button" className="settings-action" onClick={() => window.location.reload()}>새로 고침</button></SettingsRow>
  </SettingsGroup>;
}
