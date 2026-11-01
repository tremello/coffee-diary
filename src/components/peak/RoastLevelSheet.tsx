import { usePickDrag } from "../bean-editor/usePickDrag";
import { levelPeak, peakRange, ROAST_LEVEL_NOTES } from "../../lib/peak";
import { type PeakSettings, type RoastLevel, ROAST_LEVELS } from "../../types";
import { PeakBar } from "./PeakParts";

// Roast level picker over the bean editor: each level with its window and a small bar, plus 모름 to leave it empty.
export function RoastLevelSheet({ value, settings, onPick, onClose }: { value?: RoastLevel; settings: PeakSettings; onPick: (level: RoastLevel | undefined) => void; onClose: () => void }) {
  const pick = usePickDrag(onClose);
  const windows = ROAST_LEVELS.map(level => levelPeak(level, settings).window);
  const max = Math.max(...windows.map(window => window.ok)) + 5;
  return <div className="be-pick-layer">
    <div className="be-pick-backdrop" style={pick.backdropStyle} onClick={pick.close} aria-hidden="true" />
    <div className="be-pick" ref={pick.sheetRef} style={pick.sheetStyle} role="dialog" aria-modal="true" aria-label="로스팅 정도">
      <div className="be-pick-grab" {...pick.handleProps} aria-hidden="true" />
      <div className="be-pick-head" {...pick.handleProps}><h3>로스팅 정도</h3><div><button type="button" onClick={pick.close}>닫기</button></div></div>
      <div className="be-pick-scroll" ref={pick.scrollRef}>
        <p className="be-pick-label">고르면 맛있는 시기를 알려드려요</p>
        <div className="be-pick-list">
          {ROAST_LEVELS.map((level, index) => <div className="be-pick-item" key={level} aria-current={value === level}>
            <button type="button" className="pk-level" onClick={() => onPick(level)}>
              <span className="pk-level-top"><span>{level}</span><small>{peakRange(windows[index])} · {ROAST_LEVEL_NOTES[level]}</small></span>
              <PeakBar window={windows[index]} max={max} />
            </button>
          </div>)}
          <div className="be-pick-item" aria-current={!value}>
            <button type="button" className="pk-level" onClick={() => onPick(undefined)}><span className="pk-level-top"><span>모름 / 비워두기</span><small>날짜만 보여줘요</small></span></button>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
