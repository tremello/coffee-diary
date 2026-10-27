import { clearLocalData, hasPendingSync } from "../../data/storage";
import { type StorageSetter } from "../../data/sync";
import { downloadCsv, downloadJson, type ExportData } from "../../lib/export";
import { type Bean } from "../../types";
import { SettingsDisclosure, SettingsGroup, SettingsRow } from "./parts";

export function DataSection({ data, setBeans, signedIn }: { data: ExportData; setBeans: StorageSetter<Bean[]>; signedIn: boolean }) {
  const deleted = data.beans.filter(bean => bean.deleted);
  const restore = (id: number) => setBeans(data.beans.map(bean => bean.id === id ? { ...bean, deleted: false } : bean));
  const clearDevice = () => {
    const message = !signedIn ? "로그인하지 않은 상태라 이 기기의 기록이 모두 사라지고 되돌릴 수 없어요. 먼저 내보내기를 해두세요. 지울까요?"
      : hasPendingSync() ? "아직 서버에 저장하지 못한 기록이 있어요. 지우면 그 기록은 사라져요. 계속할까요?"
      : "이 기기에 저장된 기록을 지우고 서버에서 다시 받아와요. 계속할까요?";
    if (!window.confirm(message)) return;
    clearLocalData();
    window.location.reload();
  };
  return <SettingsGroup title="데이터">
    <SettingsRow label="기록 내보내기" hint="JSON은 백업용, CSV는 엑셀·구글 시트용이에요.">
      <span className="settings-actions"><button type="button" className="settings-action" onClick={() => downloadJson(data)}>JSON</button><button type="button" className="settings-action" onClick={() => downloadCsv(data)}>CSV</button></span>
    </SettingsRow>
    <SettingsDisclosure label="지운 원두 휴지통" summary={`${deleted.length}개`}>
      {deleted.length === 0 ? <p className="settings-empty">지운 원두가 없어요.</p> : <ul className="settings-trash">{deleted.map(bean => <li key={bean.id}><span><strong>{bean.name || "이름 없는 원두"}</strong><small>{[bean.roastery, bean.date].filter(Boolean).join(" · ")}</small></span><button type="button" className="settings-action" onClick={() => restore(bean.id)}>되살리기</button></li>)}</ul>}
    </SettingsDisclosure>
    <button type="button" className="settings-row settings-row-button settings-danger" onClick={clearDevice}>이 기기의 데이터 지우기</button>
  </SettingsGroup>;
}
