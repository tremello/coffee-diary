import { type Bean, type BeanForm, type BlendPart } from "../types";

export const MAX_BLEND_PARTS = 5;

export const isBlend = (bean: Pick<Bean, "kind">) => bean.kind === "blend";

const unique = (values: (string | undefined)[]) => [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];

// Parts the user actually started filling in; empty rows in the form are ignored.
export const usedParts = (parts: BlendPart[] = []) => parts.filter(part => part.origin.trim());

// A part's ratio, or the remainder when it is the only one left blank (60 and blank → 40).
export const partRatios = (parts: BlendPart[]) => {
  const blanks = parts.filter(part => !part.ratio).length;
  const given = parts.reduce((sum, part) => sum + (part.ratio ?? 0), 0);
  return parts.map(part => part.ratio || (blanks === 1 && given > 0 && given < 100 ? 100 - given : undefined));
};

export const ratioTotal = (parts: BlendPart[]) => partRatios(parts).reduce<number>((sum, ratio) => sum + (ratio ?? 0), 0);

// "에티오피아 60 · 브라질 40", or just the origins when no ratio was written.
export const blendSummary = (parts: BlendPart[] = []) => {
  const used = usedParts(parts), ratios = partRatios(used);
  return used.map((part, index) => [part.origin.trim(), ratios[index]].filter(Boolean).join(" ")).join(" · ");
};

// "에티오피아 워시드 60% · 브라질 내추럴 40%", for the brew detail sheet.
export const blendDetail = (parts: BlendPart[] = []) => {
  const used = usedParts(parts), ratios = partRatios(used);
  return used.map((part, index) => [part.origin.trim(), part.process?.trim(), ratios[index] && `${ratios[index]}%`].filter(Boolean).join(" ")).join(" · ");
};

// The name the bean is listed under: the blend's own name, else its origins ("에티오피아 · 브라질 블렌드"), else nothing yet.
export const blendName = (form: Pick<BeanForm, "blendName" | "parts">) => {
  const origins = unique(usedParts(form.parts).map(part => part.origin));
  return form.blendName?.trim() || (origins.length ? `${origins.join(" · ")} 블렌드` : "");
};

// What a bean counts as in the origin, process and variety filters: each coffee of a blend separately.
export const beanValues = (bean: Bean, key: "origin" | "process" | "variety") => isBlend(bean) ? unique(usedParts(bean.parts).map(part => part[key])) : unique([bean[key]]);

// Saving a blend: drop empty rows, write the remainder into a blank ratio, and fill the plain fields with a summary.
export const blendFields = (form: Pick<BeanForm, "parts" | "blendName">): Partial<BeanForm> => {
  const used = usedParts(form.parts), ratios = partRatios(used);
  const parts = used.map((part, index) => ({ origin: part.origin.trim(), ...(part.process?.trim() ? { process: part.process.trim() } : {}), ...(part.variety?.trim() ? { variety: part.variety.trim() } : {}), ...(ratios[index] ? { ratio: ratios[index] } : {}) }));
  return { kind: "blend", parts, blendName: form.blendName?.trim() ?? "", origin: unique(parts.map(part => part.origin)).join(" · "), process: unique(parts.map(part => part.process)).join(" · "), variety: unique(parts.map(part => part.variety)).join(", "), farm: "" };
};
