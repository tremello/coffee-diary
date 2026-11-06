import { useEffect, useState } from "react";

// Shown in the photo row while a bean label or recipe photo is being read:
// "읽는 중… N초" and one moving bar. Preparing and sending the photo take a moment, so they are not shown apart.
export function PhotoProgress({ reading }: { reading: string }) {
  const [seconds, setSeconds] = useState(0);
  // Counted from when the photo was picked, since that is how long the wait feels.
  useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const hint = seconds >= 15 ? "조금 오래 걸리고 있어요. 그대로 기다려 주세요" : "다 읽으면 아래 칸이 저절로 채워져요";
  return <>
    <strong>{reading}<span className="be-progress-time" aria-hidden="true">{seconds > 0 ? `${seconds}초` : ""}</span></strong>
    <span className="be-progress" role="progressbar" aria-label={reading}><i className="run" /></span>
    <span>{hint}</span>
  </>;
}
