import { type CardPhoto } from "../../types";
import { PHOTO_ACCEPT } from "../../lib/photo";
import { PhotoProgress } from "../bean-editor/PhotoProgress";
import { useCardFlow } from "./CardPhoto";

// The label reading as the editors run it (BeansPage for beans, BrewLog for cafe records).
export type PhotoRead = {
  preview: string;
  busy: boolean;
  error: string;
  readCount: number | null;
  canRead: boolean;
  onSelect: (file?: File) => void;
  onRetry: () => void;
  onClear: () => void;
};

const CameraIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;

// One photo, two jobs: the label is read into the fields (AI), and at the same time the corner step opens so the card
// can be straightened and kept. The user only checks the corners and, afterwards, the green-dot fields.
// "정보만 쓰기" keeps the reading and drops the photo; 취소 in the corner step drops both.
export function PhotoFill({ photo, card, canSaveCard, onCard, title, label = "사진으로 채우기" }: { photo: PhotoRead; card?: CardPhoto; canSaveCard: boolean; onCard: (card: CardPhoto | undefined) => void; title: string; label?: string }) {
  const status = photo.busy ? <PhotoProgress reading="정보 읽는 중…" waitHint="모서리를 맞추는 동안 칸이 채워져요" />
    : photo.error ? <><strong>{photo.error}</strong><span>사진만 저장하고 칸은 직접 채워도 돼요</span></>
    : photo.readCount !== null ? <><strong className="ok">{photo.readCount}개를 읽었어요</strong><span>모서리를 맞추고 저장하면 끝이에요</span></>
    : null;
  const flow = useCardFlow(next => onCard(next), { status, onInfoOnly: () => undefined, onCancel: photo.onClear });
  const pick = (file?: File) => {
    if (!file) return;
    photo.onSelect(file);
    if (canSaveCard) void flow.pick(file);
  };
  const filePill = (text: string, capture: boolean) => <label className="be-pill"><input type="file" accept={PHOTO_ACCEPT} {...(capture ? { capture: "environment" } : {})} onChange={event => { pick(event.target.files?.[0]); event.target.value = ""; }} />{text}</label>;
  const after = card ? "카드 사진도 저장했어요" : "초록 점 칸만 한 번 확인해주세요";

  return <>
    {photo.preview ? <div className="be-photo">
      <img src={photo.preview} alt="고른 사진" />
      <div className="be-photo-text" role="status">
        {photo.busy ? <PhotoProgress reading="정보 읽는 중…" />
          : photo.error ? <><strong className="bad">{photo.error}</strong><span>다시 읽거나 직접 입력해주세요</span></>
          : photo.readCount !== null ? <><strong className="ok">사진에서 {photo.readCount}개를 읽었어요</strong><span>{after}</span></>
          : <><strong>사진을 골랐어요</strong><span>{photo.canRead ? (card ? "카드 사진을 저장했어요" : "사진은 읽는 동안에만 쓰고 저장하지 않아요") : "사진 인식은 Google 로그인 후 쓸 수 있어요"}</span></>}
      </div>
      {!photo.busy && photo.canRead && <button type="button" className="be-pill" onClick={photo.onRetry}>다시 읽기</button>}
      <button type="button" className="be-photo-remove" onClick={photo.onClear} aria-label={photo.busy ? "읽기 그만두고 사진 지우기" : "고른 사진 지우기"}>×</button>
    </div> : <div className="be-row be-quick-row">
      <span className="be-row-name be-row-stack"><span className="pf-name"><CameraIcon />{label}</span>{canSaveCard && <small>한 장으로 칸도 채우고 카드도 저장해요</small>}</span>
      <span className="be-quick-actions">{filePill("찍기", true)}{filePill("앨범", false)}</span>
    </div>}
    {((photo.error && !photo.preview) || flow.error) && <p className="be-photo-note" role="alert">{flow.error || photo.error}</p>}
    {flow.element}
  </>;
}
