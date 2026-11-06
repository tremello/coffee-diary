import { supabase } from "../supabase";
import { type CardPhoto } from "../types";
import { photoMimeType, photoProblem } from "./photo";

// 원두 카드 사진: the photo is straightened and cropped here on the device, and only the result is kept (no original):
// the full-resolution JPEG for the viewer, and a small one for grids. Canvas output carries no EXIF, so no location.
export const CARD_BUCKET = "bean-cards";
const MAX_SIDE = 4000;
const QUALITY = 0.92;
const THUMB_SIDE = 480;
const THUMB_QUALITY = 0.8;
const DETECT_SIDE = 1024;

// A corner as a fraction (0–1) of the photo's width and height, in the order top-left, top-right, bottom-right, bottom-left.
export type Point = [number, number];
export type Quad = [Point, Point, Point, Point];

// Where the handles start when the corners are unknown: a little inside the edges, so each is easy to grab.
export const insetQuad = (inset = 0.08): Quad => [[inset, inset], [1 - inset, inset], [1 - inset, 1 - inset], [inset, 1 - inset]];
export const fullQuad = (): Quad => insetQuad(0);

export type CardSource = { bitmap: ImageBitmap; preview: string; width: number; height: number };

const toBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("사진을 만들지 못했어요.")), "image/jpeg", quality));

const scaled = (source: CanvasImageSource, width: number, height: number, side: number) => {
  const scale = Math.min(1, side / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (context) { context.imageSmoothingQuality = "high"; context.drawImage(source, 0, 0, canvas.width, canvas.height); }
  return canvas;
};

// Decodes the picked photo the right way up. HEIC only decodes in Safari, so other browsers get a clear message.
export const openCardSource = async (file: Blob): Promise<CardSource> => {
  if (file instanceof File) { const problem = photoProblem(file); if (problem) throw new Error(problem); }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error(file instanceof File && /hei[cf]/.test(photoMimeType(file)) ? "이 브라우저에서는 HEIC 사진을 열 수 없어요. JPG로 골라주세요." : "사진을 열지 못했어요. 다른 사진을 골라주세요."); }
  const preview = URL.createObjectURL(await toBlob(scaled(bitmap, bitmap.width, bitmap.height, 1600), 0.85));
  return { bitmap, preview, width: bitmap.width, height: bitmap.height };
};

export const closeCardSource = (source: CardSource | null) => { if (!source) return; source.bitmap.close(); URL.revokeObjectURL(source.preview); };

const asDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read"));
  reader.onerror = () => reject(new Error("read"));
  reader.readAsDataURL(blob);
});

// Asks the photo reader for the card's four corners. Any failure leaves the handles at their default spots.
export const detectCorners = async (source: CardSource): Promise<Quad | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const image = await asDataUrl(await toBlob(scaled(source.bitmap, source.width, source.height, DETECT_SIDE), 0.85));
    const response = await fetch("/api/recognize-bean", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ image, mimeType: "image/jpeg", mode: "corners" })
    });
    if (!response.ok) return null;
    const { corners } = await response.json() as { corners?: number[][] | null };
    if (!Array.isArray(corners) || corners.length !== 4) return null;
    return orderQuad(corners.map(([x, y]) => [x, y] as Point));
  } catch {
    return null;
  }
};

// Puts four points in top-left, top-right, bottom-right, bottom-left order, whatever order they came in.
export const orderQuad = (points: Point[]): Quad => {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / 4, cy = points.reduce((sum, p) => sum + p[1], 0) / 4;
  const sorted = [...points].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  // atan2 order starts near the left; rotate so the point with the smallest x+y (top-left) comes first.
  const start = sorted.reduce((best, p, index) => p[0] + p[1] < sorted[best][0] + sorted[best][1] ? index : best, 0);
  const rotated = [...sorted.slice(start), ...sorted.slice(0, start)];
  return [rotated[0], rotated[1], rotated[2], rotated[3]];
};

// Solves the 3×3 perspective map that takes the output rectangle's corners to the four picked points.
const homography = (from: Point[], to: Point[]) => {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = from[i], [x, y] = to[i];
    a.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    a.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const lead = a[col][col] || 1e-12;
    for (let k = col; k < 9; k++) a[col][k] /= lead;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (factor) for (let k = col; k < 9; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map(row => row[8]);
};

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// The cropped card's size in the photo's own pixels (longest side at most 4000), so nothing is lost to resizing.
export const cropSize = (quad: Quad, width: number, height: number) => {
  const px = quad.map(([x, y]) => [x * width, y * height] as Point);
  let w = Math.max(distance(px[0], px[1]), distance(px[3], px[2]));
  let h = Math.max(distance(px[0], px[3]), distance(px[1], px[2]));
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
  return { w, h };
};

const pause = () => new Promise(resolve => setTimeout(resolve, 0));

// Flattens the picked quadrilateral into a straight rectangle, sampling the photo with bilinear filtering.
export const warpCard = async (source: CardSource, quad: Quad) => {
  const { w, h } = cropSize(quad, source.width, source.height);
  const input = document.createElement("canvas");
  input.width = source.width; input.height = source.height;
  const inputContext = input.getContext("2d", { willReadFrequently: true });
  if (!inputContext) throw new Error("사진을 자르지 못했어요.");
  inputContext.drawImage(source.bitmap, 0, 0);
  const src = inputContext.getImageData(0, 0, source.width, source.height).data;
  input.width = input.height = 0;
  const output = document.createElement("canvas");
  output.width = w; output.height = h;
  const outputContext = output.getContext("2d");
  if (!outputContext) throw new Error("사진을 자르지 못했어요.");
  const image = outputContext.createImageData(w, h);
  const out = image.data;
  const target = quad.map(([x, y]) => [x * source.width, y * source.height] as Point);
  const [h0, h1, h2, h3, h4, h5, h6, h7] = homography([[0, 0], [w, 0], [w, h], [0, h]], target);
  const sw = source.width, sh = source.height, maxX = sw - 1, maxY = sh - 1;
  for (let v = 0; v < h; v++) {
    const vy = v + 0.5;
    for (let u = 0; u < w; u++) {
      const ux = u + 0.5;
      const d = h6 * ux + h7 * vy + 1;
      let x = (h0 * ux + h1 * vy + h2) / d - 0.5, y = (h3 * ux + h4 * vy + h5) / d - 0.5;
      x = x < 0 ? 0 : x > maxX ? maxX : x; y = y < 0 ? 0 : y > maxY ? maxY : y;
      const x0 = x | 0, y0 = y | 0, x1 = x0 < maxX ? x0 + 1 : x0, y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const o = (v * w + u) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
        const bottom = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
        out[o + c] = top + (bottom - top) * fy;
      }
      out[o + 3] = 255;
    }
    if (v % 160 === 159) await pause();
  }
  outputContext.putImageData(image, 0, 0);
  const full = await toBlob(output, QUALITY);
  const thumb = await toBlob(scaled(output, w, h, THUMB_SIDE), THUMB_QUALITY);
  output.width = output.height = 0;
  return { full, thumb, w, h };
};

const newId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Uploads both files under the signed-in account's folder; the storage rules only let an account touch its own folder.
export const uploadCard = async (files: { full: Blob; thumb: Blob; w: number; h: number }): Promise<CardPhoto> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("사진 저장은 Google 로그인 후 쓸 수 있어요.");
  const id = newId();
  const path = `${session.user.id}/${id}.jpg`, thumb = `${session.user.id}/${id}-t.jpg`;
  const bucket = supabase.storage.from(CARD_BUCKET);
  const options = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
  const [a, b] = await Promise.all([bucket.upload(path, files.full, options), bucket.upload(thumb, files.thumb, options)]);
  const failed = a.error ?? b.error;
  if (failed) {
    void bucket.remove([path, thumb]);
    throw new Error(/bucket|not found/i.test(failed.message) ? "사진 저장소가 아직 준비되지 않았어요." : "사진을 올리지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요.");
  }
  return { path, thumb, w: files.w, h: files.h, at: new Date().toISOString() };
};

// Best effort: a leftover file only costs a little space.
export const removeCard = (card: CardPhoto | undefined | null) => {
  if (!card) return;
  signed.delete(card.path); signed.delete(card.thumb);
  void supabase.storage.from(CARD_BUCKET).remove([card.path, card.thumb]).catch(() => undefined);
};

// The bucket is private, so each file is read through a link that lasts an hour; links are reused until near expiry.
const signed = new Map<string, { url: string; until: number }>();
export const cardUrl = async (path: string) => {
  const cached = signed.get(path);
  if (cached && cached.until > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(CARD_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("사진을 불러오지 못했어요. 로그인과 인터넷 연결을 확인해주세요.");
  signed.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60_000 });
  return data.signedUrl;
};

export const cardBlob = async (path: string) => {
  const response = await fetch(await cardUrl(path));
  if (!response.ok) throw new Error("사진을 불러오지 못했어요.");
  return response.blob();
};
