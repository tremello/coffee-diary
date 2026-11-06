import { supabase } from "../supabase";
import { type CoffeeValue, type RecognizedBeanFields } from "../types";
import { MAX_BLEND_PARTS } from "./blend";
import { localizedPhotoField, PHOTO_ORIGIN_LABELS, PHOTO_PROCESS_LABELS, photoMimeType, preparePhoto, sendPhoto } from "./photo";

// Sends a label or bean-card photo to the same reader the bean form uses and returns what it found.
export const readLabelPhoto = async (file: File): Promise<RecognizedBeanFields> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("사진 인식은 Google 로그인 후 사용할 수 있어요.");
  const photo = await preparePhoto(file, photoMimeType(file));
  const { ok, payload } = await sendPhoto("/api/recognize-bean", session.access_token, photo);
  if (!ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : "사진에서 정보를 읽지 못했어요.");
  return (payload.bean ?? {}) as RecognizedBeanFields;
};

// What a cafe record keeps from a read: the coffee (single origin or blend), cup notes and price, plus which rows got a value.
export const cafeFieldsFromLabel = (result: RecognizedBeanFields) => {
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const parts = (Array.isArray(result.blendParts) ? result.blendParts : []).map(part => ({
    origin: localizedPhotoField(text(part?.origin), PHOTO_ORIGIN_LABELS),
    process: localizedPhotoField(text(part?.process), PHOTO_PROCESS_LABELS) || undefined,
    variety: text(part?.variety) || undefined,
    ratio: Number(part?.ratio) > 0 && Number(part?.ratio) <= 100 ? Math.round(Number(part?.ratio)) : undefined
  })).filter(part => part.origin).slice(0, MAX_BLEND_PARTS);
  const blend = parts.length >= 2;
  const origin = blend ? "" : localizedPhotoField(text(result.origin), PHOTO_ORIGIN_LABELS);
  const process = blend ? "" : localizedPhotoField(text(result.process), PHOTO_PROCESS_LABELS);
  const coffee: CoffeeValue = blend
    ? { kind: "blend", blendName: text(result.blendName), parts, origin: "", process: "" }
    : { origin, farm: text(result.farm) || undefined, variety: text(result.variety) || undefined, process };
  const price = result.price !== undefined && String(result.price).trim() ? String(result.price).replace(/\D/g, "") : "";
  const roasteryNotes = text(result.roasteryNotes);
  const read = new Set<string>([
    ...(blend ? ["parts", ...(text(result.blendName) ? ["blendName"] : [])] : [...(origin ? ["origin"] : []), ...(process ? ["process"] : []), ...(text(result.farm) ? ["farm"] : []), ...(text(result.variety) ? ["variety"] : [])]),
    ...(roasteryNotes ? ["roasteryNotes"] : []), ...(price ? ["price"] : [])
  ]);
  return { coffee, roasteryNotes, price, read };
};
