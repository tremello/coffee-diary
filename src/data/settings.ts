import { useState } from "react";
import { type Page, PAGES } from "../lib/pages";

// Per-device preferences, kept outside the synced cf_ keys like the theme: each phone or computer can open differently.
export const DEVICE_KEYS = { startPage: "coffee-start-page", beanDensity: "coffee-bean-density", swipeHint: "coffee-swipe-hint-dismissed" };


const readString = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const writeString = (key: string, value: string | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch {} };

export const readStartPage = (): Page => { const saved = readString(DEVICE_KEYS.startPage); return (PAGES as readonly string[]).includes(saved ?? "") ? saved as Page : "Beans"; };

// A device setting the settings sheet edits; pages read it again when they mount after the sheet closes.
export function useDeviceSetting<T extends string>(key: string, read: () => T): [T, (value: T) => void] {
  const [value, setValue] = useState(read);
  return [value, next => { writeString(key, next); setValue(next); }];
}

