import { confirmAndSignOut, signInWithGoogle } from "../../data/auth";
import { retryFailedSync, useSyncFailed } from "../../data/sync";
import { SettingsGroup, SettingsRow } from "./parts";

export function AccountSection({ user }: { user: { id: string; email?: string } | null }) {
  const syncFailed = useSyncFailed();
  if (!user) return <SettingsGroup title="계정·동기화">
    <SettingsRow label="로그인하지 않았어요" hint="로그인하면 여러 기기에서 같은 기록을 볼 수 있어요."><button type="button" className="settings-action" onClick={() => void signInWithGoogle()}>Google 로그인</button></SettingsRow>
  </SettingsGroup>;
  const accountName = user.email?.split("@")[0] || "내 계정";
  return <SettingsGroup title="계정·동기화">
    <SettingsRow label={<span className="settings-account"><span className="settings-avatar" aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</span><span>{user.email ?? accountName}<small>Google 계정</small></span></span>} />
    <SettingsRow label="동기화" hint={syncFailed ? "이 기기에는 남아 있어요." : "모든 기록이 서버에 저장돼 있어요."}>
      {syncFailed ? <button type="button" className="settings-action" onClick={retryFailedSync}>다시 시도</button> : <span className="settings-status"><i aria-hidden="true" />저장됨</span>}
    </SettingsRow>
    <button type="button" className="settings-row settings-row-button settings-danger" onClick={() => void confirmAndSignOut(accountName)}>로그아웃</button>
  </SettingsGroup>;
}
