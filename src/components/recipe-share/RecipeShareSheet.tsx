import { useEffect, useState } from "react";
import { supabase } from "../../supabase";
import { useSheet } from "../brew-editor/useSheet";
import { drawRecipeCard } from "../../lib/recipeCard";
import { type SavedRecipe } from "../../types";

type Card = { file: File; url: string };

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
};
const fileName = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "레시피"}.png`;

// Shows the recipe as its share image and hands it to the phone's share sheet or saves it.
// The image is drawn when the sheet opens, so 공유하기 can call the share sheet straight from the tap (Safari requires that).
export function RecipeShareSheet({ recipe, onClose }: { recipe: SavedRecipe; onClose: () => void }) {
  const sheet = useSheet(onClose);
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let url = "";
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const meta = session?.user.user_metadata ?? {};
        const by = String(meta.full_name || meta.name || "").trim() || undefined;
        const blob = await drawRecipeCard(recipe, { by, date: today() });
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setCard({ file: new File([blob], fileName(recipe.name), { type: "image/png" }), url });
      } catch {
        if (!cancelled) setError("이미지를 만들지 못했어요. 잠시 뒤 다시 해주세요.");
      }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [recipe]);

  const canShare = Boolean(card && typeof navigator.canShare === "function" && navigator.canShare({ files: [card.file] }));
  const share = async () => {
    if (!card) return;
    try { await navigator.share({ files: [card.file], title: recipe.name }); }
    catch (shareError) { if ((shareError as Error).name !== "AbortError") setError("공유하지 못했어요. 이미지 저장으로 받아주세요."); }
  };
  const save = () => {
    if (!card) return;
    const link = document.createElement("a");
    link.href = card.url;
    link.download = card.file.name;
    link.click();
  };

  return <div className={`be-layer${sheet.closing ? " closing" : ""}`}>
    <div className="be-backdrop" ref={sheet.backdropRef} aria-hidden="true" onClick={sheet.onBackdropClick} />
    <div className="be-panel bw-panel rs-panel" ref={sheet.panelRef} role="dialog" aria-modal="true" aria-labelledby="rs-title">
      <div className="be-top" {...sheet.dragHandlers}>
        <div className="be-grab" aria-hidden="true" />
        <div className="be-head">
          <button type="button" className="be-head-button" onClick={() => sheet.dismiss()}>닫기</button>
          <h2 id="rs-title">레시피 공유</h2>
          <span />
        </div>
      </div>
      <div className="be-body"><div className="be-body-inner rs-body">
        {card ? <img className="rs-preview" src={card.url} alt={`${recipe.name} 레시피 이미지`} /> : !error && <div className="rs-preview rs-loading" role="status">이미지를 만드는 중…</div>}
        {error && <p className="be-alert" role="alert">{error}</p>}
      </div></div>
      <div className="bw-footer rs-footer">
        {canShare && <button type="button" className="bw-save" onClick={() => void share()}>공유하기</button>}
        <button type="button" className={canShare ? "rs-secondary" : "bw-save"} disabled={!card} onClick={save}>이미지 저장</button>
      </div>
    </div>
  </div>;
}
