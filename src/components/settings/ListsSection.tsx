import { LIST_KEYS, STORAGE_KEYS } from "../../data/keys";
import { useStorage } from "../../data/sync";
import { ChipList, SettingsDisclosure, SettingsGroup } from "./parts";

// The pick-lists the bean and brew forms remember. The forms can add or hide items but never bring them back, so that happens here.
export function ListsSection({ userId }: { userId: string | null }) {
  const [drippers, setDrippers] = useStorage<string[]>(STORAGE_KEYS.drippers, [], userId);
  const [origins, setOrigins] = useStorage<string[]>(LIST_KEYS.origins, [], userId);
  const [hiddenRoasteries, setHiddenRoasteries] = useStorage<string[]>(LIST_KEYS.hiddenRoasteries, [], userId);
  const [hiddenVarieties, setHiddenVarieties] = useStorage<string[]>(LIST_KEYS.hiddenVarieties, [], userId);
  const without = (list: string[], item: string) => list.filter(value => value !== item);
  const hiddenCount = hiddenRoasteries.length + hiddenVarieties.length;
  return <SettingsGroup title="내 도구·목록">
    <SettingsDisclosure label="내 드리퍼" summary={`${drippers.length}개`}>
      <ChipList items={drippers} empty="등록한 드리퍼가 없어요. 브루잉을 기록할 때 추가할 수 있어요." actionLabel={item => `${item} 삭제`} onAction={item => setDrippers(without(drippers, item))} />
    </SettingsDisclosure>
    <SettingsDisclosure label="숨긴 로스터리·품종" summary={`${hiddenCount}개`}>
      {hiddenCount === 0 ? <p className="settings-empty">숨긴 항목이 없어요.</p> : <>
        {hiddenRoasteries.length > 0 && <><p className="settings-sublabel">로스터리 · ×를 누르면 다시 보여요</p><ChipList items={hiddenRoasteries} empty="" actionLabel={item => `${item} 다시 보이기`} onAction={item => setHiddenRoasteries(without(hiddenRoasteries, item))} /></>}
        {hiddenVarieties.length > 0 && <><p className="settings-sublabel">품종 · ×를 누르면 다시 보여요</p><ChipList items={hiddenVarieties} empty="" actionLabel={item => `${item} 다시 보이기`} onAction={item => setHiddenVarieties(without(hiddenVarieties, item))} /></>}
      </>}
    </SettingsDisclosure>
    <SettingsDisclosure label="직접 추가한 원산지" summary={`${origins.length}개`}>
      <ChipList items={origins} empty="직접 추가한 원산지가 없어요." actionLabel={item => `${item} 삭제`} onAction={item => setOrigins(without(origins, item))} />
      {origins.length > 0 && <p className="settings-empty">지워도 이미 그 원산지로 등록한 원두는 그대로예요.</p>}
    </SettingsDisclosure>
  </SettingsGroup>;
}
