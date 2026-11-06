import { useEffect, useState, type CSSProperties } from "react";
import { type PhotoStep } from "../../lib/photo";

const STAGES = ["prepare", "upload", "read"] as const;

// Shown in the photo row while a bean label or recipe photo is being read:
// what is happening now, a three-part bar (준비 · 보내기 · 읽기) and the seconds waited so far.
export function PhotoProgress({ step, reading }: { step: PhotoStep; reading: string }) {
  const [seconds, setSeconds] = useState(0);
  const readingNow = step.stage === "read";
  // Counted from when the photo was picked, since that is how long the wait feels.
  useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const current = STAGES.indexOf(step.stage);
  const title = step.stage === "prepare" ? "사진 준비 중…" : step.stage === "upload" ? "사진 보내는 중…" : reading;
  const hint = seconds >= 15 ? "조금 오래 걸리고 있어요. 그대로 기다려 주세요" : "다 읽으면 아래 칸이 저절로 채워져요";
  return <>
    <strong>{title}<span className="be-progress-time" aria-hidden="true">{step.stage === "upload" ? `${Math.round(step.sent * 100)}%` : readingNow && seconds > 0 ? `${seconds}초` : ""}</span></strong>
    <span className="be-progress" role="progressbar" aria-label="사진 읽기 진행" aria-valuemin={1} aria-valuemax={3} aria-valuenow={current + 1} aria-valuetext={`3단계 중 ${current + 1}단계: ${title}`}>
      {STAGES.map((stage, index) => <i key={stage} className={index < current ? "done" : index > current ? undefined : stage === "upload" ? "now" : "now run"} style={stage === "upload" && index === current ? { "--sent": step.sent } as CSSProperties : undefined} />)}
    </span>
    <span>{hint}</span>
  </>;
}
