import { useState, type ReactNode } from "react";

// Building blocks for the settings sheet: titled groups of rows, a segmented picker and removable chips.
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="settings-group"><h3>{title}</h3><div className="settings-card">{children}</div></section>;
}

export function SettingsRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return <div className="settings-row"><div className="settings-label">{label}{hint && <small>{hint}</small>}</div>{children && <div className="settings-value">{children}</div>}</div>;
}

// A row that opens in place to show a list, so there is no second screen to navigate.
export function SettingsDisclosure({ label, summary, children }: { label: string; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="settings-disclosure">
    <button type="button" className="settings-row settings-row-button" aria-expanded={open} onClick={() => setOpen(!open)}><span className="settings-label">{label}</span><span className="settings-value">{summary}<span className="settings-chevron" aria-hidden="true">›</span></span></button>
    {open && <div className="settings-disclosure-body">{children}</div>}
  </div>;
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <div className="settings-segmented" role="radiogroup" aria-label={label}>{options.map(option => <button type="button" role="radio" key={option.value} aria-checked={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

export function ChipList({ items, empty, actionLabel, onAction }: { items: string[]; empty: string; actionLabel: (item: string) => string; onAction: (item: string) => void }) {
  if (items.length === 0) return <p className="settings-empty">{empty}</p>;
  return <ul className="settings-chips">{items.map(item => <li key={item}><span>{item}</span><button type="button" aria-label={actionLabel(item)} title={actionLabel(item)} onClick={() => onAction(item)}>×</button></li>)}</ul>;
}
