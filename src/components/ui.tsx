import { type ReactNode } from "react";
import { FONT } from "../lib/format";

export function FormCard({ children }: { children: ReactNode }) {
  return <div className="form-card">{children}</div>;
}

export function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="star-rating" aria-label={`별점 ${value}점`}>{[1, 2, 3, 4, 5].map(star => <span className={`star-rating-star ${value >= star ? "full" : value >= star - 0.5 ? "half" : "empty"}`} key={star}><span aria-hidden="true">★</span><button type="button" aria-label={`${star - 0.5}점`} onClick={() => onChange(star - 0.5)} /><button type="button" aria-label={`${star}점`} onClick={() => onChange(star)} /></span>)}</div>;
}

export function Field({ label, children, required = false, invalid = false }: { label: string; children: ReactNode; required?: boolean; invalid?: boolean }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: invalid ? "var(--fg-b65f50)" : "var(--color-text-secondary)", display: "block", marginBottom: 4, fontFamily: FONT }}>{label}{required && <span aria-hidden="true" style={{ color: invalid ? "var(--fg-b65f50)" : "var(--c-accent)", marginLeft: 2 }}>*</span>}</label>
      {children}
    </div>
  );
}

export function FormActions({ onSave, onCancel, saveLabel }: { onSave: () => void; onCancel: () => void; saveLabel: string }) {
  return (
    <div className="form-buttons">
      <button type="button" className="quiet-button" onClick={onCancel}>취소</button>
      <button type="button" className="primary-button" onClick={onSave}>{saveLabel}</button>
    </div>
  );
}

export function JourneySteps({ active }: { active: "beans" | "recipes" | "brews" }) {
  const steps = [
    { id: "beans" as const, number: 1, label: "원두 등록" },
    { id: "recipes" as const, number: 2, label: "레시피 만들기" },
    { id: "brews" as const, number: 3, label: "첫 브루잉 기록" }
  ];
  return <ol className="journey-steps" aria-label="커피 다이어리 시작 순서">{steps.map(step => <li key={step.id} className={step.id === active ? "is-active" : undefined}><b>{step.number}</b><span>{step.label}</span></li>)}</ol>;
}

export function Empty({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}
