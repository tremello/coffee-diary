import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { type CardPhoto } from "../../types";
import { stopBubbling } from "./stopBubbling";
import { type CardSource, detectCorners, type Point, type Quad, insetQuad, uploadCard, warpCard } from "../../lib/cardPhoto";

type Step = "finding" | "adjust" | "cutting" | "result" | "saving";
type Cut = { full: Blob; thumb: Blob; w: number; h: number; url: string };

// Full-screen step for 원두 카드 사진: the four corners start where the photo reader found them, the user drags them onto the
// card's edges, 자르기 flattens it into a rectangle, and 저장 uploads it. useCardFlow owns the source and frees it.
// With onInfoOnly (one photo for both reading and the card), status shows the label reading going on behind, and
// "정보만 쓰기" leaves without keeping the photo while the reading carries on.
export function CardCropper({ source, detect, status, onInfoOnly, onSaved, onCancel }: { source: CardSource; detect: boolean; status?: ReactNode; onInfoOnly?: () => void; onSaved: (card: CardPhoto) => void; onCancel: () => void }) {
  const [step, setStep] = useState<Step>(detect ? "finding" : "adjust");
  const [quad, setQuad] = useState<Quad>(detect ? insetQuad() : insetQuad(0));
  const [found, setFound] = useState<boolean | null>(null);
  const [cut, setCut] = useState<Cut | null>(null);
  const [error, setError] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  // The handle being dragged: it moves by the finger's travel (no jump to the fingertip), and a loupe shows that corner enlarged.
  const dragging = useRef<{ index: number; x: number; y: number; start: Point } | null>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => () => { if (cut) URL.revokeObjectURL(cut.url); }, [cut]);
  useEffect(() => {
    if (!detect) return;
    let live = true;
    void detectCorners(source).then(corners => {
      if (!live) return;
      if (corners) setQuad(corners);
      setFound(Boolean(corners));
      setStep(current => current === "finding" ? "adjust" : current);
    });
    return () => { live = false; };
  }, [source, detect]);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } };
    document.addEventListener("keydown", onKey, true);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", onKey, true); };
  }, [onCancel]);

  // The photo is fitted inside the stage; the handles live in the same box so a fraction maps straight onto the photo.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const { width, height } = stage.getBoundingClientRect();
      const scale = Math.min(width / source.width, height / source.height);
      const w = source.width * scale, h = source.height * scale;
      setBox({ left: (width - w) / 2, top: (height - h) / 2, width: w, height: h });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [source, step === "result"]);

  const onHandleDown = (index: number) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragging.current = { index, x: event.clientX, y: event.clientY, start: quad[index] };
    setActive(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onHandleMove = (index: number) => (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragging.current;
    if (!drag || drag.index !== index || !box.width) return;
    const x = Math.min(1, Math.max(0, drag.start[0] + (event.clientX - drag.x) / box.width));
    const y = Math.min(1, Math.max(0, drag.start[1] + (event.clientY - drag.y) / box.height));
    setQuad(current => current.map((point, i) => i === index ? [x, y] : point) as Quad);
  };
  const onHandleUp = () => { dragging.current = null; setActive(null); };
  // Arrow keys nudge a focused handle, so the corners can be set without a mouse or finger.
  const nudge = (index: number, dx: number, dy: number) => setQuad(current => current.map((point, i) => i === index ? [Math.min(1, Math.max(0, point[0] + dx)), Math.min(1, Math.max(0, point[1] + dy))] : point) as Quad);

  const doCut = async () => {
    setStep("cutting"); setError("");
    await new Promise(resolve => setTimeout(resolve, 30));
    try {
      const result = await warpCard(source, quad);
      setCut({ ...result, url: URL.createObjectURL(result.full) });
      setStep("result");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "사진을 자르지 못했어요.");
      setStep("adjust");
    }
  };
  const save = async () => {
    if (!cut) return;
    setStep("saving"); setError("");
    try { onSaved(await uploadCard(cut)); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "사진을 올리지 못했어요."); setStep("result"); }
  };

  const px = (point: Point) => [box.left + point[0] * box.width, box.top + point[1] * box.height];
  const pointsAttr = quad.map(point => px(point).join(",")).join(" ");
  const showResult = (step === "result" || step === "saving") && cut;
  const names = ["왼쪽 위", "오른쪽 위", "오른쪽 아래", "왼쪽 아래"];

  return createPortal(<div className="cp-layer cp-crop" role="dialog" aria-modal="true" aria-labelledby="cp-crop-title" onClick={event => event.stopPropagation()} {...stopBubbling}>
    <div className="cp-bar">
      <button type="button" className="cp-text-button" onClick={onCancel}>취소</button>
      <h2 id="cp-crop-title">{showResult ? "잘린 모양 확인" : "모서리 맞추기"}</h2>
      <span className="cp-text-button" aria-hidden="true" />
    </div>
    <p className="cp-hint" role="status">{error ? <strong>{error}</strong>
      : step === "finding" ? "카드 모서리를 찾는 중…"
      : step === "cutting" ? "반듯하게 펴는 중…"
      : step === "saving" ? "저장하는 중…"
      : showResult ? "괜찮으면 저장, 아니면 다시 맞춰주세요"
      : found === false ? "모서리를 못 찾았어요. 네 점을 카드 끝에 맞춰 주세요"
      : "네 모서리를 카드 끝에 맞춰 주세요"}</p>
    {status && <div className="cp-reading" role="status">{status}</div>}
    <div className="cp-stage" ref={stageRef}>
      {showResult ? <img className="cp-result" src={cut.url} alt="반듯하게 자른 원두 카드" />
        : <>
          <img className="cp-photo" src={source.preview} alt="" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} draggable={false} />
          <svg className="cp-frame" aria-hidden="true"><polygon points={pointsAttr} /></svg>
          {active !== null && step === "adjust" && <Loupe src={source.preview} box={box} quad={quad} index={active} stage={stageRef.current} />}
          {step !== "finding" && quad.map((point, index) => {
            const [left, top] = px(point);
            return <button key={index} type="button" className="cp-handle" style={{ left, top }} aria-label={`${names[index]} 모서리, 화살표 키로 옮기기`}
              onPointerDown={onHandleDown(index)} onPointerMove={onHandleMove(index)} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
              onKeyDown={event => {
                const step = event.shiftKey ? 0.02 : 0.004;
                const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                const move = moves[event.key];
                if (move) { event.preventDefault(); nudge(index, ...move); }
              }}><span /></button>;
          })}
        </>}
    </div>
    <div className="cp-actions">
      {showResult ? <>
        <button type="button" className="cp-button" disabled={step === "saving"} onClick={() => setStep("adjust")}>다시 맞추기</button>
        <button type="button" className="cp-button primary" disabled={step === "saving"} onClick={save}>{step === "saving" ? "저장하는 중…" : "저장"}</button>
      </> : <>
        {onInfoOnly ? <button type="button" className="cp-button" onClick={onInfoOnly}>정보만 쓰기</button>
          : <button type="button" className="cp-button" onClick={onCancel}>다시 고르기</button>}
        <button type="button" className="cp-button primary" disabled={step !== "adjust"} onClick={doCut}>자르기</button>
      </>}
    </div>
  </div>, document.body);
}

const LOUPE = 128;
const ZOOM = 3;

// A round magnifier above the finger while a corner is dragged: the photo around that corner at 3×, the card's outline,
// and a cross at the exact point, so the corner can be set on the card's edge without the finger hiding it.
function Loupe({ src, box, quad, index, stage }: { src: string; box: { left: number; top: number; width: number; height: number }; quad: Quad; index: number; stage: HTMLDivElement | null }) {
  const r = LOUPE / 2;
  const [x, y] = quad[index];
  const w = box.width * ZOOM, h = box.height * ZOOM;
  const cx = box.left + x * box.width, cy = box.top + y * box.height;
  const stageWidth = stage?.clientWidth ?? 0;
  // Above the finger, or below it near the top; kept inside the stage sideways.
  const top = cy - r - 72 < -40 ? cy + 56 : cy - LOUPE - 56;
  const left = Math.min(Math.max(cx - r, 0), Math.max(0, stageWidth - LOUPE));
  const at = (point: Point) => `${point[0] * w - x * w + r},${point[1] * h - y * h + r}`;
  return <div className="cp-loupe" aria-hidden="true" style={{ left, top, width: LOUPE, height: LOUPE, backgroundImage: `url(${src})`, backgroundSize: `${w}px ${h}px`, backgroundPosition: `${r - x * w}px ${r - y * h}px` }}>
    <svg width={LOUPE} height={LOUPE}><polygon points={quad.map(at).join(" ")} /><path d={`M${r - 10} ${r}h20M${r} ${r - 10}v20`} /></svg>
  </div>;
}
